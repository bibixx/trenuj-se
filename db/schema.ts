import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { STRAVA_SPORT_TYPES } from "../shared/activity";
import type { UserFlags } from "../shared/user-flags";
import type { WorkoutExecution } from "../shared/workout-execution";

const authSchema = pgSchema("auth");
const sportTypeListSql = STRAVA_SPORT_TYPES.map((sport) => `'${sport}'`).join(", ");

function enumCheck(column: { getSQL: () => unknown }, valuesSql: string) {
  return sql`${column} in (${sql.raw(valuesSql)})`;
}

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  stravaAthleteId: bigint("strava_athlete_id", { mode: "number" }),
  userFlags: jsonb("user_flags").$type<UserFlags>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stravaCredentials = pgTable("strava_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    status: text("status").default("active").notNull(),
    agentMemory: text("agent_memory"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("plans_status_check", sql`${table.status} in ('active', 'inactive')`),
    check("plans_dates_check", sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    hue: integer("hue").notNull(),
    icon: text("icon"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("labels_plan_key_unique").on(table.planId, table.key), check("labels_hue_range_check", sql`${table.hue} >= 0 and ${table.hue} < 360`)],
);

export const labelActivitySports = pgTable(
  "label_activity_sports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activitySport: text("activity_sport").notNull(),
  },
  (table) => [
    unique("label_activity_sports_label_sport_unique").on(table.labelId, table.activitySport),
    index("label_activity_sports_label_idx").on(table.labelId),
    check("label_activity_sports_activity_sport_check", enumCheck(table.activitySport, sportTypeListSql)),
  ],
);

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("phases_dates_check", sql`${table.endDate} >= ${table.startDate}`), index("phases_plan_sort").on(table.planId, table.sortOrder)],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "set null" }),
    labelId: uuid("label_id").references(() => labels.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    targetDurationMin: integer("target_duration_min"),
    targetDistanceM: integer("target_distance_m"),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: text("status").default("planned").notNull(),
    completionNotes: text("completion_notes"),
    trainerNotes: text("trainer_notes"),
    execution: jsonb("execution").$type<WorkoutExecution | null>(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("workouts_status_check", sql`${table.status} in ('planned', 'completed', 'skipped')`),
    check("workouts_target_duration_positive", sql`${table.targetDurationMin} is null or ${table.targetDurationMin} > 0`),
    check("workouts_target_distance_positive", sql`${table.targetDistanceM} is null or ${table.targetDistanceM} > 0`),
    index("workouts_plan_date").on(table.planId, table.date),
    index("workouts_plan_label_date").on(table.planId, table.labelId, table.date),
    index("workouts_user_date").on(table.userId, table.date),
    index("workouts_user_status").on(table.userId, table.status),
  ],
);

export const workoutActivities = pgTable(
  "workout_activities",
  {
    workoutId: uuid("workout_id")
      .primaryKey()
      .references(() => workouts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    stravaId: bigint("strava_id", { mode: "number" }).notNull(),
    sport: text("sport").notNull(),
    name: text("name").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    timezone: text("timezone"),
    durationSec: integer("duration_sec").notNull(),
    distanceM: integer("distance_m"),
    elevationM: integer("elevation_m"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    avgPower: integer("avg_power"),
    calories: integer("calories"),
    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("workout_activities_strava_unique").on(table.userId, table.stravaId),
    check("workout_activities_sport_check", enumCheck(table.sport, sportTypeListSql)),
    check("workout_activities_duration_positive", sql`${table.durationSec} > 0`),
    index("workout_activities_user_strava").on(table.userId, table.stravaId),
  ],
);

export const planNotes = pgTable(
  "plan_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("plan_notes_type_check", sql`${table.type} in ('summary', 'adjustment', 'note', 'recommendation')`),
    index("plan_notes_plan_created").on(table.planId, table.createdAt),
  ],
);

export const planShares = pgTable(
  "plan_shares",
  {
    id: text("id").primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    includeWorkouts: boolean("include_workouts").default(true).notNull(),
    includeActivities: boolean("include_activities").default(false).notNull(),
    includeTrainerNotes: boolean("include_trainer_notes").default(false).notNull(),
    includePlanNotes: boolean("include_plan_notes").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("plan_shares_plan").on(table.planId)],
);

export const mcpConnectorTokens = pgTable(
  "mcp_connector_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mcp_connector_tokens_hash_unique").on(table.tokenHash), index("mcp_connector_tokens_user_created").on(table.userId, table.createdAt)],
);

// Activity warehouse: every Strava activity (matched to a workout or not), lazily hydrated
// on demand for the run_sql MCP tool. workout_activities stays the 1:1 match record; the two
// are joined on (user_id, strava_id). Surrogate PK + nullable strava_id keep the door open
// for FIT/GPX-sourced activities later.
export const activities = pgTable(
  "activities",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    source: text("source").default("strava").notNull(),
    stravaId: bigint("strava_id", { mode: "number" }),
    externalId: text("external_id"),
    sport: text("sport").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    startDateLocal: timestamp("start_date_local").notNull(),
    timezone: text("timezone"),
    utcOffsetSec: integer("utc_offset_sec"),
    localDate: date("local_date").generatedAlwaysAs(sql`(start_date_local)::date`),
    distanceM: integer("distance_m"),
    movingSec: integer("moving_sec"),
    elapsedSec: integer("elapsed_sec").notNull(),
    elevationM: integer("elevation_m"),
    avgHr: smallint("avg_hr"),
    maxHr: smallint("max_hr"),
    avgSpeedMps: real("avg_speed_mps"),
    maxSpeedMps: real("max_speed_mps"),
    avgPower: smallint("avg_power"),
    maxPower: smallint("max_power"),
    weightedAvgPower: smallint("weighted_avg_power"),
    deviceWatts: boolean("device_watts"),
    avgCadence: real("avg_cadence"),
    calories: integer("calories"),
    sufferScore: smallint("suffer_score"),
    gearId: text("gear_id"),
    workoutType: smallint("workout_type"),
    isRace: boolean("is_race").generatedAlwaysAs(sql`workout_type in (1, 11)`),
    trainer: boolean("trainer"),
    commute: boolean("commute"),
    raw: jsonb("raw").$type<Record<string, unknown> | null>(),
    summarySyncedAt: timestamp("summary_synced_at", { withTimezone: true }),
    detailSyncedAt: timestamp("detail_synced_at", { withTimezone: true }),
    streamsSyncedAt: timestamp("streams_synced_at", { withTimezone: true }),
    streamsStatus: text("streams_status"),
    streamsSampleCount: integer("streams_sample_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("activities_user_strava_unique").on(table.userId, table.stravaId),
    index("activities_user_start").on(table.userId, table.startDate),
    index("activities_user_sport_start").on(table.userId, table.sport, table.startDate),
    index("activities_user_local_date").on(table.userId, table.localDate),
    check("activities_source_check", sql`${table.source} in ('strava', 'fit', 'gpx', 'manual')`),
    check("activities_sport_check", enumCheck(table.sport, sportTypeListSql)),
    check("activities_streams_status_check", sql`${table.streamsStatus} is null or ${table.streamsStatus} in ('synced', 'unavailable')`),
    check("activities_elapsed_positive", sql`${table.elapsedSec} > 0`),
  ],
);

export const activityLaps = pgTable(
  "activity_laps",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    activityId: bigint("activity_id", { mode: "number" })
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    lapIndex: smallint("lap_index").notNull(),
    startOffsetSec: integer("start_offset_sec"),
    elapsedSec: integer("elapsed_sec").notNull(),
    movingSec: integer("moving_sec"),
    distanceM: real("distance_m"),
    avgHr: smallint("avg_hr"),
    maxHr: smallint("max_hr"),
    avgSpeedMps: real("avg_speed_mps"),
    maxSpeedMps: real("max_speed_mps"),
    avgCadence: real("avg_cadence"),
    avgPower: real("avg_power"),
    totalAscentM: real("total_ascent_m"),
    startIndex: integer("start_index"),
    endIndex: integer("end_index"),
  },
  (table) => [unique("activity_laps_activity_lap_unique").on(table.activityId, table.lapIndex), index("activity_laps_user_idx").on(table.userId)],
);

// One row per stream sample (~1Hz). Column order minimizes alignment padding; dt_s is the
// precomputed gap to the next sample so time-in-zone is sum(dt_s) filter (...) with no window
// function. No lat/lng by design (re-hydratable from Strava if ever needed).
export const activityStreams = pgTable(
  "activity_streams",
  {
    activityId: bigint("activity_id", { mode: "number" })
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    timeS: integer("time_s").notNull(),
    distanceM: real("distance_m"),
    velocityMps: real("velocity_mps"),
    altitudeM: real("altitude_m"),
    gradePct: real("grade_pct"),
    dtS: smallint("dt_s"),
    hr: smallint("hr"),
    watts: smallint("watts"),
    cadence: smallint("cadence"),
    tempC: smallint("temp_c"),
    moving: boolean("moving"),
  },
  (table) => [primaryKey({ name: "activity_streams_pkey", columns: [table.activityId, table.timeS] })],
);

export const activityBestEfforts = pgTable(
  "activity_best_efforts",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    activityId: bigint("activity_id", { mode: "number" })
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    effortName: text("effort_name").notNull(),
    distanceM: real("distance_m").notNull(),
    elapsedSec: integer("elapsed_sec").notNull(),
    movingSec: integer("moving_sec"),
    startIndex: integer("start_index"),
    endIndex: integer("end_index"),
    prRank: smallint("pr_rank"),
    source: text("source").default("strava").notNull(),
  },
  (table) => [
    unique("activity_best_efforts_unique").on(table.activityId, table.effortName, table.source),
    index("activity_best_efforts_user_idx").on(table.userId),
    check("activity_best_efforts_source_check", sql`${table.source} in ('strava', 'computed')`),
  ],
);

// Versioned zone boundaries (from GET /athlete/zones); time-in-zone queries pick the latest
// effective_from <= the activity's local_date.
export const athleteZones = pgTable(
  "athlete_zones",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    zoneType: text("zone_type").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    zoneIndex: smallint("zone_index").notNull(),
    minValue: real("min_value").notNull(),
    maxValue: real("max_value"),
  },
  (table) => [
    unique("athlete_zones_unique").on(table.userId, table.zoneType, table.effectiveFrom, table.zoneIndex),
    check("athlete_zones_type_check", sql`${table.zoneType} in ('hr', 'power')`),
  ],
);

// Per-user Strava rate-limit state, shared across hydration calls.
export const stravaSyncState = pgTable("strava_sync_state", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  rateLimitedUntil: timestamp("rate_limited_until", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tables = {
  profiles,
  stravaCredentials,
  plans,
  labels,
  labelActivitySports,
  phases,
  workouts,
  workoutActivities,
  planNotes,
  planShares,
  mcpConnectorTokens,
  activities,
  activityLaps,
  activityStreams,
  activityBestEfforts,
  athleteZones,
  stravaSyncState,
};
