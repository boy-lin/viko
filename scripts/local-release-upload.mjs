#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const TARGET_META = {
  "aarch64-apple-darwin": {
    platform: "darwin-aarch64",
    updaterPattern: ".app.tar.gz",
    installerPattern: ".dmg",
  },
  "x86_64-apple-darwin": {
    platform: "darwin-x86_64",
    updaterPattern: ".app.tar.gz",
    installerPattern: ".dmg",
  },
  "x86_64-pc-windows-msvc": {
    platform: "windows-x86_64",
    updaterPattern: ".msi",
    installerPattern: ".msi",
  },
};

function parseArgs(argv) {
  const opts = {
    target: "x86_64-pc-windows-msvc",
    version: "",
    skipBuild: false,
    upload: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--target") {
      opts.target = argv[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--target=")) {
      opts.target = a.slice("--target=".length);
    } else if (a === "--version") {
      opts.version = argv[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--version=")) {
      opts.version = a.slice("--version=".length);
    } else if (a === "--skip-build") {
      opts.skipBuild = true;
    } else if (a === "--skip-upload") {
      opts.upload = false;
    } else if (a === "--upload") {
      opts.upload = true;
    } else if (a === "--help" || a === "-h") {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelpAndExit(1);
    }
  }
  return opts;
}

function printHelpAndExit(code) {
  console.log(`
Local release build + upload helper.

Usage:
  node scripts/local-release-upload.mjs [--target <triple>] [--version <x.y.z>] [--skip-build] [--skip-upload]

Defaults:
  --target  x86_64-pc-windows-msvc
  --version package.json version
  --upload  true

Required env:
  when upload enabled:
    UPDATER_API_BASE
    APP_RELEASE_CI_TOKEN  (or UPDATER_API_TOKEN)

Optional env:
  TAURI_SIGNING_PRIVATE_KEY
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD
`);
  process.exit(code);
}

function run(cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}`));
    });
    child.on("error", reject);
  });
}

function runCapture(cmd, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}\n${out}\n${err}`));
    });
    child.on("error", reject);
  });
}

function isAppleTarget(target) {
  return target === "aarch64-apple-darwin" || target === "x86_64-apple-darwin";
}

function normalizeDiskDevice(dev) {
  const m = dev.match(/^\/dev\/disk\d+/);
  return m ? m[0] : dev;
}

function parseBusyDmgDevices(hdiInfoRaw) {
  const lines = hdiInfoRaw.split(/\r?\n/);
  const devices = new Set();
  let sectionDevs = new Set();
  let sectionHasTargetDmg = false;

  const flushSection = () => {
    if (sectionHasTargetDmg) {
      for (const dev of sectionDevs) {
        devices.add(normalizeDiskDevice(dev));
      }
    }
    sectionDevs = new Set();
    sectionHasTargetDmg = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushSection();
      continue;
    }
    if (trimmed.startsWith("/dev/disk")) {
      const dev = trimmed.split(/\s+/)[0];
      sectionDevs.add(dev);
      continue;
    }
    if (
      trimmed.includes("image-path:") &&
      trimmed.includes("/src-tauri/target/") &&
      trimmed.includes("/bundle/dmg/") &&
      trimmed.includes("/rw.") &&
      trimmed.endsWith(".dmg")
    ) {
      sectionHasTargetDmg = true;
    }
  }
  flushSection();
  return [...devices];
}

async function cleanupBusyDmgMounts() {
  let info = "";
  try {
    const { out } = await runCapture("hdiutil", ["info"]);
    info = out;
  } catch (err) {
    console.warn(`[local-release] skip dmg cleanup: cannot run hdiutil info (${String(err)})`);
    return;
  }

  const devices = parseBusyDmgDevices(info);
  if (devices.length === 0) return;

  console.log(`[local-release] cleanup busy dmg mounts: ${devices.join(", ")}`);
  for (const dev of devices) {
    try {
      await runCapture("hdiutil", ["detach", "-force", dev]);
      console.log(`[local-release] detached ${dev}`);
    } catch (err) {
      console.warn(`[local-release] failed to detach ${dev}: ${String(err)}`);
    }
  }
}

function isDmgBusyBuildError(message) {
  return (
    message.includes("bundle_dmg.sh") ||
    message.includes("Resource busy") ||
    message.includes("hdiutil: couldn't unmount") ||
    message.includes("The volume can’t be ejected")
  );
}

async function runTauriBuildWithRetry(target) {
  const args = ["tauri", "build", "--target", target, "--verbose"];
  if (!isAppleTarget(target)) {
    await run("pnpm", args);
    return;
  }

  await cleanupBusyDmgMounts();
  try {
    await run("pnpm", args);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isDmgBusyBuildError(msg)) {
      throw err;
    }
    console.warn("[local-release] mac dmg unmount busy detected, cleanup and retry once...");
    await cleanupBusyDmgMounts();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await run("pnpm", args);
  }
}

async function walkFiles(dir) {
  const result = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      result.push(...(await walkFiles(full)));
    } else if (e.isFile()) {
      result.push(full);
    }
  }
  return result;
}

function firstMatch(files, suffix, excludes = []) {
  return files.find((f) => f.endsWith(suffix) && !excludes.some((x) => f.endsWith(x))) ?? "";
}

function platformKey(platform) {
  return platform.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function parseSignatureFromOutput(raw) {
  const line = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.startsWith("Signature: "));
  if (line) return line.slice("Signature: ".length).trim();

  const candidates = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9+/=]+$/.test(s));
  return candidates[candidates.length - 1] ?? "";
}

async function resolveVersion(versionArg) {
  if (versionArg) return versionArg;
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env ${name}`);
  }
  return v;
}

async function loadEnvFile(filePath) {
  let raw = "";
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function resolveArtifacts(target, meta) {
  const bundleDir = path.join(ROOT, "src-tauri", "target", target, "release", "bundle");
  const files = await walkFiles(bundleDir);

  const updaterPath = firstMatch(files, meta.updaterPattern);
  if (!updaterPath) {
    throw new Error(`Updater artifact not found in ${bundleDir} (${meta.updaterPattern})`);
  }

  const installerPath = firstMatch(files, meta.installerPattern, [".msi.zip"]);
  if (!installerPath) {
    throw new Error(`Installer artifact not found in ${bundleDir} (${meta.installerPattern})`);
  }

  return { bundleDir, updaterPath, installerPath };
}

async function resolveSignature(updaterPath) {
  const sigPath = `${updaterPath}.sig`;
  try {
    const content = await fs.readFile(sigPath, "utf8");
    const sig = content.replace(/\r?\n/g, "").trim();
    if (sig) return sig;
  } catch {
    // no sidecar signature
  }

  const key = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!key) {
    throw new Error(
      `Missing ${sigPath} and TAURI_SIGNING_PRIVATE_KEY is empty. Cannot produce updater signature.`
    );
  }

  const { out, err } = await runCapture("pnpm", ["tauri", "signer", "sign", updaterPath], {
    ...process.env,
    TAURI_PRIVATE_KEY: process.env.TAURI_SIGNING_PRIVATE_KEY,
    TAURI_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
  });
  const sig = parseSignatureFromOutput(`${out}\n${err}`);
  if (!sig || /\s/.test(sig)) {
    throw new Error(`Failed to parse signature from tauri signer output.\n${out}\n${err}`);
  }
  return sig;
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.production.local"));
  await loadEnvFile(path.join(ROOT, ".env.local"));

  const opts = parseArgs(process.argv.slice(2));
  const meta = TARGET_META[opts.target];
  if (!meta) {
    throw new Error(`Unsupported target: ${opts.target}`);
  }

  const version = await resolveVersion(opts.version);
  const updaterApiBase = opts.upload ? requiredEnv("UPDATER_API_BASE") : "";
  const updaterToken = opts.upload
    ? process.env.UPDATER_API_TOKEN || requiredEnv("APP_RELEASE_CI_TOKEN")
    : "";

  console.log(
    `[local-release] target=${opts.target} platform=${meta.platform} version=${version} upload=${opts.upload}`
  );

  if (!opts.skipBuild) {
    await run("pnpm", ["install", "--frozen-lockfile"]);
    await run("pnpm", ["build"]);
    await runTauriBuildWithRetry(opts.target);
  }

  const { updaterPath, installerPath } = await resolveArtifacts(opts.target, meta);

  console.log(`[local-release] updater=${updaterPath}`);
  console.log(`[local-release] installer=${installerPath}`);

  if (!opts.upload) {
    console.log("[local-release] skip upload by config");
    console.log("[local-release] done");
    return;
  }

  const sig = await resolveSignature(updaterPath);
  const key = platformKey(meta.platform);

  const sharedEnv = {
    ...process.env,
    UPDATER_API_BASE: updaterApiBase,
    UPDATER_API_TOKEN: updaterToken,
    UPDATER_VERSION: version,
    UPDATER_PLATFORMS: meta.platform,
  };

  await run("pnpm", ["simulate:updater"], {
    ...sharedEnv,
    UPDATER_ASSET_TYPE: "updater",
    [`UPDATER_FILE_${key}`]: updaterPath,
    [`UPDATER_SIGNATURE_${key}`]: sig,
  });

  await run("pnpm", ["simulate:updater"], {
    ...sharedEnv,
    UPDATER_ASSET_TYPE: "installer",
    [`UPDATER_FILE_${key}`]: installerPath,
  });

  console.log("[local-release] done");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
