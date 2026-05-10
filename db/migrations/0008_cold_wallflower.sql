CREATE TABLE "workout_activities" (
	"workout_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"strava_id" bigint NOT NULL,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"timezone" text,
	"duration_sec" integer NOT NULL,
	"distance_m" integer,
	"elevation_m" integer,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_power" integer,
	"calories" integer,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_activities_strava_unique" UNIQUE("user_id","strava_id"),
	CONSTRAINT "workout_activities_sport_check" CHECK ("workout_activities"."sport" in ('AlpineSki', 'BackcountrySki', 'Badminton', 'Canoeing', 'Crossfit', 'EBikeRide', 'Elliptical', 'EMountainBikeRide', 'Golf', 'GravelRide', 'Handcycle', 'HighIntensityIntervalTraining', 'Hike', 'IceSkate', 'InlineSkate', 'Kayaking', 'Kitesurf', 'MountainBikeRide', 'NordicSki', 'Pickleball', 'Pilates', 'Racquetball', 'Ride', 'RockClimbing', 'RollerSki', 'Rowing', 'Run', 'Sail', 'Skateboard', 'Snowboard', 'Snowshoe', 'Soccer', 'Squash', 'StairStepper', 'StandUpPaddling', 'Surfing', 'Swim', 'TableTennis', 'Tennis', 'TrailRun', 'Velomobile', 'VirtualRide', 'VirtualRow', 'VirtualRun', 'Walk', 'WeightTraining', 'Wheelchair', 'Windsurf', 'Workout', 'Yoga')),
	CONSTRAINT "workout_activities_duration_positive" CHECK ("workout_activities"."duration_sec" > 0)
);
--> statement-breakpoint
ALTER TABLE "workout_activities" ADD CONSTRAINT "workout_activities_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_activities" ADD CONSTRAINT "workout_activities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_activities_user_strava" ON "workout_activities" USING btree ("user_id","strava_id");--> statement-breakpoint
ALTER TABLE "workouts" DROP CONSTRAINT IF EXISTS "workouts_activity_id_activities_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "workouts_activity_unique_idx";--> statement-breakpoint
ALTER TABLE "workouts" DROP COLUMN IF EXISTS "activity_id";--> statement-breakpoint
DROP TABLE IF EXISTS "activities" CASCADE;--> statement-breakpoint
ALTER PUBLICATION supabase_realtime ADD TABLE workout_activities;
--> statement-breakpoint
ALTER TABLE public.workout_activities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "select_own" ON public.workout_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.workout_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.workout_activities FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.workout_activities FOR DELETE USING (auth.uid() = user_id);
