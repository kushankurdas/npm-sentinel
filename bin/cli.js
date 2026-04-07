#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runCheck, readPackageJson } from "../lib/scan.js";
import {
  buildBaselineSnapshot,
  saveBaseline,
  loadBaseline,
  DEFAULT_BASELINE_PATH,
} from "../lib/baseline.js";
import {
  parseNpmLockfile,
} from "../lib/parse-npm-lockfile.js";
import { loadConfig, getWatchPackageNames } from "../lib/config.js";
import { runSandbox } from "../lib/sandbox/docker-runner.js";
import { diffAgainstBaseline } from "../lib/diff-signals.js";
function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.includes("=") ? a.split("=", 2) : [a, null];
      const key = k.slice(2);
      if (v !== null) args.flags[key] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
        args.flags[key] = argv[++i];
      } else {
        args.flags[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function printFindingsJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printFindingsHuman(result) {
  console.log(`Scanned ${result.packagesScanned} unique package versions (lockfile).`);
  if (result.findings.length === 0) {
    console.log("No OSV/offline-IOC findings at or above min severity.");
  } else {
    console.log("\nFindings:");
    for (const f of result.findings) {
      console.log(
        `  - ${f.name}@${f.version} [${f.source}] severity=${f.severity} ids=${(f.ids || []).join(",")}`
      );
      if (f.summary) console.log(`    ${f.summary}`);
    }
  }
  if (result.signals?.length) {
    console.log("\nBaseline signals:");
    for (const s of result.signals) {
      console.log(`  [${s.severity}] ${s.type}: ${s.message}`);
    }
  }
  if (result.npmAuditFindings?.length) {
    console.log("\nnpm audit (summary):");
    for (const a of result.npmAuditFindings.slice(0, 20)) {
      if (a.error) console.log(`  - ${a.error}`);
      else console.log(`  - ${a.name} [${a.severity}]`);
    }
  }
}

async function cmdCheck(flags) {
  const cwd = flags.cwd || process.cwd();
  const json = !!flags.json;
  const minSeverity = flags["min-severity"] || "low";
  const result = await runCheck({
    cwd,
    minSeverity,
    noOsv: !!flags["no-osv"],
    offline: !!flags.offline,
    withBaselineDiff: !!flags.baseline,
    npmAudit: !!flags["npm-audit"],
  });

  const signalErrors = (result.signals || []).filter((s) => s.severity === "error");
  const failSignals = signalErrors.length > 0;

  if (json) {
    printFindingsJson({
      ok: result.findings.length === 0 && !failSignals,
      ...result,
    });
  } else {
    printFindingsHuman(result);
  }

  const failFindings = result.findings.length > 0;
  process.exitCode = failFindings || failSignals ? 1 : 0;
}

async function cmdBaseline(flags, sub) {
  const cwd = flags.cwd || process.cwd();
  const json = !!flags.json;
  if (sub === "save") {
    const lockPath = join(cwd, "package-lock.json");
    if (!existsSync(lockPath)) {
      console.error("package-lock.json required for baseline save.");
      process.exitCode = 2;
      return;
    }
    const pkg = readPackageJson(cwd);
    const config = loadConfig(cwd);
    const watchNames = getWatchPackageNames(pkg, config);
    const lockRaw = JSON.parse(readFileSync(lockPath, "utf8"));
    const parsed = parseNpmLockfile(lockRaw);
    const snapshot = await buildBaselineSnapshot(pkg, parsed, watchNames);
    const p = saveBaseline(snapshot, cwd, flags["baseline-file"] || DEFAULT_BASELINE_PATH);
    if (json) {
      printFindingsJson({ ok: true, path: p, snapshot });
    } else {
      console.log(`Baseline written to ${p} (${watchNames.length} watched packages).`);
    }
    process.exitCode = 0;
    return;
  }
  if (sub === "diff") {
    const baseline = loadBaseline(cwd, flags["baseline-file"] || DEFAULT_BASELINE_PATH);
    if (!baseline) {
      console.error("No baseline file. Run: npm-sentinel baseline save");
      process.exitCode = 2;
      return;
    }
    const lockPath = join(cwd, "package-lock.json");
    if (!existsSync(lockPath)) {
      console.error("package-lock.json required.");
      process.exitCode = 2;
      return;
    }
    const pkg = readPackageJson(cwd);
    const config = loadConfig(cwd);
    const watchNames = getWatchPackageNames(pkg, config);
    const parsed = parseNpmLockfile(JSON.parse(readFileSync(lockPath, "utf8")));
    const signals = await diffAgainstBaseline(baseline, parsed, watchNames);
    const errors = signals.filter((s) => s.severity === "error");
    if (json) {
      printFindingsJson({ ok: errors.length === 0, signals });
    } else {
      if (signals.length === 0) console.log("No baseline drift detected.");
      else {
        for (const s of signals) {
          console.log(`[${s.severity}] ${s.type}: ${s.message}`);
        }
      }
    }
    process.exitCode = errors.length ? 1 : 0;
    return;
  }
  console.error("Usage: npm-sentinel baseline save|diff");
  process.exitCode = 2;
}

function sandboxSshOpts(flags, config) {
  const explicitDir = flags["ssh-dir"] || config.sandbox?.sshDir;
  if (explicitDir) {
    return { mountSsh: false, sshMountPath: explicitDir };
  }
  const useDefaultDotSsh =
    !!flags["mount-ssh"] || !!config.sandbox?.mountSsh;
  if (useDefaultDotSsh) {
    return { mountSsh: true, sshMountPath: null };
  }
  return { mountSsh: false, sshMountPath: null };
}

function cmdSandbox(flags) {
  const cwd = flags.cwd || process.cwd();
  const json = !!flags.json;
  let userAllowlist;
  const config = loadConfig(cwd);
  if (config.dnsAllowlist) userAllowlist = config.dnsAllowlist;

  const ssh = sandboxSshOpts(flags, config);
  const res = runSandbox({
    cwd,
    skipBuild: !!flags["no-build"],
    userAllowlist,
    mountSsh: ssh.mountSsh,
    sshMountPath: ssh.sshMountPath,
  });

  if (json) {
    printFindingsJson({ ok: res.ok, ...res });
  } else {
    if (!res.ok && res.error) {
      console.error(res.error);
    } else {
      console.log(`npm ci exit: ${res.npmExit}`);
      if (res.disallowedDns?.length) {
        console.error("DNS allowlist violations:");
        for (const h of res.disallowedDns) console.error(`  - ${h}`);
      }
      if (res.npmExit !== 0) {
        console.error("npm ci failed inside sandbox. Last log lines:");
        console.error(res.npmLogTail || "(no log)");
      }
      if (res.ok) {
        console.log("Sandbox OK: npm ci succeeded and DNS within allowlist.");
        if (res.sshMounted) console.log("(SSH keys mounted from host for git+ssh dependencies.)");
      }
    }
  }
  process.exitCode = res.ok ? 0 : 1;
}

async function cmdGate(flags) {
  const cwd = flags.cwd || process.cwd();
  const json = !!flags.json;
  const minSeverity = flags["min-severity"] || "low";

  let result;
  try {
    result = await runCheck({
      cwd,
      minSeverity,
      noOsv: !!flags["no-osv"],
      offline: !!flags.offline,
      withBaselineDiff: true,
      npmAudit: !!flags["npm-audit"],
    });
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 2;
    return;
  }

  const signalErrors = (result.signals || []).filter((s) => s.severity === "error");
  const checkFail = result.findings.length > 0 || signalErrors.length > 0;

  if (checkFail) {
    if (json) printFindingsJson({ gate: "failed", stage: "check", ...result });
    else printFindingsHuman(result);
    process.exitCode = 1;
    return;
  }

  if (flags["require-sandbox"]) {
    cmdSandbox({ ...flags, cwd, json: false });
    return;
  }

  if (json) printFindingsJson({ gate: "ok", stage: "check", packagesScanned: result.packagesScanned });
  else console.log("Gate OK (check + baseline diff if baseline present).");
  process.exitCode = 0;
}

async function main() {
  const { _, flags } = parseArgs(process.argv);
  const cmd = _[0] || "check";

  try {
    if (cmd === "check") await cmdCheck(flags);
    else if (cmd === "baseline") await cmdBaseline(flags, _[1]);
    else if (cmd === "sandbox") cmdSandbox(flags);
    else if (cmd === "gate") await cmdGate(flags);
    else if (cmd === "help" || cmd === "--help" || flags.help) {
      console.log(`
npm-sentinel — static gate + Docker sandbox for npm supply-chain risk

Commands:
  check              Lockfile + OSV + offline IOCs; optional baseline diff (--baseline)
  baseline save      Write .npm-sentinel-baseline.json from current lockfile + registry metadata
  baseline diff      Compare current tree vs baseline (signals only)
  sandbox            Run npm ci inside Docker with DNS capture + allowlist
  gate               Run check (with baseline diff) and optionally --require-sandbox

Flags:
  --cwd <dir>        Project root (default: cwd)
  --json             JSON output
  --min-severity     low|moderate|high|critical (default: low)
  --no-osv           Skip OSV API
  --offline          Skip OSV (offline IOCs still apply)
  --baseline         With check: run baseline diff if baseline file exists
  --npm-audit        Also run npm audit --json
  --require-sandbox  With gate: run Docker sandbox after check
  --no-build         sandbox: skip docker build (reuse image)
  --mount-ssh        sandbox: mount host ~/.ssh read-only at /root/.ssh (git+ssh)
  --ssh-dir <path>   sandbox: mount this directory instead of ~/.ssh (implies SSH mount)
  --baseline-file    Alternate baseline path

Config (npm-sentinel.config.json): sandbox.mountSsh, sandbox.sshDir

preinstall (host, static only):
  "preinstall": "npx --yes npm-sentinel@latest check --baseline"
`);
      process.exitCode = 0;
    } else {
      console.error(`Unknown command: ${cmd}`);
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 2;
  }
}

main();
