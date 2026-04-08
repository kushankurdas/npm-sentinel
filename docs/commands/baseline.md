# Command: `baseline`

**Syntax:**

```bash
npm-sentinel baseline save [flags]
npm-sentinel baseline diff [flags]
```

## What “baseline” means here

A **saved snapshot** of your **trusted** dependency picture for **watched** packages only:

- **Watched packages** = names from root `package.json` **`dependencies`**, **`devDependencies`**, **`optionalDependencies`**, **`peerDependencies`**, plus **`watchPackagesExtra`**, or **`watchPackagesOverride`** if set (`lib/config.js`).
- For each watched name that **resolves** in the lockfile, the snapshot stores:
  - **Resolved version**
  - **Direct dependency names** of that package in the tree (children in lockfile)
  - **Lifecycle script keys** from the registry **packument** for that name at that version (`preinstall`, `install`, `postinstall`, etc., summarized in `lib/packument.js`)

Default file: **`.npm-sentinel-baseline.json`** (override with `--baseline-file`).

## `baseline save`

### Behavior

1. Requires **`package-lock.json`** — otherwise exits **2**.
2. Loads `package.json`, config, lockfile; computes **`watchNames`**.
3. For each watched package, **`buildBaselineSnapshot`** (`lib/baseline.js`) resolves the package in the lockfile and **fetches** version metadata from the registry (needs **network**).
4. Writes JSON snapshot; prints path and count of watched packages (or JSON with `ok`, `path`, `snapshot` if `--json`).

### Exit codes

| Code | Meaning |
|------|---------|
| **0** | Snapshot written. |
| **2** | Missing lockfile or other failure. |

### How to test

```bash
cd /path/to/your-app   # has package.json + package-lock.json
npx npm-sentinel baseline save
git add .npm-sentinel-baseline.json
```

Verify the file exists and lists expected packages under **`packages`**.

Use **`--baseline-file /tmp/test-baseline.json`** in throwaway dirs.

---

## `baseline diff`

### Behavior

1. Loads baseline (default path). If **missing**, prints hint and exits **2**.
2. Requires **`package-lock.json`** — otherwise exits **2**.
3. Recomputes **`watchNames`** from **current** `package.json` + config.
4. **`diffAgainstBaseline`** (`lib/diff-signals.js`): for each watched package that existed in the saved baseline, compares saved state vs **current** lockfile + **current** registry scripts.

### Signal types

| `type` | Typical `severity` | Meaning |
|--------|-------------------|---------|
| `missing_resolution` | **error** | Watched package no longer resolves under `node_modules` in the lockfile. |
| `version_change` | **warn** | Resolved version changed vs baseline. |
| `new_dependency` | **error** | New **direct** child dependency on the watched package (possible injection). |
| `dependency_removed` | **warn** | A direct child was removed (account takeover / metadata oddity — can be noisy). |
| `new_lifecycle_script` | **error** | Registry scripts for this name@version include a lifecycle key not present in baseline. |

Messages and `detail` objects are set in **`lib/diff-signals.js`**.

### Output

- Human: one line per signal, prefixed with `[error]` or `[warn]`, or **“No baseline drift detected.”**
- **`--json`:** `{ "ok": <no error signals>, "signals": [...] }`

### Exit codes

| Code | Meaning |
|------|---------|
| **0** | No signals **or** only **`warn`** signals. |
| **1** | At least one **`error`** signal. |
| **2** | No baseline file, missing lockfile, etc. |

**Note:** **`warn` alone does not fail** `baseline diff`.

### How to test

1. `baseline save` on a known-good tree.
2. **Version bump:** `npm install lodash@<other-version>` (if lodash is a root dep), then `baseline diff` → expect **`version_change`** (warn).
3. **New transitive shape:** Upgrade a root dep to a release that adds a **new direct** child on that package (e.g. supply-chain style) → **`new_dependency`** (error).
4. **Clean run:** Immediately `diff` after `save` with no edits → **no drift**, exit **0**.

Combining with **`check`:** use **`check --baseline`** so vulnerability findings and baseline errors fail one command together ([check.md](check.md)).

## Flags

`--cwd`, `--json`, `--baseline-file` — see [../reference/flags.md](../reference/flags.md).

## Requirements

- **`package-lock.json`** (lockfile v1/v2/v3 supported by `lib/parse-npm-lockfile.js`).
- **Network** for `save` and for `diff` when comparing **lifecycle scripts** (packument fetch for current versions).
