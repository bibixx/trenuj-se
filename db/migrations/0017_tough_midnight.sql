DROP TABLE "athlete_zones" CASCADE;--> statement-breakpoint
-- Custom SQL below (paired with the athlete_zones drop above).
--
-- The zones sync dies with the table: our Strava OAuth scope (activity:read_all) never covered
-- GET /athlete/zones, so the ingest 401'd for every user and the table stayed empty. Zone
-- boundaries live in the plan's agent memory instead.
DROP FUNCTION public.strava_ingest_athlete_zones(uuid, text);

-- Dead since the summary-sync machinery was removed from the Worker (the hydration refactor):
-- nothing calls it anymore.
DROP FUNCTION public.strava_ingest_activity_summaries(uuid, text);

-- strava_ingest_activity_streams now also reports which stream channels actually contain data,
-- so run_sql's hydration report can steer agents away from all-NULL columns (cadence, temp_c,
-- watts are often absent). Return type changes integer -> jsonb {samples, channels}, which
-- CREATE OR REPLACE cannot do -> DROP + CREATE, grants re-applied below. Body otherwise
-- identical to 0013's.
DROP FUNCTION public.strava_ingest_activity_streams(uuid, bigint, text);

CREATE FUNCTION public.strava_ingest_activity_streams(p_user_id uuid, p_strava_id bigint, p_payload text)
RETURNS jsonb
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
  v_channels text[] := '{}';
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

  IF v_count > 0 THEN
    SELECT array_remove(ARRAY[
      CASE WHEN count(distance_m)   > 0 THEN 'distance_m'   END,
      CASE WHEN count(velocity_mps) > 0 THEN 'velocity_mps' END,
      CASE WHEN count(altitude_m)   > 0 THEN 'altitude_m'   END,
      CASE WHEN count(grade_pct)    > 0 THEN 'grade_pct'    END,
      CASE WHEN count(hr)           > 0 THEN 'hr'           END,
      CASE WHEN count(watts)        > 0 THEN 'watts'        END,
      CASE WHEN count(cadence)      > 0 THEN 'cadence'      END,
      CASE WHEN count(temp_c)       > 0 THEN 'temp_c'       END,
      CASE WHEN count(moving)       > 0 THEN 'moving'       END
    ], NULL)
    INTO v_channels
    FROM public.activity_streams
    WHERE activity_id = v_activity_id;
  END IF;

  UPDATE public.activities
  SET streams_synced_at = CASE WHEN v_count > 0 THEN now() ELSE NULL END,
      streams_status = CASE WHEN v_count > 0 THEN 'synced' ELSE 'unavailable' END,
      streams_sample_count = nullif(v_count, 0),
      updated_at = now()
  WHERE id = v_activity_id;

  RETURN jsonb_build_object('samples', v_count, 'channels', to_jsonb(v_channels));
END;
$$;

REVOKE ALL ON FUNCTION public.strava_ingest_activity_streams(uuid, bigint, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strava_ingest_activity_streams(uuid, bigint, text) TO service_role;

-- Make the changes visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
