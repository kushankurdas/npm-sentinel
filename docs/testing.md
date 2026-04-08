# Testing npm-sentinel

End-to-end ideas are split by command so they stay next to behavior and exit codes:

| Goal | Doc |
|------|-----|
| Static scan, OSV, IOCs, severity, `npm audit` | [commands/check.md — How to test](commands/check.md#how-to-test) |
| Baseline save/diff, signal types | [commands/baseline.md — How to test](commands/baseline.md#how-to-test) |
| Docker `npm ci`, DNS allowlist, SSH | [commands/sandbox.md — How to test](commands/sandbox.md#how-to-test) |
| CI gate + optional sandbox | [commands/gate.md — How to test](commands/gate.md#how-to-test) |

**This repo’s automated tests:**

```bash
npm ci
npm test
```

Fixtures live under **`test/fixtures/`** (e.g. lockfile mini IOC case in **`cli-smoke.test.js`**).
