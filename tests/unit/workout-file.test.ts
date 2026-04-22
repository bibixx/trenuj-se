import {
  Cadence,
  CadenceRangeAlert,
  CadenceThresholdAlert,
  Distance,
  DistanceGoal,
  Duration,
  HeartRate,
  HeartRateRangeAlert,
  HeartRateZoneAlert,
  IntervalBlock,
  IntervalStep,
  OpenGoal,
  Power,
  PowerRangeAlert,
  PowerThresholdAlert,
  Speed,
  SpeedRangeAlert,
  SpeedThresholdAlert,
  Step,
  TimeGoal,
  WorkoutPlan,
  type Alert,
  type Goal,
  type Purpose,
} from "@bibixx/workoutkit";
import { decode } from "@bibixx/workoutkit/decode";
import { describe, expect, it } from "vitest";
import { distanceUnitFromPaceUnit, paceTimeToSeconds } from "../../shared/workout-execution-pace";
import { buildWorkoutFile, buildWorkoutPlan } from "../../src/lib/workout-file.ts";
import type { Workout } from "../../src/lib/types.ts";
import type { AppleWatchActivityType, ExecutionBlock, PaceSpeedUnit, PaceTimeUnit, WorkoutAlert, WorkoutExecution } from "../../shared/workout-execution.ts";

function workout(execution: WorkoutExecution | null, overrides: Partial<Workout> = {}): Workout {
  return {
    id: "workout-1",
    planId: "plan-1",
    phaseId: null,
    labelId: null,
    date: "2026-04-20",
    title: "Tempo intervals",
    description: null,
    targetDurationMin: null,
    targetDistanceM: null,
    sortOrder: 0,
    status: "planned",
    completionNotes: null,
    trainerNotes: null,
    activityId: null,
    execution,
    metadata: null,
    createdAt: "2026-04-18T00:00:00Z",
    updatedAt: "2026-04-18T00:00:00Z",
    ...overrides,
  };
}

function exec(structure: ExecutionBlock[], activityType: AppleWatchActivityType = "running", location: "indoor" | "outdoor" | null = "outdoor"): WorkoutExecution {
  return {
    version: 2,
    structure,
    appleWatch: {
      activityType,
      ...(location ? { location } : {}),
    },
  };
}

function expectedPlan(options: {
  activity?: "running" | "walking" | "cycling" | "swimming" | "hiking" | "functionalStrengthTraining" | "other";
  location?: "unknown" | "indoor" | "outdoor";
  displayName?: string;
  warmup?: Step;
  blocks?: IntervalBlock[];
  cooldown?: Step;
}) {
  const plan = new WorkoutPlan({ referenceId: "workout-1" });
  const custom = plan.asCustom({
    activity: options.activity ?? "running",
    location: options.location ?? "outdoor",
    displayName: options.displayName ?? "Tempo intervals",
  });
  if (options.warmup) custom.warmup = options.warmup;
  if (options.cooldown) custom.cooldown = options.cooldown;
  custom.blocks = options.blocks ?? [];
  return plan;
}

function makeStep(goal: Goal, options: { displayName?: string; alert?: Alert } = {}) {
  return new Step(goal, options.displayName, options.alert);
}

function makeBlock(iterations: number, steps: Array<{ purpose: Purpose; step: Step }>) {
  const block = new IntervalBlock(iterations);
  block.steps = steps.map(({ purpose, step }) => new IntervalStep(purpose, step));
  return block;
}

function timeGoal(seconds: number) {
  return new TimeGoal(new Duration(seconds, "seconds"));
}

function distanceGoal(meters: number) {
  return new DistanceGoal(new Distance(meters, "meters"));
}

function pace(unit: PaceTimeUnit, value: string) {
  return new Speed(new Distance(1, distanceUnitFromPaceUnit(unit)), new Duration(paceTimeToSeconds(value), "seconds"));
}

function speed(unit: PaceSpeedUnit, value: number) {
  return new Speed(new Distance(value, distanceUnitFromPaceUnit(unit)), new Duration(1, "hours"));
}

async function blobToPlanJson(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return decode(bytes).toJSON();
}

describe("buildWorkoutPlan", () => {
  it("returns null when execution is missing", () => {
    expect(buildWorkoutPlan(workout(null))).toBeNull();
  });

  it("extracts warmup and cooldown and emits interval blocks", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          { type: "warmup", target: { type: "time", seconds: 600 } },
          {
            type: "interval",
            repetitions: 4,
            work: { target: { type: "distance", meters: 1000 } },
            recovery: { target: { type: "time", seconds: 90 } },
          },
          { type: "cooldown", target: { type: "time", seconds: 300 } },
        ]),
      ),
    );

    const expected = expectedPlan({
      warmup: makeStep(timeGoal(600)),
      cooldown: makeStep(timeGoal(300)),
      blocks: [
        makeBlock(4, [
          { purpose: "work", step: makeStep(distanceGoal(1000)) },
          { purpose: "recovery", step: makeStep(timeGoal(90)) },
        ]),
      ],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it("omits recovery when an interval has no recovery step", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          {
            type: "interval",
            repetitions: 6,
            work: { target: { type: "time", seconds: 30 } },
          },
        ]),
      ),
    );

    const expected = expectedPlan({
      blocks: [makeBlock(6, [{ purpose: "work", step: makeStep(timeGoal(30)) }])],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it("flattens nested repeat blocks sequentially when they cannot be merged", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          {
            type: "repeat",
            repetitions: 3,
            blocks: [
              {
                type: "interval",
                repetitions: 5,
                work: { target: { type: "time", seconds: 60 } },
                recovery: { target: { type: "time", seconds: 30 } },
              },
            ],
          },
        ]),
      ),
    );

    const repeatedBlock = makeBlock(5, [
      { purpose: "work", step: makeStep(timeGoal(60)) },
      { purpose: "recovery", step: makeStep(timeGoal(30)) },
    ]);
    const expected = expectedPlan({ blocks: [repeatedBlock, repeatedBlock, repeatedBlock] });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it("collapses repeat of simple blocks into one merged interval block", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          {
            type: "repeat",
            repetitions: 3,
            blocks: [
              { type: "steady", target: { type: "time", seconds: 120 } },
              { type: "rest", target: { type: "time", seconds: 60 } },
            ],
          },
        ]),
      ),
    );

    const expected = expectedPlan({
      blocks: [
        makeBlock(3, [
          { purpose: "work", step: makeStep(timeGoal(120)) },
          { purpose: "recovery", step: makeStep(timeGoal(60)) },
        ]),
      ],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it("defaults the workout location to unknown when appleWatch.location is omitted", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec(
          [
            {
              type: "interval",
              repetitions: 1,
              work: { target: { type: "open" } },
            },
          ],
          "running",
          null,
        ),
      ),
    );

    const expected = expectedPlan({
      location: "unknown",
      blocks: [makeBlock(1, [{ purpose: "work", step: makeStep(new OpenGoal()) }])],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it("preserves display names on warmup, steady, and cooldown steps", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          { type: "warmup", target: { type: "time", seconds: 600 }, displayName: "Warmup jog" },
          { type: "steady", target: { type: "time", seconds: 1200 }, displayName: "Main set" },
          { type: "cooldown", target: { type: "time", seconds: 300 }, displayName: "Cool down" },
        ]),
      ),
    );

    const expected = expectedPlan({
      warmup: makeStep(timeGoal(600), { displayName: "Warmup jog" }),
      cooldown: makeStep(timeGoal(300), { displayName: "Cool down" }),
      blocks: [makeBlock(1, [{ purpose: "work", step: makeStep(timeGoal(1200), { displayName: "Main set" }) }])],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it("preserves display names on interval work and recovery phases", () => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          {
            type: "interval",
            repetitions: 2,
            work: { target: { type: "distance", meters: 400 }, displayName: "Fast rep" },
            recovery: { target: { type: "time", seconds: 60 }, displayName: "Jog recover" },
          },
        ]),
      ),
    );

    const expected = expectedPlan({
      blocks: [
        makeBlock(2, [
          { purpose: "work", step: makeStep(distanceGoal(400), { displayName: "Fast rep" }) },
          { purpose: "recovery", step: makeStep(timeGoal(60), { displayName: "Jog recover" }) },
        ]),
      ],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it.each([
    ["running", "running"],
    ["walking", "walking"],
    ["cycling", "cycling"],
    ["swimming", "swimming"],
    ["hiking", "hiking"],
    ["functional-strength-training", "functionalStrengthTraining"],
    ["other", "other"],
  ] as const)("maps %s to WorkoutKit activity %s", (activityType, expectedActivity) => {
    const actual = buildWorkoutPlan(
      workout(
        exec(
          [
            {
              type: "interval",
              repetitions: 1,
              work: { target: { type: "open" } },
            },
          ],
          activityType,
        ),
      ),
    );

    const expected = expectedPlan({
      activity: expectedActivity,
      blocks: [makeBlock(1, [{ purpose: "work", step: makeStep(new OpenGoal()) }])],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });

  it.each<{
    name: string;
    alert: WorkoutAlert;
    expectedAlert: Alert;
  }>([
    {
      name: "heart-rate zone",
      alert: { type: "heartRateZone", zone: 4 },
      expectedAlert: new HeartRateZoneAlert(4),
    },
    {
      name: "heart-rate range",
      alert: { type: "heartRateRange", min: 145, max: 162 },
      expectedAlert: new HeartRateRangeAlert(new HeartRate(145), new HeartRate(162)),
    },
    {
      name: "time-based pace range",
      alert: { type: "paceRange", unit: "min/km", min: "4:50", max: "5:10" },
      expectedAlert: new SpeedRangeAlert(pace("min/km", "5:10"), pace("min/km", "4:50")),
    },
    {
      name: "time-based pace threshold",
      alert: { type: "paceThreshold", unit: "min/mi", threshold: "7:30", metric: "average" },
      expectedAlert: new SpeedThresholdAlert(pace("min/mi", "7:30"), "average"),
    },
    {
      name: "speed-based pace range",
      alert: { type: "paceRange", unit: "km/h", min: 20, max: 24, metric: "average" },
      expectedAlert: new SpeedRangeAlert(speed("km/h", 20), speed("km/h", 24), "average"),
    },
    {
      name: "speed-based pace threshold",
      alert: { type: "paceThreshold", unit: "mph", threshold: 13.1 },
      expectedAlert: new SpeedThresholdAlert(speed("mph", 13.1)),
    },
    {
      name: "power range",
      alert: { type: "powerRange", min: 210, max: 245, metric: "average" },
      expectedAlert: new PowerRangeAlert(new Power(210, "watts"), new Power(245, "watts"), "average"),
    },
    {
      name: "power threshold",
      alert: { type: "powerThreshold", threshold: 300 },
      expectedAlert: new PowerThresholdAlert(new Power(300, "watts")),
    },
    {
      name: "cadence range",
      alert: { type: "cadenceRange", min: 88, max: 94 },
      expectedAlert: new CadenceRangeAlert(new Cadence(88), new Cadence(94)),
    },
    {
      name: "cadence threshold",
      alert: { type: "cadenceThreshold", threshold: 178 },
      expectedAlert: new CadenceThresholdAlert(new Cadence(178)),
    },
  ])("maps %s alerts to WorkoutKit JSON", ({ alert, expectedAlert }) => {
    const actual = buildWorkoutPlan(
      workout(
        exec([
          {
            type: "steady",
            target: { type: "time", seconds: 600 },
            alert,
          },
        ]),
      ),
    );

    const expected = expectedPlan({
      blocks: [
        makeBlock(1, [
          {
            purpose: "work",
            step: makeStep(timeGoal(600), { alert: expectedAlert }),
          },
        ]),
      ],
    });

    expect(actual?.toJSON()).toEqual(expected.toJSON());
  });
});

describe("buildWorkoutFile", () => {
  it("returns null when execution is missing", () => {
    expect(buildWorkoutFile(workout(null))).toBeNull();
  });

  it("round-trips the generated plan through workout bytes", async () => {
    const w = workout(
      exec([
        { type: "warmup", target: { type: "time", seconds: 600 }, displayName: "Warmup" },
        {
          type: "interval",
          repetitions: 4,
          work: { target: { type: "distance", meters: 1000 }, alert: { type: "heartRateZone", zone: 4 } },
          recovery: { target: { type: "time", seconds: 90 } },
        },
        { type: "cooldown", target: { type: "time", seconds: 300 } },
      ]),
    );

    const plan = buildWorkoutPlan(w)!;
    const file = buildWorkoutFile(w)!;

    expect(file.filename).toBe("tempo-intervals-2026-04-20.workout");
    expect(await blobToPlanJson(file.blob)).toEqual(plan.toJSON());
  });

  it("slugifies messy titles for the filename", () => {
    const file = buildWorkoutFile(
      workout(
        exec([
          {
            type: "interval",
            repetitions: 1,
            work: { target: { type: "time", seconds: 60 } },
          },
        ]),
        { title: "  Tempo Intervals #1!! ", date: "2026-05-01" },
      ),
    );

    expect(file?.filename).toBe("tempo-intervals-1-2026-05-01.workout");
  });

  it("falls back to 'workout' when the title slug is empty", () => {
    const file = buildWorkoutFile(
      workout(
        exec([
          {
            type: "interval",
            repetitions: 1,
            work: { target: { type: "time", seconds: 60 } },
          },
        ]),
        { title: "!!!", date: "2026-05-01" },
      ),
    );

    expect(file?.filename).toBe("workout-2026-05-01.workout");
  });
});
