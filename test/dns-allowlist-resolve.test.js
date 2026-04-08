import test from "node:test";
import assert from "node:assert/strict";
import { resolveDnsAllowlist } from "../lib/sandbox/docker-runner.js";
import { filterDisallowedHosts } from "../lib/sandbox/dns-parse.js";

test("resolveDnsAllowlist(undefined) uses defaults only", () => {
  const a = resolveDnsAllowlist(undefined);
  assert.ok(a.suffixes.includes("npmjs.org"));
  assert.ok(a.exactHosts.includes("localhost"));
});

test("resolveDnsAllowlist merge appends user suffixes", () => {
  const a = resolveDnsAllowlist({
    suffixes: ["my-corp.example.com"],
    exactHosts: ["10.0.0.1"],
  });
  assert.ok(a.suffixes.includes("npmjs.org"));
  assert.ok(a.suffixes.includes("my-corp.example.com"));
  assert.ok(a.exactHosts.includes("localhost"));
  assert.ok(a.exactHosts.includes("10.0.0.1"));
});

test("resolveDnsAllowlist merge is default when mode omitted", () => {
  const a = resolveDnsAllowlist({ mode: "merge", suffixes: ["x.test"] });
  assert.ok(a.suffixes.includes("npmjs.org"));
  assert.ok(a.suffixes.includes("x.test"));
});

test("resolveDnsAllowlist replace excludes defaults", () => {
  const a = resolveDnsAllowlist({
    mode: "replace",
    suffixes: ["registry.internal.corp"],
    exactHosts: ["127.0.0.1"],
  });
  assert.deepEqual(a.suffixes, ["registry.internal.corp"]);
  assert.deepEqual(a.exactHosts, ["127.0.0.1"]);
  const hosts = new Set(["registry.internal.corp", "evil.com"]);
  const bad = filterDisallowedHosts(hosts, a);
  assert.deepEqual(bad, ["evil.com"]);
});

test("resolveDnsAllowlist replace with empty lists allows nothing by suffix", () => {
  const a = resolveDnsAllowlist({ mode: "replace", suffixes: [], exactHosts: [] });
  const hosts = new Set(["registry.npmjs.org"]);
  const bad = filterDisallowedHosts(hosts, a);
  assert.deepEqual(bad, ["registry.npmjs.org"]);
});

test("unknown mode falls back to merge", () => {
  const a = resolveDnsAllowlist({ mode: "strict", suffixes: [] });
  assert.ok(a.suffixes.includes("npmjs.org"));
});
