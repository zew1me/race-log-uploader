import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

const readScript = fileURLToPath(new URL("../read-state.ts", import.meta.url));
const writeScript = fileURLToPath(new URL("../write-state.ts", import.meta.url));

function withTempDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(`${tmpdir()}/race-sync-state-`);
  try {
    run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function runScript(script: string, directory: string, ...args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

test("read-state reports a missing state file", () => {
  withTempDirectory((directory) => {
    assert.deepEqual(JSON.parse(runScript(readScript, directory)), { exists: false });
  });
});

test("write-state reports its input signature", () => {
  withTempDirectory((directory) => {
    assert.match(runScript(writeScript, directory, "--help"), /--watermark YYYY-MM-DD/);
  });
});

test("write-state writes validated data that read-state returns", () => {
  withTempDirectory((directory) => {
    const payload = {
      last_synced_date: "2026-07-16",
      synced_activity_ids: ["123", "456"],
    };

    runScript(
      writeScript,
      directory,
      "--watermark",
      "2026-07-16",
      "--submitted-activity",
      "123",
      "--submitted-activity",
      "456",
    );

    assert.deepEqual(JSON.parse(runScript(readScript, directory)), {
      exists: true,
      state: payload,
    });
    assert.match(
      readFileSync(`${directory}/.agents/state/race-sync-state.json`, "utf8"),
      /"last_synced_date": "2026-07-16"/,
    );
  });
});

test("write-state rejects invalid data without creating a state file", () => {
  withTempDirectory((directory) => {
    assert.throws(
      () => runScript(writeScript, directory, "--watermark", "bad"),
      /Payload failed schema validation/,
    );
    assert.deepEqual(JSON.parse(runScript(readScript, directory)), { exists: false });
  });
});
