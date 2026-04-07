import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cli = join(root, "bin", "cli.js");

test("CLI help exits 0", () => {
  const r = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /npm-sentinel/);
});

test("CLI check fails on offline IOC for malicious axios in lockfile", () => {
  const dir = join(root, "test", "tmp-cli-proj");
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "tmp-cli-proj",
        version: "1.0.0",
        dependencies: { axios: "^1.0.0" },
      })
    );
    const lock = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "lock-v3-mini.json"), "utf8")
    );
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify(lock));
    const r = spawnSync(
      process.execPath,
      [cli, "check", "--cwd", dir, "--offline", "--no-osv"],
      { encoding: "utf8" }
    );
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /axios/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
