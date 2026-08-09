-- Custom SQL migration file, put your code below! --

-- run_sql hydration is now inferred from the SQL itself (strava_id literals or a
-- "-- hydrate: id1, id2" comment) instead of a separate sync tool. Upgrade exec_impl's
-- hydration hints to include the missing strava_ids so the agent knows exactly what to put in
-- that comment on the next call. Body otherwise identical to 0014; CREATE OR REPLACE keeps the
-- existing grants (EXECUTE to sandbox_users).

CREATE OR REPLACE FUNCTION sandbox.exec_impl(p_sql text, p_max_rows integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cap integer := least(greatest(coalesce(p_max_rows, 200), 1), 500);
  v_rows jsonb;
  v_count integer;
  v_bytes integer;
  v_warnings text[] := '{}';
  v_missing integer;
  v_missing_ids text;
BEGIN
  IF position(';' IN p_sql) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'MULTI_STATEMENT',
      'message', 'Submit exactly one SELECT statement with no semicolons (use chr(59) for a literal semicolon).'
    );
  END IF;

  SET LOCAL work_mem = '32MB';

  BEGIN
    -- The newline after %s keeps a trailing "--" in p_sql from commenting out the wrapper tail.
    EXECUTE format(
      E'SELECT coalesce(jsonb_agg(to_jsonb(q)), \'[]\'::jsonb) FROM (SELECT * FROM (\n%s\n) _u LIMIT %s) q',
      p_sql, v_cap + 1
    )
    INTO v_rows;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'SQL_ERROR',
      'sqlstate', SQLSTATE,
      'message', SQLERRM
    );
  END;

  v_count := jsonb_array_length(v_rows);
  IF v_count > v_cap THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'TOO_MANY_ROWS',
      'row_limit', v_cap,
      'message', format('More than %s rows. Aggregate or filter in SQL (GROUP BY, date range, LIMIT) and retry.', v_cap)
    );
  END IF;

  v_bytes := octet_length(v_rows::text);
  IF v_bytes > 65536 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'RESULT_TOO_LARGE',
      'bytes', v_bytes,
      'byte_limit', 65536,
      'row_count', v_count,
      'message', 'Result exceeds 64 KB. Select fewer columns, round numerics, or aggregate further.'
    );
  END IF;

  -- Hydration hints: never let the agent mistake "not hydrated" for "no data". RLS scopes the
  -- counts to the current user; the newest missing ids are listed so the agent can pull them
  -- with a "-- hydrate: <ids>" comment on the next run_sql call.
  IF p_sql ILIKE '%activity_streams%' THEN
    SELECT count(*),
           (SELECT string_agg(t.strava_id::text, ', ')
            FROM (SELECT strava_id
                  FROM public.activities
                  WHERE streams_synced_at IS NULL AND coalesce(streams_status, '') <> 'unavailable' AND strava_id IS NOT NULL
                  ORDER BY start_date DESC
                  LIMIT 10) t)
    INTO v_missing, v_missing_ids
    FROM public.activities
    WHERE streams_synced_at IS NULL AND coalesce(streams_status, '') <> 'unavailable';
    IF v_missing > 0 THEN
      v_warnings := array_append(v_warnings, format(
        '%s known activities have no hydrated streams; stream aggregates may be incomplete. Newest missing strava_ids: %s. Re-run with "-- hydrate: <ids>" (max 3 per call) to pull them.',
        v_missing, coalesce(v_missing_ids, 'n/a')));
    END IF;
  END IF;
  IF p_sql ILIKE '%activity_laps%' OR p_sql ILIKE '%activity_best_efforts%' THEN
    SELECT count(*),
           (SELECT string_agg(t.strava_id::text, ', ')
            FROM (SELECT strava_id
                  FROM public.activities
                  WHERE detail_synced_at IS NULL AND strava_id IS NOT NULL
                  ORDER BY start_date DESC
                  LIMIT 10) t)
    INTO v_missing, v_missing_ids
    FROM public.activities
    WHERE detail_synced_at IS NULL;
    IF v_missing > 0 THEN
      v_warnings := array_append(v_warnings, format(
        '%s known activities have no synced detail (laps/best efforts missing). Newest missing strava_ids: %s. Re-run with "-- hydrate: <ids>" (max 3 per call) to pull them.',
        v_missing, coalesce(v_missing_ids, 'n/a')));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'row_count', v_count, 'warnings', to_jsonb(v_warnings));
END;
$fn$;

-- Make the updated function visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
