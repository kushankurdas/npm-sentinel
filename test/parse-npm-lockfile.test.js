import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseNpmLockfile,
  getAllNameVersionPairs,
  getRootDependencyResolution,
} from "../lib/parse-npm-lockfile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "lock-v3-mini.json"), "utf8")
);

test("parseNpmLockfile v3 enumerates packages", () => {
  const p = parseNpmLockfile(fixture);
  assert.equal(p.lockfileVersion, 3);
  const pairs = getAllNameVersionPairs(p);
  const set = new Set(pairs.map((x) => `${x.name}@${x.version}`));
  assert.ok(set.has("axios@1.14.1"));
  assert.ok(set.has("plain-crypto-js@4.2.1"));
});

test("getRootDependencyResolution returns direct deps", () => {
  const p = parseNpmLockfile(fixture);
  const ax = getRootDependencyResolution(p, "axios");
  assert.ok(ax);
  assert.equal(ax.version, "1.14.1");
  assert.deepEqual(ax.directDependencyNames.sort(), ["plain-crypto-js"]);
});

test("parseNpmLockfile v1", () => {
  const v1 = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "lock-v1-mini.json"), "utf8")
  );
  const p = parseNpmLockfile(v1);
  assert.equal(p.lockfileVersion, 1);
  const ax = getRootDependencyResolution(p, "axios");
  assert.ok(ax);
  assert.equal(ax.version, "1.14.0");
  assert.ok(ax.directDependencyNames.includes("follow-redirects"));
});
