export const TARGET_TYPES = ["time", "distance", "open"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export type DurationTarget = {
  type: "time";
  seconds: number;
};

export type DistanceTarget = {
  type: "distance";
  meters: number;
};

export type OpenTarget = {
  type: "open";
};

export type BlockTarget = DurationTarget | DistanceTarget | OpenTarget;

export const PACE_UNITS = ["min/km", "min/mi", "km/h", "mph"] as const;
export type PaceUnit = (typeof PACE_UNITS)[number];

export const PACE_TIME_UNITS = ["min/km", "min/mi"] as const;
export type PaceTimeUnit = (typeof PACE_TIME_UNITS)[number];

export const PACE_SPEED_UNITS = ["km/h", "mph"] as const;
export type PaceSpeedUnit = (typeof PACE_SPEED_UNITS)[number];

export const ALERT_METRICS = ["current", "average"] as const;
export type AlertMetric = (typeof ALERT_METRICS)[number];

export type HeartRateZoneAlert = {
  type: "heartRateZone";
  zone: 1 | 2 | 3 | 4 | 5;
};

export type HeartRateRangeAlert = {
  type: "heartRateRange";
  min: number;
  max: number;
};

export type PaceRangeTimeAlert = {
  type: "paceRange";
  unit: PaceTimeUnit;
  min: string;
  max: string;
  metric?: AlertMetric;
};

export type PaceRangeSpeedAlert = {
  type: "paceRange";
  unit: PaceSpeedUnit;
  min: number;
  max: number;
  metric?: AlertMetric;
};

export type PaceThresholdTimeAlert = {
  type: "paceThreshold";
  unit: PaceTimeUnit;
  threshold: string;
  metric?: AlertMetric;
};

export type PaceThresholdSpeedAlert = {
  type: "paceThreshold";
  unit: PaceSpeedUnit;
  threshold: number;
  metric?: AlertMetric;
};

export type PowerRangeAlert = {
  type: "powerRange";
  min: number;
  max: number;
  metric?: AlertMetric;
};

export type PowerThresholdAlert = {
  type: "powerThreshold";
  threshold: number;
  metric?: AlertMetric;
};

export type CadenceRangeAlert = {
  type: "cadenceRange";
  min: number;
  max: number;
};

export type CadenceThresholdAlert = {
  type: "cadenceThreshold";
  threshold: number;
};

export type WorkoutAlert =
  | HeartRateZoneAlert
  | HeartRateRangeAlert
  | PaceRangeTimeAlert
  | PaceRangeSpeedAlert
  | PaceThresholdTimeAlert
  | PaceThresholdSpeedAlert
  | PowerRangeAlert
  | PowerThresholdAlert
  | CadenceRangeAlert
  | CadenceThresholdAlert;

export type StepFields = {
  displayName?: string;
  alert?: WorkoutAlert;
};

export type WarmupBlock = StepFields & {
  type: "warmup";
  target: BlockTarget;
};

export type CooldownBlock = StepFields & {
  type: "cooldown";
  target: BlockTarget;
};

export type SteadyBlock = StepFields & {
  type: "steady";
  target: BlockTarget;
};

export type RestBlock = StepFields & {
  type: "rest";
  target: BlockTarget;
};

export type FreeBlock = StepFields & {
  type: "free";
  target: BlockTarget;
};

export type IntervalPhase = StepFields & {
  target: BlockTarget;
};

export type IntervalBlock = {
  type: "interval";
  work: IntervalPhase;
  recovery?: IntervalPhase;
  repetitions: number;
};

export type RepeatBlock = {
  type: "repeat";
  repetitions: number;
  blocks: ExecutionBlock[];
};

export type StepBlock = WarmupBlock | CooldownBlock | SteadyBlock | RestBlock | FreeBlock;

export type ExecutionBlock = StepBlock | IntervalBlock | RepeatBlock;

export const APPLE_WATCH_ACTIVITY_TYPES = ["running", "walking", "cycling", "swimming", "hiking", "functional-strength-training", "other"] as const;
export type AppleWatchActivityType = (typeof APPLE_WATCH_ACTIVITY_TYPES)[number];

export type AppleWatchExecution = {
  activityType: AppleWatchActivityType;
  location?: "indoor" | "outdoor";
};

export type WorkoutExecution = {
  version: 2;
  structure: ExecutionBlock[];
  appleWatch?: AppleWatchExecution;
};
