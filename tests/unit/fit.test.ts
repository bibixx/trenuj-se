import { describe, test, expect } from "vitest";
import { Decoder, Stream } from "@garmin/fitsdk";
import { buildFit, type FitLap, type StravaStream } from "../../server/lib/fit.ts";

const META = {
  sport: "Run",
  startDate: "2026-06-20T06:00:00Z",
  durationSec: 1800,
  movingSec: 1750,
  distanceM: 5000,
  elevationM: 40,
  elevHigh: 220,
  elevLow: 180,
  avgHr: 150,
  maxHr: 175,
  avgPower: 240,
  maxPower: 400,
  normalizedPower: 255,
  calories: 350,
  avgSpeed: 2.78,
  maxSpeed: 4.2,
  avgCadence: 88,
  avgTemp: 21,
  kilojoules: 500,
};

// The FIT SDK decodes position_lat/long as raw semicircles (scale 1); convert back to degrees to check the round-trip.
const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  expect(decoder.isFIT()).toBe(true);
  expect(decoder.checkIntegrity()).toBe(true);
  const { messages, errors } = decoder.read();
  expect(errors).toEqual([]);
  return messages;
}

describe("buildFit", () => {
  test("encodes a GPS activity into a valid FIT file with position + HR + grade records and a full session", () => {
    const streams: StravaStream[] = [
      {
        type: "latlng",
        data: [
          [50.06, 19.93],
          [50.07, 19.94],
          [50.08, 19.95],
        ],
      },
      { type: "time", data: [0, 5, 10] },
      { type: "altitude", data: [210, 212, 214] },
      { type: "heartrate", data: [140, 145, 150] },
      { type: "distance", data: [0, 25, 50] },
      { type: "grade_smooth", data: [1.5, 2.5, 3.5] },
    ];
    const messages = decode(buildFit(streams, META));

    const records = messages.recordMesgs ?? [];
    expect(records).toHaveLength(3);
    expect(records[0]?.heartRate).toBe(140);

    // Bug 1: timestamps must be real, not the 2106 sentinel. First record == start; the 0→10s offsets survive (not squashed to ~4s).
    const start = new Date(META.startDate).getTime();
    expect(records[0]?.timestamp.getUTCFullYear()).toBe(2026);
    expect(records[0]?.timestamp.getTime()).toBe(start);
    expect(records[2]?.timestamp.getTime() - records[0]?.timestamp.getTime()).toBe(10_000);

    // Bug 3: positions must round-trip to the original degrees (a `typeof === number` check missed this).
    expect(records[0]?.positionLat * SEMICIRCLE_TO_DEG).toBeCloseTo(50.06, 4);
    expect(records[0]?.positionLong * SEMICIRCLE_TO_DEG).toBeCloseTo(19.93, 4);

    // grade_smooth → record.grade (sint16, ×100 %)
    expect(records[0]?.grade).toBeCloseTo(1.5, 2);
    expect(records[2]?.grade).toBeCloseTo(3.5, 2);

    const session = (messages.sessionMesgs ?? [])[0];
    expect(session?.sport).toBe("running");
    expect(session?.avgPower).toBe(240);
    expect(session?.maxPower).toBe(400);
    expect(session?.normalizedPower).toBe(255);
    expect(session?.totalCalories).toBe(350);
    expect(session?.avgSpeed).toBeCloseTo(2.78, 3);
    expect(session?.maxSpeed).toBeCloseTo(4.2, 3);
    expect(session?.avgCadence).toBe(88);
    expect(session?.avgTemperature).toBe(21);
    expect(session?.totalWork).toBe(500_000); // 500 kJ → J
    expect(session?.enhancedMaxAltitude).toBeCloseTo(220, 1);
    expect(session?.enhancedMinAltitude).toBeCloseTo(180, 1);
    // moving_time drives total_timer_time; elapsed stays the full duration.
    expect(session?.totalTimerTime).toBe(1750);
    expect(session?.totalElapsedTime).toBe(1800);
  });

  test("emits one FIT lap per Strava lap with full aggregates and matches num_laps (bug 2)", () => {
    const streams: StravaStream[] = [
      { type: "time", data: [0, 5, 10] },
      { type: "heartrate", data: [140, 150, 160] },
      { type: "distance", data: [0, 500, 1000] },
    ];
    const laps: FitLap[] = [
      {
        startDate: "2026-06-20T06:00:00Z",
        elapsedTime: 300,
        movingTime: 295,
        distanceM: 1000,
        avgHr: 165,
        maxHr: 178,
        avgSpeed: 3.33,
        maxSpeed: 4.1,
        avgCadence: 90,
        avgPower: 260,
        totalAscent: 12,
      },
      {
        startDate: "2026-06-20T06:05:00Z",
        elapsedTime: 120,
        movingTime: 120,
        distanceM: 200,
        avgHr: 130,
        maxHr: 150,
        avgSpeed: 1.67,
        maxSpeed: 2.0,
        avgCadence: 78,
        avgPower: 150,
        totalAscent: 0,
      },
      {
        startDate: "2026-06-20T06:07:00Z",
        elapsedTime: 300,
        movingTime: 298,
        distanceM: 1000,
        avgHr: 168,
        maxHr: 180,
        avgSpeed: 3.36,
        maxSpeed: 4.3,
        avgCadence: 91,
        avgPower: 265,
        totalAscent: 8,
      },
    ];
    const messages = decode(buildFit(streams, META, laps));

    expect(messages.lapMesgs ?? []).toHaveLength(3);
    expect((messages.sessionMesgs ?? [])[0]?.numLaps).toBe(3);

    const firstLap = (messages.lapMesgs ?? [])[0];
    expect(firstLap?.totalElapsedTime).toBe(300);
    expect(firstLap?.startTime.getTime()).toBe(new Date(laps[0]!.startDate).getTime());
    expect(firstLap?.avgHeartRate).toBe(165);
    expect(firstLap?.avgSpeed).toBeCloseTo(3.33, 3);
    expect(firstLap?.maxSpeed).toBeCloseTo(4.1, 3);
    expect(firstLap?.avgCadence).toBe(90);
    expect(firstLap?.avgPower).toBe(260);
    expect(firstLap?.totalAscent).toBe(12);
  });

  test("indoor activity (no latlng) still exports records with HR and no position", () => {
    const streams: StravaStream[] = [
      { type: "time", data: [0, 1, 2] },
      { type: "heartrate", data: [120, 122, 124] },
      { type: "cadence", data: [80, 81, 82] },
      { type: "distance", data: [0, 3, 6] },
    ];
    const messages = decode(buildFit(streams, { ...META, sport: "Ride", distanceM: 6 }));

    const records = messages.recordMesgs ?? [];
    expect(records).toHaveLength(3);
    expect(records[0]?.heartRate).toBe(120);
    expect(records[0]?.positionLat).toBeUndefined();
    expect((messages.sessionMesgs ?? [])[0]?.sport).toBe("cycling");
    // No Strava laps → single whole-activity lap fallback.
    expect(messages.lapMesgs ?? []).toHaveLength(1);
  });

  test("no streams still produces a valid file with a session + activity summary", () => {
    const messages = decode(buildFit([], META));
    expect(messages.recordMesgs ?? []).toHaveLength(0);
    expect(messages.lapMesgs ?? []).toHaveLength(1);
    expect(messages.sessionMesgs ?? []).toHaveLength(1);
    expect(messages.activityMesgs ?? []).toHaveLength(1);
  });
});
