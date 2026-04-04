CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"strava_id" bigint NOT NULL,
	"sport" text NOT NULL,
	"name" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"timezone" text,
	"duration_sec" integer NOT NULL,
	"distance_m" integer,
	"elevation_m" integer,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_power" integer,
	"calories" integer,
	"trainer_notes" text,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_strava_id_unique" UNIQUE("strava_id"),
	CONSTRAINT "activities_duration_positive" CHECK ("activities"."duration_sec" > 0)
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phases_dates_check" CHECK ("phases"."end_date" >= "phases"."start_date")
);
--> statement-breakpoint
CREATE TABLE "plan_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_notes_type_check" CHECK ("plan_notes"."type" in ('summary', 'adjustment', 'note', 'recommendation'))
);
--> statement-breakpoint
CREATE TABLE "plan_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"include_workouts" boolean DEFAULT true NOT NULL,
	"include_activities" boolean DEFAULT false NOT NULL,
	"include_trainer_notes" boolean DEFAULT false NOT NULL,
	"include_plan_notes" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"color_by" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_status_check" CHECK ("plans"."status" in ('active', 'inactive')),
	CONSTRAINT "plans_color_by_check" CHECK ("plans"."color_by" in ('sport', 'category')),
	CONSTRAINT "plans_dates_check" CHECK ("plans"."end_date" is null or "plans"."end_date" >= "plans"."start_date")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"strava_athlete_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strava_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_strava_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"hue" integer NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workout_types_plan_key_unique" UNIQUE("plan_id","key"),
	CONSTRAINT "workout_types_hue_range_check" CHECK ("workout_types"."hue" >= 0 and "workout_types"."hue" < 360)
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"phase_id" uuid,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sport" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_duration_min" integer,
	"target_distance_m" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"completion_notes" text,
	"trainer_notes" text,
	"activity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_status_check" CHECK ("workouts"."status" in ('planned', 'completed', 'skipped')),
	CONSTRAINT "workouts_target_duration_positive" CHECK ("workouts"."target_duration_min" is null or "workouts"."target_duration_min" > 0),
	CONSTRAINT "workouts_target_distance_positive" CHECK ("workouts"."target_distance_m" is null or "workouts"."target_distance_m" > 0)
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_notes" ADD CONSTRAINT "plan_notes_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_notes" ADD CONSTRAINT "plan_notes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strava_credentials" ADD CONSTRAINT "strava_credentials_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_tokens" ADD CONSTRAINT "stream_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_types" ADD CONSTRAINT "workout_types_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_types" ADD CONSTRAINT "workout_types_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_date" ON "activities" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "api_tokens_hash" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "phases_plan_sort" ON "phases" USING btree ("plan_id","sort_order");--> statement-breakpoint
CREATE INDEX "plan_notes_plan_created" ON "plan_notes" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_shares_plan" ON "plan_shares" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "stream_tokens_hash" ON "stream_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "stream_tokens_expires" ON "stream_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workouts_plan_date" ON "workouts" USING btree ("plan_id","date");--> statement-breakpoint
CREATE INDEX "workouts_user_date" ON "workouts" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "workouts_user_status" ON "workouts" USING btree ("user_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_one_active_per_user"
  ON "plans" ("user_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_strava_credentials_updated_at ON public.strava_credentials;
CREATE TRIGGER set_strava_credentials_updated_at
  BEFORE UPDATE ON public.strava_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_plans_updated_at ON public.plans;
CREATE TRIGGER set_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_workouts_updated_at ON public.workouts;
CREATE TRIGGER set_workouts_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_plan_notes_updated_at ON public.plan_notes;
CREATE TRIGGER set_plan_notes_updated_at
  BEFORE UPDATE ON public.plan_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.api_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.api_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.api_tokens FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.plans FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.plans FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.workout_types FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.workout_types FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.workout_types FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.workout_types FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.phases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.phases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.phases FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.phases FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.workouts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.workouts FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.activities FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.activities FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.plan_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.plan_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.plan_notes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.plan_notes FOR DELETE USING (auth.uid() = user_id);
--> statement-breakpoint
CREATE POLICY "select_own" ON public.plan_shares FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.plan_shares FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own" ON public.plan_shares FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.plan_shares FOR DELETE USING (auth.uid() = user_id);
