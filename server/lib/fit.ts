import { FitWriter } from "@markw65/fit-file-writer";

export type StravaStream = { type: string; data: unknown[] };

export interface FitActivityMeta {
  sport: string;
  startDate: string;
  durationSec: number;
  movingSec: number | null;
  distanceM: number | null;
  elevationM: number | null;
  elevHigh: number | null;
  elevLow: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  maxPower: number | null;
  normalizedPower: number | null;
  calories: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  avgCadence: number | null;
  avgTemp: number | null;
  kilojoules: number | null;
}

export interface FitLap {
  startDate: string;
  elapsedTime: number;
  movingTime: number | null;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgSpeed: number | null;
  maxSpeed: number | null;
  avgCadence: number | null;
  avgPower: number | null;
  totalAscent: number | null;
}

type FitSport = "running" | "cycling" | "swimming" | "walking" | "hiking" | "generic";

const SPORT_MAP: Record<string, FitSport> = {
  Run: "running",
  TrailRun: "running",
  VirtualRun: "running",
  Ride: "cycling",
  GravelRide: "cycling",
  MountainBikeRide: "cycling",
  EBikeRide: "cycling",
  EMountainBikeRide: "cycling",
  VirtualRide: "cycling",
  Swim: "swimming",
  Walk: "walking",
  Hike: "hiking",
};

function fitSport(sport: string): FitSport {
  return SPORT_MAP[sport] ?? "generic";
}

function streamData(streams: StravaStream[], type: string): unknown[] | null {
  const stream = streams.find((entry) => entry.type === type);
  return stream && Array.isArray(stream.data) ? stream.data : null;
}

function numberAt(data: unknown[] | null, index: number): number | null {
  const value = data?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latLngAt(latlng: unknown[] | null, index: number): { lat: number; lon: number } | null {
  const pair = latlng?.[index];
  if (!Array.isArray(pair)) return null;
  const lat = pair[0];
  const lon = pair[1];
  return typeof lat === "number" && typeof lon === "number" ? { lat, lon } : null;
}

/**
 * Encode Strava activity streams (fetched with key_type=time) into a binary FIT activity file.
 * Always returns bytes: activities without a `latlng` stream (treadmill/trainer/pool) still export
 * their heart-rate, cadence, power, distance and time — which GPX cannot represent.
 */
export function buildFit(streams: StravaStream[], meta: FitActivityMeta, laps: FitLap[] = []): Uint8Array {
  const fit = new FitWriter();

  const startMs = new Date(meta.startDate).getTime();
  const base = Number.isFinite(startMs) ? startMs : Date.now(); // milliseconds — fit.time() divides by 1000 internally
  const startStamp = fit.time(base);

  fit.writeMessage("file_id", { type: "activity", manufacturer: "development", product_name: "trenuj.se", time_created: startStamp }, null, true);

  const latlng = streamData(streams, "latlng");
  const time = streamData(streams, "time");
  const altitude = streamData(streams, "altitude");
  const heartrate = streamData(streams, "heartrate");
  const cadence = streamData(streams, "cadence");
  const distance = streamData(streams, "distance");
  const velocity = streamData(streams, "velocity_smooth");
  const watts = streamData(streams, "watts");
  const temp = streamData(streams, "temp");
  const grade = streamData(streams, "grade_smooth");

  const count = Math.max(
    latlng?.length ?? 0,
    time?.length ?? 0,
    heartrate?.length ?? 0,
    distance?.length ?? 0,
    altitude?.length ?? 0,
    cadence?.length ?? 0,
    velocity?.length ?? 0,
    watts?.length ?? 0,
    grade?.length ?? 0,
  );

  for (let i = 0; i < count; i++) {
    const offset = numberAt(time, i);
    const timestamp = offset != null ? fit.time(base + offset * 1000) : fit.time(base + i * 1000);
    const pos = latLngAt(latlng, i);
    const alt = numberAt(altitude, i);
    const hr = numberAt(heartrate, i);
    const cad = numberAt(cadence, i);
    const dist = numberAt(distance, i);
    const spd = numberAt(velocity, i);
    const pwr = numberAt(watts, i);
    const tmp = numberAt(temp, i);
    const grd = numberAt(grade, i);

    fit.writeMessage(
      "record",
      {
        timestamp,
        ...(pos ? { position_lat: fit.latlng((pos.lat * Math.PI) / 180), position_long: fit.latlng((pos.lon * Math.PI) / 180) } : {}),
        ...(alt != null ? { altitude: alt } : {}),
        ...(dist != null ? { distance: dist } : {}),
        ...(spd != null ? { speed: spd } : {}),
        ...(hr != null ? { heart_rate: hr } : {}),
        ...(cad != null ? { cadence: Math.round(cad) } : {}),
        ...(pwr != null ? { power: Math.round(pwr) } : {}),
        ...(tmp != null ? { temperature: Math.round(tmp) } : {}),
        ...(grd != null ? { grade: grd } : {}),
      },
      null,
      i === count - 1,
    );
  }

  const duration = Math.max(0, Math.round(meta.durationSec || 0));
  const endStamp = fit.time(base + duration * 1000);
  const distanceM = meta.distanceM != null && meta.distanceM > 0 ? meta.distanceM : undefined;

  if (laps.length > 0) {
    laps.forEach((lap, i) => {
      const lapStartMs = new Date(lap.startDate).getTime();
      const lapBase = Number.isFinite(lapStartMs) ? lapStartMs : base;
      const elapsed = Math.max(0, lap.elapsedTime);
      fit.writeMessage(
        "lap",
        {
          message_index: { value: i },
          start_time: fit.time(lapBase),
          timestamp: fit.time(lapBase + elapsed * 1000),
          total_elapsed_time: elapsed,
          total_timer_time: lap.movingTime != null && lap.movingTime > 0 ? lap.movingTime : elapsed,
          ...(lap.distanceM != null && lap.distanceM > 0 ? { total_distance: lap.distanceM } : {}),
          ...(lap.avgHr != null ? { avg_heart_rate: lap.avgHr } : {}),
          ...(lap.maxHr != null ? { max_heart_rate: lap.maxHr } : {}),
          ...(lap.avgSpeed != null ? { avg_speed: lap.avgSpeed } : {}),
          ...(lap.maxSpeed != null ? { max_speed: lap.maxSpeed } : {}),
          ...(lap.avgCadence != null ? { avg_cadence: Math.round(lap.avgCadence) } : {}),
          ...(lap.avgPower != null ? { avg_power: Math.round(lap.avgPower) } : {}),
          ...(lap.totalAscent != null && lap.totalAscent > 0 ? { total_ascent: Math.round(lap.totalAscent) } : {}),
        },
        null,
        i === laps.length - 1,
      );
    });
  } else {
    fit.writeMessage(
      "lap",
      {
        message_index: { value: 0 },
        timestamp: endStamp,
        start_time: startStamp,
        total_elapsed_time: duration,
        total_timer_time: duration,
        ...(distanceM != null ? { total_distance: distanceM } : {}),
      },
      null,
      true,
    );
  }

  const numLaps = laps.length || 1;

  const timerSec = meta.movingSec != null && meta.movingSec > 0 ? Math.round(meta.movingSec) : duration;

  fit.writeMessage(
    "session",
    {
      message_index: { value: 0 },
      timestamp: endStamp,
      start_time: startStamp,
      total_elapsed_time: duration,
      total_timer_time: timerSec,
      sport: fitSport(meta.sport),
      first_lap_index: 0,
      num_laps: numLaps,
      ...(distanceM != null ? { total_distance: distanceM } : {}),
      ...(meta.avgHr != null ? { avg_heart_rate: meta.avgHr } : {}),
      ...(meta.maxHr != null ? { max_heart_rate: meta.maxHr } : {}),
      ...(meta.avgPower != null ? { avg_power: Math.round(meta.avgPower) } : {}),
      ...(meta.maxPower != null ? { max_power: Math.round(meta.maxPower) } : {}),
      ...(meta.normalizedPower != null ? { normalized_power: Math.round(meta.normalizedPower) } : {}),
      ...(meta.calories != null ? { total_calories: Math.round(meta.calories) } : {}),
      ...(meta.avgSpeed != null ? { avg_speed: meta.avgSpeed } : {}),
      ...(meta.maxSpeed != null ? { max_speed: meta.maxSpeed } : {}),
      ...(meta.avgCadence != null ? { avg_cadence: Math.round(meta.avgCadence) } : {}),
      ...(meta.avgTemp != null ? { avg_temperature: Math.round(meta.avgTemp) } : {}),
      ...(meta.kilojoules != null ? { total_work: Math.round(meta.kilojoules * 1000) } : {}),
      ...(meta.elevationM != null && meta.elevationM > 0 ? { total_ascent: Math.round(meta.elevationM) } : {}),
      ...(meta.elevHigh != null ? { enhanced_max_altitude: meta.elevHigh } : {}),
      ...(meta.elevLow != null ? { enhanced_min_altitude: meta.elevLow } : {}),
    },
    null,
    true,
  );

  fit.writeMessage("activity", { timestamp: endStamp, total_timer_time: duration, num_sessions: 1, type: "manual" }, null, true);

  const view = fit.finish();
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}
