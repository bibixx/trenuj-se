import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

// Integration suite for the run_sql sandbox (migration 0014) and the ingest RPCs (0013).
// Skipped unless TEST_DATABASE_URL points at a Postgres with the migrations applied — e.g.
//
//   supabase db start
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:migrate
//   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/integration
//
// These tests exercise what the mocked suites fundamentally cannot: RLS scoping, the
// SECURITY DEFINER SET ROLE hard-block (CVE-2007-6600 — the linchpin of user isolation),
// write rejection, caps, and the SQL-side ingest logic.

const DB_URL = process.env.TEST_DATABASE_URL;

const runIf = describe.skipIf(!DB_URL);

const USER_A = crypto.randomUUID();
const USER_B = crypto.randomUUID();

type QueryResult = {
  ok: boolean;
  error_code?: string;
  sqlstate?: string;
  message?: string;
  rows?: Array<Record<string, unknown>>;
  row_count?: number;
  warnings?: string[];
};

runIf("SQL sandbox (real Postgres)", () => {
  let sql: postgres.Sql;

  // Calls run_user_query the way PostgREST would: as service_role.
  async function runQuery(userId: string, query: string, maxRows?: number): Promise<QueryResult> {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE service_role`;
      return tx`SELECT public.run_user_query(${userId}::uuid, ${query}, ${maxRows ?? 200}) AS out`;
    });
    return (rows as Array<{ out: QueryResult }>)[0]!.out;
  }

  beforeAll(async () => {
    sql = postgres(DB_URL!, { max: 1, onnotice: () => {} });

    for (const userId of [USER_A, USER_B]) {
      await sql`INSERT INTO auth.users (id) VALUES (${userId}::uuid) ON CONFLICT (id) DO NOTHING`;
      await sql`INSERT INTO public.profiles (id) VALUES (${userId}::uuid) ON CONFLICT (id) DO NOTHING`;
      await sql`SELECT public.sandbox_ensure_user(${userId}::uuid)`;
    }

    await sql`
      INSERT INTO public.activities (user_id, source, strava_id, sport, name, start_date, start_date_local, elapsed_sec, distance_m, summary_synced_at)
      VALUES
        (${USER_A}::uuid, 'strava', 101, 'Run', 'A run 1', '2026-08-01T07:00:00Z', '2026-08-01T09:00:00', 3600, 10000, now()),
        (${USER_A}::uuid, 'strava', 102, 'Run', 'A run 2', '2026-08-03T07:00:00Z', '2026-08-03T09:00:00', 1800, 5000, now()),
        (${USER_B}::uuid, 'strava', 201, 'Ride', 'B ride', '2026-08-02T07:00:00Z', '2026-08-02T09:00:00', 7200, 60000, now())
      ON CONFLICT (user_id, strava_id) DO NOTHING
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    try {
      await sql`DELETE FROM public.profiles WHERE id IN (${USER_A}::uuid, ${USER_B}::uuid)`;
      await sql`DELETE FROM auth.users WHERE id IN (${USER_A}::uuid, ${USER_B}::uuid)`;
      for (const userId of [USER_A, USER_B]) {
        const fn = `exec_${userId.replaceAll("-", "")}`;
        const role = `sbx_${userId}`;
        await sql.unsafe(`DROP FUNCTION IF EXISTS sandbox."${fn}"(text, integer)`);
        await sql.unsafe(`DROP ROLE IF EXISTS "${role}"`);
      }
    } finally {
      await sql.end();
    }
  });

  test("T1: queries only ever see the requesting user's rows", async () => {
    const countA = await runQuery(USER_A, "SELECT count(*)::int AS n FROM activities");
    expect(countA.ok).toBe(true);
    expect(countA.rows?.[0]?.n).toBe(2);

    const countB = await runQuery(USER_B, "SELECT count(*)::int AS n FROM activities");
    expect(countB.rows?.[0]?.n).toBe(1);

    const userIds = await runQuery(USER_A, "SELECT DISTINCT user_id::text AS uid FROM activities");
    expect(userIds.rows).toEqual([{ uid: USER_A }]);
  });

  test("T2: SET ROLE / set_config('role', ...) is hard-blocked inside the sandbox (linchpin)", async () => {
    const smuggle = await runQuery(USER_A, "SELECT set_config('role', 'service_role', true) AS r");
    expect(smuggle.ok).toBe(false);
    expect(smuggle.error_code).toBe("SQL_ERROR");
    expect(smuggle.message).toMatch(/role|permission/i);

    const smuggleSbx = await runQuery(USER_A, `SELECT set_config('role', 'sbx_${USER_B}', true) AS r`);
    expect(smuggleSbx.ok).toBe(false);
  });

  test("T2b: forging a scoping GUC is harmless — isolation is role-based, not GUC-based", async () => {
    const forged = await runQuery(USER_A, `SELECT count(*)::int AS n FROM (SELECT set_config('app.user_id', '${USER_B}', true)) s CROSS JOIN LATERAL (SELECT * FROM activities) a`);
    expect(forged.ok).toBe(true);
    expect(forged.rows?.[0]?.n).toBe(2); // still user A's activities
  });

  test("T3: writes are rejected", async () => {
    const insert = await runQuery(USER_A, `WITH x AS (INSERT INTO plans (user_id, name, start_date) VALUES ('${USER_A}', 'evil', '2026-01-01') RETURNING id) SELECT * FROM x`);
    expect(insert.ok).toBe(false);
    expect(insert.error_code).toBe("SQL_ERROR");

    const update = await runQuery(USER_A, "UPDATE activities SET name = 'evil' RETURNING id");
    expect(update.ok).toBe(false);
  });

  test("T4: multi-statement input is rejected; trailing comments cannot break the wrapper", async () => {
    const multi = await runQuery(USER_A, "SELECT 1 AS a; DROP TABLE activities");
    expect(multi.ok).toBe(false);
    expect(multi.error_code).toBe("MULTI_STATEMENT");

    const trailingComment = await runQuery(USER_A, "SELECT 1 AS a --anything");
    expect(trailingComment.ok).toBe(true);
    expect(trailingComment.rows).toEqual([{ a: 1 }]);
  });

  test("T5: row cap, byte cap, empty results, and verbatim SQL errors", async () => {
    const overflow = await runQuery(USER_A, "SELECT g AS n FROM generate_series(1, 300) g", 200);
    expect(overflow.ok).toBe(false);
    expect(overflow.error_code).toBe("TOO_MANY_ROWS");

    const tooBig = await runQuery(USER_A, "SELECT repeat('x', 100000) AS blob");
    expect(tooBig.ok).toBe(false);
    expect(tooBig.error_code).toBe("RESULT_TOO_LARGE");

    const empty = await runQuery(USER_A, "SELECT * FROM activities WHERE strava_id = -1");
    expect(empty.ok).toBe(true);
    expect(empty.rows).toEqual([]);
    expect(empty.row_count).toBe(0);

    const sqlError = await runQuery(USER_A, "SELECT nope FROM activities");
    expect(sqlError.ok).toBe(false);
    expect(sqlError.error_code).toBe("SQL_ERROR");
    expect(sqlError.sqlstate).toBe("42703");
    expect(sqlError.message).toMatch(/nope/);
  });

  test("T6: excluded tables and privileged functions are unreachable", async () => {
    for (const table of ["strava_credentials", "profiles", "mcp_connector_tokens", "plan_shares"]) {
      const result = await runQuery(USER_A, `SELECT * FROM ${table}`);
      expect(result.ok, `${table} should be blocked`).toBe(false);
      expect(result.message).toMatch(/permission denied/i);
    }

    const rpcEscape = await runQuery(USER_A, `SELECT public.run_user_query('${USER_B}', 'SELECT 1', 1) AS r`);
    expect(rpcEscape.ok).toBe(false);

    const provisionEscape = await runQuery(USER_A, `SELECT public.sandbox_ensure_user('${USER_B}') AS r`);
    expect(provisionEscape.ok).toBe(false);

    const otherWrapper = await runQuery(USER_A, `SELECT sandbox."exec_${USER_B.replaceAll("-", "")}"('SELECT 1', 1) AS r`);
    expect(otherWrapper.ok).toBe(false);

    const ingestEscape = await runQuery(USER_A, `SELECT public.strava_ingest_activity_detail('${USER_A}', '{}') AS r`);
    expect(ingestEscape.ok).toBe(false);
  });

  test("T7: pg_net is unreachable from the sandbox", async () => {
    const result = await runQuery(USER_A, "SELECT net.http_get('http://example.com') AS r");
    // Either the extension is absent (undefined schema/function) or usage is denied — both block.
    expect(result.ok).toBe(false);
  });

  test("T8: provisioning is idempotent", async () => {
    await sql`SELECT public.sandbox_ensure_user(${USER_A}::uuid)`;
    await sql`SELECT public.sandbox_ensure_user(${USER_A}::uuid)`;
    const after = await runQuery(USER_A, "SELECT 1 AS ok");
    expect(after.ok).toBe(true);
  });

  test("T9: ingest RPC round-trip — detail + streams land as queryable rows with correct dt_s", async () => {
    const detailPayload = JSON.stringify({
      id: 909,
      sport_type: "Run",
      name: "Ingest test",
      start_date: "2026-08-05T06:00:00Z",
      start_date_local: "2026-08-05T08:00:00Z",
      timezone: "(GMT+02:00) Europe/Warsaw",
      elapsed_time: 40,
      moving_time: 38,
      distance: 150.5,
      average_heartrate: 140.6,
      laps: [
        { lap_index: 1, start_date: "2026-08-05T06:00:00Z", elapsed_time: 20, distance: 75.0, average_heartrate: 138.2 },
        { lap_index: 2, start_date: "2026-08-05T06:00:20Z", elapsed_time: 20, distance: 75.5, average_heartrate: 143.9 },
      ],
      best_efforts: [{ name: "400m", distance: 400, elapsed_time: 90, pr_rank: null }],
      segment_efforts: [{ huge: "stripped" }],
    });

    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE service_role`;
      await tx`SELECT public.strava_ingest_activity_detail(${USER_A}::uuid, ${detailPayload})`;
    });

    const streamsPayload = JSON.stringify([
      { type: "time", data: [0, 10, 25, 40] },
      { type: "distance", data: [0, 40.5, 95.1, 150.5] },
      { type: "heartrate", data: [120, 135, 150, 142] },
      { type: "moving", data: [false, true, true, true] },
    ]);

    const [{ report }] = (await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE service_role`;
      return tx`SELECT public.strava_ingest_activity_streams(${USER_A}::uuid, 909, ${streamsPayload}) AS report`;
    })) as Array<{ report: { samples: number; channels: string[] } }>;
    expect(report.samples).toBe(4);
    // Channels reflect which columns actually got data: no velocity/altitude/etc. in the payload.
    expect(report.channels).toEqual(["distance_m", "hr", "moving"]);

    const activity = await runQuery(
      USER_A,
      "SELECT sport, name, local_date::text AS local_date, avg_hr, distance_m, streams_status, streams_sample_count FROM activities WHERE strava_id = 909",
    );
    expect(activity.rows?.[0]).toMatchObject({
      sport: "Run",
      name: "Ingest test",
      local_date: "2026-08-05",
      avg_hr: 141,
      distance_m: 151,
      streams_status: "synced",
      streams_sample_count: 4,
    });

    const laps = await runQuery(
      USER_A,
      "SELECT l.lap_index, l.start_offset_sec, l.avg_hr FROM activity_laps l JOIN activities a ON a.id = l.activity_id WHERE a.strava_id = 909 ORDER BY l.lap_index",
    );
    expect(laps.rows).toEqual([
      { lap_index: 1, start_offset_sec: 0, avg_hr: 138 },
      { lap_index: 2, start_offset_sec: 20, avg_hr: 144 },
    ]);

    const streams = await runQuery(
      USER_A,
      "SELECT time_s, dt_s, hr, moving FROM activity_streams s JOIN activities a ON a.id = s.activity_id WHERE a.strava_id = 909 ORDER BY time_s",
    );
    expect(streams.rows).toEqual([
      { time_s: 0, dt_s: 10, hr: 120, moving: false },
      { time_s: 10, dt_s: 15, hr: 135, moving: true },
      { time_s: 25, dt_s: 15, hr: 150, moving: true },
      { time_s: 40, dt_s: null, hr: 142, moving: true }, // last sample: dt_s must be NULL
    ]);

    const efforts = await runQuery(USER_A, "SELECT e.effort_name, e.elapsed_sec FROM activity_best_efforts e JOIN activities a ON a.id = e.activity_id WHERE a.strava_id = 909");
    expect(efforts.rows).toEqual([{ effort_name: "400m", elapsed_sec: 90 }]);

    // Heavy keys stripped from raw, light keys kept.
    const raw = await runQuery(USER_A, "SELECT raw ? 'segment_efforts' AS has_segments, raw ? 'name' AS has_name FROM activities WHERE strava_id = 909");
    expect(raw.rows?.[0]).toEqual({ has_segments: false, has_name: true });

    // Hydration warning fires for unhydrated streams elsewhere, and lists the missing
    // strava_ids so the agent can pull them via a `-- hydrate:` comment. Activities 101/102
    // (seeded summary-only) have no streams.
    const warned = await runQuery(USER_A, "SELECT count(*) AS n FROM activity_streams");
    const streamWarning = warned.warnings?.find((w) => w.includes("no hydrated streams"));
    expect(streamWarning).toBeDefined();
    expect(streamWarning).toMatch(/101|102/);
    expect(streamWarning).toMatch(/-- hydrate:/);
  });

  test("athlete_zones is gone (dropped in 0017 — the OAuth scope never covered it)", async () => {
    const result = await runQuery(USER_A, "SELECT count(*) FROM athlete_zones");
    expect(result.ok).toBe(false);
    expect(result.sqlstate).toBe("42P01"); // undefined_table
  });
});
