import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maxSeverityFromVulns, normalizeSeverity, compareSeverity } from "./osv-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const offlineIocs = JSON.parse(
  readFileSync(join(__dirname, "offline-iocs.json"), "utf8")
);

/**
 * @param {Array<{package: {name: string, version: string}, vulns: object[]}>} osvResults
 * @returns {Array<{name: string, version: string, source: string, severity: string, ids: string[], summary?: string}>}
 */
export function flattenOsvFindings(osvResults) {
  const out = [];
  for (const row of osvResults) {
    const { name, version } = row.package;
    if (!row.vulns?.length) continue;
    const severity = maxSeverityFromVulns(row.vulns);
    const ids = row.vulns.map((v) => v.id || v.alias || "unknown").filter(Boolean);
    const summary = row.vulns[0]?.summary || row.vulns[0]?.details?.slice?.(0, 200);
    out.push({
      name,
      version,
      source: "osv",
      severity,
      ids,
      summary,
    });
  }
  return out;
}

/**
 * @param {Array<{name: string, version: string}>} packages
 * @returns {Array<{name: string, version: string, source: string, severity: string, ids: string[], summary?: string}>}
 */
export function matchOfflineIocs(packages) {
  const iocs = offlineIocs.packages || [];
  const byName = new Map(iocs.map((p) => [p.name, p]));
  const out = [];
  for (const { name, version } of packages) {
    const entry = byName.get(name);
    if (!entry) continue;
    if (!entry.versions.includes(version)) continue;
    out.push({
      name,
      version,
      source: "offline-ioc",
      severity: "critical",
      ids: [entry.id || `ioc-${name}`],
      summary: entry.summary,
    });
  }
  return out;
}

/**
 * @param {string} minSeverity
 * @param {Array<{severity: string}>} findings
 */
export function filterByMinSeverity(minSeverity, findings) {
  const min = normalizeSeverity(minSeverity);
  return findings.filter((f) => compareSeverity(f.severity, min) <= 0);
}
