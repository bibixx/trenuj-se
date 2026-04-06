import clsx from "clsx";
import { useMemo } from "react";
import { groupWorkoutsByDate, isToday } from "../../../lib/week-utils.ts";
import type { Label, Workout } from "../../../lib/types.ts";
import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import { WorkoutCard } from "../WorkoutCard/WorkoutCard.tsx";
import styles from "./SessionList.module.css";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface SessionListProps {
  workouts: Workout[];
  labels: Label[];
  onToggleComplete?: (workoutId: string, completed: boolean) => void;
  readOnly?: boolean;
  className?: string;
  debug?: boolean;
}

function getDayAbbr(dateStr: string): string {
  const d = new Date(dateStr);
  return DAY_NAMES[d.getUTCDay()]!;
}

function resolveLabel(workout: Workout, labelsMap: Map<string, Label>): Workout {
  if (workout.labelId) {
    return { ...workout, label: labelsMap.get(workout.labelId) ?? null };
  }
  return workout;
}

/**
 * Find the workout that should be auto-expanded:
 * 1. Today's first workout
 * 2. Otherwise, first "planned" (incomplete) workout
 */
function getAutoExpandId(workouts: Workout[]): string | null {
  const todayWorkouts = workouts.filter((w) => isToday(w.date));
  if (todayWorkouts.length > 0) return todayWorkouts[0]!.id;

  return null;
}

export function SessionList({ workouts, labels, onToggleComplete, readOnly, className, debug }: SessionListProps) {
  const labelsMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const grouped = useMemo(() => groupWorkoutsByDate(workouts), [workouts]);
  const autoExpandId = useMemo(() => getAutoExpandId(workouts), [workouts]);

  const renderDescription = useMemo(() => {
    return (content: string) => <Markdown>{content}</Markdown>;
  }, []);

  return (
    <div className={clsx(styles.root, className)}>
      {Array.from(grouped.entries()).map(([date, dayWorkouts]) => {
        const dayAbbr = getDayAbbr(date);
        const today = isToday(date);

        return dayWorkouts.map((workout, i) => {
          const resolved = resolveLabel(workout, labelsMap);
          return (
            <div key={workout.id} className={styles.row}>
              <WorkoutCard
                workout={resolved}
                dateLabel={i === 0 ? dayAbbr : ""}
                isToday={today}
                defaultExpanded={workout.id === autoExpandId}
                onToggleComplete={onToggleComplete}
                readOnly={readOnly}
                renderDescription={renderDescription}
                debug={debug}
              />
            </div>
          );
        });
      })}
    </div>
  );
}
