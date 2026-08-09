-- Custom SQL migration file, put your code below! --

-- Ingest RPCs for the lazily-hydrated activity warehouse (activities / activity_laps /
-- activity_streams / activity_best_efforts / athlete_zones). The Worker fetches Strava
-- responses as RAW TEXT and passes them here untouched — all JSON parsing, array pivoting,
-- and dt computation happen in Postgres so the Worker stays within its 10ms CPU budget.
-- Same access pattern as 0010: REVOKE from public/anon/authenticated, GRANT to service_role,
-- called via ctx.supabase.rpc() so payloads ride the POST body.

-- ---------------------------------------------------------------------------
-- SQL mirror of collapseStravaSportType (server/lib/strava.ts). KEEP IN SYNC with
-- shared/activity.ts STRAVA_SPORT_TYPES and the alias map in server/lib/strava.ts.
CREATE OR REPLACE FUNCTION public.collapse_strava_sport_type(p_sport text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_known text[] := ARRAY[
    'AlpineSki', 'BackcountrySki', 'Badminton', 'Canoeing', 'Crossfit', 'EBikeRide', 'Elliptical',
    'EMountainBikeRide', 'Golf', 'GravelRide', 'Handcycle', 'HighIntensityIntervalTraining', 'Hike',
    'IceSkate', 'InlineSkate', 'Kayaking', 'Kitesurf', 'MountainBikeRide', 'NordicSki', 'Pickleball',
    'Pilates', 'Racquetball', 'Ride', 'RockClimbing', 'RollerSki', 'Rowing', 'Run', 'Sail',
    'Skateboard', 'Snowboard', 'Snowshoe', 'Soccer', 'Squash', 'StairStepper', 'StandUpPaddling',
    'Surfing', 'Swim', 'TableTennis', 'Tennis', 'TrailRun', 'Velomobile', 'VirtualRide', 'VirtualRow',
    'VirtualRun', 'Walk', 'WeightTraining', 'Wheelchair', 'Windsurf', 'Workout', 'Yoga'
  ];
  v_canonical text;
BEGIN
  IF p_sport IS NULL OR p_sport = '' THEN
    RETURN 'Workout';
  END IF;
  IF p_sport = ANY (v_known) THEN
    RETURN p_sport;
  END IF;
  CASE p_sport
    WHEN 'CrossFit' THEN RETURN 'Crossfit';
    WHEN 'OpenWaterSwim' THEN RETURN 'Swim';
    WHEN 'Treadmill' THEN RETURN 'Run';
    WHEN 'VirtualRowing' THEN RETURN 'VirtualRow';
    ELSE NULL;
  END CASE;
  v_canonical := regexp_replace(p_sport, '[^A-Za-z]', '', 'g');
  IF v_canonical = ANY (v_known) THEN
    RETURN v_canonical;
  END IF;
  RETURN 'Workout';
END;
$$;

-- ---------------------------------------------------------------------------
-- Upsert a page of GET /athlete/activities (SummaryActivity[], raw text). ON CONFLICT updates
-- only summary-scope columns — never description/calories/raw/detail_synced_at/streams_*, so a
-- later summary sync can't clobber richer detail data.
CREATE OR REPLACE FUNCTION public.strava_ingest_activity_summaries(p_user_id uuid, p_payload text)
RETURNS TABLE (ingested integer, oldest timestamptz, newest timestamptz)
LANGUAGE sql
AS $$
  WITH src AS (
    SELECT *
    FROM jsonb_to_recordset(p_payload::jsonb) AS a(
      id bigint,
      name text,
      sport_type text,
      "type" text,
      start_date timestamptz,
      start_date_local text,
      timezone text,
      utc_offset numeric,
      distance numeric,
      moving_time integer,
      elapsed_time integer,
      total_elevation_gain numeric,
      average_heartrate numeric,
      max_heartrate numeric,
      average_speed real,
      max_speed real,
      average_watts numeric,
      max_watts numeric,
      weighted_average_watts numeric,
      device_watts boolean,
      average_cadence real,
      suffer_score numeric,
      gear_id text,
      workout_type numeric,
      trainer boolean,
      commute boolean
    )
    WHERE a.id IS NOT NULL AND a.start_date IS NOT NULL
  ), ins AS (
    INSERT INTO public.activities (
      user_id, source, strava_id, sport, name, start_date, start_date_local, timezone,
      utc_offset_sec, distance_m, moving_sec, elapsed_sec, elevation_m, avg_hr, max_hr,
      avg_speed_mps, max_speed_mps, avg_power, max_power, weighted_avg_power, device_watts,
      avg_cadence, suffer_score, gear_id, workout_type, trainer, commute, summary_synced_at
    )
    SELECT
      p_user_id, 'strava', s.id,
      public.collapse_strava_sport_type(coalesce(s.sport_type, s."type")),
      coalesce(s.name, 'Untitled activity'),
      s.start_date,
      coalesce(s.start_date_local::timestamp, s.start_date AT TIME ZONE 'UTC'),
      s.timezone,
      s.utc_offset::integer,
      s.distance::integer,
      s.moving_time,
      greatest(coalesce(s.elapsed_time, 0), coalesce(s.moving_time, 0), 1),
      s.total_elevation_gain::integer,
      s.average_heartrate::smallint,
      s.max_heartrate::smallint,
      s.average_speed,
      s.max_speed,
      s.average_watts::smallint,
      s.max_watts::smallint,
      s.weighted_average_watts::smallint,
      s.device_watts,
      s.average_cadence,
      s.suffer_score::smallint,
      s.gear_id,
      s.workout_type::smallint,
      s.trainer,
      s.commute,
      now()
    FROM src s
    ON CONFLICT (user_id, strava_id) DO UPDATE SET
      sport = excluded.sport,
      name = excluded.name,
      start_date = excluded.start_date,
      start_date_local = excluded.start_date_local,
      timezone = excluded.timezone,
      utc_offset_sec = excluded.utc_offset_sec,
      distance_m = excluded.distance_m,
      moving_sec = excluded.moving_sec,
      elapsed_sec = excluded.elapsed_sec,
      elevation_m = excluded.elevation_m,
      avg_hr = excluded.avg_hr,
      max_hr = excluded.max_hr,
      avg_speed_mps = excluded.avg_speed_mps,
      max_speed_mps = excluded.max_speed_mps,
      avg_power = excluded.avg_power,
      max_power = excluded.max_power,
      weighted_avg_power = excluded.weighted_avg_power,
      device_watts = excluded.device_watts,
      avg_cadence = excluded.avg_cadence,
      suffer_score = excluded.suffer_score,
      gear_id = excluded.gear_id,
      workout_type = excluded.workout_type,
      trainer = excluded.trainer,
      commute = excluded.commute,
      summary_synced_at = now(),
      updated_at = now()
    RETURNING public.activities.start_date
  )
  SELECT count(*)::integer, min(ins.start_date), max(ins.start_date) FROM ins;
$$;

-- ---------------------------------------------------------------------------
-- Upsert one GET /activities/{id} (DetailedActivity, raw text): full activities row, laps,
-- and Strava's own best_efforts. `raw` keeps the payload minus the heavy keys (laps and
-- best_efforts land in their own tables; segment_efforts can exceed 100KB).
CREATE OR REPLACE FUNCTION public.strava_ingest_activity_detail(p_user_id uuid, p_payload text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw jsonb := p_payload::jsonb;
  v_activity_id bigint;
  v_start_date timestamptz := (v_raw->>'start_date')::timestamptz;
BEGIN
  IF v_raw->>'id' IS NULL OR v_start_date IS NULL THEN
    RAISE EXCEPTION 'strava_ingest_activity_detail: payload has no id/start_date';
  END IF;

  INSERT INTO public.activities (
    user_id, source, strava_id, sport, name, description, start_date, start_date_local,
    timezone, utc_offset_sec, distance_m, moving_sec, elapsed_sec, elevation_m, avg_hr, max_hr,
    avg_speed_mps, max_speed_mps, avg_power, max_power, weighted_avg_power, device_watts,
    avg_cadence, calories, suffer_score, gear_id, workout_type, trainer, commute, raw,
    summary_synced_at, detail_synced_at
  )
  VALUES (
    p_user_id, 'strava', (v_raw->>'id')::bigint,
    public.collapse_strava_sport_type(coalesce(v_raw->>'sport_type', v_raw->>'type')),
    coalesce(v_raw->>'name', 'Untitled activity'),
    v_raw->>'description',
    v_start_date,
    coalesce((v_raw->>'start_date_local')::timestamp, v_start_date AT TIME ZONE 'UTC'),
    v_raw->>'timezone',
    (v_raw->>'utc_offset')::numeric::integer,
    (v_raw->>'distance')::numeric::integer,
    (v_raw->>'moving_time')::integer,
    greatest(coalesce((v_raw->>'elapsed_time')::integer, 0), coalesce((v_raw->>'moving_time')::integer, 0), 1),
    (v_raw->>'total_elevation_gain')::numeric::integer,
    (v_raw->>'average_heartrate')::numeric::smallint,
    (v_raw->>'max_heartrate')::numeric::smallint,
    (v_raw->>'average_speed')::real,
    (v_raw->>'max_speed')::real,
    (v_raw->>'average_watts')::numeric::smallint,
    (v_raw->>'max_watts')::numeric::smallint,
    (v_raw->>'weighted_average_watts')::numeric::smallint,
    (v_raw->>'device_watts')::boolean,
    (v_raw->>'average_cadence')::real,
    (v_raw->>'calories')::numeric::integer,
    (v_raw->>'suffer_score')::numeric::smallint,
    v_raw->>'gear_id',
    (v_raw->>'workout_type')::numeric::smallint,
    (v_raw->>'trainer')::boolean,
    (v_raw->>'commute')::boolean,
    v_raw - 'segment_efforts' - 'laps' - 'splits_metric' - 'splits_standard' - 'best_efforts'
          - 'map' - 'similar_activities' - 'photos' - 'stats_visibility',
    now(), now()
  )
  ON CONFLICT (user_id, strava_id) DO UPDATE SET
    sport = excluded.sport,
    name = excluded.name,
    description = excluded.description,
    start_date = excluded.start_date,
    start_date_local = excluded.start_date_local,
    timezone = excluded.timezone,
    utc_offset_sec = excluded.utc_offset_sec,
    distance_m = excluded.distance_m,
    moving_sec = excluded.moving_sec,
    elapsed_sec = excluded.elapsed_sec,
    elevation_m = excluded.elevation_m,
    avg_hr = excluded.avg_hr,
    max_hr = excluded.max_hr,
    avg_speed_mps = excluded.avg_speed_mps,
    max_speed_mps = excluded.max_speed_mps,
    avg_power = excluded.avg_power,
    max_power = excluded.max_power,
    weighted_avg_power = excluded.weighted_avg_power,
    device_watts = excluded.device_watts,
    avg_cadence = excluded.avg_cadence,
    calories = excluded.calories,
    suffer_score = excluded.suffer_score,
    gear_id = excluded.gear_id,
    workout_type = excluded.workout_type,
    trainer = excluded.trainer,
    commute = excluded.commute,
    raw = excluded.raw,
    summary_synced_at = now(),
    detail_synced_at = now(),
    updated_at = now()
  RETURNING id INTO v_activity_id;

  DELETE FROM public.activity_laps WHERE activity_id = v_activity_id;
  IF jsonb_typeof(v_raw->'laps') = 'array' THEN
    INSERT INTO public.activity_laps (
      activity_id, user_id, lap_index, start_offset_sec, elapsed_sec, moving_sec, distance_m,
      avg_hr, max_hr, avg_speed_mps, max_speed_mps, avg_cadence, avg_power, total_ascent_m,
      start_index, end_index
    )
    SELECT
      v_activity_id, p_user_id,
      coalesce((lap->>'lap_index')::numeric::smallint, ord::smallint),
      extract(epoch FROM ((lap->>'start_date')::timestamptz - v_start_date))::integer,
      coalesce((lap->>'elapsed_time')::integer, 0),
      (lap->>'moving_time')::integer,
      (lap->>'distance')::real,
      (lap->>'average_heartrate')::numeric::smallint,
      (lap->>'max_heartrate')::numeric::smallint,
      (lap->>'average_speed')::real,
      (lap->>'max_speed')::real,
      (lap->>'average_cadence')::real,
      (lap->>'average_watts')::real,
      (lap->>'total_elevation_gain')::real,
      (lap->>'start_index')::integer,
      (lap->>'end_index')::integer
    FROM jsonb_array_elements(v_raw->'laps') WITH ORDINALITY AS l(lap, ord)
    ON CONFLICT (activity_id, lap_index) DO NOTHING;
  END IF;

  DELETE FROM public.activity_best_efforts WHERE activity_id = v_activity_id AND source = 'strava';
  IF jsonb_typeof(v_raw->'best_efforts') = 'array' THEN
    INSERT INTO public.activity_best_efforts (
      activity_id, user_id, effort_name, distance_m, elapsed_sec, moving_sec, start_index, end_index, pr_rank, source
    )
    SELECT
      v_activity_id, p_user_id,
      effort->>'name',
      (effort->>'distance')::real,
      (effort->>'elapsed_time')::integer,
      (effort->>'moving_time')::integer,
      (effort->>'start_index')::integer,
      (effort->>'end_index')::integer,
      (effort->>'pr_rank')::numeric::smallint,
      'strava'
    FROM jsonb_array_elements(v_raw->'best_efforts') AS e(effort)
    WHERE effort->>'name' IS NOT NULL AND effort->>'distance' IS NOT NULL AND effort->>'elapsed_time' IS NOT NULL
    ON CONFLICT (activity_id, effort_name, source) DO NOTHING;
  END IF;

  RETURN v_activity_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Pivot one GET /activities/{id}/streams response (array of {type, data}, raw text) into
-- activity_streams rows. dt_s (gap to next sample) is precomputed here so time-in-zone queries
-- are a plain sum(dt_s) FILTER (...). Delete+insert in one transaction = idempotent, and no
-- partial streams are ever visible. Returns the sample count (0 = no usable time stream, the
-- caller should mark streams_status accordingly; this function marks it itself).
CREATE OR REPLACE FUNCTION public.strava_ingest_activity_streams(p_user_id uuid, p_strava_id bigint, p_payload text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_payload jsonb := p_payload::jsonb;
  v_activity_id bigint;
  v_time jsonb;
  v_distance jsonb;
  v_velocity jsonb;
  v_altitude jsonb;
  v_grade jsonb;
  v_hr jsonb;
  v_watts jsonb;
  v_cadence jsonb;
  v_temp jsonb;
  v_moving jsonb;
  v_count integer := 0;
BEGIN
  SELECT id INTO v_activity_id
  FROM public.activities
  WHERE user_id = p_user_id AND strava_id = p_strava_id;

  IF v_activity_id IS NULL THEN
    RAISE EXCEPTION 'strava_ingest_activity_streams: activity % not found for user (ingest detail first)', p_strava_id;
  END IF;

  IF jsonb_typeof(v_payload) = 'array' THEN
    SELECT s.value->'data' INTO v_time     FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'time';
    SELECT s.value->'data' INTO v_distance FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'distance';
    SELECT s.value->'data' INTO v_velocity FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'velocity_smooth';
    SELECT s.value->'data' INTO v_altitude FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'altitude';
    SELECT s.value->'data' INTO v_grade    FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'grade_smooth';
    SELECT s.value->'data' INTO v_hr       FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'heartrate';
    SELECT s.value->'data' INTO v_watts    FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'watts';
    SELECT s.value->'data' INTO v_cadence  FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'cadence';
    SELECT s.value->'data' INTO v_temp     FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'temp';
    SELECT s.value->'data' INTO v_moving   FROM jsonb_array_elements(v_payload) s WHERE s.value->>'type' = 'moving';
  END IF;

  DELETE FROM public.activity_streams WHERE activity_id = v_activity_id;

  IF v_time IS NOT NULL AND jsonb_typeof(v_time) = 'array' AND jsonb_array_length(v_time) > 0 THEN
    WITH t AS (
      SELECT e.elem::integer AS time_s, (e.ord - 1)::integer AS idx
      FROM jsonb_array_elements_text(v_time) WITH ORDINALITY AS e(elem, ord)
    )
    INSERT INTO public.activity_streams (
      activity_id, user_id, time_s, distance_m, velocity_mps, altitude_m, grade_pct, dt_s,
      hr, watts, cadence, temp_c, moving
    )
    SELECT
      v_activity_id, p_user_id, t.time_s,
      (v_distance ->> t.idx)::real,
      (v_velocity ->> t.idx)::real,
      (v_altitude ->> t.idx)::real,
      (v_grade ->> t.idx)::real,
      -- CASE, not plain least(): LEAST ignores NULLs, so the last sample (lead() = NULL)
      -- would otherwise get dt_s = 32767 instead of NULL.
      CASE WHEN lead(t.time_s) OVER w IS NULL THEN NULL
           ELSE least(lead(t.time_s) OVER w - t.time_s, 32767) END::smallint,
      (v_hr ->> t.idx)::numeric::smallint,
      (v_watts ->> t.idx)::numeric::smallint,
      (v_cadence ->> t.idx)::numeric::smallint,
      (v_temp ->> t.idx)::numeric::smallint,
      (v_moving ->> t.idx)::boolean
    FROM t
    WINDOW w AS (ORDER BY t.time_s)
    ON CONFLICT (activity_id, time_s) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  UPDATE public.activities
  SET streams_synced_at = CASE WHEN v_count > 0 THEN now() ELSE NULL END,
      streams_status = CASE WHEN v_count > 0 THEN 'synced' ELSE 'unavailable' END,
      streams_sample_count = nullif(v_count, 0),
      updated_at = now()
  WHERE id = v_activity_id;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ingest GET /athlete/zones (raw text). Inserts a new effective_from = current_date version
-- per zone_type only when it differs from the current latest; same-day changes upsert in place.
-- Strava encodes an open-ended max as -1 → stored as NULL.
CREATE OR REPLACE FUNCTION public.strava_ingest_athlete_zones(p_user_id uuid, p_payload text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_payload jsonb := p_payload::jsonb;
  v_type text;
  v_key text;
  v_zones jsonb;
  v_new jsonb;
  v_cur jsonb;
  v_latest date;
  v_inserted integer := 0;
  v_rows integer;
BEGIN
  FOR v_type, v_key IN VALUES ('hr', 'heart_rate'), ('power', 'power') LOOP
    v_zones := v_payload -> v_key -> 'zones';
    CONTINUE WHEN v_zones IS NULL OR jsonb_typeof(v_zones) <> 'array' OR jsonb_array_length(v_zones) = 0;

    SELECT jsonb_agg(jsonb_build_array(e.ord, (e.z->>'min')::real, nullif((e.z->>'max')::real, -1)) ORDER BY e.ord)
    INTO v_new
    FROM jsonb_array_elements(v_zones) WITH ORDINALITY AS e(z, ord);

    SELECT max(effective_from) INTO v_latest
    FROM public.athlete_zones
    WHERE user_id = p_user_id AND zone_type = v_type;

    IF v_latest IS NOT NULL THEN
      SELECT jsonb_agg(jsonb_build_array(zone_index, min_value, max_value) ORDER BY zone_index)
      INTO v_cur
      FROM public.athlete_zones
      WHERE user_id = p_user_id AND zone_type = v_type AND effective_from = v_latest;

      CONTINUE WHEN v_new = v_cur;
    END IF;

    INSERT INTO public.athlete_zones (user_id, zone_type, effective_from, zone_index, min_value, max_value)
    SELECT p_user_id, v_type, current_date, e.ord::smallint, (e.z->>'min')::real, nullif((e.z->>'max')::real, -1)
    FROM jsonb_array_elements(v_zones) WITH ORDINALITY AS e(z, ord)
    ON CONFLICT (user_id, zone_type, effective_from, zone_index) DO UPDATE SET
      min_value = excluded.min_value,
      max_value = excluded.max_value;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_inserted + v_rows;

    -- Same-day re-sync with fewer zones: drop the leftover higher indexes.
    DELETE FROM public.athlete_zones
    WHERE user_id = p_user_id AND zone_type = v_type AND effective_from = current_date
      AND zone_index > jsonb_array_length(v_zones);
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ---------------------------------------------------------------------------
-- Lock down: service_role only, like edit_plan_memory_cas (0010).
REVOKE ALL ON FUNCTION public.collapse_strava_sport_type(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collapse_strava_sport_type(text) TO service_role;
REVOKE ALL ON FUNCTION public.strava_ingest_activity_summaries(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strava_ingest_activity_summaries(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.strava_ingest_activity_detail(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strava_ingest_activity_detail(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.strava_ingest_activity_streams(uuid, bigint, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strava_ingest_activity_streams(uuid, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.strava_ingest_athlete_zones(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strava_ingest_athlete_zones(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Explicit DML grants for the ingest path. Do not rely on default privileges: hosted Supabase
-- grants service_role full DML on new tables by default, but local `supabase db start` does
-- not — explicit grants keep both environments identical.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.activities,
  public.activity_laps,
  public.activity_streams,
  public.activity_best_efforts,
  public.athlete_zones,
  public.strava_sync_state
TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: enabled, deliberately no policies — only service_role (BYPASSRLS) and the sandbox
-- roles added in 0014 can read these tables. The web UI never queries them directly.
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_laps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_best_efforts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.athlete_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_sync_state ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- One-time backfill: every matched activity already has the full DetailedActivity in
-- workout_activities.raw_data — replay it through the detail ingest (also fills laps and
-- best_efforts) with zero Strava API calls. Legacy rows without raw_data get a minimal
-- summary-level row; their start_date_local approximates local time as UTC and self-heals
-- on the next summary sync of that date range (the upsert refreshes summary columns).
SELECT public.strava_ingest_activity_detail(wa.user_id, wa.raw_data::text)
FROM public.workout_activities wa
WHERE wa.raw_data IS NOT NULL AND wa.raw_data->>'id' IS NOT NULL AND wa.raw_data->>'start_date' IS NOT NULL;

INSERT INTO public.activities (
  user_id, source, strava_id, sport, name, start_date, start_date_local, timezone,
  distance_m, elapsed_sec, elevation_m, avg_hr, max_hr, avg_power, calories, summary_synced_at
)
SELECT
  wa.user_id, 'strava', wa.strava_id, wa.sport, wa.name, wa.start_date,
  wa.start_date AT TIME ZONE 'UTC', wa.timezone, wa.distance_m, greatest(wa.duration_sec, 1),
  wa.elevation_m, wa.avg_hr::smallint, wa.max_hr::smallint, wa.avg_power::smallint, wa.calories,
  wa.created_at
FROM public.workout_activities wa
WHERE wa.raw_data IS NULL
ON CONFLICT (user_id, strava_id) DO NOTHING;

-- Make the new functions visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
