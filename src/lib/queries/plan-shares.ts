import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase.ts";
import type { PlanShare } from "../types.ts";

export const planShareKeys = {
  byPlan: (planId: string) => ["plan-shares", planId] as const,
};

async function fetchPlanShares(planId: string): Promise<PlanShare[]> {
  const { data, error } = await supabase
    .from("plan_shares")
    .select("id, plan_id, include_workouts, include_activities, include_trainer_notes, include_plan_notes, active, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    planId: row.plan_id as string,
    includeWorkouts: row.include_workouts as boolean,
    includeActivities: row.include_activities as boolean,
    includeTrainerNotes: row.include_trainer_notes as boolean,
    includePlanNotes: row.include_plan_notes as boolean,
    active: row.active as boolean,
    createdAt: row.created_at as string,
  }));
}

export function planSharesQueryOptions(planId: string) {
  return queryOptions({
    queryKey: planShareKeys.byPlan(planId),
    queryFn: () => fetchPlanShares(planId),
  });
}

export function useCreateShare(planId: string) {
  const queryClient = useQueryClient();
  const key = planShareKeys.byPlan(planId);

  return useMutation({
    mutationFn: async (userId: string) => {
      const id = `share-${crypto.randomUUID()}`;
      const { data, error } = await supabase
        .from("plan_shares")
        .insert({
          id,
          plan_id: planId,
          user_id: userId,
          include_workouts: true,
          include_activities: false,
          include_trainer_notes: false,
          include_plan_notes: false,
          active: true,
        })
        .select("id, plan_id, include_workouts, include_activities, include_trainer_notes, include_plan_notes, active, created_at")
        .single();

      if (error) throw error;

      return {
        id: data.id as string,
        planId: data.plan_id as string,
        includeWorkouts: data.include_workouts as boolean,
        includeActivities: data.include_activities as boolean,
        includeTrainerNotes: data.include_trainer_notes as boolean,
        includePlanNotes: data.include_plan_notes as boolean,
        active: data.active as boolean,
        createdAt: data.created_at as string,
      } satisfies PlanShare;
    },
    onSuccess: (newShare) => {
      queryClient.setQueryData<PlanShare[]>(key, (old) => [newShare, ...(old ?? [])]);
    },
  });
}

export function useUpdateShare(planId: string) {
  const queryClient = useQueryClient();
  const key = planShareKeys.byPlan(planId);

  return useMutation({
    mutationFn: async ({
      shareId,
      updates,
    }: {
      shareId: string;
      updates: Partial<Pick<PlanShare, "includeWorkouts" | "includeActivities" | "includeTrainerNotes" | "includePlanNotes" | "active">>;
    }) => {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.includeWorkouts !== undefined) dbUpdates.include_workouts = updates.includeWorkouts;
      if (updates.includeActivities !== undefined) dbUpdates.include_activities = updates.includeActivities;
      if (updates.includeTrainerNotes !== undefined) dbUpdates.include_trainer_notes = updates.includeTrainerNotes;
      if (updates.includePlanNotes !== undefined) dbUpdates.include_plan_notes = updates.includePlanNotes;
      if (updates.active !== undefined) dbUpdates.active = updates.active;

      const { error } = await supabase.from("plan_shares").update(dbUpdates).eq("id", shareId);
      if (error) throw error;
    },
    onMutate: async ({ shareId, updates }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanShare[]>(key);

      queryClient.setQueryData<PlanShare[]>(key, (old) => old?.map((s) => (s.id === shareId ? { ...s, ...updates } : s)));

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

export function useDeleteShare(planId: string) {
  const queryClient = useQueryClient();
  const key = planShareKeys.byPlan(planId);

  return useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.from("plan_shares").delete().eq("id", shareId);
      if (error) throw error;
    },
    onMutate: async (shareId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlanShare[]>(key);

      queryClient.setQueryData<PlanShare[]>(key, (old) => old?.filter((s) => s.id !== shareId));

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
