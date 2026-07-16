import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RaceSyncStateSchema, STATE_PATH } from "./schema.ts";

function usage(): string {
  return [
    "Usage: node .agents/skills/sync-race-log/scripts/write-state.ts --watermark YYYY-MM-DD [--submitted-activity ID]...",
    "",
    "Options:",
    "  --watermark DATE          Required sync watermark.",
    "  --submitted-activity ID   Submitted activity ID; repeat for each activity.",
    "  -h, --help                Show this help.",
  ].join("\n");
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArguments(args: string[]): unknown {
  let watermark: string | undefined;
  const submittedActivityIds: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--watermark") {
      watermark = valueAfter(args, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--submitted-activity") {
      submittedActivityIds.push(valueAfter(args, index, argument));
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!watermark) {
    throw new Error("--watermark is required");
  }

  return {
    last_synced_date: watermark,
    synced_activity_ids: submittedActivityIds,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }

  let parsed: unknown;
  try {
    parsed = parseArguments(args);
  } catch (err) {
    console.error(`Invalid arguments: ${(err as Error).message}`);
    console.error(usage());
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
