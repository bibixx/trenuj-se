CREATE TABLE "activities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"source" text DEFAULT 'strava' NOT NULL,
	"strava_id" bigint,
	"external_id" text,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" timestamp with time zone NOT NULL,
	"start_date_local" timestamp NOT NULL,
	"timezone" text,
	"utc_offset_sec" integer,
	"local_date" date GENERATED ALWAYS AS ((start_date_local)::date) STORED,
	"distance_m" integer,
	"moving_sec" integer,
	"elapsed_sec" integer NOT NULL,
	"elevation_m" integer,
	"avg_hr" smallint,
	"max_hr" smallint,
	"avg_speed_mps" real,
	"max_speed_mps" real,
	"avg_power" smallint,
	"max_power" smallint,
	"weighted_avg_power" smallint,
	"device_watts" boolean,
	"avg_cadence" real,
	"calories" integer,
	"suffer_score" smallint,
	"gear_id" text,
	"workout_type" smallint,
	"is_race" boolean GENERATED ALWAYS AS (workout_type in (1, 11)) STORED,
	"trainer" boolean,
	"commute" boolean,
	"raw" jsonb,
	"summary_synced_at" timestamp with time zone,
	"detail_synced_at" timestamp with time zone,
	"streams_synced_at" timestamp with time zone,
	"streams_status" text,
	"streams_sample_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_user_strava_unique" UNIQUE("user_id","strava_id"),
	CONSTRAINT "activities_source_check" CHECK ("activities"."source" in ('strava', 'fit', 'gpx', 'manual')),
	CONSTRAINT "activities_sport_check" CHECK ("activities"."sport" in ('AlpineSki', 'BackcountrySki', 'Badminton', 'Canoeing', 'Crossfit', 'EBikeRide', 'Elliptical', 'EMountainBikeRide', 'Golf', 'GravelRide', 'Handcycle', 'HighIntensityIntervalTraining', 'Hike', 'IceSkate', 'InlineSkate', 'Kayaking', 'Kitesurf', 'MountainBikeRide', 'NordicSki', 'Pickleball', 'Pilates', 'Racquetball', 'Ride', 'RockClimbing', 'RollerSki', 'Rowing', 'Run', 'Sail', 'Skateboard', 'Snowboard', 'Snowshoe', 'Soccer', 'Squash', 'StairStepper', 'StandUpPaddling', 'Surfing', 'Swim', 'TableTennis', 'Tennis', 'TrailRun', 'Velomobile', 'VirtualRide', 'VirtualRow', 'VirtualRun', 'Walk', 'WeightTraining', 'Wheelchair', 'Windsurf', 'Workout', 'Yoga')),
	CONSTRAINT "activities_streams_status_check" CHECK ("activities"."streams_status" is null or "activities"."streams_status" in ('synced', 'unavailable')),
	CONSTRAINT "activities_elapsed_positive" CHECK ("activities"."elapsed_sec" > 0)
);
--> statement-breakpoint
CREATE TABLE "activity_best_efforts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_best_efforts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"activity_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"effort_name" text NOT NULL,
	"distance_m" real NOT NULL,
	"elapsed_sec" integer NOT NULL,
	"moving_sec" integer,
	"start_index" integer,
	"end_index" integer,
	"pr_rank" smallint,
	"source" text DEFAULT 'strava' NOT NULL,
	CONSTRAINT "activity_best_efforts_unique" UNIQUE("activity_id","effort_name","source"),
	CONSTRAINT "activity_best_efforts_source_check" CHECK ("activity_best_efforts"."source" in ('strava', 'computed'))
);
--> statement-breakpoint
CREATE TABLE "activity_laps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_laps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"activity_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"lap_index" smallint NOT NULL,
	"start_offset_sec" integer,
	"elapsed_sec" integer NOT NULL,
	"moving_sec" integer,
	"distance_m" real,
	"avg_hr" smallint,
	"max_hr" smallint,
	"avg_speed_mps" real,
	"max_speed_mps" real,
	"avg_cadence" real,
	"avg_power" real,
	"total_ascent_m" real,
	"start_index" integer,
	"end_index" integer,
	CONSTRAINT "activity_laps_activity_lap_unique" UNIQUE("activity_id","lap_index")
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"activity_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"time_s" integer NOT NULL,
	"distance_m" real,
	"velocity_mps" real,
	"altitude_m" real,
	"grade_pct" real,
	"dt_s" smallint,
	"hr" smallint,
	"watts" smallint,
	"cadence" smallint,
	"temp_c" smallint,
	"moving" boolean,
	CONSTRAINT "activity_streams_pkey" PRIMARY KEY("activity_id","time_s")
);
--> statement-breakpoint
CREATE TABLE "athlete_zones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "athlete_zones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"zone_type" text NOT NULL,
	"effective_from" date NOT NULL,
	"zone_index" smallint NOT NULL,
	"min_value" real NOT NULL,
	"max_value" real,
	CONSTRAINT "athlete_zones_unique" UNIQUE("user_id","zone_type","effective_from","zone_index"),
	CONSTRAINT "athlete_zones_type_check" CHECK ("athlete_zones"."zone_type" in ('hr', 'power'))
);
--> statement-breakpoint
CREATE TABLE "strava_sync_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"history_synced_from" timestamp with time zone,
	"history_complete" boolean DEFAULT false NOT NULL,
	"last_head_sync_at" timestamp with time zone,
	"rate_limited_until" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_best_efforts" ADD CONSTRAINT "activity_best_efforts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_best_efforts" ADD CONSTRAINT "activity_best_efforts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_laps" ADD CONSTRAINT "activity_laps_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_laps" ADD CONSTRAINT "activity_laps_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_zones" ADD CONSTRAINT "athlete_zones_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_sync_state" ADD CONSTRAINT "strava_sync_state_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_start" ON "activities" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "activities_user_sport_start" ON "activities" USING btree ("user_id","sport","start_date");--> statement-breakpoint
CREATE INDEX "activities_user_local_date" ON "activities" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "activity_best_efforts_user_idx" ON "activity_best_efforts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_laps_user_idx" ON "activity_laps" USING btree ("user_id");