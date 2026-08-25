#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const EXPECTED_FILES = [
  ".codex-plugin/plugin.json",
  "assets/askrigor-composer-icon.svg",
  "assets/askrigor-logo.svg",
  "skills/askrigor/SKILL.md",
  "skills/browser-archive-downloading/GVSU-REFERENCE.md",
  "skills/browser-archive-downloading/SCENARIOS.md",
  "skills/browser-archive-downloading/SKILL.md",
  "skills/browser-archive-downloading/SUCCESS-PROFILE.json",
];
const PACKAGE_ROOTS = [".codex-plugin", "assets", "skills"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function filesBelow(directory, relative = "") {
  const entries = await readdir(resolve(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesBelow(directory, path));
    else files.push(path);
  }
  return files;
}

export async function createPluginPackageReceipt(packageRoot) {
  const root = resolve(packageRoot);
  const actualFiles = (await Promise.all(
    PACKAGE_ROOTS.map((path) => filesBelow(root, path)),
  )).flat().sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_FILES)) {
    throw new Error(
      `Plugin package inventory mismatch. Expected ${EXPECTED_FILES.join(", ")}; ` +
      `received ${actualFiles.join(", ")}.`,
    );
  }

  const inventory = [];
  for (const path of actualFiles) {
    const absolutePath = resolve(root, path);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Plugin package member is not a regular file: ${path}`);
    }
    const bytes = await readFile(absolutePath);
    inventory.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }

  const manifest = JSON.parse(
    await readFile(resolve(root, ".codex-plugin/plugin.json"), "utf8"),
  );
  if (manifest.name !== "askrigor" || typeof manifest.version !== "string") {
    throw new Error("Plugin manifest identity is not the expected AskRigor package.");
  }
  const packageDigestInput = inventory
    .map(({ path, bytes, sha256: digest }) => `${path}\0${bytes}\0${digest}\n`)
    .join("");
  return {
    schema_version: 1,
    package_name: manifest.name,
    package_version: manifest.version,
    package_sha256: sha256(Buffer.from(packageDigestInput, "utf8")),
    inventory,
  };
}

if (import.meta.main) {
  const packageRoot = process.argv[2] ?? process.cwd();
  try {
    process.stdout.write(`${JSON.stringify(await createPluginPackageReceipt(packageRoot), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
