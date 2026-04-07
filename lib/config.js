import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CONFIG_NAMES = [
  "npm-sentinel.config.json",
  ".npm-sentinelsrc.json",
];

/**
 * @param {string} cwd
 * @returns {object}
 */
export function loadConfig(cwd) {
  for (const name of CONFIG_NAMES) {
    const p = join(cwd, name);
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8"));
      } catch {
        return {};
      }
    }
  }
  return {};
}

/**
 * @param {object} pkg - package.json parsed
 * @param {object} config
 * @returns {string[]}
 */
export function getWatchPackageNames(pkg, config) {
  if (Array.isArray(config.watchPackagesOverride)) {
    return [...config.watchPackagesOverride].sort();
  }
  const extra = config.watchPackagesExtra || [];
  const root = new Set(
    [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.optionalDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ].filter(Boolean)
  );
  if (Array.isArray(extra)) {
    for (const e of extra) root.add(e);
  }
  return [...root].sort();
}
