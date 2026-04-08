# npm-sentinel documentation

Command references below match the CLI in `bin/cli.js`. The **[main README](../README.md)** is the quick-start and cheat sheet.

## Command reference

| Command | Guide |
|--------|--------|
| **`check`** | [commands/check.md](commands/check.md) — lockfile scan (OSV, offline IOCs), optional baseline diff and npm audit |
| **`baseline`** | [commands/baseline.md](commands/baseline.md) — `save` and `diff` for trusted-tree snapshots |
| **`sandbox`** | [commands/sandbox.md](commands/sandbox.md) — Docker `npm ci` with DNS capture and allowlist |
| **`gate`** | [commands/gate.md](commands/gate.md) — CI-friendly check + optional sandbox |
| **`help`** | [commands/help.md](commands/help.md) — built-in help text |

## Shared configuration

- **Project root:** `--cwd <dir>` (default: current directory).
- **Config files:** `npm-sentinel.config.json` or `.npm-sentinelsrc.json` — see [reference/config.md](reference/config.md).
- **Global flags:** [reference/flags.md](reference/flags.md) summarizes all CLI flags by command.

## Testing

See **[testing.md](testing.md)** for links to each command’s testing section and how to run **`npm test`** in this repo.

## Related topics

- Supply-chain background (e.g. lifecycle-based attacks): see the main README’s “Related reading” and [SECURITY.md](../SECURITY.md).
