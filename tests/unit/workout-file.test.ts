import { decode } from "@bibixx/workoutkit/decode";
import { describe, expect, it } from "vitest";
import { buildWorkoutFile } from "../../src/lib/workout-file.ts";
import type { Workout } from "../../src/lib/types.ts";
import type { ExecutionBlock, WorkoutExecution } from "../../shared/workout-execution.ts";

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

function exec(structure: ExecutionBlock[], activityType: "running" | "cycling" | "swimming" | "other" = "running"): WorkoutExecution {
  return {
    version: 1,
    structure,
    appleWatch: { activityType, location: "outdoor" },
  };
}

async function blobToPlanJson(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return decode(bytes).toJSON();
}

describe("buildWorkoutFile", () => {
  it("returns null when execution is missing", () => {
    expect(buildWorkoutFile(workout(null))).toBeNull();
  });

  it("returns null when structure contains only note/strength blocks", () => {
    const w = workout(
      exec([
        { type: "note", text: "Read the plan" },
        { type: "strength", exercises: [{ name: "Squat", reps: 5 }] },
      ]),
    );
    expect(buildWorkoutFile(w)).toBeNull();
  });

  it("extracts warmup and cooldown and emits interval blocks", async () => {
    const w = workout(
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
    );

    const file = buildWorkoutFile(w);
    expect(file).not.toBeNull();
    expect(file!.filename).toBe("tempo-intervals-2026-04-20.workout");

    const json = await blobToPlanJson(file!.blob);
    expect(json.referenceId).toBe("workout-1");
    expect(json.custom).toBeDefined();
    expect(json.custom!.activity).toBe("running");
    expect(json.custom!.location).toBe("outdoor");
    expect(json.custom!.displayName).toBe("Tempo intervals");
    expect(json.custom!.warmup?.goal).toEqual({ type: "time", time: { value: 600, unit: "seconds" } });
    expect(json.custom!.cooldown?.goal).toEqual({ type: "time", time: { value: 300, unit: "seconds" } });
    expect(json.custom!.blocks).toHaveLength(1);
    expect(json.custom!.blocks[0]!.iterations).toBe(4);
    expect(json.custom!.blocks[0]!.steps).toEqual([
      { purpose: "work", step: { goal: { type: "distance", distance: { value: 1000, unit: "meters" } } } },
      { purpose: "recovery", step: { goal: { type: "time", time: { value: 90, unit: "seconds" } } } },
    ]);
  });

  it("omits recovery step when interval has no recovery", async () => {
    const w = workout(
      exec([
        {
          type: "interval",
          repetitions: 6,
          work: { target: { type: "time", seconds: 30 } },
        },
      ]),
    );
    const file = buildWorkoutFile(w)!;
    const json = await blobToPlanJson(file.blob);
    expect(json.custom!.blocks[0]!.steps).toEqual([{ purpose: "work", step: { goal: { type: "time", time: { value: 30, unit: "seconds" } } } }]);
  });

  it("flattens nested repeat of interval blocks sequentially", async () => {
    const w = workout(
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
    );
    const file = buildWorkoutFile(w)!;
    const json = await blobToPlanJson(file.blob);
    expect(json.custom!.blocks).toHaveLength(3);
    for (const block of json.custom!.blocks) {
      expect(block.iterations).toBe(5);
      expect(block.steps).toHaveLength(2);
    }
  });

  it("collapses repeat of simple blocks into one Block(N) with each step", async () => {
    const w = workout(
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
    );
    const file = buildWorkoutFile(w)!;
    const json = await blobToPlanJson(file.blob);
    expect(json.custom!.blocks).toHaveLength(1);
    expect(json.custom!.blocks[0]!.iterations).toBe(3);
    expect(json.custom!.blocks[0]!.steps.map((s) => s.purpose)).toEqual(["work", "recovery"]);
  });

  it("drops note and strength blocks while keeping encodable ones", async () => {
    const w = workout(
      exec([
        { type: "note", text: "remember to hydrate" },
        {
          type: "interval",
          repetitions: 2,
          work: { target: { type: "time", seconds: 60 } },
        },
        { type: "strength", exercises: [{ name: "Pushup", reps: 10 }] },
      ]),
    );
    const file = buildWorkoutFile(w)!;
    const json = await blobToPlanJson(file.blob);
    expect(json.custom!.blocks).toHaveLength(1);
    expect(json.custom!.blocks[0]!.iterations).toBe(2);
  });

  it("maps functional-strength-training activity type", async () => {
    const w = workout(
      exec(
        [
          {
            type: "interval",
            repetitions: 1,
            work: { target: { type: "open" } },
          },
        ],
        "other",
      ),
    );
    // override activityType directly
    w.execution!.appleWatch!.activityType = "functional-strength-training";
    const file = buildWorkoutFile(w)!;
    const json = await blobToPlanJson(file.blob);
    expect(json.custom!.activity).toBe("functionalStrengthTraining");
  });

  it("slugifies messy titles for the filename", () => {
    const w = workout(
      exec([
        {
          type: "interval",
          repetitions: 1,
          work: { target: { type: "time", seconds: 60 } },
        },
      ]),
      { title: "  Tempo Intervals #1!! ", date: "2026-05-01" },
    );
    const file = buildWorkoutFile(w)!;
    expect(file.filename).toBe("tempo-intervals-1-2026-05-01.workout");
  });

  it("falls back to 'workout' when title slug is empty", () => {
    const w = workout(
      exec([
        {
          type: "interval",
          repetitions: 1,
          work: { target: { type: "time", seconds: 60 } },
        },
      ]),
      { title: "!!!", date: "2026-05-01" },
    );
    const file = buildWorkoutFile(w)!;
    expect(file.filename).toBe("workout-2026-05-01.workout");
  });
});
