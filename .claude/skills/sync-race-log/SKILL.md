---
name: sync-race-log
description: Sync race-tagged Strava activities into the tacotimenw.bike WordPress race log form. Use when the user asks to "sync races", "update the race log", "add my races to the site", "check for new races", or similar. Can be run on a schedule (e.g. via a Cowork scheduled workflow) or on demand with an explicit time period.
---

# Sync Race Log

Finds Strava activities tagged as races, enriches them with results data (finish
position, field size, etc.) that Strava doesn't have, and creates an entry for
each one in the WordPress race log at
`https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log`.

See [AGENTS.md](../../AGENTS.md) at the repo root for background on this project.

## Hard constraint: never enter the WordPress password

The `WP_USERNAME` / `WP_PASSWORD` values in the local `.env` file exist for a
human to use, not for this skill to type into a login form. Entering a
password into any field is not something this agent does, regardless of
where the credential is stored or who authorized it.

When the workflow needs an authenticated WordPress session:

1. Open `https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log` in
   the browser.
2. If it redirects to a login page, stop and tell the user: *"WordPress needs
   you to log in — please sign in in the browser pane, then tell me to
   continue."* Do not fill in the username/password fields yourself.
3. Once the post-new (or edit) screen is visible, continue with the steps
   below. All of that is normal form-filling, not credential entry.

## Step 1 — Determine the sync window

State file: `.claude/state/race-sync-state.json` (gitignored — local only).

- If the user gave an explicit period ("last 2 weeks", "since June 1",
  specific dates), use that and don't touch the state file's read side.
- Otherwise, read `last_synced_date` from the state file and use
  `[last_synced_date, today]`. `today` is the `currentDate` from context.
- If the state file doesn't exist yet, ask the user for a starting date
  instead of guessing one.

```json
{
  "last_synced_date": "2026-06-01",
  "synced_activity_ids": ["1234567890"]
}
```

`synced_activity_ids` is a belt-and-suspenders de-dupe list (recent IDs only,
last ~50) in case an activity falls exactly on the boundary date.

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
5. On confirmed submission, record the activity ID in
   `synced_activity_ids` and, if this is the newest activity processed so
   far this run, update `last_synced_date` to its date.

## Step 5 — Wrap up

After processing all race activities (or if the user stops partway through),
write the updated state file reflecting only what was actually submitted, and
report a short summary: races added, races skipped (and why), and the new
`last_synced_date`.
