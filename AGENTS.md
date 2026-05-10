# AGENTS.md

Guidance for AI agents working in this codebase.

## Getting started

### Prerequisites

- Node.js (ES2023 target)
- pnpm
- A Supabase project (provides PostgreSQL + auth)
- Strava API app (for OAuth integration)

### Setup

1. Install dependencies:

   ```
   pnpm install
   ```

2. Create `.dev.vars` from the example and fill in the values:

   ```
   cp .dev.vars.example .dev.vars
   ```

   Required variables:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — from your Supabase project settings
   - `SUPABASE_SECRET_KEY` — service role key from Supabase (used for RLS bypass in shares, MCP auth)
   - `DATABASE_URL` — direct PostgreSQL connection string (only needed for running Drizzle migrations, not at runtime)
   - `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` — from your Strava API app
   - `STRAVA_VERIFY_TOKEN` — any string, used to verify Strava webhook subscription
   - `STRAVA_WEBHOOK_PATH_SECRET` — random string, becomes part of the webhook URL path to prevent enumeration
   - `PUBLIC_APP_URL` — defaults to `http://localhost:8787` for local dev

3. Run database migrations:

   ```
   pnpm db:migrate
   ```

   This requires `DATABASE_URL` to be set (either in `.dev.vars` or as an env var). Migrations live in `db/migrations/` and include table creation, RLS policies, and triggers.

### Running locally

```
pnpm dev
```

This builds the TypeScript (`tsc`) then starts a local Cloudflare Pages dev server on `http://localhost:8787`. The app is served via Wrangler which emulates the Workers runtime. Environment variables are read from `.dev.vars`.

### Running tests

```
pnpm test
```

Tests do not require any env vars or database connection — everything is mocked. See "Testing conventions" below for details.

## Package manager

- **Always use `pnpm`** — never use `npm` or `npx`.
- Run all scripts via `pnpm run <script>` (e.g. `pnpm run lint`, `pnpm run format:check`, `pnpm run test`).
- Execute package binaries via `pnpm exec <bin>` instead of `npx`.

## Navigation

| What you need                 | Where to look           |
| ----------------------------- | ----------------------- |
| HTTP route handlers           | `server/routes/`        |
| MCP tool implementations      | `server/mcp/tools/`     |
| MCP auth, errors, helpers     | `server/mcp/context.ts` |
| MCP server setup              | `server/mcp/handler.ts` |
| Database schema               | `db/schema.ts`          |
| Supabase/Strava clients       | `server/lib/`           |
| Cloudflare Pages entry points | `functions/`            |
| Tests for HTTP routes         | `tests/api/`            |
| Tests for MCP tools           | `tests/mcp/`            |
| Test helpers and mocks        | `tests/helpers/`        |
| DB migrations                 | `db/migrations/`        |

## Key patterns

### Error handling

Use `AppError` from `server/mcp/context.ts` with one of these codes:
`AUTH_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.

MCP tool handlers return responses via `toolSuccess(result, warnings?)` or `toolError(error)` — these wrap the payload for both text and structured content.

Zod validation errors are automatically serialized by `errorPayload()`.

### Input validation

All inputs are validated with Zod schemas. Define the schema inline in the tool/route handler. For workout metadata, use `validateWorkoutMetadata()` which checks known shapes: `intervals`, `zones`, `sets`, `segments` (schemas in `knownMetadataSchemas`).

### Plan resolution

`resolvePlanId(ctx, planId?)` — if `planId` is provided, fetches that specific plan. Otherwise falls back to the user's active plan. Most MCP tools accept an optional `planId` and use this helper.

### Auth model

- **HTTP routes** (`server/routes/`): Use Supabase session auth. Call `createUserSupabase(c)` to get a client scoped to the authenticated user.
- **MCP endpoint**: Uses `authenticateMcpRequest(c)` which validates OAuth 2.1 access tokens via `supabase.auth.getUser()`. Returns an `McpContext` with `supabase` (service-role client), `userId`, and `bindings`. OAuth discovery is at `/.well-known/oauth-authorization-server`, consent page at `/oauth/consent`.
- **Shares endpoint**: Uses service-role Supabase client to bypass RLS (public access).

### Strava integration

- Sport type mapping is in `server/lib/strava.ts` (`mapStravaType`). Maps specific types (e.g. `TrailRun` → `run`, `MountainBikeRide` → `bike`) to normalized sport names.
- Token refresh has a 5-minute buffer before expiry.
- Activities are auto-matched to planned workouts by date + sport + `planned` status.
- Stream tokens (15 min expiry) are generated via `server/lib/stream-tokens.ts` for secure access to Strava stream data.

## Database conventions

- All tables use UUID primary keys (`defaultRandom()`), except `plan_shares` which uses text IDs.
- Every table has RLS enabled with `select_own`, `insert_own`, `update_own`, `delete_own` policies.
- `userId` column on every table (FK → `profiles.id`) for RLS scoping.
- JSONB `metadata` fields on `plans`, `phases`, `workouts`, `plan_notes` for extensibility.
- Check constraints enforce enums (`status`, `type`), positive values, and date ranges.
- `updated_at` columns are auto-updated by database triggers.
- A trigger auto-creates a `profiles` row on auth user signup.
- Cascade deletes: plan → phases, workouts, notes, labels, label activity sports, shares. Phase/activity deletion → sets null on workouts.
- Only one active plan per user (enforced in application logic + unique partial index).

## Testing conventions

- Tests use Vitest. Run with `pnpm test` or `pnpm test:watch`.
- Mock Supabase client (`tests/helpers/mock-supabase.ts`) provides a fluent chain API. Configured per-test via `mockTable().select().eq().returns()` pattern.
- `tests/helpers/setup.ts` auto-mocks the `server/lib/supabase` module — no manual mock setup needed.
- MCP tool tests use helpers from `tests/helpers/mcp.ts`: `mcpCallTool(toolName, args)`, `parseMcpResponse(result)`, `extractToolResult(result)`.
- Test files mirror source structure: `tests/api/` for HTTP routes, `tests/mcp/` for MCP tools.
- Coverage thresholds: 90% statements/functions/lines, 85% branches.

## Formatting and linting

- **OxFmt**: 180 char line width, double quotes, semicolons, trailing commas everywhere. Run `pnpm format`.
- **OxLint**: TypeScript plugin enabled. Custom rule: `process` usage is forbidden in `server/` and `functions/` files (Workers runtime has no `process` global). Run `pnpm lint`.
- **No `any`**: `typescript/no-explicit-any` is enabled as an error. Use `unknown` and narrow the type instead.
- For CSS transitions with multiple properties, put timing on `transition` and list properties separately:

  ```css
  transition: var(--motion-timing-fast) var(--motion-function);
  transition-property: color, background, box-shadow;
  ```

- Ignores: `dist/`, `.wrangler/`.

## Common tasks

### Adding a new MCP tool

1. Create or edit a file in `server/mcp/tools/`.
2. Define the tool with `server.tool(name, description, schema, handler)`. Use Zod for the input schema.
3. The handler receives `(params, extra)` — use `extra` to get the `McpContext` (set during auth in `handler.ts`).
4. Return `toolSuccess(result)` or `toolError(error)`.
5. The tool is auto-registered — `handler.ts` imports all tool files.
6. Add tests in `tests/mcp/`.

### Adding a new HTTP route

1. Create a new file in `server/routes/` with a Hono router.
2. Register it in `server/index.ts` via `app.route("/api/path", router)`.
3. For authenticated routes, use `createUserSupabase(c)` from `server/lib/supabase.ts`.
4. Add a catch-all in `functions/` if the route uses a new top-level path (existing `/api/*` and `/mcp` catch-alls cover most cases).
5. Add tests in `tests/api/`.

### Adding a new database table

1. Define the table in `db/schema.ts` using Drizzle's `pgTable`.
2. Add it to the `tables` export at the bottom of the file.
3. Run `pnpm db:generate` to create a migration.
4. Write the RLS policies in the generated migration SQL (follow existing patterns: `select_own`, `insert_own`, `update_own`, `delete_own`).
5. Run `pnpm db:migrate` to apply.
