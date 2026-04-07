# Supply-chain context (why npm-sentinel exists)

## Axios npm incident (March 2026) — how the RAT ran

Public write-ups (e.g. [Elastic Security Labs](https://www.elastic.co/security-labs/axios-one-rat-to-rule-them-all), [Microsoft](https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/)) describe:

1. **Compromised npm releases** of **`axios`** (e.g. **1.14.1**, **0.30.4**) published after a maintainer account takeover.
2. Those releases pulled in a **malicious dependency** (reported as **`plain-crypto-js@4.2.1`**, typosquatting **`crypto-js`**).
3. That package’s **`package.json` defined a `postinstall` script**. **`npm install` / `npm ci`** run lifecycle scripts **automatically** (unless **`--ignore-scripts`**), so the dropper ran **during install** with no extra user action.
4. The dropper **fetched second-stage payloads** (platform-specific RAT) from attacker infrastructure.
5. **Anti-forensics** (e.g. rewriting **`package.json`**) was used to hide the **`postinstall`** hook after execution.

**Takeaway:** the dangerous code ran because **npm executed install-time scripts from a dependency** pulled in by a trusted-looking package. Static lockfile scanning catches **known bad versions** (OSV, IOCs); **sandbox** runs a real **`npm ci`** in Docker and records **DNS** to spot unexpected resolution during that install.

## How npm-sentinel maps to that threat model

| Layer | Role |
|--------|------|
| **`check`** | Lockfile → OSV + offline IOCs (+ optional baseline drift). **No** dependency scripts on the host during the scan. |
| **`sandbox`** | Real **`npm ci`** with **scripts on**, inside Linux + **DNS capture** vs allowlist. Aims to catch **network behavior** at install time. |

## Limits of DNS allowlisting

- If malware only talks to hosts that **already match** a broad suffix (e.g. object storage on **`amazonaws.com`**, CDNs on **`cloudflare.com`**), the DNS gate may **not** flag it.
- DNS gating is a **coarse** control; it complements **version/advisory** checks and **baseline** drift, it does not replace them.

## npm-sentinel IOC list

Exact malicious versions tracked for offline matching are in **`lib/offline-iocs.json`** (see **`testing-static-check.md`**). Update that file and release when new authoritative IOCs are published.
