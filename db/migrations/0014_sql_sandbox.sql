-- Custom SQL migration file, put your code below! --

-- SQL sandbox for the run_sql MCP tool: executes agent-written, attacker-grade SQL strictly
-- read-only and strictly scoped to one user.
--
-- Isolation model (why it looks like this):
--   * GUC-based scoping (views on current_setting('app.user_id')) is UNSOUND here: any role can
--     call set_config('app.user_id', '<victim>', true) inside a plain SELECT, and pg_catalog
--     builtins can't be revoked on Supabase. We are accepting attacker-built SQL, so the GUC
--     pattern (safe under PostgREST, which builds its own SQL) does not transfer.
--   * The one identity attacker SQL cannot forge is current_user established by SECURITY DEFINER
--     function ownership: Postgres hard-rejects SET ROLE / set_config('role', ...) /
--     SET SESSION AUTHORIZATION inside security-definer context (CVE-2007-6600 hardening).
--   * So: one NOLOGIN role per user (sbx_<uuid>, member of the sandbox_users group), one trivial
--     SECURITY DEFINER wrapper per user owned by that role, RLS policies keyed on current_user.
--     public.run_user_query(p_user_id, ...) — the only PostgREST-exposed entry point, callable by
--     service_role only — dispatches structurally to the caller's wrapper, so the trusted
--     ctx.userId from the Worker IS the identity; nothing inside p_sql can change it.
--
-- Defense in depth for writes: sandbox roles have zero write grants anywhere, the dispatcher is
-- STABLE so PostgREST runs it in a read-only transaction, and exec_impl rejects multi-statement
-- input outright.
--
-- statement_timeout note: SET LOCAL inside these functions cannot re-arm the timer of the
-- already-running RPC statement, so the effective bound is the role-level timeout of the
-- PostgREST connection. Verify it on the project (time a pg_sleep query); if unlimited, set
-- `ALTER ROLE service_role SET statement_timeout = '15s'` as a deliberate app-wide decision.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_users') THEN
    CREATE ROLE sandbox_users NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO sandbox_users;

CREATE SCHEMA IF NOT EXISTS sandbox;
REVOKE ALL ON SCHEMA sandbox FROM PUBLIC;
GRANT USAGE ON SCHEMA sandbox TO sandbox_users, service_role;

-- current_user 'sbx_<uuid>' -> uuid. Role names are minted only by sandbox_ensure_user, so the
-- mapping is trustworthy.
CREATE OR REPLACE FUNCTION public.sandbox_user_id()
RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT substr(current_user::text, 5)::uuid
$$;

-- ---------------------------------------------------------------------------
-- Table whitelist. Deliberately excluded: profiles, strava_credentials, stream_tokens,
-- mcp_connector_tokens, plan_shares (tokens / other users' PII).
GRANT SELECT ON
  public.activities,
  public.activity_laps,
  public.activity_streams,
  public.activity_best_efforts,
  public.athlete_zones,
  public.strava_sync_state,
  public.plans,
  public.phases,
  public.workouts,
  public.labels,
  public.label_activity_sports,
  public.plan_notes,
  public.workout_activities
TO sandbox_users;

CREATE POLICY sandbox_select_own ON public.activities FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.activity_laps FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.activity_streams FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.activity_best_efforts FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.athlete_zones FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.strava_sync_state FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.plans FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.phases FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.workouts FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.labels FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.label_activity_sports FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.plan_notes FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());
CREATE POLICY sandbox_select_own ON public.workout_activities FOR SELECT TO sandbox_users USING (user_id = public.sandbox_user_id());

-- ---------------------------------------------------------------------------
-- Shared implementation. SECURITY INVOKER on purpose: it runs as the per-user sbx_* role that
-- owns the calling wrapper, inside the wrapper's security-definer context (which is what blocks
-- SET ROLE for the EXECUTE'd user SQL). Errors are returned as data (ok:false), not raised, so
-- SQLSTATE/SQLERRM reach the agent verbatim for self-correction.
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
  -- counts to the current user.
  IF p_sql ILIKE '%activity_streams%' THEN
    SELECT count(*) INTO v_missing
    FROM public.activities
    WHERE streams_synced_at IS NULL AND coalesce(streams_status, '') <> 'unavailable';
    IF v_missing > 0 THEN
      v_warnings := array_append(v_warnings, format(
        '%s known activities have no hydrated streams; stream aggregates may be incomplete. Check activities.streams_synced_at for coverage and call sync_activity_data to hydrate.', v_missing));
    END IF;
  END IF;
  IF p_sql ILIKE '%activity_laps%' OR p_sql ILIKE '%activity_best_efforts%' THEN
    SELECT count(*) INTO v_missing
    FROM public.activities
    WHERE detail_synced_at IS NULL;
    IF v_missing > 0 THEN
      v_warnings := array_append(v_warnings, format(
        '%s known activities have no synced detail (laps/best efforts missing). Check activities.detail_synced_at and call sync_activity_data to hydrate.', v_missing));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows, 'row_count', v_count, 'warnings', to_jsonb(v_warnings));
END;
$fn$;

REVOKE ALL ON FUNCTION sandbox.exec_impl(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sandbox.exec_impl(text, integer) TO sandbox_users;

-- ---------------------------------------------------------------------------
-- Lazy idempotent provisioning: role + wrapper per user. Owned by postgres (has CREATEROLE on
-- Supabase). The Worker calls this on SANDBOX_NOT_PROVISIONED and retries the query once.
CREATE OR REPLACE FUNCTION public.sandbox_ensure_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_role text := 'sbx_' || p_user_id::text;
  v_fn text := 'exec_' || replace(p_user_id::text, '-', '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN INHERIT', v_role);
    EXECUTE format('GRANT sandbox_users TO %I', v_role);
    -- postgres must be a member of the new role to transfer function ownership to it below.
    EXECUTE format('GRANT %I TO postgres', v_role);
  END IF;

  IF to_regprocedure(format('sandbox.%I(text, integer)', v_fn)) IS NULL THEN
    EXECUTE format(
      'CREATE FUNCTION sandbox.%I(p_sql text, p_max_rows integer) RETURNS jsonb '
      || 'LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp '
      || 'AS $body$ SELECT sandbox.exec_impl(p_sql, p_max_rows) $body$',
      v_fn
    );
    -- ALTER ... OWNER requires the new owner to have CREATE on the schema; grant transiently.
    EXECUTE format('GRANT CREATE ON SCHEMA sandbox TO %I', v_role);
    EXECUTE format('ALTER FUNCTION sandbox.%I(text, integer) OWNER TO %I', v_fn, v_role);
    EXECUTE format('REVOKE CREATE ON SCHEMA sandbox FROM %I', v_role);
    EXECUTE format('REVOKE ALL ON FUNCTION sandbox.%I(text, integer) FROM PUBLIC', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION sandbox.%I(text, integer) TO service_role', v_fn);
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sandbox_ensure_user(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sandbox_ensure_user(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Dispatcher: the only PostgREST-exposed entry point. STABLE => PostgREST wraps the call in a
-- read-only transaction. Identity enters exclusively via the trusted p_user_id argument.
CREATE OR REPLACE FUNCTION public.run_user_query(p_user_id uuid, p_sql text, p_max_rows integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_fn text := 'exec_' || replace(p_user_id::text, '-', '');
  v_out jsonb;
BEGIN
  IF to_regprocedure(format('sandbox.%I(text, integer)', v_fn)) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error_code', 'SANDBOX_NOT_PROVISIONED',
      'message', 'SQL sandbox not provisioned for this user.'
    );
  END IF;

  EXECUTE format('SELECT sandbox.%I($1, $2)', v_fn) INTO v_out USING p_sql, p_max_rows;
  RETURN v_out;
END;
$fn$;

REVOKE ALL ON FUNCTION public.run_user_query(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_user_query(uuid, text, integer) TO service_role;

-- Make the new functions visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
