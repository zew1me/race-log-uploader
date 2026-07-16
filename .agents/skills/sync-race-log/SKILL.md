---
name: sync-race-log
description: Use this skill whenever the user asks to sync, update, add to, or resume the WordPress race log from Strava activities. It finds Strava race-tagged cycling activities only, enriches them with race results, pipelines ready entries into WordPress while continuing to process later races, and updates the local sync state.
---

# Sync Race Log

Finds Strava cycling activities tagged as races, enriches them with results data
(finish position, field size, etc.) that Strava doesn't have, and creates an
entry for each one in the WordPress race log at
`https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log`.

This skill is intentionally cycling-only: road, gravel, cyclocross, mountain
bike, track, virtual ride, and other bike activities are in scope; running,
walking, hiking, swimming, skiing, generic workouts, and other non-cycling
activities are out of scope even if they are tagged `race`.

See [AGENTS.md](../../../AGENTS.md) at the repo root for background on this project.

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

Use the TypeScript state tools below as the only state interface. Do not inspect
or edit the backing file, and do not infer its schema. The tools validate state
and make writes atomic.

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
  specific dates), use that and skip the state tool.
- Otherwise, use the state returned by the tool to determine the sync window
  and `today`, where
  `today` is the `currentDate` from context.
- If `exists` is `false`, ask the user for a starting date instead of
  guessing one.

## Step 2 — Find cycling race activities on Strava

Use the Strava connector's `list_activities` tool with `range_start` /
`range_end` covering the sync window and `include_tags: true`.

An activity is eligible only when **both** filters pass:

1. Its `activity_tags` include a tag equal to (case-insensitive) `"race"`.
2. Its Strava `sport_type`, `type`, or equivalent activity kind is clearly a
   cycling activity.

Treat these as cycling activity kinds when present: `Ride`, `VirtualRide`,
`GravelRide`, `MountainBikeRide`, `EBikeRide`, `EMountainBikeRide`,
`Handcycle`, `Velomobile`, road cycling, gravel cycling, cyclocross, mountain
bike, track cycling, bike commute/race rides, and similarly explicit bike
labels.

Filter out non-cycling activities even if they are race-tagged, including
`Run`, `TrailRun`, `VirtualRun`, walks, hikes, swims, skis, rows, paddles,
generic gym/workout activities, and ambiguous activities without enough evidence
that they are cycling. If an activity looks like a mixed/multisport event, only
include it when the Strava activity itself is the cycling leg or otherwise
clearly a cycling activity; otherwise skip it and mention the skip in the
summary.

Skip any eligible cycling race activity the state tool reports as already
submitted. If none are found, report that and stop — don't update state.

## Step 3 — Enrich races with results data using a pipeline

Start enrichment in date order, but do **not** wait for every race to be fully
researched before beginning WordPress entry. Maintain a small work queue with
per-race status, for example: `needs_enrichment`, `ready_for_entry`,
`awaiting_confirmation`, `submitted`, or `skipped`.

As soon as one cycling race has enough supported data for a WordPress draft,
move it to `ready_for_entry` and begin Step 4 for that race while continuing to
enrich the remaining races. If multiple races are ready at the same time, fill
older races first. It is okay for a later race to be submitted before an earlier
hard-to-research race; the state-update rules below prevent the earlier race
from being lost.

A race is ready for entry when you have, at minimum, a supported event title,
event date, cycling race type, and a supported value for the required Place
field (`numeric result`, `DNF`, or `N/A`). Include optional details only when
supported by Strava, official results, or another credible source.

Strava may have finish position, field size, or category placing in the activity
details. But it also may not. If you can infer them, do so. Do not make up data
that isn't clearly supported by the available information. If not found, for
each race activity:

1. Use the activity name, date, and location (city/venue if present in the
   name/description) to web search for the official results — typical sources
   are the event's own results page, <https://www.road-results.com/>,
   <https://www.cross-results.com/>, <https://gc.trackscoreboard.com/>,
   Athlinks, UltraSignup, RaceRoster, or similar timing sites.
2. Extract what you can find: overall place, gender/category place, field size,
   official finish time (if it differs from Strava's moving time), race
   distance/category name.
3. If no results can be found after a reasonable search, proceed with what
   Strava has and use `N/A` for Place only when it is still clear the activity
   was a cycling race that should be logged. Note missing result details to the
   user in the summary. Skip an entry and let the user know if you can't find
   sufficient information to submit the race log entry.

## Step 4 — Fill out the WordPress form as races become ready

WordPress form entry itself should be serialized in one browser session to avoid
overwriting drafts, but it should overlap with enrichment work: once a race is
`ready_for_entry`, start filling that form instead of waiting for the rest of the
sync window to finish. While waiting for pages, user confirmation, or submission
results, continue research/enrichment for other races when tools allow.

For each ready race, in the browser:

1. Navigate to `https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log`
   (handling the login pause from the constraint above if needed).
2. Read the form fields present (`read_page`) — don't assume a fixed field
   layout, inspect what's actually on the page each time in case the form
   changes.
3. Fill the race title and the additional fields by label:
   - **Event Date** (required): use the event date in `m/d/y` format.
   - **Type** (required): use the best available evidence and LLM judgment to
     select exactly one of `Class`, `Cyclocross`, `Gravel`, `Mountain`,
     `Other`, `Road`, `Track`, `Triathlon`, or `Volunteer`. Do not leave the
     placeholder selected.
   - **Category**: enter the event's category when known; otherwise leave it
     blank.
   - **Place** (required): enter the numeric result, `DNF`, or `N/A`; never
     add an ordinal suffix such as `th`.
   - **Cost**: enter a supported cost when known; otherwise leave it blank.
   - **Attributes**: mark **Sanctioned** when the event is a USA Cycling event.
     Mark **Mass Start** only when the entire event has one shared start time.
     Mark **National Level** only when supported by the event information.
   - **Travel Stipend Requested**: mark **Yes** only when the racer stayed
     overnight for the race; it is $50 per racing day, not per night stayed.
4. **Before clicking Publish/Submit**, show the user a short summary of what
   this entry will contain and ask for confirmation. This is a real form
   submission with personal data, so it needs explicit per-entry (or
   explicitly-batched, if the user says "just do all of them") approval —
   don't submit silently.
5. On confirmed submission, record the activity through the state tool. The
   pipeline may submit ready races out of chronological order, but watermark
   advancement must still be chronological: only advance the sync watermark to
   cover a **contiguous run of confirmed submissions starting from the beginning
   of the window** — i.e. update it to a race's date only if every eligible
   cycling race at or before that date in the window was successfully submitted.
   If a race is skipped, declined, still pending, or fails to submit, stop
   advancing the sync watermark at the last date before that race, even if later
   races in the same run are confirmed — this leaves the skipped/pending race
   (and everything after it) in the window for the next sync so it isn't lost.
   Still record every activity that was actually submitted, so later confirmed
   races are not re-added on the next run.

## Step 5 — Wrap up

After processing all race activities (or if the user stops partway through),
write the updated state via the TypeScript tool. First ask the tool for its
current input signature; never inspect or edit the backing state directly:

```bash
node .agents/skills/sync-race-log/scripts/write-state.ts --help
```

Call the tool using that signature with state derived only from what was
actually submitted (per the contiguous-run rule in Step 4.5), not from
everything found in Step 2. The tool validates its input and preserves the
existing state if validation fails.

Then report a short summary: races added, races skipped (and why), and the
new sync watermark.
