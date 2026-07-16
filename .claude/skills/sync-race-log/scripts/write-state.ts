import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RaceSyncStateSchema, STATE_PATH } from "./schema.ts";

function main(): void {
  const raw = process.argv[2];
  if (!raw) {
    console.error(
      "Usage: npx tsx .claude/skills/sync-race-log/scripts/write-state.ts '<json-payload>'",
    );
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`Invalid JSON payload: ${(err as Error).message}`);
    process.exit(1);
  }

  const result = RaceSyncStateSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Payload failed schema validation:");
    console.error(result.error.format());
    process.exit(1);
  }

  if (!existsSync(dirname(STATE_PATH))) {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
  }

  // Write to a temp file and rename so a crash mid-write can't corrupt the
  // existing state file.
  const tmpPath = `${STATE_PATH}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
  renameSync(tmpPath, STATE_PATH);

  console.log(`Wrote validated state to ${STATE_PATH}`);
}

main();
