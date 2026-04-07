/**
 * Fetch npm registry packument / version metadata for lifecycle scripts.
 */

const REGISTRY = "https://registry.npmjs.org";

/**
 * @param {string} name - package name (scoped ok)
 * @param {string} version - exact version
 * @returns {Promise<Record<string, string> | null>} scripts object or null
 */
export async function fetchVersionScripts(name, version, fetchImpl = fetch) {
  const enc = encodeURIComponent(name).replace(/%40/g, "@").replace(/%2F/g, "/");
  const url = `${REGISTRY}/${enc}/${encodeURIComponent(version)}`;
  const res = await fetchImpl(url, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const scripts = json.scripts;
  if (!scripts || typeof scripts !== "object") return {};
  return /** @type {Record<string, string>} */ (scripts);
}

const LIFECYCLE = new Set([
  "preinstall",
  "install",
  "postinstall",
  "preprepare",
  "prepare",
  "postprepare",
  "prepublish",
  "prepublishOnly",
]);

/**
 * @param {Record<string, string>} scripts
 * @returns {{ keys: string[], hashes: Record<string, string> }}
 */
export function summarizeLifecycleScripts(scripts) {
  const keys = [];
  const hashes = {};
  for (const key of Object.keys(scripts)) {
    if (LIFECYCLE.has(key)) {
      keys.push(key);
      const body = scripts[key] || "";
      hashes[key] = simpleHash(body);
    }
  }
  return { keys, hashes };
}

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h);
}
