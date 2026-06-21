import { Collapsible } from "@base-ui/react/collapsible";
import { Toast } from "@base-ui/react/toast";
import clsx from "clsx";
import { IconBrandStrava, IconDownload, IconLoader2, IconTriangleInvertedFilled, IconUnlink } from "@tabler/icons-react";
import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { triggerHaptic } from "tactus";
import { Badge } from "../../primitives/Badge/Badge.tsx";
import { Button } from "../../primitives/Button/Button.tsx";
import { IconGpx } from "../../primitives/icons/IconGpx.tsx";
import { Checkbox } from "../../primitives/Checkbox/Checkbox.tsx";
import { LinkActivityDialog } from "../LinkActivityDialog/LinkActivityDialog.tsx";
import { StravaPill } from "../../domain/StravaPill/StravaPill.tsx";
import { WorkoutTypeIcon } from "../../domain/WorkoutTypeIcon/WorkoutTypeIcon.tsx";
import type { Workout } from "../../../lib/types.ts";
import { getUiVariant, isCheckable } from "../../../lib/types.ts";
import { useUnlinkActivity } from "../../../lib/queries/workouts.ts";
import { resolveHue } from "../../../lib/color.ts";
import { buildWorkoutFile, gpxFilename } from "../../../lib/workout-file.ts";
import { apiFetch } from "../../../lib/api.ts";
import styles from "./WorkoutCard.module.css";

interface WorkoutCardProps {
  workout: Workout;
  dateLabel: string;
  isToday?: boolean;
  defaultExpanded?: boolean;
  onToggleComplete?: (workoutId: string, completed: boolean) => void;
  readOnly?: boolean;
  renderDescription?: (description: string) => React.ReactNode;
  debug?: boolean;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }
  return `${meters} m`;
}

function formatSubtitle(distanceM: number | null, durationMin: number | null): string | null {
  const parts: string[] = [];
  if (distanceM) parts.push(formatDistance(distanceM));
  if (durationMin) parts.push(formatDuration(durationMin));
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function WorkoutCard({ workout, dateLabel, isToday = false, defaultExpanded = false, onToggleComplete, readOnly, renderDescription, debug }: WorkoutCardProps) {
  const variant = getUiVariant(workout);
  const checkable = isCheckable(variant);
  const hue = resolveHue(workout.label);
  const editorial = variant === "note";
  const isCompleted = workout.status === "completed";
  const isOptional = variant === "optional";
  const workoutFile = useMemo(() => buildWorkoutFile(workout), [workout]);
  const showActivityActions = !editorial && !readOnly && checkable && workout.planId !== "";
  const hasActivityAction = showActivityActions && (workout.activity != null || !isCompleted);
  const hasContent = !!(workout.description || workout.trainerNotes || workout.completionNotes) || workoutFile !== null || hasActivityAction;
  const expandable = !editorial && hasContent;

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [gpxPending, setGpxPending] = useState(false);
  const toastManager = Toast.useToastManager();
  const unlink = useUnlinkActivity(workout.planId);

  const handleDownload = useCallback(() => {
    if (!workoutFile) return;
    const url = URL.createObjectURL(workoutFile.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = workoutFile.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [workoutFile]);

  const handleDownloadGpx = useCallback(async () => {
    if (!workout.activity) return;
    setGpxPending(true);
    try {
      const res = await apiFetch(`/api/strava/gpx/${workout.id}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = gpxFilename(workout);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastManager.add({ title: "Couldn't download GPX", description: err instanceof Error ? err.message : undefined, type: "error" });
    } finally {
      setGpxPending(false);
    }
  }, [workout, toastManager]);

  const handleUnlink = useCallback(() => {
    unlink.mutate(
      { workoutId: workout.id },
      {
        onError: (err) => {
          toastManager.add({ title: "Couldn't unlink activity", description: err instanceof Error ? err.message : undefined, type: "error" });
        },
      },
    );
  }, [unlink, workout.id, toastManager]);

  const [expanded, setExpanded] = useState(defaultExpanded || editorial);
  const handleOpenChange = useCallback((open: boolean) => {
    triggerHaptic();
    setExpanded(open);
  }, []);

  const rowClass = variant === "standard" ? (isOptional ? "optional" : "workout") : variant;
  const hueStyle = hue != null ? ({ "--session-hue": hue } as CSSProperties) : undefined;

  return (
    <Collapsible.Root open={expanded} onOpenChange={expandable ? handleOpenChange : undefined}>
      <article className={clsx(styles.card, styles[rowClass], { [styles.completed!]: isCompleted, [styles.today!]: isToday })} style={hueStyle}>
        <Collapsible.Trigger className={clsx(styles.row, { [styles.expandable!]: expandable })}>
          <div className={styles.day}>{dateLabel}</div>
          <WorkoutTypeIcon icon={workout.label?.icon ?? null} />
          <div className={styles.info}>
            <div className={styles.titleRow}>
              <div className={styles.title}>{workout.title}</div>
              {isOptional && <Badge variant="optional">Optional</Badge>}
            </div>
            {formatSubtitle(workout.targetDistanceM, workout.targetDurationMin) && (
              <div className={styles.duration}>{formatSubtitle(workout.targetDistanceM, workout.targetDurationMin)}</div>
            )}
          </div>
          {workout.activity && <StravaPill stravaActivityId={workout.activity.stravaId} onClick={(e) => e.stopPropagation()} />}
          {checkable ? (
            <div onClick={(e) => e.stopPropagation()} className={styles.checkboxWrapper}>
              <Checkbox checked={isCompleted} onCheckedChange={(checked) => onToggleComplete?.(workout.id, !!checked)} hue={hue} readOnly={readOnly} />
            </div>
          ) : (
            <div className={styles.checkPlaceholder} />
          )}
          {expandable ? (
            <span className={clsx(styles.chevron, expanded && styles.chevronOpen)}>
              <IconTriangleInvertedFilled size={8} />
            </span>
          ) : (
            <div className={styles.checkPlaceholder} />
          )}
        </Collapsible.Trigger>

        {(expandable || editorial) && hasContent && (
          <Collapsible.Panel keepMounted className={clsx(styles.panel, editorial && styles.editorialPanel)}>
            <div className={styles.content}>
              {workout.description && <div className={styles.details}>{renderDescription ? renderDescription(workout.description) : workout.description}</div>}
              {workout.trainerNotes && (
                <div className={styles.trainerNotes}>
                  <span className={styles.trainerLabel}>Trainer Notes</span>
                  {renderDescription ? renderDescription(workout.trainerNotes) : workout.trainerNotes}
                </div>
              )}
              {workout.completionNotes && (
                <div className={styles.completionNotes}>
                  <span className={styles.completionLabel}>Completion Notes</span>
                  {renderDescription ? renderDescription(workout.completionNotes) : workout.completionNotes}
                </div>
              )}
              {(workoutFile || hasActivityAction) && (
                <div className={styles.actions}>
                  {workoutFile && (
                    <Button variant="secondary" size="sm" icon={<IconDownload size={16} />} onClick={handleDownload}>
                      Save to Apple Watch
                    </Button>
                  )}
                  {showActivityActions && workout.activity && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={gpxPending ? <IconLoader2 size={16} className="spin" /> : <IconGpx size={16} />}
                      onClick={handleDownloadGpx}
                      disabled={gpxPending}
                    >
                      Download GPX
                    </Button>
                  )}
                  {showActivityActions && workout.activity && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={unlink.isPending ? <IconLoader2 size={16} className="spin" /> : <IconUnlink size={16} />}
                      onClick={handleUnlink}
                      disabled={unlink.isPending}
                    >
                      Unlink activity
                    </Button>
                  )}
                  {showActivityActions && !workout.activity && (
                    <Button variant="secondary" size="sm" icon={<IconBrandStrava size={16} />} onClick={() => setLinkDialogOpen(true)}>
                      Link Strava activity
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Collapsible.Panel>
        )}

        {debug && (
          <details className={styles.debug}>
            <summary className={styles.debugSummary}>Raw Workout Data</summary>
            <pre className={styles.debugPre}>{JSON.stringify(workout, null, 2)}</pre>
          </details>
        )}
      </article>
      {showActivityActions && !workout.activity && <LinkActivityDialog workoutId={workout.id} planId={workout.planId} open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />}
    </Collapsible.Root>
  );
}
