# Workout Planner Backend

Backend-only shape of the workout planner app — an MCP-first training plan manager with Strava integration, hosted on Cloudflare Pages.

## Stack

- **Runtime** — Cloudflare Pages Functions (Workers)
- **Framework** — Hono
- **Database** — PostgreSQL via Supabase
- **ORM** — Drizzle ORM
- **Validation** — Zod
- **Protocol** — MCP (Model Context Protocol)
- **Integration** — Strava OAuth + webhooks
- **Testing** — Vitest (v8 coverage)
- **Linting** — OxLint
- **Formatting** — OxFmt

## Project structure

```
server/
  index.ts              — Hono app entry point, route registration
  routes/
    mcp-auth.ts         — API token CRUD (create, list, revoke)
    shares.ts           — Public plan sharing endpoint
    strava.ts           — OAuth flow, webhooks, sync, streams
  mcp/
    handler.ts          — MCP server setup and request handling
    context.ts          — Auth, errors, helpers (AppError, toolSuccess/toolError)
    tools/
      plans.ts          — Plan, phase, and workout type management
      workouts.ts       — Workout CRUD and queries
      notes.ts          — Plan note CRUD
      activities.ts     — Strava activity queries and trainer notes
      athlete.ts        — Athlete profile and connection state
    resources/
      training-guide.ts — MCP resource: data modeling conventions guide
  lib/
    supabase.ts         — Supabase client factories, AppBindings type
    strava.ts           — Strava API client, OAuth helpers, sport mapping
    stream-tokens.ts    — Temporary token generation for stream data
functions/
  api/[[route]].ts      — Cloudflare Pages catch-all → Hono /api/*
  mcp/[[route]].ts      — Cloudflare Pages catch-all → Hono /mcp
db/
  schema.ts             — Drizzle table definitions (11 tables)
  migrations/           — SQL migration files
tests/
  helpers/
    setup.ts            — Global test setup (auto-mocks supabase)
    mock-supabase.ts    — Fluent chain mock for Supabase client
    mock-env.ts         — Mock Cloudflare bindings
    mcp.ts              — MCP test client helpers
  api/                  — HTTP route tests
  mcp/                  — MCP tool tests
```

## Database

PostgreSQL with 11 tables, all using UUID primary keys. RLS is enabled on every table with per-user policies (`select_own`, `insert_own`, `update_own`, `delete_own`).

| Table                | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `profiles`           | User profiles (FK → `auth.users`)                          |
| `strava_credentials` | OAuth tokens for Strava                                    |
| `api_tokens`         | Bearer tokens for MCP auth (`tp_` prefix, SHA-256 hashed)  |
| `plans`              | Training plans (one active per user)                       |
| `workout_types`      | Configurable categories per plan (key, label, hue, icon)   |
| `phases`             | Training phases within a plan                              |
| `workouts`           | Individual planned workouts                                |
| `activities`         | Synced Strava activities                                   |
| `plan_notes`         | Annotations (summary / adjustment / note / recommendation) |
| `plan_shares`        | Public share links with visibility flags                   |
| `stream_tokens`      | Time-limited tokens for Strava stream access (15 min)      |

Key relationships: plan deletion cascades to phases, workouts, notes, workout types, and shares. Phase/activity deletion sets null on workouts (preserves the workout).

Schema defined in `db/schema.ts` with Drizzle ORM. Migrations in `db/migrations/`.

## API surface

| Method | Path                          | Auth      | Description                                     |
| ------ | ----------------------------- | --------- | ----------------------------------------------- |
| GET    | `/api/health`                 | none      | Health check                                    |
| GET    | `/api/tokens`                 | Supabase  | List user's API tokens                          |
| POST   | `/api/tokens`                 | Supabase  | Create API token (returns `tp_` prefixed token) |
| DELETE | `/api/tokens/:id`             | Supabase  | Revoke API token                                |
| GET    | `/api/strava/profile`         | Supabase  | Athlete profile and connection state            |
| GET    | `/api/strava/auth`            | Supabase  | Start Strava OAuth flow                         |
| GET    | `/api/strava/callback`        | Supabase  | OAuth callback                                  |
| POST   | `/api/strava/disconnect`      | Supabase  | Revoke Strava connection                        |
| GET    | `/api/strava/webhook/:secret` | none      | Webhook verification                            |
| POST   | `/api/strava/webhook/:secret` | none      | Webhook events (activity CRUD)                  |
| POST   | `/api/strava/sync`            | Supabase  | Manual sync (up to 90 days)                     |
| GET    | `/api/strava/streams/:id`     | token     | Stream data with temporary token                |
| GET    | `/api/shares/:shareId`        | none      | Fetch shared plan (public)                      |
| ALL    | `/mcp`                        | MCP token | MCP server endpoint                             |

## MCP tools

5 tool categories registered on the MCP server:

- **Plans** — `list_plans`, `get_plan`, `create_plan`, `update_plan`, `set_workout_types`, `update_workout_type`, `add_phase`, `update_phase`, `delete_phase`
- **Workouts** — `add_workouts`, `get_workouts`, `update_workout`, `delete_workout`, `get_workout_by_date`
- **Notes** — `add_plan_note`, `update_plan_note`, `delete_plan_note`, `get_plan_notes`
- **Activities** — `get_activities`, `get_activity_detail`, `update_activity`
- **Athlete** — `get_profile`

Resource: `guide://training-plan-guide` — markdown guide for data modeling conventions.

## Authentication

Two auth paths:

1. **Supabase session** — used by HTTP routes (`/api/tokens`, `/api/strava/*`). Bearer token from Supabase auth.
2. **MCP tokens** — used by the `/mcp` endpoint. `tp_`-prefixed tokens, SHA-256 hashed in `api_tokens` table. Managed via the `/api/tokens` routes.

## Scripts

| Script               | Description                                 |
| -------------------- | ------------------------------------------- |
| `pnpm dev`           | Run Cloudflare Pages locally (builds first) |
| `pnpm build`         | Type-check and prepare `dist/`              |
| `pnpm lint`          | Run OxLint                                  |
| `pnpm format`        | Format with OxFmt                           |
| `pnpm format:check`  | Check formatting                            |
| `pnpm test`          | Run tests once                              |
| `pnpm test:watch`    | Run tests in watch mode                     |
| `pnpm test:coverage` | Run tests with coverage report              |
| `pnpm db:generate`   | Generate Drizzle migrations                 |
| `pnpm db:migrate`    | Apply Drizzle migrations                    |
| `pnpm db:studio`     | Open Drizzle Studio GUI                     |

## Environment

Copy `.dev.vars.example` to `.dev.vars` and fill in:

**Public (safe for frontend):**

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key

**Server-only:**

- `SUPABASE_SECRET_KEY` — Service role key
- `DATABASE_URL` — Direct PostgreSQL connection (for Drizzle migrations)
- `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` — OAuth credentials
- `STRAVA_VERIFY_TOKEN` — Webhook verification token
- `STRAVA_WEBHOOK_PATH_SECRET` — Random string for webhook URL path
- `PUBLIC_APP_URL` — Application base URL (`http://localhost:8788` for dev)

## Testing

Tests live in `tests/` mirroring the source structure (`api/`, `mcp/`). Vitest with v8 coverage provider.

Coverage thresholds: 90% statements/functions/lines, 85% branches. `server/mcp/resources/**` is excluded from coverage.

Test infrastructure:

- **Mock Supabase** — fluent chain API (`mock-supabase.ts`) auto-mocked via setup file
- **Mock env** — Cloudflare bindings (`mock-env.ts`)
- **MCP helpers** — `mcpCallTool`, `parseMcpResponse`, `extractToolResult` (`mcp.ts`)
