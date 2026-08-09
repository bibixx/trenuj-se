// Agent-facing reference for the run_sql tool. Served as the guide://sql-schema MCP resource.
export const sqlSchemaGuideMarkdown = `# SQL Schema Guide (run_sql)

Run one read-only Postgres SELECT per call. Every table is pre-scoped to the authenticated
user by row-level security — **never filter by user_id** (the column exists but always holds
your own id). CTEs, window functions (including RANGE frames), FILTER aggregates,
width_bucket, ntile, generate_series, lateral joins, regr_slope/regr_intercept/corr and
recursive CTEs all work.

## Rules and limits

- One statement, **no semicolons** (use chr(59) for a literal semicolon in a string).
- Results are capped at maxRows (default 200, max 500) rows and 64 KB. On overflow you get
  TOO_MANY_ROWS / RESULT_TOO_LARGE — aggregate or filter more and retry.
- SQL errors come back verbatim (sqlstate + message) so you can self-correct.
- ~seconds-level statement timeout: push heavy stream scans through aggregates, not raw rows.

## Hydration (important)

Hydration from Strava is **inferred from your SQL** and happens before the query runs:

- Any Strava activity id (10-11 digit integer literal) appearing in the SQL gets its detail,
  laps, best efforts, and per-second streams pulled if missing — max 3 ids per call. So when
  you want per-second data for specific activities, reference them by \`strava_id\` in the
  query and hydration is automatic.
- When the query is date- or name-scoped (no id literals), add a comment anywhere in the SQL:
  \`-- hydrate: 19620351399, 19605843631\`. The ids to use come from the response warnings
  (see below) or from \`SELECT strava_id FROM activities WHERE ...\`.
- Zone boundaries sync automatically the first time a query references \`athlete_zones\`.
- Per activity, \`activities.detail_synced_at\` (laps + best efforts present) and
  \`activities.streams_synced_at\` / \`streams_status\` ('synced' | 'unavailable' | NULL = not
  fetched yet) say what is hydrated.

Responses referencing streams/laps include a warning with the count of unhydrated activities
**and their newest strava_ids** — feed those into \`-- hydrate:\` on the next call; do not
present incomplete aggregates as complete. When hydration ran, the response carries a
\`hydrated\` array with per-id status.

Coverage notes: the Strava webhook ingests every new activity, and everything ever matched to
a planned workout is pre-loaded. Old activities that were never matched become visible after
being referenced by id once (the detail fetch creates the row).

## Tables

### activities — one row per activity (units: meters, seconds, m/s, bpm, watts)
id (bigint, PK) · strava_id (bigint) · source ('strava'|'fit'|'gpx'|'manual') · sport (Strava
sport type, e.g. 'Run', 'Ride') · name · description · start_date (timestamptz) ·
start_date_local (timestamp, local clock time) · local_date (date, generated) · timezone ·
utc_offset_sec · distance_m · moving_sec · elapsed_sec · elevation_m · avg_hr · max_hr ·
avg_speed_mps · max_speed_mps · avg_power · max_power · weighted_avg_power · device_watts ·
avg_cadence · calories · suffer_score (Strava relative effort) · gear_id · workout_type
(run: 0 default/1 race/2 long run/3 workout; ride: 10/11 race/12) · is_race (generated) ·
trainer · commute · raw (jsonb, stripped Strava detail) · summary_synced_at ·
detail_synced_at · streams_synced_at · streams_status · streams_sample_count

### activity_streams — one row per ~1s sample
activity_id → activities.id · time_s (offset from start, PK with activity_id) · dt_s
(precomputed gap to next sample, NULL on last — **use sum(dt_s) for time-in-zone**, no window
needed; cap or filter large dt_s values for pauses) · distance_m (cumulative) · velocity_mps ·
altitude_m · grade_pct · hr · watts · cadence · temp_c · moving (bool)

### activity_laps — one row per lap
activity_id → activities.id · lap_index (1-based) · start_offset_sec · elapsed_sec ·
moving_sec · distance_m · avg_hr · max_hr · avg_speed_mps · max_speed_mps · avg_cadence ·
avg_power · total_ascent_m · start_index/end_index (Strava's original positional stream
indexes — informational only; join laps to activity_streams on time_s, not on these)

### activity_best_efforts — Strava's per-run best efforts ('400m'…'Half-Marathon')
activity_id → activities.id · effort_name · distance_m · elapsed_sec · moving_sec · pr_rank
(1-3 when it was a PR) · source ('strava')

### athlete_zones — versioned zone boundaries
zone_type ('hr'|'power') · effective_from (date) · zone_index (1-5) · min_value · max_value
(NULL = open-ended top zone). Pick the latest version per activity:
\`effective_from <= activities.local_date\` (or just the latest overall).

### strava_sync_state — Strava rate-limit state (one row)
rate_limited_until (hydration is paused until this timestamp after a Strava 429) · last_error

### Training-plan tables
plans (id, name, goal, start_date, end_date, status 'active'|'inactive') · phases (plan_id,
name, start_date, end_date) · workouts (plan_id, phase_id, label_id, date, title, description,
target_duration_min, target_distance_m, status 'planned'|'completed'|'skipped',
completion_notes, trainer_notes, execution jsonb — structured prescription) · labels (plan_id,
key, label) · label_activity_sports (label_id, activity_sport) · plan_notes ·
workout_activities (workout_id, strava_id, …) — the workout↔activity match record.

## Join keys

- workouts ↔ actual activity: \`workouts.id = workout_activities.workout_id\`, then
  \`workout_activities.strava_id = activities.strava_id\` (both are already user-scoped).
- streams/laps/efforts ↔ activity: \`activity_id = activities.id\`.
- lap ↔ its stream samples: join on activity_id and
  \`streams.time_s BETWEEN lap.start_offset_sec AND lap.start_offset_sec + lap.elapsed_sec\`.

## Worked examples

Weekly running volume, last 12 weeks (calendar spine keeps empty weeks):

    SELECT w.week::date AS week,
           round(coalesce(sum(a.distance_m) / 1000.0, 0)::numeric, 1) AS km,
           count(a.id) AS runs
    FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
    LEFT JOIN activities a ON date_trunc('week', a.start_date_local) = w.week AND a.sport IN ('Run', 'TrailRun')
    GROUP BY w.week ORDER BY w.week

Time in HR zones for one activity (dt_s, no window function):

    WITH z AS (
      SELECT zone_index, min_value, max_value
      FROM athlete_zones
      WHERE zone_type = 'hr'
        AND effective_from = (SELECT max(effective_from) FROM athlete_zones WHERE zone_type = 'hr')
    )
    SELECT z.zone_index,
           round(sum(least(s.dt_s, 10)) / 60.0, 1) AS minutes
    FROM activity_streams s
    JOIN activities a ON a.id = s.activity_id
    JOIN z ON s.hr >= z.min_value AND (z.max_value IS NULL OR s.hr < z.max_value)
    WHERE a.strava_id = 19605843631 AND s.hr IS NOT NULL
    GROUP BY z.zone_index ORDER BY z.zone_index

Aerobic fitness trend — pace at easy HR on flat ground, by month:

    SELECT date_trunc('month', a.start_date_local)::date AS month,
           round((sum(s.velocity_mps * s.dt_s) / sum(s.dt_s))::numeric, 2) AS avg_mps,
           to_char((interval '1 second' * (1000.0 / (sum(s.velocity_mps * s.dt_s) / sum(s.dt_s)))), 'MI:SS') AS pace_per_km
    FROM activity_streams s
    JOIN activities a ON a.id = s.activity_id
    WHERE a.sport = 'Run' AND s.hr BETWEEN 145 AND 155
      AND abs(coalesce(s.grade_pct, 0)) < 1.5 AND s.moving AND s.dt_s <= 10
    GROUP BY 1 HAVING sum(s.dt_s) > 600 ORDER BY 1

This query has no id literal, so it aggregates only already-hydrated activities and returns a
warning listing the newest un-hydrated strava_ids. Pull those in batches of 3 with a
\`-- hydrate: <ids>\` comment across successive calls until the warning clears, then re-run.

Interval fade — first vs last work lap per interval session:

    WITH work_laps AS (
      SELECT l.activity_id, l.lap_index, l.avg_speed_mps,
             row_number() OVER (PARTITION BY l.activity_id ORDER BY l.lap_index) AS rn,
             count(*) OVER (PARTITION BY l.activity_id) AS n
      FROM activity_laps l
      JOIN activities a ON a.id = l.activity_id
      WHERE a.sport = 'Run' AND l.avg_speed_mps > 3.0 AND l.elapsed_sec BETWEEN 120 AND 900
    )
    SELECT a.local_date, a.name,
           max(wl.avg_speed_mps) FILTER (WHERE wl.rn = 1) AS first_rep_mps,
           max(wl.avg_speed_mps) FILTER (WHERE wl.rn = wl.n) AS last_rep_mps
    FROM work_laps wl JOIN activities a ON a.id = wl.activity_id
    WHERE wl.n >= 3
    GROUP BY a.id, a.local_date, a.name ORDER BY a.local_date DESC

Plan compliance by label, current plan:

    SELECT lb.label,
           count(*) FILTER (WHERE w.status = 'completed') AS done,
           count(*) FILTER (WHERE w.status = 'skipped') AS skipped,
           count(*) AS planned
    FROM workouts w
    JOIN plans p ON p.id = w.plan_id AND p.status = 'active'
    LEFT JOIN labels lb ON lb.id = w.label_id
    WHERE w.date <= current_date
    GROUP BY lb.label ORDER BY planned DESC
`;
