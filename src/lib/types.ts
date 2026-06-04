import type { SportType } from "../../shared/activity";
import type { PlanNoteMetadata } from "../../shared/plan-note-metadata";
import type { WorkoutExecution } from "../../shared/workout-execution";
import type { WorkoutMetadata } from "../../shared/workout-metadata";

// Re-export shared types for convenience
export type { WorkoutMetadata } from "../../shared/workout-metadata";
export type { PlanNoteMetadata } from "../../shared/plan-note-metadata";
export type { WorkoutExecution } from "../../shared/workout-execution";

export interface Label {
  id: string;
  key: string;
  label: string;
  hue: number;
  icon: string | null;
  metadata: Record<string, unknown> | null;
  activitySports: SportType[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutActivity {
  stravaId: number;
  sport: SportType;
  name: string;
  startDate: string;
  timezone: string | null;
  durationSec: number;
  distanceM: number | null;
  elevationM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  calories: number | null;
}

export interface Workout {
  id: string;
  planId: string;
  phaseId: string | null;
  labelId: string | null;
  /** Resolved label — not from DB, populated by query layer or components */
  label?: Label | null;
  date: string;
  title: string;
  description: string | null;
  targetDurationMin: number | null;
  targetDistanceM: number | null;
  sortOrder: number;
  status: "planned" | "completed" | "skipped";
  completionNotes: string | null;
  trainerNotes: string | null;
  activity: WorkoutActivity | null;
  execution: WorkoutExecution | null;
  metadata: WorkoutMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanNote {
  id: string;
  planId: string;
  type: "summary" | "adjustment" | "note" | "recommendation";
  content: string;
  metadata: PlanNoteMetadata | null;
  createdAt: string;
  updatedAt: string;
}

export interface Phase {
  id: string;
  planId: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string | null;
  status: "active" | "inactive";
  /** Agent-authored, plan-scoped markdown notepad. Read-only in the UI; only agents write it (via the MCP `update_plan` tool). */
  agentMemory: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanShare {
  id: string;
  planId: string;
  includeWorkouts: boolean;
  includeActivities: boolean;
  includeTrainerNotes: boolean;
  includePlanNotes: boolean;
  active: boolean;
  createdAt: string;
}

export interface Profile {
  id: string;
  stravaAthleteId: number | null;
  isPremium: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UiVariant = "standard" | "optional" | "rest" | "note";

export function getUiVariant(workout: Workout): UiVariant {
  if (workout.metadata?.ui?.variant === "rest") return "rest";
  if (workout.metadata?.ui?.variant === "note") return "note";
  if (workout.metadata?.optional) return "optional";
  return "standard";
}

export function isCheckable(variant: UiVariant): boolean {
  return variant === "standard" || variant === "optional";
}
