/**
 * Extract hostnames from tcpdump -n udp port 53 style lines.
 */

const RE_A = /A\?\s+([a-zA-Z0-9*.-]+)\.\s/;
const RE_AAAA = /AAAA\?\s+([a-zA-Z0-9*.-]+)\.\s/;
const RE_CNAME = /CNAME\?\s+([a-zA-Z0-9*.-]+)\.\s/;

/**
 * @param {string} logText
 * @returns {Set<string>}
 */
export function extractHostsFromTcpdump(logText) {
  const hosts = new Set();
  for (const line of logText.split("\n")) {
    for (const re of [RE_A, RE_AAAA, RE_CNAME]) {
      const m = line.match(re);
      if (m) {
        hosts.add(m[1].toLowerCase().replace(/\.$/, ""));
      }
    }
  }
  return hosts;
}

/**
 * @param {string} host
 * @param {{ suffixes: string[], exactHosts: string[] }} allow
 */
export function isHostAllowed(host, allow) {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  for (const ex of allow.exactHosts || []) {
    if (h === ex.toLowerCase()) return true;
  }
  for (const suf of allow.suffixes || []) {
    const s = suf.toLowerCase();
    if (h === s || h.endsWith("." + s)) return true;
  }
  return false;
}

/**
 * @param {Set<string>} hosts
 * @param {object} allow
 * @returns {string[]}
 */
export function filterDisallowedHosts(hosts, allow) {
  const bad = [];
  for (const h of hosts) {
    if (!isHostAllowed(h, allow)) bad.push(h);
  }
  return [...new Set(bad)].sort();
}
