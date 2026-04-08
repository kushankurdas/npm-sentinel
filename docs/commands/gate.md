# Command: `gate`

**Syntax:** `npm-sentinel gate [flags]`

## What it does

A **CI-oriented** orchestration of **static check** and **optional sandbox**:

1. Runs **`runCheck`** with **`withBaselineDiff: true`** always. If **`.npm-sentinel-baseline.json`** exists in the project root, baseline diff runs the same way as **`check --baseline`**.

   **Baseline path limitation:** `runCheck` calls **`loadBaseline(cwd)`** with no custom path (`lib/scan.js`). Only the default filename **`.npm-sentinel-baseline.json`** is loaded for **`check --baseline`** and **`gate`**. The **`--baseline-file`** flag applies to **`baseline save`** / **`baseline diff`** only. For a custom path with static check, the CLI would need a small extension.

2. **Failure (stage `check`):** If **`findings.length > 0`** **or** any baseline signal with **`severity === "error"`**, prints result (human or JSON with `gate: "failed", stage: "check"`), exits **1**.

3. **Success + `--require-sandbox`:** Calls **`cmdSandbox`** with the same `flags` **but forces `json: false`** for the sandbox step — sandbox output is always human-readable even if you passed `--json` to `gate`.

4. **Success without sandbox:** Prints **“Gate OK …”** or minimal JSON with `gate: "ok"`, exits **0**.

## Flags

Inherits **check-related** flags: `--cwd`, `--json`, `--min-severity`, `--no-osv`, `--offline`, `--npm-audit`, plus **`--require-sandbox`**.

Sandbox flags **`--no-build`**, **`--mount-ssh`**, **`--ssh-dir`** apply when **`--require-sandbox`** is set (passed through to **`cmdSandbox`**).

**Note:** There is **no** `--baseline` flag on `gate` — baseline diff is **on by default** when a baseline file is present.

## Exit codes

| Code | Meaning |
|------|---------|
| **0** | Check passed (no findings, no baseline **error** signals) and, if requested, sandbox **`ok`**. |
| **1** | Check failed **or** sandbox failed. |
| **2** | Thrown error from **`runCheck`** (e.g. missing `package.json` / lockfile). |

## Output (`--json`)

- On check failure: `{ "gate": "failed", "stage": "check", ...fullResult }`
- On check success without sandbox: `{ "gate": "ok", "stage": "check", "packagesScanned": N }`
- Sandbox stage does not add JSON when **`--json`** was used (sandbox runs non-JSON).

## How to test

### Static gate only

```bash
npx npm-sentinel gate --cwd /path/to/project
```

With no baseline file: behaves like **`check`** without baseline. With baseline: includes diff signals.

### Full gate with sandbox

```bash
npx npm-sentinel gate --require-sandbox --no-build
```

Requires Docker; static check must pass first.

### Simulate failure

Introduce an IOC version or baseline **error** (e.g. **`new_dependency`**) and run **`gate`** — expect exit **1** before any sandbox runs.

## When to use vs `check`

| Use **`check`** | Use **`gate`** |
|-----------------|----------------|
| Local dev, flexible flags (`--baseline` explicit, no baseline) | CI job that should always consider baseline if present |
| You never want sandbox | One command: **`gate --require-sandbox`** after tests |

If you need **`--baseline-file`** with **`gate`**, the current implementation may not support it on the **`runCheck`** path; use **`check --baseline --baseline-file …`** until the CLI is extended.
