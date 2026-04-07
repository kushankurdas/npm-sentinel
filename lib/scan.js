import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parseNpmLockfile,
  getAllNameVersionPairs,
} from "./parse-npm-lockfile.js";
import { queryOsvBatch } from "./osv-client.js";
import {
  flattenOsvFindings,
  matchOfflineIocs,
  filterByMinSeverity,
} from "./merge-findings.js";
import { loadBaseline, buildBaselineSnapshot } from "./baseline.js";
import { diffAgainstBaseline } from "./diff-signals.js";
import { loadConfig, getWatchPackageNames } from "./config.js";

const execFileAsync = promisify(execFile);

/**
 * @param {string} cwd
 */
function readPackageJson(cwd) {
  const p = join(cwd, "package.json");
  if (!existsSync(p)) throw new Error(`Missing package.json in ${cwd}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * @param {string} cwd
 */
function readLockfile(cwd) {
  const p = join(cwd, "package-lock.json");
  if (!existsSync(p)) throw new Error(`Missing package-lock.json in ${cwd}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {string} [opts.minSeverity]
 * @param {boolean} [opts.noOsv]
 * @param {boolean} [opts.offline] - skip OSV, IOCs only
 * @param {boolean} [opts.withBaselineDiff]
 * @param {boolean} [opts.npmAudit]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function runCheck(opts) {
  const cwd = opts.cwd || process.cwd();
  const minSeverity = opts.minSeverity || "low";
  const pkg = readPackageJson(cwd);
  const lockRaw = readLockfile(cwd);
  const parsed = parseNpmLockfile(lockRaw);
  const pairs = getAllNameVersionPairs(parsed);
  const config = loadConfig(cwd);
  const watchNames = getWatchPackageNames(pkg, config);

  /** @type {Array<{name: string, version: string, source: string, severity: string, ids: string[], summary?: string}>} */
  let findings = [];

  if (!opts.offline) {
    if (!opts.noOsv) {
      const osv = await queryOsvBatch(pairs, opts.fetchImpl || fetch);
      findings = findings.concat(flattenOsvFindings(osv));
    }
  }

  findings = findings.concat(matchOfflineIocs(pairs));
  findings = filterByMinSeverity(minSeverity, findings);

  /** @type {import('./diff-signals.js').Signal[]} */
  let signals = [];
  if (opts.withBaselineDiff) {
    const baseline = loadBaseline(cwd);
    if (baseline) {
      signals = await diffAgainstBaseline(
        baseline,
        parsed,
        watchNames,
        opts.fetchImpl || fetch
      );
    }
  }

  let npmAuditFindings = [];
  if (opts.npmAudit) {
    npmAuditFindings = await runNpmAuditJson(cwd);
  }

  return {
    cwd,
    packagesScanned: pairs.length,
    findings,
    signals,
    npmAuditFindings,
    watchNames,
  };
}

/**
 * @param {string} cwd
 * @returns {Promise<object[]>}
 */
async function runNpmAuditJson(cwd) {
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["audit", "--json"],
      { cwd, maxBuffer: 20 * 1024 * 1024 }
    );
    const j = JSON.parse(stdout);
    const vulns = j.vulnerabilities || {};
    const out = [];
    for (const [name, v] of Object.entries(vulns)) {
      if (!v.via || !v.effects) continue;
      const sev = String(v.severity || "moderate").toLowerCase();
      out.push({
        name,
        severity: sev,
        source: "npm-audit",
        via: v.via,
        range: v.range,
      });
    }
    return out;
  } catch (e) {
    const out = e.stdout?.toString?.() || e.stdout;
    if (out) {
      try {
        const j = JSON.parse(out);
        if (j.error?.code === "ENOLOCK") return [];
        const vulns = j.vulnerabilities || {};
        const arr = [];
        for (const [name, v] of Object.entries(vulns)) {
          if (!v.via) continue;
          arr.push({
            name,
            severity: String(v.severity || "moderate").toLowerCase(),
            source: "npm-audit",
            via: v.via,
            range: v.range,
          });
        }
        return arr;
      } catch {
        /* fallthrough */
      }
    }
    return [
      { name: "(npm-audit)", source: "npm-audit", error: String(e.message) },
    ];
  }
}

export { readPackageJson, readLockfile, parseNpmLockfile };
