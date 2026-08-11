#!/usr/bin/env node
import { writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

function fail(message) {
  writeSync(2, `Compose delta rejected: ${message}\n`);
  process.exit(1);
}

if (process.argv.length !== 4) {
  fail("expected <base-render.json> <candidate-render.json>");
}

let base;
let candidate;
try {
  [base, candidate] = await Promise.all(
    process.argv.slice(2).map(async (path) => JSON.parse(await readFile(path, "utf8")))
  );
} catch {
  fail("render is missing or invalid JSON");
}

const baseCaddy = base?.services?.caddy;
const candidateCaddy = candidate?.services?.caddy;
if (!baseCaddy || !candidateCaddy) fail("both renders must contain caddy");
if (candidateCaddy.image !== baseCaddy.image) fail("candidate Caddy image differs from production");
if (!/(?:^|\/)caddy(?::[^@\s]+)?@sha256:[0-9a-f]{64}$/i.test(candidateCaddy.image ?? "")) {
  fail("candidate must use the exact pinned production Caddy image");
}

const baseVolumes = Array.isArray(baseCaddy.volumes) ? baseCaddy.volumes : [];
const candidateVolumes = Array.isArray(candidateCaddy.volumes) ? candidateCaddy.volumes : [];
const byTarget = (volumes, label) => {
  const result = new Map();
  for (const volume of volumes) {
    if (!volume || typeof volume.target !== "string" || result.has(volume.target)) {
      fail(`${label} Caddy volumes must have unique targets`);
    }
    result.set(volume.target, volume);
  }
  return result;
};
const baseByTarget = byTarget(baseVolumes, "production");
const candidateByTarget = byTarget(candidateVolumes, "candidate");
const configTarget = "/etc/caddy/Caddyfile";
const siteTarget = "/srv/askrigor-site";
if (!baseByTarget.has(configTarget)) fail("production Caddyfile mount is missing");
if (baseByTarget.has(siteTarget)) fail("production render already contains the public-site mount");
if (candidateByTarget.size !== baseByTarget.size + 1) fail("candidate has an unexpected Caddy volume delta");

const exactReviewedBind = (volume, source, target) => {
  const expected = {
    type: "bind",
    source,
    target,
    read_only: true,
    bind: { create_host_path: false }
  };
  return isDeepStrictEqual(volume, expected);
};
if (!exactReviewedBind(
  candidateByTarget.get(configTarget),
  "/opt/askrigor/site/state/Caddyfile",
  configTarget
)) fail("candidate Caddyfile mount is not the reviewed read-only bind");
if (!exactReviewedBind(
  candidateByTarget.get(siteTarget),
  "/opt/askrigor/site/current",
  siteTarget
)) fail("candidate site mount is not the reviewed read-only bind");

for (const [target, baseVolume] of baseByTarget) {
  if (target === configTarget) continue;
  if (!isDeepStrictEqual(candidateByTarget.get(target), baseVolume)) {
    fail(`candidate changes the existing Caddy volume at ${target}`);
  }
}

const normalizedCandidateCaddy = structuredClone(candidateCaddy);
normalizedCandidateCaddy.volumes = structuredClone(baseVolumes);
if (!isDeepStrictEqual(normalizedCandidateCaddy, baseCaddy)) {
  fail("candidate changes Caddy configuration outside the two reviewed mounts");
}

const normalizedCandidate = structuredClone(candidate);
normalizedCandidate.services.caddy = structuredClone(baseCaddy);
if (!isDeepStrictEqual(normalizedCandidate, base)) {
  fail("candidate changes configuration outside the two reviewed Caddy mounts");
}
