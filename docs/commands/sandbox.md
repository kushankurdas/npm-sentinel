# Command: `sandbox`

**Syntax:** `npm-sentinel sandbox [flags]`

## What it does

Runs a **real `npm ci`** inside **Docker** so install **lifecycle scripts** execute in an isolated Linux environment (not on your host). Optionally records **DNS** (UDP port 53) and enforces an **allowlist**.

Implementation: **`runSandbox`** in `lib/sandbox/docker-runner.js` + image `docker/Dockerfile.sandbox` + `docker/entrypoint-sandbox.sh`.

### High-level flow

1. Verifies **`package-lock.json`** exists at `--cwd`.
2. If **`--mount-ssh`** / **`--ssh-dir`** / config SSH path: resolves mount; errors if path missing.
3. Runs **`docker info`** — fails if Docker is unavailable.
4. Unless **`--no-build`**, builds image **`npm-sentinel-sandbox:local`** from `docker/Dockerfile.sandbox`.
5. **Runs container** with:
   - Project mounted **read-only** at `/src`, copied to `/work`
   - **`tcpdump`** on `udp port 53` appended to `/out/dns.log`
   - **`npm ci`** in `/work` (stdout/stderr → `/out/npm.log`)
   - Optional: mount host SSH keys for **`git+ssh`**
6. After the container exits, the CLI reads **`dns.log`**, **`npm.log`**, **`npm-exit.code`**, runs **`extractHostsFromTcpdump`** + **`filterDisallowedHosts`** (`lib/sandbox/dns-parse.js`) using **`resolveDnsAllowlist`** (`lib/sandbox/docker-runner.js`): built-in defaults **`merge`**d with config, or config-only when **`dnsAllowlist.mode`** is **`replace`**.

### Success condition

**`ok`** is true only when:

- **`npm ci`** exit code is **0**, **and**
- **No** extracted DNS hostname is outside the merged allowlist.

Either failure yields CLI exit **1** (unless preflight errors — see below).

## Output (human)

- Preflight failure: **`res.error`** on stderr (lockfile, Docker, SSH path, docker build).
- Otherwise: **`npm ci exit:`** code, optional **DNS allowlist violations** list, optional npm log tail on install failure, **“Sandbox OK”** when `ok`.

## Output (`--json`)

Object includes at least: **`ok`**, **`npmExit`**, **`npmLogTail`**, **`dnsHostsSample`**, **`disallowedDns`**, **`sshMounted`**, and on failure **`error`** may be set instead of npm/DNS fields.

Use **`dnsHostsSample`** to debug empty violations (parser/capture issues).

## Exit codes

| Code | Meaning |
|------|---------|
| **0** | `res.ok` — install succeeded and DNS within allowlist. |
| **1** | DNS violations, `npm ci` failure, or any `ok: false` result. |
| *(preflight)* **1** | Same exit mapping: `res.ok` false includes `error` string cases. |

**Note:** The entrypoint exits with **`npm ci`’s code** inside the container; the **CLI** still treats non-zero npm or DNS violations as failure.

## Flags

`--cwd`, `--json`, `--no-build`, `--mount-ssh`, `--ssh-dir` — see [../reference/flags.md](../reference/flags.md) and [../reference/config.md](../reference/config.md).

## Limits & caveats

- **Linux image** (`node:20-bookworm-slim`): native addons built for macOS/Windows may **fail** `npm ci` here even when local install works.
- **DNS parsing** only recognizes certain **tcpdump** line shapes (`A?` / `AAAA?` / `CNAME?` patterns in `dns-parse.js`).
- **Broad default allowlist** (`lib/dns-allowlist-default.json`): malware using allowed CDNs may **not** trigger DNS violations.
- **`tcpdump` stderr** is discarded in the entrypoint; silent capture failures can yield **empty** host sets.

## How to test

### Happy path

```bash
cd /path/to/small-js-project   # valid package-lock.json
docker info   # ensure daemon is up
npx npm-sentinel sandbox
# Second run:
npx npm-sentinel sandbox --no-build
```

Expect **Sandbox OK** and exit **0**.

### Force `npm ci` failure

Make `package.json` and `package-lock.json` **out of sync** (add a dependency in `package.json` without updating the lockfile). Run **`sandbox`** → expect non-zero **`npm ci exit`** and log tail.

### Force DNS violation (controlled)

Add a root **`preinstall`** / **`postinstall`** that runs **`require('node:dns').resolve4('example.com', …)`**, run **`npm install`** to refresh the lockfile, then **`sandbox`**. If capture + parser see **`example.com`**, expect **DNS allowlist violations** (see `lib/dns-allowlist-default.json`).

Avoid **`dns.lookupSync`** on Node 25+ (removed); use **`resolve4`** or callback **`lookup`**.

### Private git dependencies

```bash
npx npm-sentinel sandbox --mount-ssh
# or
npx npm-sentinel sandbox --ssh-dir /path/to/deploy-keys
```

See main README **Docker & SSH** / macOS **UseKeychain** notes.

## Relation to `check`

**`sandbox`** does **not** run OSV or offline IOCs. Use **`check`** (or **`gate`**) for static findings; use **`sandbox`** when you need **install-time behavior** evidence.
