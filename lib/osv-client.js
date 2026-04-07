/**
 * OSV batch query API — https://google.github.io/osv.dev/
 */

const OSV_BATCH = "https://api.osv.dev/v1/querybatch";

const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "unknown"];

/**
 * @param {string} a
 * @param {string} b
 */
export function compareSeverity(a, b) {
  const ia = SEVERITY_ORDER.indexOf(normalizeSeverity(a));
  const ib = SEVERITY_ORDER.indexOf(normalizeSeverity(b));
  return ia - ib;
}

export function normalizeSeverity(s) {
  const x = String(s || "").toLowerCase();
  if (SEVERITY_ORDER.includes(x)) return x;
  return "unknown";
}

/**
 * @param {Array<{name: string, version: string}>} packages
 * @param {typeof fetch} fetchImpl
 * @param {number} chunkSize
 */
export async function queryOsvBatch(packages, fetchImpl = fetch, chunkSize = 500) {
  /** @type {Array<{package: {name: string, version: string}, vulns: object[]}>} */
  const results = [];

  for (let i = 0; i < packages.length; i += chunkSize) {
    const chunk = packages.slice(i, i + chunkSize);
    const body = {
      queries: chunk.map((p) => ({
        package: { ecosystem: "npm", name: p.name },
        version: p.version,
      })),
    };

    const res = await fetchImpl(OSV_BATCH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OSV batch failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const batchResults = json.results || [];
    for (let j = 0; j < chunk.length; j++) {
      const pkg = chunk[j];
      const r = batchResults[j] || {};
      const vulns = r.vulns || [];
      results.push({ package: pkg, vulns });
    }
  }

  return results;
}

/**
 * @param {object[]} vulns - OSV vuln objects
 * @returns {string}
 */
export function maxSeverityFromVulns(vulns) {
  let best = "unknown";
  for (const v of vulns) {
    const s = extractSeverity(v);
    if (compareSeverity(s, best) < 0) best = s;
  }
  return best;
}

function extractSeverity(vuln) {
  const ss = vuln.severity;
  if (Array.isArray(ss)) {
    for (const s of ss) {
      if (s?.type === "CVSS_V3" && s.score) {
        const num = parseFloat(String(s.score));
        if (num >= 9) return "critical";
        if (num >= 7) return "high";
        if (num >= 4) return "moderate";
        if (num > 0) return "low";
      }
    }
  }
  if (vuln.database_specific?.severity) {
    return normalizeSeverity(vuln.database_specific.severity);
  }
  return "moderate";
}
