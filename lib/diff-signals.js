import { getRootDependencyResolution } from "./parse-npm-lockfile.js";
import { fetchVersionScripts, summarizeLifecycleScripts } from "./packument.js";

/**
 * @typedef {{ type: string, severity: 'error'|'warn', message: string, package?: string, detail?: object }} Signal
 */

/**
 * @param {object} baselineSnapshot - from buildBaselineSnapshot / loadBaseline
 * @param {ReturnType<import('./parse-npm-lockfile.js').parseNpmLockfile>} parsed
 * @param {string[]} watchNames
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<Signal[]>}
 */
export async function diffAgainstBaseline(
  baselineSnapshot,
  parsed,
  watchNames,
  fetchImpl = fetch
) {
  /** @type {Signal[]} */
  const signals = [];
  const saved = baselineSnapshot.packages || {};

  for (const name of watchNames) {
    const prev = saved[name];
    const cur = getRootDependencyResolution(parsed, name);

    if (!prev) continue;

    if (!cur) {
      signals.push({
        type: "missing_resolution",
        severity: "error",
        message: `Watched package "${name}" no longer resolves at node_modules (removed from tree?)`,
        package: name,
      });
      continue;
    }

    if (prev.resolvedVersion && cur.version !== prev.resolvedVersion) {
      signals.push({
        type: "version_change",
        severity: "warn",
        message: `Watched package "${name}" version changed: ${prev.resolvedVersion} → ${cur.version}`,
        package: name,
        detail: { from: prev.resolvedVersion, to: cur.version },
      });
    }

    const prevDeps = new Set(prev.directDependencyNames || []);
    const curDeps = new Set(cur.directDependencyNames || []);

    for (const d of curDeps) {
      if (!prevDeps.has(d)) {
        signals.push({
          type: "new_dependency",
          severity: "error",
          message: `New direct dependency "${d}" on watched package "${name}"`,
          package: name,
          detail: { dependency: d },
        });
      }
    }

    for (const d of prevDeps) {
      if (!curDeps.has(d)) {
        signals.push({
          type: "dependency_removed",
          severity: "warn",
          message: `Direct dependency "${d}" removed from watched package "${name}" (review for takeover)`,
          package: name,
          detail: { dependency: d },
        });
      }
    }

    const scripts = await fetchVersionScripts(name, cur.version, fetchImpl);
    const sum =
      scripts === null
        ? { keys: [], hashes: {} }
        : summarizeLifecycleScripts(scripts);
    const prevKeys = new Set(prev.lifecycleScriptKeys || []);

    for (const k of sum.keys) {
      if (!prevKeys.has(k)) {
        signals.push({
          type: "new_lifecycle_script",
          severity: "error",
          message: `New lifecycle script "${k}" on watched package "${name}"@${cur.version}`,
          package: name,
          detail: { script: k },
        });
      }
    }
  }

  return signals;
}
