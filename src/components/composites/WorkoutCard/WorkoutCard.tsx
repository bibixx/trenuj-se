import { Collapsible } from "@base-ui-components/react/collapsible";
import clsx from "clsx";
import { IconTriangleInvertedFilled } from "@tabler/icons-react";
import { type CSSProperties, useCallback, useState } from "react";
import { triggerHaptic } from "tactus";
import { Badge } from "../../primitives/Badge/Badge.tsx";
import { Checkbox } from "../../primitives/Checkbox/Checkbox.tsx";
import { StravaPill } from "../../domain/StravaPill/StravaPill.tsx";
import { WorkoutTypeIcon } from "../../domain/WorkoutTypeIcon/WorkoutTypeIcon.tsx";
import type { Workout } from "../../../lib/types.ts";
import { getUiVariant, isCheckable } from "../../../lib/types.ts";
import { resolveHue } from "../../../lib/color.ts";
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
  const hasContent = !!(workout.description || workout.trainerNotes || workout.completionNotes);
  const expandable = !editorial && hasContent;

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
          {workout.activityId && <StravaPill activityId={workout.activityId} onClick={(e) => e.stopPropagation()} />}
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
    </Collapsible.Root>
  );
}
