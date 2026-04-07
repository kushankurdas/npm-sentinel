# npm-sentinel

**npm-sentinel** helps you catch risky dependency changes before or during install:

- **Fast checks** — scan your `package-lock.json` against vulnerability databases and known-bad versions.
- **Baseline drift** — detect new dependencies or install scripts on packages you trust (similar to how the [Axios supply-chain incident](https://www.elastic.co/security-labs/axios-one-rat-to-rule-them-all) introduced a hidden dependency).
- **Optional Docker sandbox** — run `npm ci` **inside a container** with DNS monitoring, so malicious `postinstall` scripts do not run on your host during that check.

---

## Simple guide: two jobs, five commands

Think of it as **two layers**:

| Layer | What it does | Needs Docker? |
|--------|----------------|---------------|
| **A — Static** | Reads the lockfile, calls [OSV](https://osv.dev/), optional baseline compare | **No** |
| **B — Sandbox** | Runs a real `npm ci` in Linux + watches DNS | **Yes** |

### Cheat sheet (what to run)

| I want… | Command |
|--------|---------|
| **Quick “is my lockfile bad?”** (daily / CI) | `npx npm-sentinel check` |
| **Same + compare to a saved “good” snapshot** | `npx npm-sentinel check --baseline` |
| **Save a “good” snapshot** (commit the file afterward) | `npx npm-sentinel baseline save` |
| **See what changed vs that snapshot** | `npx npm-sentinel baseline diff` |
| **Heavy: install in Docker + DNS allowlist** | `npx npm-sentinel sandbox` |
| **CI: static check, then optionally sandbox** | `npx npm-sentinel gate` or `npx npm-sentinel gate --require-sandbox` |

**Most teams:** use **`check`** (and **`check --baseline`** once baselines exist) on every PR; add **`sandbox`** where you need install-time behavior proof.

### Commands in plain English

- **`check`** — “Does this lockfile list any known vulnerable or known-malicious versions?” Optionally: “Did my trusted direct deps drift vs my baseline?”
- **`baseline save`** — “Remember today’s dependency + script picture for my root `package.json` deps as **trusted**.” Writes `.npm-sentinel-baseline.json`.
- **`baseline diff`** — “What changed since `baseline save`?” (new child deps, new install scripts, version bumps, etc.)
- **`sandbox`** — “Copy the project into a container, run **`npm ci` with scripts on**, record DNS. Fail if DNS hits unknown domains or `npm ci` fails.” Use **`--mount-ssh`** if you have private **`git+ssh`** dependencies (see below).
- **`gate`** — “Run **`check`** with baseline diff enabled **if** a baseline file exists. With **`--require-sandbox`**, run **`sandbox`** after **`check`** passes.”

---

## Quick start

### 1. In any repo that has `package-lock.json`

```bash
cd your-project
npx npm-sentinel check
```

Exit code **0** = no findings at your severity threshold; **1** = findings or baseline errors.

### 2. Optional: block install on bad lockfile (host only runs static check)

Use **npx** or a **global** install so `preinstall` works on a fresh clone:

```json
{
  "scripts": {
    "preinstall": "npx --yes npm-sentinel@latest check --baseline"
  }
}
```

Static `preinstall` does **not** run dependency `postinstall` on the host if npm aborts first. For **install-time** behavior, use **`sandbox`** separately or in CI.

### 3. Optional: baseline workflow

```bash
npx npm-sentinel baseline save
git add .npm-sentinel-baseline.json
git commit -m "chore: npm-sentinel baseline"
```

Later:

```bash
npx npm-sentinel check --baseline
```

### 4. Optional: Docker sandbox (`git+ssh` private deps)

```bash
npx npm-sentinel sandbox --mount-ssh
```

Or a folder with only deploy keys:

```bash
npx npm-sentinel sandbox --ssh-dir /path/to/keys
```

See **Docker & SSH** below for macOS vs Linux caveats.

---

## Install

```bash
npm install -D npm-sentinel
```

```bash
npm install -g npm-sentinel
```

From a **local clone** of this repo:

```bash
cd npm-sentinel
npm link
cd /path/to/your-app
npm link npm-sentinel
```

---

## Requirements

- **Node.js ≥ 18**
- **Docker** — only for `sandbox` and `gate --require-sandbox`
- **`package-lock.json`** at the project root (required for `check`, `baseline`, `sandbox`)

---

## Command reference (detailed)

| Command | Description |
|--------|-------------|
| `npm-sentinel check` | Lockfile → OSV + offline IOCs; add `--baseline` if `.npm-sentinel-baseline.json` exists |
| `npm-sentinel baseline save` | Write baseline from lockfile + registry metadata for watched packages |
| `npm-sentinel baseline diff` | Print drift vs baseline |
| `npm-sentinel sandbox` | Docker: copy project, `npm ci`, tcpdump DNS vs allowlist |
| `npm-sentinel gate` | `check` with baseline diff; `--require-sandbox` runs `sandbox` after |
| `npm-sentinel help` | Print help |

### Flags

| Flag | Purpose |
|------|---------|
| `--cwd <dir>` | Project root (default: current directory) |
| `--json` | JSON output |
| `--min-severity` | `low` \| `moderate` \| `high` \| `critical` (default: `low`) |
| `--no-osv` | Skip OSV API |
| `--offline` | Skip OSV (offline IOCs still apply) |
| `--baseline` | With `check`, run baseline diff when baseline file exists |
| `--npm-audit` | Also run `npm audit --json` |
| `--require-sandbox` | With `gate`, run `sandbox` after check |
| `--no-build` | `sandbox`: reuse existing Docker image |
| `--mount-ssh` | `sandbox`: mount host `~/.ssh` read-only at `/root/.ssh` |
| `--ssh-dir <path>` | `sandbox`: mount this directory instead of `~/.ssh` |
| `--baseline-file <path>` | Alternate baseline file path |

---

## Docker sandbox and your machine

- The sandbox runs **Linux** in Docker. It does **not** always give you a **macOS/Windows–usable** `node_modules` when packages ship **native** binaries built for your host OS.
- **Recommendation:** run **`sandbox` in CI (Linux)**; locally use **`check`**, or develop inside a **Dev Container** if you want Linux `node_modules` daily.

### Private `git+ssh` dependencies

The image includes **`git`** and **`openssh-client`**.

| Approach | Command / config |
|----------|-------------------|
| Mount host keys | `npm-sentinel sandbox --mount-ssh` |
| Mount a key folder only | `npm-sentinel sandbox --ssh-dir /path/to/keys` |
| Config file | `npm-sentinel.config.json`: `"sandbox": { "mountSsh": true }` or `"sshDir": "/path"` |

**macOS:** Your `~/.ssh/config` may use **`UseKeychain`**, which **Linux OpenSSH does not support**. The tool sets **`GIT_SSH_COMMAND`** with **`-F /dev/null`** so the **mounted config is ignored**; default key files in the mount still apply (`id_ed25519`, `id_rsa`, …). Keys that exist **only** in the Keychain and not on disk may still fail — use a **deploy key file** or **`git+https`** with a token in CI.

**Security:** Mounting `~/.ssh` gives the container read access to whatever keys are in that directory. Prefer **deploy keys** or **HTTPS + token** for automation.

---

## Configuration

Create **`npm-sentinel.config.json`** or **`.npm-sentinelsrc.json`** in the project root:

```json
{
  "watchPackagesExtra": ["some-transitive-parent"],
  "watchPackagesOverride": null,
  "dnsAllowlist": {
    "suffixes": ["my-registry.example.com"],
    "exactHosts": []
  },
  "sandbox": {
    "mountSsh": true
  }
}
```

| Key | Meaning |
|-----|---------|
| **Watched packages** | Defaults to root `dependencies` + `devDependencies` (+ optional peers / optionals). `watchPackagesExtra` adds more parent names. |
| **`watchPackagesOverride`** | If set (array), **only** these names are watched (replaces default list + extras). |
| **`dnsAllowlist`** | Extra allowed DNS suffixes / hosts for `sandbox`. |
| **`sandbox.mountSsh`** | Same as `--mount-ssh`. |
| **`sandbox.sshDir`** | Same as `--ssh-dir` (wins over `mountSsh` when set). |

---

## Baseline signals

When you compare to a saved baseline, npm-sentinel can report:

- **New direct dependencies** on a watched package (dependency injection)
- **New lifecycle scripts** on a resolved version (`preinstall` / `install` / `postinstall`)
- **Version changes** on watched packages
- **Removed dependencies** (warning; can be noisy; possible account-takeover signal)

---

## Development (this repo)

Extra guides (testing **`check`**, sandbox/DNS, supply-chain context): **[`docs/`](docs/README.md)**. Security reports: **[`SECURITY.md`](SECURITY.md)**.

```bash
git clone https://github.com/kushankurdas/npm-sentinel.git
cd npm-sentinel
npm ci
npm test
```

If your GitHub username or repo name differs, update the **`repository`**, **`bugs`**, and **`homepage`** fields in [`package.json`](package.json) to match.

---

## Related reading

- [pakrat](https://github.com/HorseyofCoursey/pakrat) — behavioral npm monitoring (inspiration)
- [Elastic — Axios supply chain](https://www.elastic.co/security-labs/axios-one-rat-to-rule-them-all)
- [Microsoft — Axios mitigation](https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/)

---

## License

[MIT](LICENSE)
