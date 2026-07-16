import { existsSync, readFileSync } from "node:fs";
import { RaceSyncStateSchema, STATE_PATH } from "./schema.ts";

function main(): void {
  if (!existsSync(STATE_PATH)) {
    console.log(JSON.stringify({ exists: false }));
    return;
  }

  const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  const result = RaceSyncStateSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`State file failed schema validation: ${STATE_PATH}`);
    console.error(result.error.format());
    process.exit(1);
  }

  console.log(JSON.stringify({ exists: true, state: result.data }));
}

main();
