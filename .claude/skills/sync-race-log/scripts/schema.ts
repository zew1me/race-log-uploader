import { z } from "zod";
import { resolve } from "node:path";

export const RaceSyncStateSchema = z.object({
  last_synced_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "last_synced_date must be YYYY-MM-DD"),
  synced_activity_ids: z.array(z.string()).max(50),
});

export type RaceSyncState = z.infer<typeof RaceSyncStateSchema>;

// Scripts are invoked from the repo root — see SKILL.md.
export const STATE_PATH = resolve(process.cwd(), ".agents/state/race-sync-state.json");
