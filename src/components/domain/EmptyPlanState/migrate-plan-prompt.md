I already have a training plan and I'd like to migrate it into the Workout Planner app.

## MCP Setup

Connect to the Workout Planner MCP server first:

- **Transport:** Streamable HTTP
- **Endpoint:** `https://trenuj.se/mcp`
- **Auth:** OAuth 2.1 — your MCP client handles authentication automatically. You'll be prompted to log in and approve access when connecting for the first time.

Point your AI client at the endpoint above. It will discover the OAuth configuration and guide you through sign-in. Refer to your client's documentation for how to add an MCP server.

---

## What to do

1. Connect to the MCP server and call `get_profile` to check my account.
2. Read the `training-plan-guide` resource (`guide://training-plan-guide`) to understand the app's formatting conventions.
3. Ask me to share my existing plan — I can paste it as text, share a spreadsheet, a screenshot, or describe it verbally.
4. Once you understand the plan, recreate it in the app:
   - `create_plan` — set up the plan with name, dates, and goal
   - `set_labels` — define workout type labels (e.g. easy-run, long-ride, strength, rest) with appropriate colors and icons
   - `add_phase` — add training phases if my plan has them
   - `add_workouts` — add all workouts with proper descriptions, targets, and labels
5. After importing, call `get_plan` and show me a summary so I can verify everything looks right.

Keep the workout descriptions faithful to my original plan — don't rewrite or "improve" them unless I ask. Adapt formatting to match the app's conventions (markdown descriptions, label system, phases) but preserve the intent and targets.
