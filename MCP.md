# Workout Planner — MCP Server

You have access to a training plan MCP server. Use it to manage the athlete's plans, workouts, activities, and notes.

## Connection

- **Transport:** Streamable HTTP
- **Endpoint:** `{SERVER_URL}/mcp`
- **Auth:** OAuth 2.1 by default — MCP clients that support OAuth will handle authentication automatically. On first connection, you'll be prompted to log in and approve access.
- **Claude fallback endpoint:** `{SERVER_URL}/mcp/claude/{CONNECTOR_TOKEN}` — pre-authenticated URL for Claude surfaces that currently fail the OAuth bootstrap.

The user will provide you with the server URL. If they haven't, ask for it before proceeding.

## Setup by Client

Pick the section matching your environment. Replace `{SERVER_URL}` with the actual server URL.

### Claude Desktop

If Claude Desktop's OAuth flow works for you, use the normal OAuth endpoint:

```json
{
  "mcpServers": {
    "workout-planner": {
      "type": "streamableHttp",
      "url": "{SERVER_URL}/mcp"
    }
  }
}
```

If Claude fails during OAuth bootstrap, mint a connector token first (see **Claude fallback token flow** below) and use the pre-authenticated URL instead:

```json
{
  "mcpServers": {
    "workout-planner": {
      "type": "streamableHttp",
      "url": "{SERVER_URL}/mcp/claude/{CONNECTOR_TOKEN}"
    }
  }
}
```

Then restart Claude Desktop.

### Claude Code (CLI)

OAuth path:

```bash
claude mcp add workout-planner \
  --transport streamable-http \
  "{SERVER_URL}/mcp"
```

Fallback token path:

```bash
claude mcp add workout-planner \
  --transport streamable-http \
  "{SERVER_URL}/mcp/claude/{CONNECTOR_TOKEN}"
```

### VS Code (GitHub Copilot)

Create `.vscode/mcp.json` in the workspace. Requires `chat.mcp.enabled: true` in VS Code settings.

```json
{
  "servers": {
    "workout-planner": {
      "type": "http",
      "url": "{SERVER_URL}/mcp"
    }
  }
}
```

### Claude fallback token flow

Use this when Claude reaches `POST /mcp` but never continues into OAuth discovery.

1. Create a connector token with an authenticated app session:

   ```bash
   curl -X POST "{SERVER_URL}/api/mcp/connector-tokens" \
     -H "Authorization: Bearer {SESSION_JWT}" \
     -H "Content-Type: application/json" \
     -d '{"name":"Claude Desktop"}'
   ```

2. Copy the returned `connectorUrl` or `rawToken`.
3. Configure Claude to use `{SERVER_URL}/mcp/claude/{CONNECTOR_TOKEN}`.
4. Treat that URL like a secret. If it leaks, revoke the token and mint a new one.

You can inspect existing tokens with:

```bash
curl "{SERVER_URL}/api/mcp/connector-tokens" \
  -H "Authorization: Bearer {SESSION_JWT}"
```

And revoke one with:

```bash
curl -X DELETE "{SERVER_URL}/api/mcp/connector-tokens/{TOKEN_ID}" \
  -H "Authorization: Bearer {SESSION_JWT}"
```

---

## How the Server Works

Read this section so you understand how to use the tools effectively.

### Plan Resolution

Most tools accept an optional `planId`. **When omitted, they automatically target the user's active plan.** Only one plan can be active at a time. Always omit `planId` unless the user explicitly wants to work on a non-active plan.

### Labels

Every workout must reference a label — either by `labelId` (UUID) or `labelKey` (e.g. `easy-run`). Labels define the workout category and carry:

- `key` — unique lowercase-hyphenated identifier
- `label` — human-readable name
- `hue` — HSL hue (0–359) for color
- `icon` — optional Tabler icon name (use `search_icons` to find valid names)
- `activitySports` — Strava sport types for auto-matching imported activities

### Workout Status

```
planned → completed   (complete_workout or link_activity)
planned → skipped     (skip_workout)
completed → planned   (unlink_activity)
```

### Strava Activities

Activities synced from Strava are auto-matched to planned workouts by date + sport type. Use `link_activity` / `unlink_activity` to manually override. `get_activity_streams` returns a temporary URL (15 min expiry) for detailed stream data.

### Training Guide Resource

The server exposes a `training-plan-guide` resource (`guide://training-plan-guide`) containing conventions for workout descriptions, metadata shapes, naming, colors, icons, and mermaid usage. **Read this resource before creating or modifying plans** — it defines the expected formats.

---

## Available Tools

### Plans

| Tool              | What it does                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_plans`      | List all plans. Optional filter: `status` (`active` / `inactive`).                                                                                            |
| `get_plan`        | Get full plan with phases, labels, stats. Optional: `planId`.                                                                                                 |
| `create_plan`     | Create a new plan. Required: `name`, `startDate`. Optional: `goal`, `endDate`, `metadata`. Auto-deactivates current active plan.                              |
| `update_plan`     | Update plan fields. Optional: `planId`, `name`, `goal`, `startDate`, `endDate`, `status`, `metadata`.                                                         |
| `deactivate_plan` | Set plan to inactive. Optional: `planId`.                                                                                                                     |
| `set_labels`      | **Replace all** labels on a plan. Required: `labels` array. Each label needs `key`, `label`, `hue`. Optional per label: `icon`, `metadata`, `activitySports`. |
| `update_label`    | Update one label by `key`. Optional fields: `label`, `hue`, `icon`, `metadata`, `activitySports`.                                                             |
| `add_phase`       | Add a training phase. Required: `name`, `startDate`, `endDate`. Optional: `planId`, `description`, `sortOrder`, `metadata`. Dates must be within plan range.  |
| `update_phase`    | Update a phase. Required: `phaseId`. Optional: `name`, `description`, `startDate`, `endDate`, `sortOrder`, `metadata`.                                        |
| `remove_phase`    | Delete a phase. Required: `phaseId`. Workouts in this phase become unlinked (not deleted).                                                                    |

### Workouts

| Tool                | What it does                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add_workouts`      | Add one or more workouts. Required per workout: `date`, `title`, `description`, `sortOrder`, and one of `labelId`/`labelKey`. Optional: `planId`, `targetDurationMin`, `targetDistanceM`, `phaseId`, `execution`, `metadata`. Supports partial success. |
| `update_workout`    | Update a workout. Required: `workoutId`. All other fields optional. Set to `null` to clear.                                                                                                                                                             |
| `remove_workouts`   | Delete workouts. Required: `workoutIds` array.                                                                                                                                                                                                          |
| `get_workouts`      | Query workouts. Optional filters: `planId`, `dateFrom`, `dateTo`, `labelId`, `labelKey`, `status`, `limit` (default 50, max 200).                                                                                                                       |
| `complete_workout`  | Mark as completed. Required: `workoutId`. Optional: `notes`.                                                                                                                                                                                            |
| `skip_workout`      | Mark as skipped. Required: `workoutId`. Optional: `reason`.                                                                                                                                                                                             |
| `link_activity`     | Link a Strava activity to a workout and mark it completed. Fetches the activity from Strava and stores it. Required: `workoutId`, `stravaActivityId` (numeric Strava ID). Fails on conflict.                                                            |
| `unlink_activity`   | Remove activity link, delete the stored activity row, reset workout to planned. Required: `workoutId`.                                                                                                                                                  |
| `add_trainer_notes` | Set coach notes (markdown) on a workout. Required: `workoutId`, `notes`. Overwrites existing.                                                                                                                                                           |

### Activities & Analytics

| Tool                        | What it does                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `get_workout_streams`       | Get temp URL for detailed Strava stream data for a linked workout (use this to build GPX, analyze pacing). Required: `workoutId`. |
| `get_week_summary`          | Planned vs actual aggregation for a Mon–Sun week. Optional: `weekDate`, `planId`.                                                 |
| `get_plan_progress`         | Overall plan metrics: total/completed/skipped workouts, completion rate, current phase. Optional: `planId`.                       |
| `compare_planned_vs_actual` | Per-workout planned vs actual comparison. Optional: `planId`, `dateFrom`, `dateTo`.                                               |

### Notes

| Tool               | What it does                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `add_plan_note`    | Add a markdown note. Required: `type` (`summary`/`adjustment`/`note`/`recommendation`), `content`. Optional: `planId`, `metadata`. |
| `update_plan_note` | Update a note. Required: `noteId`. Optional: `type`, `content`, `metadata`.                                                        |
| `delete_plan_note` | Delete a note. Required: `noteId`.                                                                                                 |
| `get_plan_notes`   | List notes. Optional: `planId`, `type`, `limit` (default 20, max 100).                                                             |

### Athlete

| Tool          | What it does                                                                                |
| ------------- | ------------------------------------------------------------------------------------------- |
| `get_profile` | Get athlete profile, Strava connection status, and active plan summary. No required params. |

### Icons

| Tool           | What it does                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `search_icons` | Search Tabler icons by name/category/tag. Required: `query`. Optional: `limit` (default 20, max 50). |

---

## Recommended First Steps

When starting a new conversation with a connected server:

1. Call `get_profile` to understand the athlete's current state.
2. Call `get_plan` (no args) to load the active plan with its phases, labels, and stats.
3. Read the `training-plan-guide` resource if you'll be creating or modifying workouts.
4. Use `get_workouts` with date filters to see what's coming up or what was recently completed.
5. Use `get_week_summary` to see the current week's planned vs actual workload.

## Common Mistakes to Avoid

- **Don't forget `sortOrder`** when adding workouts — it's required and controls display order within a day.
- **Don't use `set_labels` to update a single label** — it replaces ALL labels. Use `update_label` instead.
- **Don't guess icon names** — use `search_icons` to find valid Tabler icon names.
- **Don't set `planId` unnecessarily** — omitting it defaults to the active plan, which is almost always correct.
- **Dates are `YYYY-MM-DD`** strings, not timestamps.
- **`description` is the canonical workout body** — the user must be able to execute the workout from `description` alone. `execution` is optional structured data.
