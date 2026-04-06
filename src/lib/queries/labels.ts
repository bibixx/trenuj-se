import { queryOptions } from "@tanstack/react-query";
import type { SportType } from "../../../shared/activity.ts";
import { supabase } from "../supabase.ts";
import type { Label } from "../types.ts";

export const labelKeys = {
  byPlan: (planId: string) => ["labels", planId] as const,
};

async function fetchLabels(planId: string): Promise<Label[]> {
  // Fetch labels for this plan first
  const labelsResult = await supabase.from("labels").select("id, plan_id, key, label, hue, icon, metadata, created_at, updated_at").eq("plan_id", planId);

  if (labelsResult.error) throw labelsResult.error;
  const labelRows = labelsResult.data ?? [];
  if (labelRows.length === 0) return [];

  // Fetch activity sports for these labels
  const labelIds = labelRows.map((r) => r.id as string);
  const sportsResult = await supabase.from("label_activity_sports").select("label_id, activity_sport").in("label_id", labelIds);

  // Build a map of label_id → activity sports
  const sportsMap = new Map<string, SportType[]>();
  if (!sportsResult.error && sportsResult.data) {
    for (const row of sportsResult.data) {
      const labelId = row.label_id as string;
      const sport = row.activity_sport as SportType;
      const existing = sportsMap.get(labelId);
      if (existing) {
        existing.push(sport);
      } else {
        sportsMap.set(labelId, [sport]);
      }
    }
  }

  return labelRows.map((row) => ({
    id: row.id as string,
    key: row.key as string,
    label: row.label as string,
    hue: row.hue as number,
    icon: (row.icon as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    activitySports: sportsMap.get(row.id as string) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function labelsQueryOptions(planId: string) {
  return queryOptions({
    queryKey: labelKeys.byPlan(planId),
    queryFn: () => fetchLabels(planId),
  });
}
