import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { safeParseWorkoutExecution } from "../../../shared/workout-execution-schema.ts";
import { safeParseWorkoutMetadata } from "../../../shared/workout-metadata.ts";
import { supabase } from "../supabase.ts";
import type { Workout } from "../types.ts";

export const workoutKeys = {
  byPlan: (planId: string) => ["workouts", planId] as const,
};

function rowToWorkout(row: Record<string, unknown>): Workout {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    phaseId: (row.phase_id as string) ?? null,
    labelId: (row.label_id as string) ?? null,
    date: row.date as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    targetDurationMin: (row.target_duration_min as number) ?? null,
    targetDistanceM: (row.target_distance_m as number) ?? null,
    sortOrder: row.sort_order as number,
    status: row.status as Workout["status"],
    completionNotes: (row.completion_notes as string) ?? null,
    trainerNotes: (row.trainer_notes as string) ?? null,
    activityId: (row.activity_id as string) ?? null,
    execution: safeParseWorkoutExecution(row.execution),
    metadata: safeParseWorkoutMetadata(row.metadata),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function fetchWorkouts(planId: string): Promise<Workout[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, plan_id, phase_id, label_id, date, title, description, target_duration_min, target_distance_m, sort_order, status, completion_notes, trainer_notes, activity_id, execution, metadata, created_at, updated_at",
    )
    .eq("plan_id", planId)
    .order("date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToWorkout);
}

export function workoutsQueryOptions(planId: string) {
  return queryOptions({
    queryKey: workoutKeys.byPlan(planId),
    queryFn: () => fetchWorkouts(planId),
  });
}

export function useToggleCompletion(planId: string) {
  const queryClient = useQueryClient();
  const key = workoutKeys.byPlan(planId);

  return useMutation({
    mutationFn: async ({ workoutId, completed }: { workoutId: string; completed: boolean }) => {
      const status = completed ? "completed" : "planned";
      const { error } = await supabase.from("workouts").update({ status }).eq("id", workoutId);
      if (error) throw error;
    },
    onMutate: async ({ workoutId, completed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Workout[]>(key);

      queryClient.setQueryData<Workout[]>(key, (old) => old?.map((w) => (w.id === workoutId ? { ...w, status: completed ? "completed" : "planned" } : w)));

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useLinkActivity(planId: string) {
  const queryClient = useQueryClient();
  const key = workoutKeys.byPlan(planId);

  return useMutation({
    mutationFn: async ({ workoutId, activityId }: { workoutId: string; activityId: string }) => {
      const { error } = await supabase.from("workouts").update({ activity_id: activityId, status: "completed" }).eq("id", workoutId);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useUnlinkActivity(planId: string) {
  const queryClient = useQueryClient();
  const key = workoutKeys.byPlan(planId);

  return useMutation({
    mutationFn: async ({ workoutId }: { workoutId: string }) => {
      const { error } = await supabase.from("workouts").update({ activity_id: null, status: "planned" }).eq("id", workoutId);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
