import test from "node:test";
import assert from "node:assert/strict";
import {
  extractHostsFromTcpdump,
  filterDisallowedHosts,
} from "../lib/sandbox/dns-parse.js";

test("extractHostsFromTcpdump parses A? queries", () => {
  const log = `IP 10.0.0.2.123 > 8.8.8.8.53: 12345+ A? registry.npmjs.org. (37)`;
  const h = extractHostsFromTcpdump(log);
  assert.ok(h.has("registry.npmjs.org"));
});

test("filterDisallowedHosts respects suffix allowlist", () => {
  const hosts = new Set(["registry.npmjs.org", "evil.example"]);
  const allow = { suffixes: ["npmjs.org"], exactHosts: [] };
  const bad = filterDisallowedHosts(hosts, allow);
  assert.deepEqual(bad, ["evil.example"]);
});
