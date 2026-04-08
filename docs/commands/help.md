# Command: `help`

**Syntax:**

```bash
npm-sentinel help
```

**Note:** `npm-sentinel --help` is parsed as **flags** only; the CLI currently dispatches **`check`** before it evaluates `flags.help`, so **`--help` alone may still run `check`** in your tree. Prefer **`npm-sentinel help`** for the usage banner (or `npm-sentinel help` after we reorder dispatch if that gets fixed).

## What it does

Prints a short reference listing **commands**, **flags**, **config** keys, and an example **`preinstall`** one-liner. **Does not** touch `package-lock.json` or network.

## Exit code

**0**

## How to test

```bash
node bin/cli.js help
npx npm-sentinel help
```

Expect the usage banner from `bin/cli.js` (~lines 263–291).

For full documentation, use this **`docs/`** tree and the [main README](../../README.md).
