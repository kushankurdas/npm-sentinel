# npm-sentinel documentation

Reference material for using and testing **npm-sentinel** (static lockfile checks, baseline drift, and Docker sandbox with DNS allowlisting).

| Document | Contents |
|----------|----------|
| [Testing the static "check" command](testing-static-check.md) | OSV, offline IOCs, vulnerable packages, exit codes |
| [Sandbox mode and DNS](sandbox-and-dns.md) | What `npm ci` does, how sandbox works, failures, allowlist, testing DNS violations, troubleshooting |
| [Supply-chain context](supply-chain-context.md) | Axios-style incidents, lifecycle scripts, limits of DNS gating |

Start with the static check doc for daily/CI usage; use the sandbox doc when you need install-time behavior in isolation.
