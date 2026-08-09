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
- Workout-UUID-scoped queries hydrate too: a quoted workout UUID in SQL that touches activity
  data resolves to its matched activity via \`workout_activities\`.
- Queries that RETURN a \`strava_id\` column (e.g. finding an activity by date or name) hydrate
  the returned unhydrated ids automatically and re-run once, so the response already reflects
  the pulled data.
- To force specific ids anyway, add a comment anywhere in the SQL:
  \`-- hydrate: 19620351399, 19605843631\`. For bulk pulls (cross-session stream analysis),
  use the \`hydrate_activities\` tool — up to 10 ids per call.
- Per activity, \`activities.detail_synced_at\` (laps + best efforts present) and
  \`activities.streams_synced_at\` / \`streams_status\` ('synced' | 'unavailable' | NULL = not
  fetched yet) say what is hydrated; \`activities.stream_channels\` lists which stream columns
  actually contain data.

When the query is date/name-scoped, responses referencing streams/laps include a warning with
the count of unhydrated activities **and their newest strava_ids** — feed those into
\`-- hydrate:\` / \`hydrate_activities\`; do not present incomplete aggregates as complete.
When hydration ran, the response carries a \`hydrated\` array with per-id status, sample count,
and \`channels\`.

Coverage notes: the Strava webhook ingests every new activity, and everything ever matched to
a planned workout is pre-loaded. Old activities that were never matched become visible after
being referenced by id once (the detail fetch creates the row).

## Tables

### activities — one row per activity (units: meters, seconds, m/s, bpm, watts)
id (bigint, PK) · strava_id (bigint) · source ('strava'|'fit'|'gpx'|'manual') · sport (Strava
sport type, e.g. 'Run', 'Ride') · name · description · start_date (timestamptz) ·
start_date_local (timestamp, local clock time) · local_date (date, generated) · timezone ·
utc_offset_sec · distance_m · moving_sec · elapsed_sec · elevation_m · avg_hr · max_hr ·
avg_speed_mps (moving-time based — use distance_m/elapsed_sec when stops matter) ·
max_speed_mps · avg_power · max_power · weighted_avg_power · device_watts ·
avg_cadence · calories · suffer_score (Strava relative effort) · gear_id · workout_type
(run: 0 default/1 race/2 long run/3 workout; ride: 10/11 race/12) · is_race (generated) ·
trainer · commute · raw (jsonb, stripped Strava detail) · summary_synced_at ·
detail_synced_at · streams_synced_at · streams_status · streams_sample_count ·
stream_channels (text[], which stream columns have data — check before querying
watts/cadence/temp_c)

### activity_streams — one row per ~1s sample
activity_id → activities.id · time_s (offset from start, PK with activity_id) · dt_s
(precomputed gap to next sample, NULL on last — **use sum(dt_s) for time-in-zone**, no window
needed; guard pauses with \`least(dt_s, 10)\`) · distance_m (cumulative) · velocity_mps ·
altitude_m · grade_pct · hr · watts · cadence · temp_c · moving (bool)

### activity_laps — one row per lap
activity_id → activities.id · lap_index (1-based) · start_offset_sec · elapsed_sec ·
moving_sec · distance_m · avg_hr · max_hr · avg_speed_mps · max_speed_mps · avg_cadence ·
avg_power · total_ascent_m · start_index/end_index (Strava's original positional stream
indexes — informational only; join laps to activity_streams on time_s, not on these)

### activity_best_efforts — Strava's per-run best efforts ('400m'…'Half-Marathon')
activity_id → activities.id · effort_name · distance_m · elapsed_sec · moving_sec · pr_rank
(1-3 when it was a PR) · source ('strava')

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

## Analysis pitfalls

- **Pace**: never average per-sample pace — \`avg(1000/velocity_mps)\` overweights slow samples
  and biases every result slow. Use total distance ÷ total time
  (\`(max(distance_m)-min(distance_m)) / sum(dt_s)\`) or the harmonic form
  \`1000/avg(velocity_mps)/60\`.
- **Time-based aggregates**: weight by \`sum(dt_s)\`, not \`count(*)\` — sampling is ~1 Hz but
  not guaranteed uniform.
- **Optional columns**: check \`activities.stream_channels\` (or \`count(col)\`) before
  building queries on watts / cadence / temp_c / grade_pct.
- **HR fits**: heart rate approaches a workload step exponentially, not linearly. A
  \`regr_slope(hr, t)\` over a rep answers "still climbing?"; extrapolating it beyond the rep
  produces impossible numbers.
- **Derive boundaries, don't hardcode**: get rep windows from \`activity_laps\`
  (\`start_offset_sec\`, \`elapsed_sec\`) in the query instead of pasting literals read off an
  earlier result.
- **Work-lap heuristics lie**: a speed/duration filter for "work laps" can admit walked
  recoveries or fragmented warmups — sanity-check the selected laps against the prescription
  in \`workouts.execution\` (block count and durations).
- **Cross-session questions**: start from summary columns (\`activities\`: avg_hr,
  avg_speed_mps, suffer_score…) or \`activity_laps\` — they cover the whole fleet with no
  hydration cost. Per-second cross-session scans require every activity's streams; reserve
  those for a handful of ids, or bulk-pull with \`hydrate_activities\` first.
- **Lookups belong in SQL too**: resolving "which workout/activity" via run_sql returns a few
  hundred bytes; the REST-shaped tools return full execution JSONB and notes. E.g. the most
  recent completed quality session:

      SELECT w.id, w.date, w.title
      FROM workouts w
      JOIN labels lb ON lb.id = w.label_id AND lb.key = 'quality'
      JOIN plans p ON p.id = w.plan_id AND p.status = 'active'
      WHERE w.status = 'completed' AND w.date <= current_date
      ORDER BY w.date DESC LIMIT 1

## Worked examples

Weekly running volume, last 12 weeks (calendar spine keeps empty weeks):

    SELECT w.week::date AS week,
           round(coalesce(sum(a.distance_m) / 1000.0, 0)::numeric, 1) AS km,
           count(a.id) AS runs
    FROM generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS w(week)
    LEFT JOIN activities a ON date_trunc('week', a.start_date_local) = w.week AND a.sport IN ('Run', 'TrailRun')
    GROUP BY w.week ORDER BY w.week

Time in HR zones for one activity (dt_s, no window function). Zone boundaries are not stored
in the database — take them from the training plan and inline them. LEFT JOIN from the band
list so an empty band shows up as an explicit 0 instead of silently missing:

    WITH z(zone_index, min_hr, max_hr) AS (
      VALUES (1, 0, 148), (2, 148, 158), (3, 158, 172), (4, 172, 190), (5, 190, 999)
    )
    SELECT z.zone_index,
           round(coalesce(sum(least(s.dt_s, 10)), 0) / 60.0, 1) AS minutes
    FROM z
    LEFT JOIN (
      SELECT s.hr, s.dt_s
      FROM activity_streams s
      JOIN activities a ON a.id = s.activity_id
      WHERE a.strava_id = 19605843631 AND s.hr IS NOT NULL
    ) s ON s.hr >= z.min_hr AND s.hr < z.max_hr
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
warning listing the newest un-hydrated strava_ids. Pull those with \`hydrate_activities\`
(10 per call) until the warning clears, then re-run — or answer from summary columns instead
when per-second precision isn't essential.

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

Cross-session comparison — rep-level pace and HR across every completed quality session (the
strongest use of this tool: how does HR at a given pace vary with rep duration across weeks?):

    WITH quality AS (
      SELECT w.date, w.title, a.id AS act_id
      FROM workouts w
      JOIN labels lb ON lb.id = w.label_id AND lb.key IN ('quality', 'race')
      JOIN workout_activities wa ON wa.workout_id = w.id
      JOIN activities a ON a.strava_id = wa.strava_id
      WHERE w.status = 'completed'
    )
    SELECT q.date, q.title, l.lap_index, l.elapsed_sec,
           to_char(interval '1 second' * (1000.0 / nullif(l.avg_speed_mps, 0)), 'MI:SS') AS pace,
           l.avg_hr, l.max_hr
    FROM quality q
    JOIN activity_laps l ON l.activity_id = q.act_id
    WHERE l.avg_speed_mps > 3.0 AND l.elapsed_sec BETWEEN 55 AND 900
    ORDER BY q.date, l.lap_index

Laps require detail hydration, so expect the first run to warn about unhydrated sessions:
bulk-pull them with \`hydrate_activities\` (10 ids per call) and re-run until the warning
clears.

Entry vs terminal HR per lap — lap-average HR is diluted by the ~2 min entry ramp; terminal HR
is the honest cost of the pace:

    WITH s AS (
      SELECT l.lap_index, st.time_s - l.start_offset_sec AS t_rel, st.hr,
             max(st.time_s - l.start_offset_sec) OVER (PARTITION BY l.lap_index) AS t_max
      FROM activity_laps l
      JOIN activities a ON a.id = l.activity_id
      JOIN activity_streams st ON st.activity_id = l.activity_id
       AND st.time_s >= l.start_offset_sec AND st.time_s < l.start_offset_sec + l.elapsed_sec
      WHERE a.strava_id = 19620351399 AND st.hr IS NOT NULL
    )
    SELECT lap_index,
           round(avg(hr) FILTER (WHERE t_rel < 15)::numeric, 0) AS hr_entry,
           round(avg(hr)::numeric, 1) AS hr_avg,
           round(avg(hr) FILTER (WHERE t_rel > t_max - 15)::numeric, 0) AS hr_terminal
    FROM s GROUP BY lap_index ORDER BY lap_index

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
