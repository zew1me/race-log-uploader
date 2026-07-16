# Race Log Uploader

Agent skill for finding race-tagged Strava activities, enriching results data,
and creating WordPress race-log entries.

The canonical skill lives at
[`.agents/skills/sync-race-log/SKILL.md`](.agents/skills/sync-race-log/SKILL.md).
`.claude/skills` is a compatibility symlink for Claude-compatible clients.

## Requirements

- Node.js **22.18.0 or newer**. The skill runs TypeScript directly with Node's
  native type stripping; there is no build step.
- Run `npm install` at the repository root to install development quality tools.
- Run `npm install` in `.agents/skills/sync-race-log/scripts` to install the
  skill's Zod runtime dependency.
