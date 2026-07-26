import type { WorkoutPlan } from "@bibixx/workoutkit";
import { toBlob } from "@bibixx/workoutkit/encode";
import { buildWorkoutPlanFromExecution } from "../../shared/workout-plan";
import type { Workout } from "./types";

export interface WorkoutFile {
  blob: Blob;
  filename: string;
}

export function buildWorkoutPlan(workout: Workout): WorkoutPlan | null {
  if (!workout.execution) return null;
  return buildWorkoutPlanFromExecution(workout.id, workout.title, workout.execution);
}

export function buildWorkoutFile(workout: Workout): WorkoutFile | null {
  const plan = buildWorkoutPlan(workout);
  if (!plan) return null;

  return {
    blob: toBlob(plan),
    filename: `${slug(workout.title)}-${workout.date}.workout`,
  };
}

export function fitFilename(workout: Pick<Workout, "title" | "date">): string {
  return `${slug(workout.title)}-${workout.date}.fit`;
}

function slug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workout";
}
