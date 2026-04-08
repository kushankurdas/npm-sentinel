# Configuration file

Optional. First matching file in the project root (`--cwd`) wins:

1. `npm-sentinel.config.json`
2. `.npm-sentinelsrc.json`

Parsed as JSON in `lib/config.js`. Invalid JSON yields an empty object for that file.

## Keys

| Key | Type | Used by | Description |
|-----|------|---------|-------------|
| `watchPackagesExtra` | `string[]` | baseline, `check --baseline`, `gate` | Add package names to the **watch list** in addition to root `dependencies` / `devDependencies` / optional / peer deps. |
| `watchPackagesOverride` | `string[]` \| null | same | If set, **replace** the default watch list entirely (only these names are watched). |
| `dnsAllowlist` | object | `sandbox` | **`mode`** optional: **`merge`** (default) — defaults from `lib/dns-allowlist-default.json` **plus** your `suffixes` / `exactHosts`; **`replace`** — **only** your lists (no built-in suffixes/hosts). Invalid `mode` values behave as **`merge`**. |
| `sandbox.mountSsh` | boolean | `sandbox` | Same as CLI `--mount-ssh`. |
| `sandbox.sshDir` | string | `sandbox` | Same as `--ssh-dir`; wins over `mountSsh` when set. |

## Example

```json
{
  "watchPackagesExtra": ["some-transitive-parent"],
  "watchPackagesOverride": null,
  "dnsAllowlist": {
    "mode": "merge",
    "suffixes": ["my-registry.example.com"],
    "exactHosts": []
  },
  "sandbox": {
    "mountSsh": true
  }
}
```

### Strict allowlist (`replace`)

For a minimal allowlist (e.g. private registry only), set **`"mode": "replace"`** and list every **suffix** and **exact host** your `npm ci` legitimately resolves (often start by copying defaults from `lib/dns-allowlist-default.json`, then trim). Empty **`suffixes`** / **`exactHosts`** under **`replace`** allow **no** names by those rules until you add them.
