# Testing the static `check` command

The **`check`** command reads **`package-lock.json`**, queries **OSV** (unless disabled), merges **offline IOCs** (known malicious exact versions), optionally compares to a **baseline**, and can run **`npm audit`**.

## What feeds findings

1. **OSV** (network) — batch query to `https://api.osv.dev/v1/querybatch` for npm ecosystem. Skipped with `--offline` or `--no-osv`.
2. **Offline IOCs** — always applied after OSV results. Exact **`name` + `version`** matches from `lib/offline-iocs.json` (e.g. compromised axios / plain-crypto-js releases). Source label: `offline-ioc`, severity treated as **critical** for filtering.

## Exit codes

- **`0`** — no findings at or above `--min-severity`, and no baseline **error**-level signals (when `--baseline` is used).
- **`1`** — findings and/or failing baseline signals.

Use **`--json`** for machine-readable output. **`--min-severity`** filters by `low` | `moderate` | `high` | `critical` (default: `low`).

## Proving `check` works

### 1. Offline IOC path (no OSV needed)

The repo encodes known-bad versions in **`lib/offline-iocs.json`**. You can verify IOC matching **without** calling OSV:

```bash
npm-sentinel check --cwd /path/to/project --offline --no-osv
```

Use a lockfile that pins those exact versions (see **`test/fixtures/lock-v3-mini.json`** in this repo: `axios@1.14.1`, `plain-crypto-js@4.2.1`). You do **not** need to run `npm install` for that tarball if you only want to test the scanner — a hand-written or copied lockfile is enough.

**Safety:** Avoid `npm install` of known-malicious packages on your host unless you fully accept the risk; static **`check`** only needs the lockfile contents.

### 2. OSV path

Use a small project with a **real** lockfile and a dependency version that has published advisories in OSV (e.g. an old but non-malicious CVE’d release). Then:

```bash
npm-sentinel check
```

If nothing appears, try another version or run **`npm audit`** locally to see what npm flags, then confirm the lockfile pins that version.

### 3. Optional: `npm audit`

```bash
npm-sentinel check --npm-audit
```

Adds **`npm audit --json`** output as an additional signal (separate from OSV).

## Baseline (brief)

- **`baseline save`** — writes `.npm-sentinel-baseline.json` from the lockfile + registry metadata for watched packages.
- **`check --baseline`** — reports drift (new deps, new lifecycle scripts on watched packages, version bumps, etc.).

See the main **[README.md](../README.md)** for the full command matrix and config file options.
