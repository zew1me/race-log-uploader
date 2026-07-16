# Repo Instructions

## What is here

This repo contains a workflow to find races, extract data for them from various sources, and then create an entry for that race in a wordpress form submit.

Key data is found via querying strava via the Claude.ai connector.
What place the rider came in and such may need to be looked up via secondary means.
Then the form is completed.

This project uses a mix of connectors, web search to augment information, and browser automation for submission.

## User Information

The form is a wordpress form, hosted at <https://tacotimenw.bike/wp-admin/post-new.php?post_type=race_log>.

username and password for this can be found with WP_ prefixes in the local .env file.  If not found, check for these to be present in the env vars.

Note: the agent will never type this password into the WordPress login form
itself — see the constraint at the top of the `sync-race-log` skill. Log in
manually in the browser pane when prompted.

## Workflow

The end-to-end sync workflow lives in
[`.claude/skills/sync-race-log/SKILL.md`](.claude/skills/sync-race-log/SKILL.md).
Invoke it by asking to sync/update the race log, optionally with a time
period. It tracks the last synced date in `.agents/state/race-sync-state.json`
(gitignored, local only) so re-runs only pick up new activities.
