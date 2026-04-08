# Command: `check`

**Syntax:** `npm-sentinel check [flags]`  
**Default:** If you run `npm-sentinel` with no subcommand, it runs **`check`** (`bin/cli.js`).

## What it does

Runs the **static** pipeline (no `npm install` / `npm ci` on your machine):

1. **Reads** `package.json` and **`package-lock.json`** in the project root (`--cwd`). Missing either file throws and exits **2**.
2. **Parses** the lockfile and collects every unique **`(package name, resolved version)`** pair.
3. **Findings (vulnerability / IOC):**
   - **OSV** — unless `--offline` or `--no-osv`, POSTs batches to `https://api.osv.dev/v1/querybatch` (npm ecosystem). Each row with matching vulns becomes a finding (`source: osv`).
   - **Offline IOCs** — **always** evaluated from `lib/offline-iocs.json`: exact name + version matches (`source: offline-ioc`, severity **critical** for filtering purposes).
   - **`--min-severity`** filters findings (low → critical scale in `lib/merge-findings.js`).
4. **Baseline (optional):** With **`--baseline`**, if **`.npm-sentinel-baseline.json`** exists under **`--cwd`**, runs **`diffAgainstBaseline`** and appends **signals**. Only the default baseline filename is supported on this code path (see [baseline.md](baseline.md), [gate.md](gate.md)).
5. **`--npm-audit`:** Spawns **`npm audit --json`** in the project. Results are attached to the output as **`npmAuditFindings`** for display/JSON.

## Output

- **Human:** Count of scanned pairs, list of findings (name, version, source, severity, ids, optional summary), baseline signals, short npm-audit summary (first ~20 entries).
- **`--json`:** Single object including `ok` (**true** only when no findings **and** no baseline **error**-severity signals), `findings`, `signals`, `npmAuditFindings`, `watchNames`, `packagesScanned`, `cwd`.

## Exit codes

| Code | Meaning |
|------|---------|
| **0** | No findings after severity filter **and** no baseline signals with **`severity === "error"`**. |
| **1** | At least one finding **or** at least one **error** baseline signal. |
| **2** | Missing `package.json` / `package-lock.json`, OSV/network failure, or other thrown error. |

**Note:** **`npm audit` problems do not set exit code 1** by themselves. Only **`findings`** (OSV/IOC) and **baseline error signals** affect success for `check`.

## Flags (summary)

See [../reference/flags.md](../reference/flags.md). Common: `--cwd`, `--json`, `--min-severity`, `--no-osv`, `--offline`, `--baseline`, `--npm-audit`.

## How to test

### Smoke: help and happy path

```bash
npm-sentinel check --cwd /path/to/project
```

Use a project with a clean lockfile and no baseline errors — expect exit **0** (or findings if deps are vulnerable).

### IOC / offline path (no OSV)

Use a fixture lockfile that pins a version listed in **`lib/offline-iocs.json`** (e.g. `axios@1.14.1`). This repo’s test uses **`test/fixtures/lock-v3-mini.json`** copied into a temp dir:

```bash
node bin/cli.js check --cwd /tmp/test-proj --offline --no-osv
```

Expect exit **1** and output mentioning the IOC package.

### OSV path

Install an old version with a known advisory, ensure **`package-lock.json`** pins it, run **`check`** without `--offline`. Expect findings if OSV has the CVE.

### Severity filter

```bash
npm-sentinel check --min-severity high
```

Low/moderate-only findings are dropped; exit **0** if nothing meets the threshold.

### Baseline integration

1. `npm-sentinel baseline save`
2. Change a watched dependency’s resolved version in the lockfile.
3. `npm-sentinel check --baseline`

Expect **baseline signals** in output; exit **1** if any signal is **`error`** (e.g. `new_dependency`, `new_lifecycle_script`).

### npm audit attachment

```bash
npm-sentinel check --npm-audit --json
```

Inspect **`npmAuditFindings`** in JSON; exit code still follows findings/baseline rules only.

## Typical CI usage

```bash
npx npm-sentinel@latest check --baseline
```

Pair with a committed **`.npm-sentinel-baseline.json`** after an intentional `baseline save`.
