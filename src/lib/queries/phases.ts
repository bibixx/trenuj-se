import { queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase.ts";
import type { Phase } from "../types.ts";

export const phaseKeys = {
  byPlan: (planId: string) => ["phases", planId] as const,
};

async function fetchPhases(planId: string): Promise<Phase[]> {
  const { data, error } = await supabase
    .from("phases")
    .select("id, plan_id, name, description, start_date, end_date, sort_order, metadata, created_at")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    planId: row.plan_id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    sortOrder: row.sort_order as number,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.created_at as string,
  }));
}

export function phasesQueryOptions(planId: string) {
  return queryOptions({
    queryKey: phaseKeys.byPlan(planId),
    queryFn: () => fetchPhases(planId),
  });
}
