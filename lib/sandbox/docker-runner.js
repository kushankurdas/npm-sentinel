import {
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  extractHostsFromTcpdump,
  filterDisallowedHosts,
} from "./dns-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..", "..");
const DOCKER_DIR = join(PACKAGE_ROOT, "docker");
const IMAGE_TAG = "npm-sentinel-sandbox:local";

/**
 * Skip mounted ~/.ssh/config: macOS often sets UseKeychain, which Linux OpenSSH rejects.
 * With -F /dev/null, ssh still tries default identity files under /root/.ssh (id_ed25519, id_rsa, …).
 */
const GIT_SSH_COMMAND =
  "ssh -F /dev/null -o BatchMode=yes -o IdentityAgent=none -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/npm-sentinel-known_hosts";

function loadDefaultAllowlist() {
  const p = join(PACKAGE_ROOT, "lib", "dns-allowlist-default.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * DNS allowlist for sandbox: built-in defaults plus optional project config.
 *
 * - **merge** (default): `lib/dns-allowlist-default.json` + `dnsAllowlist.suffixes` / `exactHosts`.
 * - **replace**: only `suffixes` / `exactHosts` from config (full list is your responsibility).
 *
 * @param {object | null | undefined} userAllow - from `dnsAllowlist` in npm-sentinel.config.json
 * @returns {{ suffixes: string[], exactHosts: string[] }}
 */
export function resolveDnsAllowlist(userAllow) {
  const modeRaw =
    userAllow && typeof userAllow.mode === "string"
      ? String(userAllow.mode).toLowerCase()
      : "merge";
  const mode = modeRaw === "replace" ? "replace" : "merge";

  const userSuffixes = (userAllow && userAllow.suffixes) || [];
  const userExact = (userAllow && userAllow.exactHosts) || [];

  if (mode === "replace") {
    return {
      suffixes: [...userSuffixes],
      exactHosts: [...userExact],
    };
  }

  const base = loadDefaultAllowlist();
  return {
    suffixes: [...(base.suffixes || []), ...userSuffixes],
    exactHosts: [...(base.exactHosts || []), ...userExact],
  };
}

/**
 * Resolve directory to mount at /root/.ssh in the container.
 * @param {{ sshMountPath?: string | null, mountSsh?: boolean }} opts
 * @returns {{ path: string } | { error: string }}
 */
export function resolveSshMountPath(opts) {
  let dir = opts.sshMountPath;
  if (!dir && opts.mountSsh) {
    dir = join(homedir(), ".ssh");
  }
  if (!dir) return { path: "" };
  if (!existsSync(dir)) {
    return {
      error: `SSH mount path does not exist: ${dir}`,
    };
  }
  try {
    return { path: realpathSync(dir) };
  } catch {
    return { error: `Could not resolve SSH mount path: ${dir}` };
  }
}

/**
 * @param {{
 *   cwd: string,
 *   skipBuild?: boolean,
 *   userAllowlist?: object,
 *   dockerPath?: string,
 *   mountSsh?: boolean,
 *   sshMountPath?: string | null,
 * }} opts
 */
export function runSandbox(opts) {
  const cwd = opts.cwd || process.cwd();
  if (!existsSync(join(cwd, "package-lock.json"))) {
    return {
      ok: false,
      error: "package-lock.json required for sandbox (npm ci)",
    };
  }

  const sshResolved = resolveSshMountPath({
    sshMountPath: opts.sshMountPath || null,
    mountSsh: !!opts.mountSsh,
  });
  if (sshResolved.error) {
    return { ok: false, error: sshResolved.error };
  }
  const sshHostPath = sshResolved.path || null;

  const dockerBin = opts.dockerPath || "docker";
  const checkDocker = spawnSync(dockerBin, ["info"], { encoding: "utf8" });
  if (checkDocker.status !== 0) {
    return {
      ok: false,
      error: `Docker not available: ${checkDocker.stderr || checkDocker.stdout || "docker info failed"}`,
    };
  }

  if (!opts.skipBuild) {
    const build = spawnSync(
      dockerBin,
      [
        "build",
        "-t",
        IMAGE_TAG,
        "-f",
        join(DOCKER_DIR, "Dockerfile.sandbox"),
        DOCKER_DIR,
      ],
      { encoding: "utf8" }
    );
    if (build.status !== 0) {
      return {
        ok: false,
        error: `docker build failed:\n${build.stderr || build.stdout}`,
      };
    }
  }

  const outDir = mkdtempSync(join(tmpdir(), "npm-sentinel-"));
  try {
    const dockerArgs = [
      "run",
      "--rm",
      "--cap-add=NET_RAW",
      "--cap-add=NET_ADMIN",
    ];

    if (sshHostPath) {
      dockerArgs.push("-e", `GIT_SSH_COMMAND=${GIT_SSH_COMMAND}`);
      dockerArgs.push("-v", `${sshHostPath}:/root/.ssh:ro`);
    }

    dockerArgs.push("-v", `${cwd}:/src:ro`, "-v", `${outDir}:/out`, IMAGE_TAG);

    const run = spawnSync(dockerBin, dockerArgs, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });

    const dnsLogPath = join(outDir, "dns.log");
    const npmLogPath = join(outDir, "npm.log");
    const exitPath = join(outDir, "npm-exit.code");

    let dnsText = "";
    if (existsSync(dnsLogPath)) {
      dnsText = readFileSync(dnsLogPath, "utf8");
    }
    let npmLog = "";
    if (existsSync(npmLogPath)) {
      npmLog = readFileSync(npmLogPath, "utf8");
    }
    let npmExit = 1;
    if (existsSync(exitPath)) {
      npmExit = parseInt(readFileSync(exitPath, "utf8").trim(), 10);
      if (Number.isNaN(npmExit)) npmExit = 1;
    }

    const hosts = extractHostsFromTcpdump(dnsText);
    const allow = resolveDnsAllowlist(opts.userAllowlist);
    const disallowed = filterDisallowedHosts(hosts, allow);

    const dnsViolation = disallowed.length > 0;
    const npmFailed = npmExit !== 0;

    return {
      ok: !dnsViolation && !npmFailed,
      npmExit,
      npmLogTail: npmLog.slice(-8000),
      dnsHostsSample: [...hosts].slice(0, 50),
      disallowedDns: disallowed,
      dockerStderr: run.stderr,
      dockerStdout: run.stdout,
      sshMounted: !!sshHostPath,
    };
  } finally {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
