# Local Supabase (integration testing)

This scaffold exists so the SQL sandbox and Strava-ingest migrations can be tested against a
**real Postgres** — the mocked Vitest suites can't execute SQL, so RLS scoping, the
`SET ROLE` hard-block, statement timeouts, and the ingest RPCs are only meaningfully covered
here.

Requires Docker running and the Supabase CLI (`brew install supabase/tap/supabase`).

## Run the SQL sandbox integration suite

```bash
# 1. Start the local database (Postgres on 127.0.0.1:54322).
supabase db start

# 2. Apply all migrations, including the warehouse + sandbox ones (0012–0014).
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:migrate

# 3. Run the env-gated integration suite (skipped when TEST_DATABASE_URL is unset).
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm vitest run tests/integration

# When done:
supabase stop
```

`tests/integration/sql-sandbox.test.ts` seeds two users and asserts, among other things:
cross-user isolation, that `set_config('role', …)` / `SET ROLE` is rejected inside the
sandbox (the linchpin of user isolation), that writes are refused, the row/byte caps, that
excluded tables and privileged functions are unreachable, that `pg_net` is blocked, and that
the ingest RPCs produce correct rows (including `dt_s` NULL on the last stream sample).

## Manual production checks before enabling the `sql_queries` flag

Verified locally on Postgres 17.6; re-confirm against the hosted project (its major version
may differ):

- **Read-only RPC path** — PostgREST runs the STABLE `run_user_query` in a read-only
  transaction and `SET LOCAL work_mem` inside `exec_impl` still works. Simulate with:
  `BEGIN; SET TRANSACTION READ ONLY; SET LOCAL ROLE service_role; SELECT public.run_user_query(...);`
- **Statement timeout** — the `authenticator` role carries `statement_timeout=8s` on Supabase,
  which bounds the PostgREST path (a `pg_sleep` query is cancelled). No extra config needed
  unless that value is unset on the project.
- **Provisioning** — `sandbox_ensure_user` creates the per-user role + wrapper and transfers
  ownership; confirm the `GRANT role TO postgres` / `ALTER FUNCTION … OWNER` sequence succeeds
  on the project's Postgres version.
- **pg_net** — `net.http_get(...)` is not executable from a sandbox role.
