# Sandbox mode and DNS allowlisting

## What `npm ci` does

**`npm ci`** is npm’s **clean, lockfile-driven** install:

- Requires a **`package-lock.json`** (or shrinkwrap) consistent with **`package.json`**; fails if they disagree instead of rewriting the lockfile.
- Removes existing **`node_modules`** and reinstalls exactly what the lockfile describes.
- Does **not** bump ranges like a typical **`npm install`**.
- Runs **lifecycle scripts** by default (`preinstall`, `install`, `postinstall`, etc.) unless **`--ignore-scripts`** or config disables them.

In short: **`npm ci` = reproducible install from the lockfile, with scripts on by default.**

## What npm-sentinel sandbox does

1. Requires **`package-lock.json`** and a working **Docker** daemon.
2. Builds image **`npm-sentinel-sandbox:local`** (skip with **`--no-build`** after the first successful build).
3. Runs a container that:
   - Copies the project from a **read-only** mount into **`/work`**
   - Starts **`tcpdump`** on **UDP port 53** (DNS)
   - Runs **`npm ci`** in **`/work`** (scripts **on** — no `--ignore-scripts` in the entrypoint)
4. After the container exits, the CLI parses **`dns.log`**, extracts hostnames from query lines, and compares them to the **merged DNS allowlist** (defaults + `dnsAllowlist` in config).

**Success** only if **`npm ci` exits 0** and **no extracted hostname** is outside the allowlist.

**Note:** The image is **Linux** (`node:20-bookworm-slim`). Native modules built for macOS/Windows may fail inside the container even when local installs work. That is expected; many teams run **`sandbox` in Linux CI**.

## Default DNS allowlist

Defaults live in **`lib/dns-allowlist-default.json`**: suffixes such as **`npmjs.org`**, **`registry.npmjs.org`**, **`github.com`**, **`cloudflare.com`**, **`amazonaws.com`**, etc., plus **`localhost`** / **`127.0.0.1`** as exact hosts.

**Matching rule:** a hostname is allowed if it equals an **exact** entry, equals a **suffix**, or ends with **`.` + suffix**. Optional **`dnsAllowlist`** in **`npm-sentinel.config.json`** **adds** suffixes/exact hosts; it does **not** remove defaults.

## When sandbox fails

| Cause | Typical signal |
|--------|----------------|
| Missing lockfile, Docker down, SSH mount path invalid, image build failed | CLI prints an **`error`** string; exit **1** |
| **`npm ci` non-zero** | e.g. lockfile out of sync, private deps without auth, failing scripts, Linux/native build issues | **`npm ci exit:`** non-zero + npm log tail |
| **DNS allowlist violation** | Any captured query name not allowed | **`DNS allowlist violations:`** listing hostnames |

Private **`git+ssh`** deps: use **`--mount-ssh`** or **`--ssh-dir`** (see main README).

## Testing a DNS violation (on purpose)

Goal: trigger a **real** DNS query to a name **not** covered by the default suffix list (e.g. **`example.com`**).

### Use `dns.resolve4`, not `dns.lookupSync`

- **`dns.resolve4`** uses the **DNS protocol** and tends to produce **A** queries that show up in **tcpdump** output the parser understands.
- **`dns.lookup()`** uses the OS resolver (`getaddrinfo`); behavior and capture can differ.
- **`dns.lookupSync`** is **not available** on newer Node (e.g. **Node 25+**); use callback or promises APIs instead.

**Example `package.json` script** (refresh lockfile with `npm install` after editing):

```json
"preinstall": "node -e \"require('node:dns').resolve4('example.com', (e) => { if (e) throw e; })\""
```

You can use **`postinstall`** or **`prepare`** instead of **`preinstall`**; any root lifecycle script that runs during **`npm ci`** is fine for a local test.

**Critical:** If **`ignore-scripts`** is set (`.npmrc`, **`NPM_CONFIG_IGNORE_SCRIPTS`**, etc.), **`npm ci` will skip these scripts** and your test will not run.

### Debug with `--json`

```bash
npm-sentinel sandbox --json
```

Inspect:

- **`npmExit`** — `0` if install completed.
- **`dnsHostsSample`** — hostnames parsed from the capture. If **empty**, no violation can be reported (capture empty, **tcpdump** format mismatch, or no matching query lines).
- **`disallowedDns`** — expected failures appear here.

### Why sandbox might “pass” when you expect a violation

1. **No hostnames parsed** — **`extractHostsFromTcpdump`** only matches lines like **`A? name. `** (space after the trailing dot). If **tcpdump** output format differs, names may be missed. **`dns.log`** capture can also be empty if **tcpdump** fails silently (stderr is discarded in the entrypoint).
2. **Scripts disabled** — **`ignore-scripts`** prevents **`preinstall`** / **`postinstall`** from running.
3. **Wrong API** — **`lookup`** may not yield lines the parser extracts; prefer **`resolve4`** for testing.

## Other lifecycle hooks (besides `postinstall`)

During **`npm ci`**, npm can run **`preinstall`**, **`install`**, **`postinstall`**, and often **`prepare`** on the **root** package, plus the same classes of scripts on **dependencies**. Real supply-chain malware usually hides in **dependency** scripts, not your app’s **`package.json`**.

## Commands cheat sheet

```bash
npm-sentinel sandbox
npm-sentinel sandbox --no-build
npm-sentinel sandbox --mount-ssh
npm-sentinel sandbox --json
```

See **[README.md](../README.md)** for **`gate --require-sandbox`**, config keys, and SSH caveats on macOS.
