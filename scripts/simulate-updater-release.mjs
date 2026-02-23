#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.UPDATER_API_BASE;
const PRESIGN_ENDPOINT = `${API_BASE}/presign`;
const ASSET_ENDPOINT = `${API_BASE}/asset`;
const TOKEN = process.env.UPDATER_API_TOKEN;

const VERSION = process.env.UPDATER_VERSION ?? "0.1.1";
const CONTENT_TYPE = process.env.UPDATER_CONTENT_TYPE ?? "application/octet-stream";
const ASSET_TYPE = process.env.UPDATER_ASSET_TYPE ?? "updater";
const PLATFORMS = (process.env.UPDATER_PLATFORMS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function platformKey(platform) {
  return platform.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function authHeaders() {
  if (!TOKEN) return {};
  return { Authorization: `Bearer ${TOKEN}` };
}

async function requestJson(url, init) {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${url}\n${typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}`);
  }
  if (parsed && typeof parsed === "object" && "code" in parsed) {
    if (parsed.code !== 0) {
      throw new Error(`API code ${parsed.code} ${url}\n${JSON.stringify(parsed, null, 2)}`);
    }
    return parsed.data;
  }
  return parsed;
}

function requirePlatforms() {
  if (PLATFORMS.length === 0) {
    throw new Error(
      "UPDATER_PLATFORMS is required and cannot be empty. " +
        "Example: UPDATER_PLATFORMS=darwin-aarch64,windows-x86_64"
    );
  }
}

async function loadPayload(platform) {
  const key = platformKey(platform);
  const explicit = process.env[`UPDATER_FILE_${key}`];
  if (!explicit) {
    throw new Error(
      `[${platform}] missing UPDATER_FILE_${key}. ` +
        "Please provide the built artifact path for this platform."
    );
  }

  const data = await fs.readFile(explicit);
  return {
    filename: path.basename(explicit),
    data,
    sourcePath: explicit,
  };
}

async function uploadOne(platform) {
  const key = platformKey(platform);
  const signature = process.env[`UPDATER_SIGNATURE_${key}`];
  if (ASSET_TYPE === "updater" && !signature) {
    throw new Error(
      `[${platform}] missing UPDATER_SIGNATURE_${key}. ` +
        "Please provide the updater signature for this artifact."
    );
  }
  const { filename, data, sourcePath } = await loadPayload(platform);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");

  console.log(`\n[${platform}] preparing upload`);
  console.log(`[${platform}] file: ${filename} (${data.length} bytes) from ${sourcePath}`);

  const presignPayload = {
    version: VERSION,
    platform,
    asset_type: ASSET_TYPE,
    filename,
    contentType: CONTENT_TYPE,
    size: data.length,
    sha256,
  };

  const presign = await requestJson(PRESIGN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(presignPayload),
  });

  const uploadMethod = presign.method ?? "PUT";
  const uploadHeaders = { ...(presign.headers ?? {}) };
  const uploadUrl = presign.uploadUrl;
  const publicUrl = presign.publicUrl;
  const uploadId = presign.uploadId ?? null;
  const objectKey = presign.objectKey ?? null;
  const contentDisposition = presign.contentDisposition ?? presign.content_disposition;

  if (!uploadUrl || !publicUrl) {
    throw new Error(`[${platform}] presign response missing uploadUrl/publicUrl ${JSON.stringify(presign)}`);
  }
  if (!uploadId) {
    throw new Error(`[${platform}] presign response missing uploadId`);
  }
  if (!objectKey) {
    throw new Error(`[${platform}] presign response missing objectKey`);
  }

  if (!uploadHeaders["content-disposition"] && !uploadHeaders["Content-Disposition"]) {
    if (contentDisposition) {
      uploadHeaders["content-disposition"] = contentDisposition;
    } else {
      const signedHeaders = new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") ?? "";
      if (signedHeaders.includes("content-disposition")) {
        throw new Error(
          `[${platform}] presign requires content-disposition in signature, but server did not return exact header value. ` +
            `Please return it in presign response as data.headers["content-disposition"] or data.contentDisposition.`
        );
      }
    }
  }

  const uploadResp = await fetch(uploadUrl, {
    method: uploadMethod,
    headers: uploadHeaders,
    body: data,
  });

  if (!uploadResp.ok) {
    let errorBody = "";
    try {
      errorBody = await uploadResp.text();
    } catch {
      errorBody = "";
    }
    throw new Error(
      `[${platform}] upload failed: HTTP ${uploadResp.status} ${uploadUrl}\n${errorBody}`
    );
  }
  console.log(`[${platform}] upload ok -> ${publicUrl}`);

  const assetPayload = {
    version: VERSION,
    platform,
    asset_type: ASSET_TYPE,
    url: publicUrl,
    filename,
    objectKey,
    sha256,
    size: data.length,
    uploadId,
  };
  if (signature) {
    assetPayload.signature = signature;
  }

  const asset = await requestJson(ASSET_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(assetPayload),
  });

  console.log(`[${platform}] asset registered ${JSON.stringify(asset)}`);
  return asset;
}

async function main() {
  requirePlatforms();
  if (ASSET_TYPE !== "updater" && ASSET_TYPE !== "installer") {
    throw new Error(
      `Unsupported UPDATER_ASSET_TYPE=${ASSET_TYPE}. ` +
        "Allowed values: updater, installer."
    );
  }

  console.log("simulate updater release");
  console.log(`version=${VERSION} asset_type=${ASSET_TYPE} platforms=${PLATFORMS.join(",")}`);
  console.log(`presign=${PRESIGN_ENDPOINT}`);
  console.log(`asset=${ASSET_ENDPOINT}`);

  for (const platform of PLATFORMS) {
    await uploadOne(platform);
  }
  console.log(`\n[done] uploaded ${PLATFORMS.length} asset(s)`);
}

main().catch((err) => {
  console.error("\n[error]");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
