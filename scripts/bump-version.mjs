#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error("Usage: node scripts/bump-version.mjs <version>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(nextVersion)) {
  console.error(`Invalid version: ${nextVersion}`);
  process.exit(1);
}

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");

async function updatePackageJson() {
  const raw = await fs.readFile(packageJsonPath, "utf8");
  const json = JSON.parse(raw);
  json.version = nextVersion;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`);
}

async function updateTauriConf() {
  const raw = await fs.readFile(tauriConfPath, "utf8");
  const json = JSON.parse(raw);
  json.version = nextVersion;
  await fs.writeFile(tauriConfPath, `${JSON.stringify(json, null, 2)}\n`);
}

async function updateCargoToml() {
  const raw = await fs.readFile(cargoTomlPath, "utf8");
  const updated = raw.replace(
    /^version\s*=\s*"[^"]*"/m,
    `version = "${nextVersion}"`
  );
  if (updated === raw) {
    throw new Error("Failed to update version in src-tauri/Cargo.toml");
  }
  await fs.writeFile(cargoTomlPath, updated);
}

await updatePackageJson();
await updateTauriConf();
await updateCargoToml();

console.log(`Version bumped to ${nextVersion}`);
