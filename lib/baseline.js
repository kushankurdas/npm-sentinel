import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseNpmLockfile,
  getRootDependencyResolution,
} from "./parse-npm-lockfile.js";
import { fetchVersionScripts, summarizeLifecycleScripts } from "./packument.js";

export const DEFAULT_BASELINE_PATH = ".npm-sentinel-baseline.json";

/**
 * @param {string} cwd
 * @param {string} [relPath]
 */
export function baselinePath(cwd, relPath = DEFAULT_BASELINE_PATH) {
  return join(cwd, relPath);
}

/**
 * @param {object} pkg
 * @param {ReturnType<import('./parse-npm-lockfile.js').parseNpmLockfile>} parsed
 * @param {string[]} watchNames
 * @param {typeof fetch} [fetchImpl]
 */
export async function buildBaselineSnapshot(
  pkg,
  parsed,
  watchNames,
  fetchImpl = fetch
) {
  /** @type {Record<string, object>} */
  const packages = {};

  for (const name of watchNames) {
    const res = getRootDependencyResolution(parsed, name);
    if (!res) {
      packages[name] = {
        resolvedVersion: null,
        directDependencyNames: [],
        lifecycleScriptKeys: [],
        scriptHashes: {},
        missingInLockfile: true,
      };
      continue;
    }

    const scripts = await fetchVersionScripts(name, res.version, fetchImpl);
    const sum =
      scripts === null
        ? { keys: [], hashes: {} }
        : summarizeLifecycleScripts(scripts);

    packages[name] = {
      resolvedVersion: res.version,
      directDependencyNames: [...(res.directDependencyNames || [])].sort(),
      lifecycleScriptKeys: sum.keys.sort(),
      scriptHashes: sum.hashes,
      missingInLockfile: false,
    };
  }

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    packages,
  };
}

export function loadBaseline(cwd, relPath = DEFAULT_BASELINE_PATH) {
  const p = baselinePath(cwd, relPath);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function saveBaseline(snapshot, cwd, relPath = DEFAULT_BASELINE_PATH) {
  const p = baselinePath(cwd, relPath);
  writeFileSync(p, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return p;
}
