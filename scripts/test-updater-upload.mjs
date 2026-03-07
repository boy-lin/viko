#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const opts = {
    file: "",
    platform: "darwin-aarch64",
    version: "",
    type: "updater",
    contentType: "application/octet-stream",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file") {
      opts.file = argv[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--file=")) {
      opts.file = a.slice("--file=".length);
    } else if (a === "--platform") {
      opts.platform = argv[i + 1] ?? opts.platform;
      i += 1;
    } else if (a.startsWith("--platform=")) {
      opts.platform = a.slice("--platform=".length);
    } else if (a === "--version") {
      opts.version = argv[i + 1] ?? "";
      i += 1;
    } else if (a.startsWith("--version=")) {
      opts.version = a.slice("--version=".length);
    } else if (a === "--type") {
      opts.type = argv[i + 1] ?? opts.type;
      i += 1;
    } else if (a.startsWith("--type=")) {
      opts.type = a.slice("--type=".length);
    } else if (a === "--content-type") {
      opts.contentType = argv[i + 1] ?? opts.contentType;
      i += 1;
    } else if (a.startsWith("--content-type=")) {
      opts.contentType = a.slice("--content-type=".length);
    } else if (a === "-h" || a === "--help") {
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
Usage:
  node scripts/test-updater-upload.mjs --file <artifact_path> [options]

Options:
  --platform <name>       default: darwin-aarch64
  --version <x.y.z>       default: package.json version
  --type <updater|installer>   default: updater
  --content-type <mime>   default: application/octet-stream

Examples:
  node scripts/test-updater-upload.mjs --file src-tauri/target/aarch64-apple-darwin/release/bundle/macos/viko.app.tar.gz
  node scripts/test-updater-upload.mjs --file ./a.dmg --type installer --platform darwin-aarch64
`);
  process.exit(code);
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

async function resolveVersion(versionArg) {
  if (versionArg) return versionArg;
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
  return pkg.version;
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function requestJson(url, init) {
  let resp;
  try {
    resp = await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error ${init?.method ?? "GET"} ${url}\n${msg}`);
  }
  const text = await resp.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!resp.ok) {
    throw new Error(
      `HTTP ${resp.status} ${init?.method ?? "GET"} ${url}\n${
        typeof body === "string" ? body : JSON.stringify(body, null, 2)
      }`
    );
  }
  if (body && typeof body === "object" && "code" in body) {
    if (body.code !== 0) {
      throw new Error(`API code ${body.code} ${url}\n${JSON.stringify(body, null, 2)}`);
    }
    return body.data;
  }
  return body;
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.production.local"));
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.file) printHelpAndExit(1);
  if (opts.type !== "updater" && opts.type !== "installer") {
    throw new Error(`--type must be updater or installer, got: ${opts.type}`);
  }

  const API_BASE = requiredEnv("UPDATER_API_BASE");
  const TOKEN = process.env.UPDATER_API_TOKEN || requiredEnv("APP_RELEASE_CI_TOKEN");
  const PRESIGN_ENDPOINT = `${API_BASE}/presign`;
  const ASSET_ENDPOINT = `${API_BASE}/asset`;
  const version = await resolveVersion(opts.version);
  const sourcePath = path.resolve(ROOT, opts.file);
  const data = await fs.readFile(sourcePath);
  const filename = path.basename(sourcePath);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");

  const authHeaders = { Authorization: `Bearer ${TOKEN}` };

  console.log(`[test-upload] file=${sourcePath}`);
  console.log(`[test-upload] size=${data.length} sha256=${sha256}`);
  console.log(`[test-upload] version=${version} platform=${opts.platform} type=${opts.type}`);
  console.log(`[test-upload] presign=${PRESIGN_ENDPOINT}`);

  const presign = await requestJson(PRESIGN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      version,
      platform: opts.platform,
      asset_type: opts.type,
      filename,
      contentType: opts.contentType,
      size: data.length,
      sha256,
    }),
  });

  const uploadUrl = presign.uploadUrl;
  const publicUrl = presign.publicUrl;
  const uploadId = presign.uploadId ?? null;
  const objectKey = presign.objectKey ?? null;
  const uploadMethod = presign.method ?? "PUT";
  const uploadHeaders = { ...(presign.headers ?? {}) };
  const contentDisposition = presign.contentDisposition ?? presign.content_disposition;
  if (!uploadHeaders["content-disposition"] && !uploadHeaders["Content-Disposition"] && contentDisposition) {
    uploadHeaders["content-disposition"] = contentDisposition;
  }

  if (!uploadUrl || !publicUrl || !uploadId || !objectKey) {
    throw new Error(`[test-upload] invalid presign payload: ${JSON.stringify(presign, null, 2)}`);
  }

  console.log(`[test-upload] upload method=${uploadMethod}`);
  console.log(`[test-upload] upload to r2...`);

  let uploadResp;
  try {
    uploadResp = await fetch(uploadUrl, {
      method: uploadMethod,
      headers: uploadHeaders,
      body: data,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause ? `\nCause: ${String(err.cause)}` : "";
    throw new Error(`[test-upload] upload request failed\n${msg}${cause}`);
  }

  if (!uploadResp.ok) {
    const t = await uploadResp.text().catch(() => "");
    throw new Error(`[test-upload] upload failed HTTP ${uploadResp.status}\n${t}`);
  }
  console.log(`[test-upload] upload ok -> ${publicUrl}`);

  const payload = {
    version,
    platform: opts.platform,
    asset_type: opts.type,
    url: publicUrl,
    filename,
    objectKey,
    sha256,
    size: data.length,
    uploadId,
  };

  if (opts.type === "updater") {
    const key = opts.platform.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const sig = process.env[`UPDATER_SIGNATURE_${key}`];
    if (sig) payload.signature = sig;
  }

  const asset = await requestJson(ASSET_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  });

  console.log(`[test-upload] asset register ok`);
  console.log(JSON.stringify(asset, null, 2));
}

main().catch((err) => {
  console.error("[test-upload] failed");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

