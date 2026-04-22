import {
  type ActivityName,
  Distance,
  DistanceGoal,
  Duration,
  type Goal,
  IntervalBlock,
  IntervalStep,
  type Location,
  OpenGoal,
  type Purpose,
  Step,
  TimeGoal,
  WorkoutPlan,
} from "@bibixx/workoutkit";
import { toBlob } from "@bibixx/workoutkit/encode";
import type { AppleWatchActivityType, BlockTarget, ExecutionBlock, WorkoutExecution } from "../../shared/workout-execution";
import type { Workout } from "./types";

const ACTIVITY_MAP: Record<AppleWatchActivityType, ActivityName> = {
  running: "running",
  walking: "walking",
  cycling: "cycling",
  swimming: "swimming",
  hiking: "hiking",
  "functional-strength-training": "functionalStrengthTraining",
  other: "other",
};

export interface WorkoutFile {
  blob: Blob;
  filename: string;
}

export function buildWorkoutFile(workout: Workout): WorkoutFile | null {
  if (!workout.execution) return null;

  const plan = buildWorkoutPlan(workout.id, workout.title, workout.execution);
  if (!plan) return null;

  return {
    blob: toBlob(plan),
    filename: `${slug(workout.title)}-${workout.date}.workout`,
  };
}

function buildWorkoutPlan(referenceId: string, title: string, execution: WorkoutExecution): WorkoutPlan | null {
  const activity = ACTIVITY_MAP[execution.appleWatch?.activityType ?? "other"];
  const location: Location = execution.appleWatch?.location ?? "unknown";

  let structure = execution.structure;

  const warmupStep = structure[0]?.type === "warmup" ? new Step(goalFromTarget(structure[0].target)) : null;
  if (warmupStep) structure = structure.slice(1);

  const last = structure[structure.length - 1];
  const cooldownStep = last && last.type === "cooldown" ? new Step(goalFromTarget(last.target)) : null;
  if (cooldownStep) structure = structure.slice(0, -1);

  const blocks = structure.flatMap(toIntervalBlocks);

  if (!warmupStep && !cooldownStep && blocks.length === 0) return null;

  const plan = new WorkoutPlan({ referenceId });
  const custom = plan.asCustom({ activity, location, displayName: title });
  if (warmupStep) custom.warmup = warmupStep;
  if (cooldownStep) custom.cooldown = cooldownStep;
  custom.blocks = blocks;
  return plan;
}

function toIntervalBlocks(block: ExecutionBlock): IntervalBlock[] {
  switch (block.type) {
    case "warmup":
    case "cooldown":
    case "steady":
    case "free":
      return [singleStepBlock("work", block.target)];
    case "rest":
      return [singleStepBlock("recovery", block.target)];
    case "interval": {
      const steps = [new IntervalStep("work", new Step(goalFromTarget(block.work.target)))];
      if (block.recovery) {
        steps.push(new IntervalStep("recovery", new Step(goalFromTarget(block.recovery.target))));
      }
      const out = new IntervalBlock(block.repetitions);
      out.steps = steps;
      return [out];
    }
    case "repeat": {
      const inner = block.blocks.flatMap(toIntervalBlocks);
      if (inner.every(isSimpleSingleStepBlock)) {
        const merged = new IntervalBlock(block.repetitions);
        merged.steps = inner.map((b) => b.steps[0]!);
        return [merged];
      }
      const out: IntervalBlock[] = [];
      for (let i = 0; i < block.repetitions; i++) out.push(...inner);
      return out;
    }
    case "note":
    case "strength":
      return [];
  }
}

function singleStepBlock(purpose: Purpose, target: BlockTarget): IntervalBlock {
  const block = new IntervalBlock(1);
  block.steps = [new IntervalStep(purpose, new Step(goalFromTarget(target)))];
  return block;
}

function isSimpleSingleStepBlock(block: IntervalBlock): boolean {
  return block.iterations === 1 && block.steps.length === 1;
}

function goalFromTarget(target: BlockTarget): Goal {
  switch (target.type) {
    case "time":
      return new TimeGoal(new Duration(target.seconds, "seconds"));
    case "distance":
      return new DistanceGoal(new Distance(target.meters, "meters"));
    case "open":
    case "lap-button":
      return new OpenGoal();
  }
}

function slug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workout";
}
