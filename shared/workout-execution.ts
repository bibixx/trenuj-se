export const EXECUTION_GOALS = ["endurance", "recovery", "tempo", "threshold", "vo2max", "speed", "strength", "mobility", "technique", "race"] as const;
export type ExecutionGoal = (typeof EXECUTION_GOALS)[number];

export const TARGET_TYPES = ["time", "distance", "open", "lap-button"] as const;
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

export type LapButtonTarget = {
  type: "lap-button";
};

export type BlockTarget = DurationTarget | DistanceTarget | OpenTarget | LapButtonTarget;

export const INTENSITY_KINDS = ["easy", "steady", "moderate", "hard", "max", "recovery", "custom"] as const;
export type IntensityKind = (typeof INTENSITY_KINDS)[number];

export type Intensity =
  | { kind: "easy" }
  | { kind: "steady" }
  | { kind: "moderate" }
  | { kind: "hard" }
  | { kind: "max" }
  | { kind: "recovery" }
  | { kind: "custom"; label: string };

export const PACE_UNITS = ["min/km", "min/mi", "speed-kmh", "speed-mph"] as const;
export type PaceUnit = (typeof PACE_UNITS)[number];

export type PaceCue = {
  unit: PaceUnit;
  min?: number;
  max?: number;
  label?: string;
};

export type HrCue = {
  zone?: 1 | 2 | 3 | 4 | 5;
  min?: number;
  max?: number;
};

export type PowerCue = {
  min?: number;
  max?: number;
  ftpPercentMin?: number;
  ftpPercentMax?: number;
};

export type CadenceCue = {
  min?: number;
  max?: number;
};

export type Cue = {
  intensity?: Intensity;
  pace?: PaceCue;
  heartRate?: HrCue;
  power?: PowerCue;
  cadence?: CadenceCue;
  notes?: string;
};

export type BaseBlock = {
  title?: string;
  notes?: string;
  cue?: Cue;
};

export type WarmupBlock = BaseBlock & {
  type: "warmup";
  target: BlockTarget;
};

export type CooldownBlock = BaseBlock & {
  type: "cooldown";
  target: BlockTarget;
};

export type SteadyBlock = BaseBlock & {
  type: "steady";
  target: BlockTarget;
};

export type RestBlock = BaseBlock & {
  type: "rest";
  target: BlockTarget;
};

export type FreeBlock = BaseBlock & {
  type: "free";
  target: BlockTarget;
};

export type NoteBlock = {
  type: "note";
  text: string;
};

export type IntervalBlock = BaseBlock & {
  type: "interval";
  work: {
    target: BlockTarget;
    cue?: Cue;
  };
  recovery?: {
    target: BlockTarget;
    cue?: Cue;
  };
  repetitions: number;
};

export type RepeatBlock = BaseBlock & {
  type: "repeat";
  repetitions: number;
  blocks: ExecutionBlock[];
};

export type StrengthBlock = BaseBlock & {
  type: "strength";
  exercises: Array<{
    name: string;
    reps?: number;
    durationSec?: number;
    weightKg?: number;
    notes?: string;
  }>;
  sets?: number;
  restSeconds?: number;
};

export type ExecutionBlock = WarmupBlock | CooldownBlock | SteadyBlock | RestBlock | FreeBlock | NoteBlock | IntervalBlock | RepeatBlock | StrengthBlock;

export const APPLE_WATCH_ACTIVITY_TYPES = ["running", "walking", "cycling", "swimming", "hiking", "functional-strength-training", "other"] as const;
export type AppleWatchActivityType = (typeof APPLE_WATCH_ACTIVITY_TYPES)[number];

export const APPLE_WATCH_METRICS = ["time", "distance", "heart-rate", "pace", "power", "cadence"] as const;
export type AppleWatchMetric = (typeof APPLE_WATCH_METRICS)[number];

export type AppleWatchExecution = {
  activityType: AppleWatchActivityType;
  location?: "indoor" | "outdoor";
  poolLengthMeters?: number;
  alerts?: {
    audio?: boolean;
    haptics?: boolean;
  };
  displayHints?: {
    primaryMetric?: AppleWatchMetric;
    secondaryMetric?: AppleWatchMetric;
  };
};

export type WorkoutExecution = {
  version: 1;
  summary?: {
    goal?: ExecutionGoal;
    notes?: string;
  };
  structure: ExecutionBlock[];
  appleWatch?: AppleWatchExecution;
};
