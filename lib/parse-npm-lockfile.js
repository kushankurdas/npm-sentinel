/**
 * Parse npm package-lock.json v1 and v2/v3; enumerate packages and root dependency resolutions.
 */

/**
 * @param {string} pathKey - e.g. "node_modules/foo" or "node_modules/@scope/pkg"
 * @returns {string} package name
 */
export function pathKeyToPackageName(pathKey) {
  if (!pathKey || pathKey === "") return "";
  const prefix = "node_modules/";
  if (!pathKey.startsWith(prefix)) return pathKey;
  return pathKey.slice(prefix.length).replace(/\\/g, "/");
}

/**
 * @param {object} lock
 * @returns {{ lockfileVersion: number, packages: Array<{path: string, name: string, version: string, dependencies: Record<string, string>, directDependencyNames: string[]}> }}
 */
export function parseNpmLockfile(lock) {
  const lv = lock.lockfileVersion ?? 1;
  if (lv === 1 || !lock.packages) {
    return parseLockfileV1(lock);
  }
  return parseLockfileV2(lock, lv);
}

function parseLockfileV1(lock) {
  /** @type {Array<{path: string, name: string, version: string, dependencies: Record<string, string>}>} */
  const packages = [];
  const seen = new Set();

  function walk(deps, prefixPath) {
    if (!deps) return;
    for (const [name, spec] of Object.entries(deps)) {
      if (!spec || typeof spec !== "object") continue;
      const version = spec.version;
      if (!version) continue;
      const pathKey =
        prefixPath === ""
          ? `node_modules/${name}`
          : `${prefixPath}/node_modules/${name}`;
      if (!seen.has(pathKey)) {
        seen.add(pathKey);
        const depObj = spec.dependencies || {};
        const directDependencyNames = Object.keys(depObj);
        const dependencies = {};
        for (const k of directDependencyNames) dependencies[k] = "*";
        packages.push({
          path: pathKey,
          name,
          version,
          dependencies,
          directDependencyNames,
        });
      }
      if (spec.dependencies) {
        walk(spec.dependencies, pathKey);
      }
    }
  }

  walk(lock.dependencies || {}, "");

  return {
    lockfileVersion: 1,
    packages,
    rootDependencies: lock.dependencies || {},
  };
}

function parseLockfileV2(lock, lockfileVersion) {
  const map = lock.packages || {};
  /** @type {Array<{path: string, name: string, version: string, dependencies: Record<string, string>}>} */
  const packages = [];

  for (const [pathKey, pkg] of Object.entries(map)) {
    if (pathKey === "") continue;
    if (!pkg || typeof pkg !== "object") continue;
    const version = pkg.version;
    if (!version) continue;
    const name = pkg.name || pathKeyToPackageName(pathKey);
    const depRecord = pkg.dependencies || {};
    const directDependencyNames = Object.keys(depRecord);
    packages.push({
      path: pathKey.replace(/\\/g, "/"),
      name,
      version,
      dependencies: depRecord,
      directDependencyNames,
    });
  }

  const root = map[""] || {};
  return {
    lockfileVersion,
    packages,
    rootDependencies: root.dependencies || {},
  };
}

/**
 * Unique (name, version) pairs for OSV batching.
 * @param {ReturnType<parseNpmLockfile>} parsed
 * @returns {Array<{name: string, version: string}>}
 */
export function getAllNameVersionPairs(parsed) {
  const key = (n, v) => `${n}@${v}`;
  const out = new Map();
  for (const p of parsed.packages) {
    const k = key(p.name, p.version);
    if (!out.has(k)) {
      out.set(k, { name: p.name, version: p.version });
    }
  }
  return [...out.values()];
}

/**
 * Path under node_modules for a root dependency name (e.g. axios -> node_modules/axios, @x/y -> node_modules/@x/y)
 * @param {string} depName
 */
export function rootNodeModulesPath(depName) {
  return `node_modules/${depName.replace(/\\/g, "/")}`;
}

/**
 * Resolved version + direct dependency names for a root-level dependency from package.json.
 * @param {ReturnType<parseNpmLockfile>} parsed
 * @param {string} depName - key as in package.json dependencies
 * @returns {{ version: string, directDependencyNames: string[] } | null}
 */
export function getRootDependencyResolution(parsed, depName) {
  const targetPath = rootNodeModulesPath(depName);
  const entry = parsed.packages.find((p) => p.path === targetPath);
  if (!entry) return null;
  const directDependencyNames =
    entry.directDependencyNames ||
    Object.keys(entry.dependencies || {});
  return {
    version: entry.version,
    directDependencyNames,
  };
}
