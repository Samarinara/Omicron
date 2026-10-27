import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockRuntime } from "../server/runtime-lock.mjs";
test("one runtime per credential directory prevents rotating-token races", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "omicron-lock-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const release = lockRuntime(directory);
  assert.throws(() => lockRuntime(directory), /already running/);
  release();
  const releaseAgain = lockRuntime(directory);
  releaseAgain();
  await writeFile(join(directory, "runtime.lock"), "unreadable");
  assert.throws(() => lockRuntime(directory), /left untouched/);
  assert.equal(
    await readFile(join(directory, "runtime.lock"), "utf8"),
    "unreadable",
  );
});
