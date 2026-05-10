import { queryOptions } from "@tanstack/react-query";
import type { SportType } from "../../../shared/activity.ts";
import { safeParsePlanNoteMetadata } from "../../../shared/plan-note-metadata.ts";
import { safeParseWorkoutExecution } from "../../../shared/workout-execution-schema.ts";
import { safeParseWorkoutMetadata } from "../../../shared/workout-metadata.ts";
import type { Label, Phase, PlanNote, Workout, WorkoutActivity } from "../types.ts";

export interface SharedPlan {
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string | null;
  status: "active" | "inactive";
  metadata: Record<string, unknown> | null;
}

export interface SharedPlanData {
  plan: SharedPlan;
  phases: Phase[];
  labels: Label[];
  workouts: Workout[] | null;
  planNotes: PlanNote[] | null;
}

export const shareKeys = {
  byId: (shareId: string) => ["shares", shareId] as const,
};

function rowToSharedPlan(row: Record<string, unknown>): SharedPlan {
  return {
    name: row.name as string,
    goal: (row.goal as string) ?? null,
    startDate: row.start_date as string,
    endDate: (row.end_date as string) ?? null,
    status: row.status as SharedPlan["status"],
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  };
}

function rowToPhase(row: Record<string, unknown>): Phase {
  return {
    id: row.id as string,
    planId: "",
    name: row.name as string,
    description: (row.description as string) ?? null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    sortOrder: row.sort_order as number,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: "",
  };
}

function rowToLabel(row: Record<string, unknown>): Label {
  return {
    id: row.id as string,
    key: row.key as string,
    label: row.label as string,
    hue: row.hue as number,
    icon: (row.icon as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    activitySports: (row.activitySports as Label["activitySports"]) ?? [],
    createdAt: (row.created_at as string) ?? "",
    updatedAt: (row.updated_at as string) ?? "",
  };
}

function rowToActivity(row: Record<string, unknown> | null): WorkoutActivity | null {
  if (!row) return null;
  return {
    stravaId: row.strava_id as number,
    sport: row.sport as SportType,
    name: row.name as string,
    startDate: row.start_date as string,
    timezone: (row.timezone as string) ?? null,
    durationSec: row.duration_sec as number,
    distanceM: (row.distance_m as number) ?? null,
    elevationM: (row.elevation_m as number) ?? null,
    avgHr: (row.avg_hr as number) ?? null,
    maxHr: (row.max_hr as number) ?? null,
    avgPower: (row.avg_power as number) ?? null,
    calories: (row.calories as number) ?? null,
  };
}

function rowToWorkout(row: Record<string, unknown>): Workout {
  const rawActivity = row.workout_activities;
  const activityRow = Array.isArray(rawActivity) ? (rawActivity[0] ?? null) : (rawActivity as Record<string, unknown> | null);
  return {
    id: row.id as string,
    planId: "",
    phaseId: (row.phase_id as string) ?? null,
    labelId: (row.label_id as string) ?? null,
    label: row.label ? rowToLabel(row.label as Record<string, unknown>) : null,
    date: row.date as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    targetDurationMin: (row.target_duration_min as number) ?? null,
    targetDistanceM: (row.target_distance_m as number) ?? null,
    sortOrder: row.sort_order as number,
    status: row.status as Workout["status"],
    completionNotes: (row.completion_notes as string) ?? null,
    trainerNotes: (row.trainer_notes as string) ?? null,
    activity: rowToActivity(activityRow),
    execution: safeParseWorkoutExecution(row.execution),
    metadata: safeParseWorkoutMetadata(row.metadata),
    createdAt: "",
    updatedAt: "",
  };
}

function rowToPlanNote(row: Record<string, unknown>): PlanNote {
  return {
    id: row.id as string,
    planId: "",
    type: row.type as PlanNote["type"],
    content: row.content as string,
    metadata: safeParsePlanNoteMetadata(row.metadata),
    createdAt: (row.created_at as string) ?? "",
    updatedAt: "",
  };
}

async function fetchSharedPlan(shareId: string): Promise<SharedPlanData> {
  const response = await fetch(`/api/shares/${shareId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new ShareNotFoundError();
    }
    throw new Error(`Failed to fetch shared plan: ${response.statusText}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    plan: rowToSharedPlan(data.plan as Record<string, unknown>),
    phases: ((data.phases as Record<string, unknown>[]) ?? []).map(rowToPhase),
    labels: ((data.labels as Record<string, unknown>[]) ?? []).map(rowToLabel),
    workouts: data.workouts != null ? ((data.workouts as Record<string, unknown>[]) ?? []).map(rowToWorkout) : null,
    planNotes: data.planNotes != null ? ((data.planNotes as Record<string, unknown>[]) ?? []).map(rowToPlanNote) : null,
  };
}

export class ShareNotFoundError extends Error {
  constructor() {
    super("Share not found");
    this.name = "ShareNotFoundError";
  }
}

export function shareQueryOptions(shareId: string) {
  return queryOptions({
    queryKey: shareKeys.byId(shareId),
    queryFn: () => fetchSharedPlan(shareId),
    retry: (failureCount, error) => {
      if (error instanceof ShareNotFoundError) return false;
      return failureCount < 3;
    },
  });
}
