---
name: sync-race-log
description: Sync race-tagged Strava activities into the tacotimenw.bike WordPress race log form. Invoke explicitly with /sync-race-log — this skill submits form data and touches state, so it should not be triggered by inferring intent from conversation. Can be run on a schedule (e.g. via a Cowork scheduled workflow) in discovery/report-only mode, or on demand — interactively, with the user present to confirm submissions — with an explicit time period.
disable-model-invocation: true
---

# Sync Race Log

Finds Strava activities tagged as races, enriches them with results data (finish
position, field size, etc.) that Strava doesn't have, and creates an entry for
each one in the WordPress race log at
`https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log`.

See [AGENTS.md](../../AGENTS.md) at the repo root for background on this project.

## Scheduled vs. interactive runs

Step 4's confirm-before-submit requirement assumes a human is present to
answer the prompt. On a scheduled/unattended run there is nobody there, so
this skill must never treat a scheduled invocation as authorization to
submit:

- **Scheduled run (e.g. a Cowork scheduled workflow, or any invocation where
  no user is actively present to respond):** stop after Step 3. Do not open
  the WordPress form or submit anything. Instead, produce a report of the
  races found and their enriched data, and end the run there — submission
  happens later, interactively, when a user reviews the report and explicitly
  asks to proceed with the form-filling steps.
- **On-demand run:** if the user is present in the conversation, continue
  through Step 4 and Step 5 as normal, including the required per-entry (or
  explicitly-batched) confirmation before any Publish/Submit click.

## Logging in 

The `WP_USERNAME` / `WP_PASSWORD` values may exist in a local `.env` file, or via environment variables.

When the workflow needs an authenticated WordPress session:

1. Open `https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log` in
   the browser.
2. If it redirects to a login page, log in using the credentials you found.
   If you have no credentials, please tell the user: 
   "I need you to log in — please sign in in the browser pane, then tell me to continue."
3. Once the post-new (or edit) screen is visible, continue with the steps
   below. All of that is normal form-filling, not credential entry.

## Step 1 — Determine the sync window

State file: `.agents/state/race-sync-state.json` (gitignored — local only),
schema: `{ last_synced_date: "YYYY-MM-DD", synced_activity_ids: string[] }`
(max 50 ids). `synced_activity_ids` is a belt-and-suspenders de-dupe list in
case an activity falls exactly on the boundary date.

Read and write it only through the scripts in `scripts/` (run from the repo
root) — never hand-edit or freeform-write the JSON. They validate the
payload against a shared zod schema (`scripts/schema.ts`) before touching
disk, and the write is atomic (temp file + rename), so a malformed or
partial state file never lands in `.agents/state/`.

One-time setup (skip if `scripts/node_modules/` already exists):

```bash
cd .agents/skills/sync-race-log/scripts && npm install
```

Read the current state:

```bash
node .agents/skills/sync-race-log/scripts/read-state.ts
# -> {"exists":false}  or  {"exists":true,"state":{...}}
```

- If the user gave an explicit period ("last 2 weeks", "since June 1",
  specific dates), use that and skip reading the state file.
- Otherwise, use `[last_synced_date, today]` from the state read above.
  `today` is the `currentDate` from context.
- If `exists` is `false`, ask the user for a starting date instead of
  guessing one.

## Step 2 — Find race activities on Strava

Use the Strava connector's `list_activities` tool with `range_start` /
`range_end` covering the sync window and `include_tags: true`.

An activity counts as a race if its `activity_tags` include a tag equal to
(case-insensitive) `"race"`. Skip anything already in `synced_activity_ids`.

If none are found, report that and stop — don't touch the state file (nothing
was synced, so `last_synced_date` shouldn't move).

## Step 3 — Enrich each race with results data

Strava won't have finish position, field size, or category placing. For each
race activity:

1. Use the activity name, date, and location (city/venue if present in the
   name/description) to web search for the official results — typical
   sources are the event's own results page, Athlinks, UltraSignup,
   RaceRoster, or similar timing sites.
2. Extract what you can find: overall place, gender/category place, field
   size, official finish time (if it differs from Strava's moving time), race
   distance/category name.
3. If no results can be found after a reasonable search, proceed with what
   Strava has and leave placement fields blank — don't block the whole sync
   on one hard-to-find race. Note this to the user in the summary.

## Step 4 — Fill out the WordPress form

For each race, in the browser:

1. Navigate to `https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log`
   (handling the login pause from the constraint above if needed).
2. Read the form fields present (`read_page`) — don't assume a fixed field
   layout, inspect what's actually on the page each time in case the form
   changes.
3. Map the gathered data onto the fields (race name/title, date, distance,
   location, finish place, time, notes/description, Strava link, etc.) —
   match by label text.
4. **Before clicking Publish/Submit**, show the user a short summary of what
   this entry will contain and ask for confirmation. This is a real form
   submission with personal data, so it needs explicit per-entry (or
   explicitly-batched, if the user says "just do all of them") approval —
   don't submit silently.
5. On confirmed submission, record the activity ID in `synced_activity_ids`.
   Process races within the sync window in date order (oldest first), and
   only advance `last_synced_date` to cover a **contiguous run of confirmed
   submissions starting from the beginning of the window** — i.e. update it
   to a race's date only if every race at or before that date in the window
   was successfully submitted. If a race is skipped, declined, or fails to
   submit, stop advancing `last_synced_date` at the last date before that
   race, even if later races in the same run are confirmed — this leaves the
   skipped race (and everything after it) in the window for the next sync so
   it isn't lost. `synced_activity_ids` still records every activity that was
   actually submitted, so already-submitted races later in the window aren't
   re-added on the next run.

## Step 5 — Wrap up

After processing all race activities (or if the user stops partway through),
write the updated state via the script — never edit the JSON file directly:

```bash
node .agents/skills/sync-race-log/scripts/write-state.ts \
  '{"last_synced_date":"2026-06-05","synced_activity_ids":["1234567890","1234567891"]}'
```

Build the payload from what was *actually* submitted (per the contiguous-run
rule in Step 4.5), not from everything found in Step 2. The script rejects a
malformed payload (e.g. a non-`YYYY-MM-DD` date) and leaves the existing
state file untouched, so a bad write can't corrupt the watermark.

Then report a short summary: races added, races skipped (and why), and the
new `last_synced_date`.
