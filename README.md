<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
<!--
*** I'm using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->
<div align="center">
  <a href="https://github.com/bibixx/trenuj-se/graphs/contributors">
    <img src="https://img.shields.io/github/contributors/bibixx/trenuj-se.svg?style=flat" alt="Contributors" />
  </a>
  <a href="https://github.com/bibixx/trenuj-se/network/members">
    <img src="https://img.shields.io/github/forks/bibixx/trenuj-se.svg?style=flat" alt="Forks" />
  </a>
  <a href="https://github.com/bibixx/trenuj-se/stargazers">
    <img src="https://img.shields.io/github/stars/bibixx/trenuj-se.svg?style=flat" alt="Stargazers" />
  </a>
  <a href="https://github.com/bibixx/trenuj-se/issues">
    <img src="https://img.shields.io/github/issues/bibixx/trenuj-se.svg?style=flat" alt="Issues" />
  </a>
</div>

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/bibixx/trenuj-se">
    <img src="public/android-chrome-512x512.png" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">trenuj.se</h3>

  <p align="center">
    An MCP-first training plan manager with Strava integration — plan and coach your training through an AI agent, track it in a React web app.
    <br />
    <a href="MCP.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://www.trenuj.se">View Demo</a>
    &middot;
    <a href="https://github.com/bibixx/trenuj-se/issues/new?labels=bug">Report Bug</a>
    &middot;
    <a href="https://github.com/bibixx/trenuj-se/issues/new?labels=enhancement">Request Feature</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#features">Features</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#environment-variables">Environment Variables</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#connect-an-ai-agent-mcp">Connect an AI agent (MCP)</a></li>
        <li><a href="#mcp-tools">MCP tools</a></li>
        <li><a href="#sync-to-an-apple-watch">Sync to an Apple Watch</a></li>
        <li><a href="#scripts">Scripts</a></li>
      </ul>
    </li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

<!-- Add a screenshot at images/screenshot.png and uncomment the line below -->
<!-- [![Product Name Screen Shot][product-screenshot]](https://www.trenuj.se) -->

**[trenuj.se](https://www.trenuj.se)** is an MCP-first training plan manager. Instead of clicking through forms, you talk to an AI agent — it builds your plan, schedules workouts into phases, writes coaching notes, and reconciles what you planned against what you actually did via Strava. A React web app renders the plan, tracks progress, and lets you share plans publicly.

The whole thing runs on a single Cloudflare Worker: a Hono API and a [Model Context Protocol](https://modelcontextprotocol.io/) server on the backend, a React 19 SPA served as static assets on the frontend, and Supabase (PostgreSQL + auth) for data and identity.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Features

- **MCP-first** — a full MCP server (30+ tools) lets any MCP-capable AI client manage plans, phases, workouts, notes, and analytics.
- **Strava integration** — OAuth connect, webhook-driven activity sync, and auto-matching of activities to planned workouts by date + sport.
- **Training analytics** — week summaries, plan progress, and planned-vs-actual comparisons, with Recharts-backed charts in the web app.
- **Public plan sharing** — generate share links with per-field visibility flags.
- **Per-plan agent memory** — a freeform notepad the agent reads and edits to carry context between sessions.
- **Secure by default** — Supabase Row Level Security on every table, OAuth 2.1 for the MCP endpoint, and time-limited tokens for Strava stream access.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

<div align="center">
  <a href="https://react.dev/">
    <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React" />
  </a>
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  </a>
  <a href="https://vite.dev/">
    <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite" />
  </a>
  <a href="https://tanstack.com/">
    <img src="https://img.shields.io/badge/TanStack-FF4154?style=flat&logo=reactquery&logoColor=white" alt="TanStack" />
  </a>
  <a href="https://hono.dev/">
    <img src="https://img.shields.io/badge/Hono-E36002?style=flat&logo=hono&logoColor=white" alt="Hono" />
  </a>
  <a href="https://workers.cloudflare.com/">
    <img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat&logo=cloudflareworkers&logoColor=white" alt="Cloudflare Workers" />
  </a>
  <a href="https://supabase.com/">
    <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=flat&logo=supabase&logoColor=white" alt="Supabase" />
  </a>
  <a href="https://www.postgresql.org/">
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  </a>
  <a href="https://orm.drizzle.team/">
    <img src="https://img.shields.io/badge/Drizzle-C5F74F?style=flat&logo=drizzle&logoColor=black" alt="Drizzle ORM" />
  </a>
  <a href="https://zod.dev/">
    <img src="https://img.shields.io/badge/Zod-3E67B1?style=flat&logo=zod&logoColor=white" alt="Zod" />
  </a>
  <a href="https://modelcontextprotocol.io/">
    <img src="https://img.shields.io/badge/MCP-000000?style=flat&logo=modelcontextprotocol&logoColor=white" alt="Model Context Protocol" />
  </a>
  <a href="https://vitest.dev/">
    <img src="https://img.shields.io/badge/Vitest-6E9F18?style=flat&logo=vitest&logoColor=white" alt="Vitest" />
  </a>
</div>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->

## Getting Started

To get a local copy up and running, follow these steps.

### Prerequisites

- **Node.js** (ES2023 target) and **pnpm** — always use `pnpm`, never `npm` or `npx`.
  ```sh
  npm install -g pnpm
  ```
- A **Supabase** project (provides PostgreSQL + auth).
- A **Strava API app** (for the OAuth integration).

### Installation

1. Clone the repo
   ```sh
   git clone https://github.com/bibixx/trenuj-se.git
   cd trenuj-se
   ```
2. Install dependencies
   ```sh
   pnpm install
   ```
3. Create your local env file and fill in the values (see [Environment Variables](#environment-variables))
   ```sh
   cp .dev.vars.example .dev.vars
   ```
4. Run the database migrations (requires `DATABASE_URL`)
   ```sh
   pnpm db:migrate
   ```
5. Start developing
   ```sh
   pnpm dev          # Vite dev server (frontend, HMR)
   pnpm dev:server   # Wrangler — the Workers runtime (API + MCP), in a second terminal
   # or run a single prod-like server that serves the built assets:
   pnpm cf:dev       # build, then wrangler dev
   ```

### Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and fill in the following.

| Variable                        | Scope  | Description                                                                                                             |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | public | Supabase project URL                                                                                                    |
| `VITE_SUPABASE_ANON_KEY`        | public | Supabase anon key                                                                                                       |
| `SUPABASE_SECRET_KEY`           | server | Service-role key (RLS bypass for shares + MCP auth)                                                                     |
| `DATABASE_URL`                  | server | Direct PostgreSQL connection — only needed to run Drizzle migrations, not at runtime                                    |
| `STRAVA_CLIENT_ID`              | server | Strava API app client ID                                                                                                |
| `STRAVA_CLIENT_SECRET`          | server | Strava API app client secret                                                                                            |
| `STRAVA_VERIFY_TOKEN`           | server | Any string, used to verify the Strava webhook subscription                                                              |
| `STRAVA_WEBHOOK_PATH_SECRET`    | server | Random string used as the webhook URL path segment (prevents enumeration)                                               |
| `STRAVA_WEBHOOK_SIGNING_SECRET` | server | HMAC-SHA256 secret for `X-Strava-Signature`. Leave empty until Strava surfaces it — verification is skipped while unset |
| `PUBLIC_APP_URL`                | server | App base URL (`http://localhost:8787` for dev, `https://www.trenuj.se` in production)                                   |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->

## Usage

Open the web app at **[www.trenuj.se](https://www.trenuj.se)** to view plans, track workouts, and manage your Strava connection. The plan itself is created and maintained by an AI agent over MCP.

### Connect an AI agent (MCP)

The MCP server is exposed at `{SERVER_URL}/mcp` (e.g. `https://www.trenuj.se/mcp`) over Streamable HTTP, authenticated with OAuth 2.1. For example, with the Claude Code CLI:

```sh
claude mcp add trenuj-se \
  --transport streamable-http \
  "https://www.trenuj.se/mcp"
```

On first connection you'll be prompted to log in and approve access. See **[MCP.md](MCP.md)** for full per-client setup (Claude Desktop, Claude Code, Cursor, VS Code / Copilot), the OAuth-fallback token flow, and usage guidance.

### MCP tools

The server registers 30+ tools across six categories. Full parameter docs live in [MCP.md](MCP.md).

| Category                   | Tools                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plans**                  | `get_training_guide`, `list_plans`, `get_plan`, `create_plan`, `update_plan`, `edit_plan_memory`, `deactivate_plan`, `set_labels`, `add_label`, `update_label`, `add_phase`, `update_phase`, `remove_phase` |
| **Workouts**               | `add_workouts`, `get_workouts`, `update_workouts`, `remove_workouts`, `complete_workout`, `skip_workout`, `link_activity`, `unlink_activity`, `add_trainer_notes`                                           |
| **Activities & Analytics** | `get_week_summary`, `get_plan_progress`, `compare_planned_vs_actual`                                                                                                                                        |
| **SQL Queries**            | `run_sql` + `get_sql_guide` + `hydrate_activities` — read-only SQL over the lazily-hydrated activity warehouse (summaries, laps, per-second streams, best efforts)                                          |
| **Notes**                  | `add_plan_note`, `update_plan_note`, `delete_plan_note`, `get_plan_notes`                                                                                                                                   |
| **Athlete**                | `get_profile`                                                                                                                                                                                               |
| **Icons**                  | `search_icons`                                                                                                                                                                                              |

The server also exposes a `training-plan-guide` resource (`guide://training-plan-guide`) with conventions for workout descriptions, metadata shapes, colors, icons, and chart blocks — read it before creating or modifying plans.

### Sync to an Apple Watch

Planned workouts can show up in the watch's **native Workout app** via **[Workout Feed](https://github.com/bibixx/workout-feed)** — a generic iOS companion app that consumes `.workout` feeds. trenuj.se is one producer of that feed: it serves the manifest at `/api/watch/index.json` and individual workouts at `/api/watch/w/<id>.workout` (Apple WorkoutKit binaries built with [`@bibixx/workoutkit`](https://www.npmjs.com/package/@bibixx/workoutkit)), authenticated by a long-lived watch token (`Authorization: Bearer …` header, or `?token=` for clients that can't set headers). Tokens are stored hashed in the `watch_tokens` table and are individually revocable from the settings page.

To connect the two:

1. Enable the `companion_app` flag on your profile (the `user_flags` JSONB column in the database).
2. In the web app go to **Settings → Apple Watch → Create token**, name the token, then copy the shown **Root URL** and **Authorization** values (the Authorization value is shown only once).
3. Build and install [Workout Feed](https://github.com/bibixx/workout-feed) on your iPhone (its README covers the two-command setup) and paste both values into the app.

From then on the app keeps the watch stocked automatically. For local development, point it at `http://<your-mac-ip>:8787/api/watch/index.json` — the app allows plain `http` on the LAN.

### Scripts

| Script                         | Description                                                          |
| ------------------------------ | -------------------------------------------------------------------- |
| `pnpm dev`                     | Vite dev server (frontend, HMR)                                      |
| `pnpm dev:server`              | Wrangler — Workers runtime locally (API + MCP)                       |
| `pnpm cf:dev`                  | Build, then run Wrangler against the built assets (prod-like)        |
| `pnpm build`                   | Production build (`vite build`)                                      |
| `pnpm lint`                    | Run OxLint                                                           |
| `pnpm format` / `format:check` | Format with OxFmt / check formatting                                 |
| `pnpm test`                    | Run tests once (Vitest)                                              |
| `pnpm test:watch`              | Run tests in watch mode                                              |
| `pnpm test:coverage`           | Run tests with a coverage report                                     |
| `pnpm type-check`              | Type-check the app and server projects                               |
| `pnpm db:generate`             | Generate Drizzle migrations                                          |
| `pnpm db:migrate`              | Apply Drizzle migrations                                             |
| `pnpm strava:webhook`          | Manage the Strava push subscription (`list` / `register` / `delete`) |

_For architecture, conventions, and contributor guidance, see [AGENTS.md](AGENTS.md)._

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ROADMAP -->

## Roadmap

- [ ] Enable Strava webhook signature verification once Strava surfaces `STRAVA_WEBHOOK_SIGNING_SECRET`.
- [ ] Retire the Claude OAuth-fallback token flow once upstream OAuth bootstrap is reliable.
- [ ] Add a product screenshot to the README.

See the [open issues](https://github.com/bibixx/trenuj-se/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement". Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

Please make sure `pnpm lint`, `pnpm format:check`, and `pnpm test` pass before opening a PR.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/bibixx/trenuj-se/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=bibixx/trenuj-se" alt="contrib.rocks image" />
</a>

<!-- LICENSE -->

## License

No license has been specified yet, so default copyright applies (all rights reserved). If you intend to open-source this, add a `LICENSE` file and update this section.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->

## Contact

Bartek Legięć — [@bibixx](https://github.com/bibixx)

Project Link: [https://github.com/bibixx/trenuj-se](https://github.com/bibixx/trenuj-se)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Strava API](https://developers.strava.com/)
- [Supabase](https://supabase.com/)
- [Cloudflare Workers](https://workers.cloudflare.com/) & [Hono](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [TanStack](https://tanstack.com/)
- [Tabler Icons](https://tabler.io/icons)
- [Img Shields](https://shields.io)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[product-screenshot]: images/screenshot.png

<!-- Shields.io badges. You can find a comprehensive list with many more badges at: https://github.com/inttter/md-badges -->
