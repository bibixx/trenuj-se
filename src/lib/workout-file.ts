import {
  type ActivityName,
  Cadence,
  CadenceRangeAlert,
  CadenceThresholdAlert,
  Distance,
  DistanceGoal,
  Duration,
  type Goal,
  HeartRate,
  HeartRateRangeAlert,
  HeartRateZoneAlert,
  IntervalBlock,
  IntervalStep,
  type Location,
  OpenGoal,
  Power,
  PowerRangeAlert,
  PowerThresholdAlert,
  type Purpose,
  Speed,
  SpeedRangeAlert,
  SpeedThresholdAlert,
  Step,
  TimeGoal,
  WorkoutPlan,
} from "@bibixx/workoutkit";
import { toBlob } from "@bibixx/workoutkit/encode";
import { distanceUnitFromPaceUnit, isPaceTimeUnit, paceTimeToSeconds } from "../../shared/workout-execution-pace";
import type {
  AppleWatchActivityType,
  BlockTarget,
  ExecutionBlock,
  IntervalPhase,
  PaceRangeTimeAlert,
  PaceSpeedUnit,
  PaceThresholdTimeAlert,
  PaceTimeUnit,
  StepBlock,
  WorkoutAlert,
  WorkoutExecution,
} from "../../shared/workout-execution";
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

function buildWorkoutPlanFromExecution(referenceId: string, title: string, execution: WorkoutExecution): WorkoutPlan | null {
  const activity = ACTIVITY_MAP[execution.appleWatch?.activityType ?? "other"];
  const location: Location = execution.appleWatch?.location ?? "unknown";

  let structure = execution.structure;

  const warmupStep = structure[0]?.type === "warmup" ? stepFromBlock(structure[0]) : null;
  if (warmupStep) structure = structure.slice(1);

  const last = structure[structure.length - 1];
  const cooldownStep = last && last.type === "cooldown" ? stepFromBlock(last) : null;
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
      return [singleStepBlock("work", stepFromBlock(block))];
    case "rest":
      return [singleStepBlock("recovery", stepFromBlock(block))];
    case "interval": {
      const steps = [new IntervalStep("work", stepFromPhase(block.work))];
      if (block.recovery) {
        steps.push(new IntervalStep("recovery", stepFromPhase(block.recovery)));
      }
      const out = new IntervalBlock(block.repetitions);
      out.steps = steps;
      return [out];
    }
    case "repeat": {
      const inner = block.blocks.flatMap(toIntervalBlocks);
      if (inner.every(isSimpleSingleStepBlock)) {
        const merged = new IntervalBlock(block.repetitions);
        merged.steps = inner.map((innerBlock) => innerBlock.steps[0]!);
        return [merged];
      }
      const out: IntervalBlock[] = [];
      for (let i = 0; i < block.repetitions; i++) out.push(...inner);
      return out;
    }
  }
}

function stepFromBlock(block: StepBlock): Step {
  return new Step(goalFromTarget(block.target), block.displayName, alertFromExecutionAlert(block.alert));
}

function stepFromPhase(phase: IntervalPhase): Step {
  return new Step(goalFromTarget(phase.target), phase.displayName, alertFromExecutionAlert(phase.alert));
}

function singleStepBlock(purpose: Purpose, step: Step): IntervalBlock {
  const block = new IntervalBlock(1);
  block.steps = [new IntervalStep(purpose, step)];
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
      return new OpenGoal();
  }
}

function alertFromExecutionAlert(alert: WorkoutAlert | undefined) {
  if (!alert) return undefined;

  switch (alert.type) {
    case "heartRateZone":
      return new HeartRateZoneAlert(alert.zone);
    case "heartRateRange":
      return new HeartRateRangeAlert(new HeartRate(alert.min), new HeartRate(alert.max));
    case "paceRange":
      if (isPaceTimeRangeAlert(alert)) {
        return new SpeedRangeAlert(speedFromPaceTime(alert.unit, alert.max), speedFromPaceTime(alert.unit, alert.min), alert.metric);
      }
      return new SpeedRangeAlert(speedFromSpeed(alert.unit, alert.min), speedFromSpeed(alert.unit, alert.max), alert.metric);
    case "paceThreshold":
      if (isPaceTimeThresholdAlert(alert)) {
        return new SpeedThresholdAlert(speedFromPaceTime(alert.unit, alert.threshold), alert.metric);
      }
      return new SpeedThresholdAlert(speedFromSpeed(alert.unit, alert.threshold), alert.metric);
    case "powerRange":
      return new PowerRangeAlert(new Power(alert.min, "watts"), new Power(alert.max, "watts"), alert.metric);
    case "powerThreshold":
      return new PowerThresholdAlert(new Power(alert.threshold, "watts"), alert.metric);
    case "cadenceRange":
      return new CadenceRangeAlert(new Cadence(alert.min), new Cadence(alert.max));
    case "cadenceThreshold":
      return new CadenceThresholdAlert(new Cadence(alert.threshold));
  }
}

function isPaceTimeRangeAlert(alert: Extract<WorkoutAlert, { type: "paceRange" }>): alert is PaceRangeTimeAlert {
  return isPaceTimeUnit(alert.unit);
}

function isPaceTimeThresholdAlert(alert: Extract<WorkoutAlert, { type: "paceThreshold" }>): alert is PaceThresholdTimeAlert {
  return isPaceTimeUnit(alert.unit);
}

function speedFromPaceTime(unit: PaceTimeUnit, value: string): Speed {
  return new Speed(new Distance(1, distanceUnitFromPaceUnit(unit)), new Duration(paceTimeToSeconds(value), "seconds"));
}

function speedFromSpeed(unit: PaceSpeedUnit, value: number): Speed {
  return new Speed(new Distance(value, distanceUnitFromPaceUnit(unit)), new Duration(1, "hours"));
}

function slug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "workout";
}
