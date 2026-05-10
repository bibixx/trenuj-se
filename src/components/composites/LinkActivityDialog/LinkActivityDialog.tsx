import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../../lib/api.ts";
import { recentStravaActivitiesQueryOptions, useLinkStravaActivity, type RecentStravaActivity } from "../../../lib/queries/workouts.ts";
import { Dialog } from "../../primitives/Dialog/Dialog.tsx";
import { DialogList } from "../../primitives/DialogList/DialogList.tsx";
import { WorkoutTypeIcon } from "../../domain/WorkoutTypeIcon/WorkoutTypeIcon.tsx";
import styles from "./LinkActivityDialog.module.css";

interface LinkActivityDialogProps {
  workoutId: string;
  planId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SPORT_ICONS: Record<string, string> = {
  Run: "run",
  TrailRun: "run",
  VirtualRun: "run",
  Ride: "bike",
  GravelRide: "bike",
  MountainBikeRide: "bike",
  EBikeRide: "bike",
  EMountainBikeRide: "bike",
  VirtualRide: "bike",
  Swim: "swimming",
  WeightTraining: "barbell",
  Workout: "barbell",
  Yoga: "yoga",
  Walk: "walk",
  Hike: "mountain",
};

function formatStartDate(iso: string | null, timezone: string | null): string {
  if (!iso) return "";
  const tz = timezone?.match(/\)\s*(.+)$/)?.[1] ?? timezone ?? undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function formatDuration(sec: number | null): string {
  if (sec == null) return "";
  const minutes = Math.round(sec / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDistance(m: number | null): string {
  if (m == null || m === 0) return "";
  if (m >= 1000) {
    const km = m / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${m} m`;
}

function formatMeta(activity: RecentStravaActivity): string {
  const parts = [formatStartDate(activity.startDate, activity.timezone), formatDuration(activity.durationSec), formatDistance(activity.distanceM)].filter(Boolean);
  return parts.join(" · ");
}

export function LinkActivityDialog({ workoutId, planId, open, onOpenChange }: LinkActivityDialogProps) {
  const queryClient = useQueryClient();
  const link = useLinkStravaActivity(planId);
  const [linkError, setLinkError] = useState<string | null>(null);

  const { data, error, isLoading, refetch } = useQuery({
    ...recentStravaActivitiesQueryOptions,
    enabled: open,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: recentStravaActivitiesQueryOptions.queryKey });
      await refetch();
    },
  });

  const handleSelect = async (activity: RecentStravaActivity) => {
    setLinkError(null);
    try {
      await link.mutateAsync({ workoutId, stravaActivityId: activity.stravaId });
      onOpenChange(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link activity");
    }
  };

  const handleConnectStrava = async () => {
    try {
      const res = await apiFetch(`/api/strava/auth?callback=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to start Strava connection");
    }
  };

  const stravaNotConnected = error instanceof Error && /not connected/i.test(error.message);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Close />
        <Dialog.Title>Link Strava activity</Dialog.Title>

        {isLoading && <p className={styles.loading}>Fetching recent activities…</p>}

        {error && stravaNotConnected && (
          <>
            <Dialog.Description>Connect Strava to link activities to your workouts.</Dialog.Description>
            <DialogList.Item onClick={handleConnectStrava}>
              <DialogList.Content>
                <DialogList.Name>Connect with Strava</DialogList.Name>
              </DialogList.Content>
            </DialogList.Item>
          </>
        )}

        {error && !stravaNotConnected && <p className={styles.error}>{error.message}</p>}

        {data && data.length === 0 && <DialogList.Empty>No recent unlinked Strava activities. New activities sync automatically when you finish them.</DialogList.Empty>}

        {data && data.length > 0 && (
          <DialogList.Root>
            {data.map((activity) => (
              <DialogList.Item key={activity.stravaId} disabled={link.isPending || refresh.isPending} onClick={() => handleSelect(activity)}>
                <WorkoutTypeIcon icon={SPORT_ICONS[activity.sport] ?? null} />
                <DialogList.Content>
                  <DialogList.Name>{activity.name}</DialogList.Name>
                  <DialogList.Meta>{formatMeta(activity)}</DialogList.Meta>
                </DialogList.Content>
              </DialogList.Item>
            ))}
          </DialogList.Root>
        )}

        {linkError && <p className={styles.error}>{linkError}</p>}
      </Dialog.Content>
    </Dialog.Root>
  );
}
