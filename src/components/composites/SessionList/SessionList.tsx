import clsx from "clsx";
import { useMemo } from "react";
import { getWorkoutDateGroups, isToday, type DateRange } from "../../../lib/week-utils.ts";
import type { Label, Workout } from "../../../lib/types.ts";
import { Markdown } from "../../markdown/Markdown/Markdown.tsx";
import { WorkoutCard } from "../WorkoutCard/WorkoutCard.tsx";
import styles from "./SessionList.module.css";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FALLBACK_REST_LABEL: Label = {
  id: "generated-rest-label",
  key: "rest",
  label: "Rest",
  hue: 0,
  icon: "😴",
  metadata: null,
  activitySports: [],
  createdAt: "",
  updatedAt: "",
};

interface SessionListProps {
  workouts: Workout[];
  labels: Label[];
  dateRange?: DateRange | null;
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

function findRestLabel(labels: Label[]): Label | null {
  return (
    labels.find((label) => label.key === "rest") ??
    labels.find((label) => {
      const normalized = label.label.trim().toLowerCase();
      return normalized === "rest" || normalized === "rest day";
    }) ??
    null
  );
}

function createGeneratedRestWorkout(date: string, restLabel: Label | null): Workout {
  return {
    id: `generated-rest-${date}`,
    planId: "",
    phaseId: null,
    labelId: restLabel?.id ?? null,
    label: restLabel ?? FALLBACK_REST_LABEL,
    date,
    title: "Rest Day",
    description: null,
    targetDurationMin: null,
    targetDistanceM: null,
    sortOrder: 0,
    status: "planned",
    completionNotes: null,
    trainerNotes: null,
    activity: null,
    execution: null,
    metadata: { ui: { variant: "rest" } },
    createdAt: "",
    updatedAt: "",
  };
}

/** Find today's first workout that should be auto-expanded. */
function getAutoExpandId(workouts: Workout[]): string | null {
  const todayWorkouts = workouts.filter((w) => isToday(w.date));
  if (todayWorkouts.length > 0) return todayWorkouts[0]!.id;

  return null;
}

export function SessionList({ workouts, labels, dateRange, onToggleComplete, readOnly, className, debug }: SessionListProps) {
  const labelsMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const groups = useMemo(() => getWorkoutDateGroups(workouts, dateRange), [workouts, dateRange]);
  const restLabel = useMemo(() => findRestLabel(labels), [labels]);
  const autoExpandId = useMemo(() => getAutoExpandId(workouts), [workouts]);

  const renderDescription = useMemo(() => {
    return (content: string) => <Markdown>{content}</Markdown>;
  }, []);

  return (
    <div className={clsx(styles.root, className)}>
      {groups.map(({ date, workouts: dayWorkouts }) => {
        const dayAbbr = getDayAbbr(date);
        const today = isToday(date);

        if (dayWorkouts.length === 0) {
          const restWorkout = createGeneratedRestWorkout(date, restLabel);
          return (
            <div key={restWorkout.id} className={styles.row}>
              <WorkoutCard workout={restWorkout} dateLabel={dayAbbr} isToday={today} readOnly={readOnly} renderDescription={renderDescription} debug={debug} />
            </div>
          );
        }

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
