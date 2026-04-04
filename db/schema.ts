import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, integer, index, jsonb, pgSchema, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  stravaAthleteId: bigint("strava_athlete_id", { mode: "number" }),
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

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("api_tokens_hash").on(table.tokenHash)],
);

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
    colorBy: text("color_by").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("plans_status_check", sql`${table.status} in ('active', 'inactive')`),
    check("plans_color_by_check", sql`${table.colorBy} in ('sport', 'category')`),
    check("plans_dates_check", sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`),
  ],
);

export const workoutTypes = pgTable(
  "workout_types",
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
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [unique("workout_types_plan_key_unique").on(table.planId, table.key), check("workout_types_hue_range_check", sql`${table.hue} >= 0 and ${table.hue} < 360`)],
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

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    stravaId: bigint("strava_id", { mode: "number" }).notNull(),
    sport: text("sport").notNull(),
    name: text("name").notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    timezone: text("timezone"),
    durationSec: integer("duration_sec").notNull(),
    distanceM: integer("distance_m"),
    elevationM: integer("elevation_m"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    avgPower: integer("avg_power"),
    calories: integer("calories"),
    trainerNotes: text("trainer_notes"),
    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("activities_strava_id_unique").on(table.stravaId),
    check("activities_duration_positive", sql`${table.durationSec} > 0`),
    index("activities_user_date").on(table.userId, table.date),
  ],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    sport: text("sport").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    targetDurationMin: integer("target_duration_min"),
    targetDistanceM: integer("target_distance_m"),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: text("status").default("planned").notNull(),
    completionNotes: text("completion_notes"),
    trainerNotes: text("trainer_notes"),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("workouts_status_check", sql`${table.status} in ('planned', 'completed', 'skipped')`),
    check("workouts_target_duration_positive", sql`${table.targetDurationMin} is null or ${table.targetDurationMin} > 0`),
    check("workouts_target_distance_positive", sql`${table.targetDistanceM} is null or ${table.targetDistanceM} > 0`),
    index("workouts_plan_date").on(table.planId, table.date),
    index("workouts_user_date").on(table.userId, table.date),
    index("workouts_user_status").on(table.userId, table.status),
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

export const streamTokens = pgTable(
  "stream_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    activityStravaId: bigint("activity_strava_id", { mode: "number" }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("stream_tokens_hash").on(table.tokenHash), index("stream_tokens_expires").on(table.expiresAt)],
);

export const tables = {
  profiles,
  stravaCredentials,
  apiTokens,
  plans,
  workoutTypes,
  phases,
  activities,
  workouts,
  planNotes,
  planShares,
  streamTokens,
};
