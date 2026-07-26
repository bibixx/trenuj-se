# Workout Feed (ios-companion)

An iOS app that keeps the Apple Watch's **native Workout app** stocked with your upcoming planned
workouts — from **any URL you point it at**. No watchOS code, works on a free Apple account.

Point it at a feed (a small JSON manifest + workout files, hostable on S3, GitHub Pages, nginx, a
Worker — anything static), and your workouts appear on the watch automatically. This folder currently
lives in the trenuj.se repo but is producer-agnostic and will be extracted.

## Feed contract (version 1)

`GET <feed-url>` returns the manifest (a URL ending in `/` gets `index.json` appended):

```json
{
  "version": 1,
  "workouts": [
    {
      "id": "easy-8k-2026-07-27",
      "date": "2026-07-27T07:00:00",
      "url": "w/easy-8k.workout",
      "type": "workout",
      "title": "Easy — 8 km"
    }
  ]
}
```

| Field         | Required | Meaning                                                                                                                                                                       |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `date`        | yes      | When to schedule it, in the device's local wall-clock time. `2026-07-27` or `2026-07-27T07:00:00` (date-only → 07:00).                                                        |
| `url`         | yes      | The workout file — relative to the manifest (portable) or absolute.                                                                                                           |
| `type`        | no       | File kind. `"workout"` = Apple WorkoutKit binary. Missing → inferred from the URL extension. **Unknown types are skipped**, which is the forward-compat door for e.g. `.fit`. |
| `id`, `title` | no       | Identification/labeling.                                                                                                                                                      |

**Auth:** the app has one optional **Authorization** field, sent verbatim as the `Authorization`
header (e.g. `Bearer abc…`) — and **only to the manifest's own origin**, never to third-party hosts
an absolute `url` might point at. Public feeds need nothing.

## What the app does

- **Home = the watch schedule.** The list shows what is actually scheduled (grouped by day, with
  completion state) — read back from WorkoutKit, not from the feed.
- **Set-and-forget.** Full-screen setup only when unconfigured; afterwards settings hide behind ⚙︎
  (change feed, sync now, disconnect — which also clears everything the app scheduled).
- **Diff-based sync, resolved per row.** The manifest renders immediately (rows show loading
  spinners); workout files download concurrently and each row flips to "on watch" as it lands.
  Unchanged entries are left alone (preserving completion state), content changes are replaced, and
  entries removed from the feed are pruned — but pruning only runs on a clean pass: if any file
  failed to fetch, nothing is deleted (a flaky network can't wipe the watch). An empty feed clears
  the schedule.
- **Stays fresh.** Syncs on launch (30-min throttle), pull-to-refresh, and a background-refresh
  top-up. Every sync applies the whole window, so the watch stays stocked even when iOS skips
  background fires.

## Debug screen

Settings → tap the **Version** row 5×. Unlocks a Debug entry with: resolved config, scheduler dump
(plan id, date, completion), sync history (including background fires and skipped/unsupported items),
copy-raw-manifest, schedule-test-workout, and clear-all.

## Build & deploy

```bash
cd ios-companion
xcodegen generate    # only needed after adding/removing files or editing project.yml
./deploy.sh          # builds, signs, installs to the connected iPhone
```

Signing (team + automatic style) is baked into `project.yml`, so regenerating never wipes it — set
`DEVELOPMENT_TEAM` to your own team id. Free-account note: the cert expires every 7 days — re-run
`./deploy.sh` (or use AltStore/SideStore auto-refresh).

## Using with trenuj.se (one producer of this format)

trenuj.se serves the contract at `/api/watch/index.json` + `/api/watch/w/<id>.workout`, authed by a
long-lived watch token. In the trenuj.se web app: **Settings → Apple Watch → Generate watch token**
(requires the `companion_app` flag), then paste the shown **Root URL** and **Authorization** values
into this app. For local dev use `http://<mac-ip>:8787/api/watch/index.json` (LAN http is allowed via
the ATS local-networking exception).
