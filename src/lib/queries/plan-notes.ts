import { queryOptions } from "@tanstack/react-query";
import { safeParsePlanNoteMetadata } from "../../../shared/plan-note-metadata.ts";
import { supabase } from "../supabase.ts";
import type { PlanNote } from "../types.ts";

export const planNoteKeys = {
  byPlan: (planId: string) => ["plan-notes", planId] as const,
};

async function fetchPlanNotes(planId: string): Promise<PlanNote[]> {
  const { data, error } = await supabase
    .from("plan_notes")
    .select("id, plan_id, type, content, metadata, created_at, updated_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    planId: row.plan_id as string,
    type: row.type as PlanNote["type"],
    content: row.content as string,
    metadata: safeParsePlanNoteMetadata(row.metadata),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function planNotesQueryOptions(planId: string) {
  return queryOptions({
    queryKey: planNoteKeys.byPlan(planId),
    queryFn: () => fetchPlanNotes(planId),
  });
}
