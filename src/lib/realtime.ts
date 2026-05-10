import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect } from "react";
import { queryClient } from "./query-client.ts";
import { labelKeys } from "./queries/labels.ts";
import { planKeys } from "./queries/plans.ts";
import { planNoteKeys } from "./queries/plan-notes.ts";
import { planShareKeys } from "./queries/plan-shares.ts";
import { phaseKeys } from "./queries/phases.ts";
import { workoutKeys } from "./queries/workouts.ts";
import { supabase } from "./supabase.ts";

/**
 * Subscribes to Supabase Realtime channels and invalidates the corresponding
 * TanStack Query caches when changes arrive.
 *
 * Call once in the root layout. Pass the active plan ID (or null when logged out).
 */
export function useRealtimeSync(planId: string | null) {
  useEffect(() => {
    if (!planId) return;

    const channels: RealtimeChannel[] = [];

    function subscribe(table: string, filter: string | undefined, invalidate: () => void) {
      const channelConfig = filter ? { event: "*" as const, schema: "public" as const, table, filter } : { event: "*" as const, schema: "public" as const, table };

      const channel = supabase.channel(`realtime:${table}:${planId}`).on("postgres_changes", channelConfig, () => invalidate());

      channel.subscribe();
      channels.push(channel);
    }

    // Plan-level: any plan change for the user
    subscribe("plans", undefined, () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
    });

    // Plan-scoped tables
    subscribe("labels", `plan_id=eq.${planId}`, () => {
      queryClient.invalidateQueries({ queryKey: labelKeys.byPlan(planId) });
    });

    subscribe("label_activity_sports", undefined, () => {
      // Can't filter by plan_id (not on this table), invalidate labels broadly
      queryClient.invalidateQueries({ queryKey: labelKeys.byPlan(planId) });
    });

    subscribe("phases", `plan_id=eq.${planId}`, () => {
      queryClient.invalidateQueries({ queryKey: phaseKeys.byPlan(planId) });
    });

    subscribe("workouts", `plan_id=eq.${planId}`, () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.byPlan(planId) });
    });

    subscribe("workout_activities", undefined, () => {
      queryClient.invalidateQueries({ queryKey: workoutKeys.byPlan(planId) });
    });

    subscribe("plan_notes", `plan_id=eq.${planId}`, () => {
      queryClient.invalidateQueries({ queryKey: planNoteKeys.byPlan(planId) });
    });

    subscribe("plan_shares", `plan_id=eq.${planId}`, () => {
      queryClient.invalidateQueries({ queryKey: planShareKeys.byPlan(planId) });
    });

    return () => {
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, [planId]);
}
