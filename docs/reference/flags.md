# CLI flags reference

Parsed in `bin/cli.js` (`parseArgs`). Boolean flags can appear as `--flag` or `--flag=true`-style where noted.

## All commands

| Flag | Type | Applies to | Description |
|------|------|------------|-------------|
| `--cwd <dir>` | path | all | Project root; must contain `package.json` (and usually `package-lock.json`). |
| `--json` | boolean | `check`, `baseline`, `sandbox`, `gate` | Machine-readable JSON on stdout (shape varies by command). |
| `--help` / `help` | — | `npm-sentinel help` | Prints usage and exits 0. |

## `check` and `gate`

| Flag | Default | Description |
|------|---------|-------------|
| `--min-severity` | `low` | Filter findings: `low`, `moderate`, `high`, `critical`. |
| `--no-osv` | off | Do not call the OSV batch API. |
| `--offline` | off | Skip OSV entirely (offline IOCs in `lib/offline-iocs.json` still apply). |
| `--baseline` | off | **`check` only:** if **`.npm-sentinel-baseline.json`** exists, run baseline diff and merge signals into output. Custom paths are **not** wired into `runCheck` / **`gate`**. |
| `--npm-audit` | off | Run `npm audit --json` in the project and attach summary to results (**does not** change exit code by itself; see [check.md](../commands/check.md)). |

## `gate` only

| Flag | Description |
|------|-------------|
| `--require-sandbox` | After a successful check, run **`sandbox`** (Docker). **`gate` forces `json: false` for the sandbox stage** even if `--json` was passed. |

## `sandbox` only

| Flag | Description |
|------|-------------|
| `--no-build` | Skip `docker build`; reuse existing `npm-sentinel-sandbox:local` image. |
| `--mount-ssh` | Mount host `~/.ssh` read-only at `/root/.ssh` in the container. |
| `--ssh-dir <path>` | Mount this directory instead of `~/.ssh` (for `git+ssh` deps). |

Config can also set `sandbox.mountSsh`, `sandbox.sshDir`, and `dnsAllowlist` (see [config.md](config.md)).

## `baseline` subcommands

| Flag | Description |
|------|-------------|
| `--baseline-file <path>` | Read/write baseline JSON at this path instead of **`.npm-sentinel-baseline.json`**. |

`baseline save` and `baseline diff` also accept `--cwd` and `--json`. (**Not** passed through from `check` / `gate` today.)
