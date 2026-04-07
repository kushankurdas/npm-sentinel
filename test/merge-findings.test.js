import test from "node:test";
import assert from "node:assert/strict";
import { matchOfflineIocs, filterByMinSeverity } from "../lib/merge-findings.js";

test("matchOfflineIocs flags axios 1.14.1", () => {
  const f = matchOfflineIocs([{ name: "axios", version: "1.14.1" }]);
  assert.equal(f.length, 1);
  assert.equal(f[0].source, "offline-ioc");
});

test("filterByMinSeverity excludes low when min is moderate", () => {
  const f = [
    { severity: "low", name: "a" },
    { severity: "high", name: "b" },
  ];
  const m = filterByMinSeverity("moderate", f);
  assert.equal(m.length, 1);
  assert.equal(m[0].name, "b");
});
