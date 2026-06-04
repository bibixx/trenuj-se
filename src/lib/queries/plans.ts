import { queryOptions } from "@tanstack/react-query";
import { supabase } from "../supabase.ts";
import type { Plan } from "../types.ts";

export const planKeys = {
  all: ["plans"] as const,
  active: ["plans", "active"] as const,
  byId: (planId: string) => ["plans", planId] as const,
};

function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id: row.id as string,
    name: row.name as string,
    goal: (row.goal as string) ?? null,
    startDate: row.start_date as string,
    endDate: (row.end_date as string) ?? null,
    status: row.status as Plan["status"],
    agentMemory: (row.agent_memory as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, goal, start_date, end_date, status, agent_memory, metadata, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToPlan);
}

async function fetchActivePlan(): Promise<Plan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, goal, start_date, end_date, status, agent_memory, metadata, created_at, updated_at")
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data ? rowToPlan(data) : null;
}

async function fetchPlan(planId: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, goal, start_date, end_date, status, agent_memory, metadata, created_at, updated_at")
    .eq("id", planId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToPlan(data) : null;
}

export function planQueryOptions(planId: string) {
  return queryOptions({
    queryKey: planKeys.byId(planId),
    queryFn: () => fetchPlan(planId),
  });
}

export const plansQueryOptions = queryOptions({
  queryKey: planKeys.all,
  queryFn: fetchPlans,
});

export const activePlanQueryOptions = queryOptions({
  queryKey: planKeys.active,
  queryFn: fetchActivePlan,
});
