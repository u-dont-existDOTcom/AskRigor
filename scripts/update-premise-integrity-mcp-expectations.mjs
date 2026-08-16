import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const HRP_PATH = "protocols/HRP_Full.xml";
const UNIVERSAL_PATH = "protocols/Universal_Instructions.xml";
const MCP_TEST_PATH = "tests/mcp-tools.test.ts";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function rootState(text, expectedName) {
  const root = text.match(
    /<Protocol name="([^"]+)" version="([^"]+)" revisionDate="([^"]+)"/
  );
  if (!root) throw new Error(`Unable to parse protocol root for ${expectedName}`);
  if (root[1] !== expectedName) {
    throw new Error(`Expected protocol ${expectedName}, found ${root[1]}`);
  }
  return { name: root[1], version: root[2], revisionDate: root[3] };
}

function replaceManifestExpectation(text, base, target, label) {
  const baseCount = text.split(base).length - 1;
  const targetCount = text.split(target).length - 1;

  if (targetCount === 1 && baseCount === 0) return text;
  if (baseCount !== 1 || targetCount !== 0) {
    throw new Error(
      `${label}: expected exactly one base manifest or one target manifest; base=${baseCount}, target=${targetCount}`
    );
  }
  return text.replace(base, target);
}

const [hrp, universal, originalTests] = await Promise.all([
  readFile(HRP_PATH, "utf8"),
  readFile(UNIVERSAL_PATH, "utf8"),
  readFile(MCP_TEST_PATH, "utf8")
]);

const hrpManifest = rootState(hrp, "HRP");
const universalManifest = rootState(
  universal,
  "AskRigor.com universal saved instructions"
);

if (hrpManifest.version !== "20.5.18" || hrpManifest.revisionDate !== "2026-08-16") {
  throw new Error(
    `HRP must be generated at 20.5.18/2026-08-16 before MCP expectation sync; found ${hrpManifest.version}/${hrpManifest.revisionDate}`
  );
}
if (
  universalManifest.version !== "20.5.12" ||
  universalManifest.revisionDate !== "2026-08-16"
) {
  throw new Error(
    `Universal must be generated at 20.5.12/2026-08-16 before MCP expectation sync; found ${universalManifest.version}/${universalManifest.revisionDate}`
  );
}

const hrpBase = `        manifest: {
          name: "HRP",
          version: "20.5.17",
          revisionDate: "2026-08-13",
          sha256: "d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242"
        },`;
const hrpTarget = `        manifest: {
          name: "HRP",
          version: "${hrpManifest.version}",
          revisionDate: "${hrpManifest.revisionDate}",
          sha256: "${sha256(hrp)}"
        },`;

const universalBase = `          manifest: {
            name: "AskRigor.com universal saved instructions",
            version: "20.5.11",
            revisionDate: "2026-08-07",
            sha256: "1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa"
          }`;
const universalTarget = `          manifest: {
            name: "AskRigor.com universal saved instructions",
            version: "${universalManifest.version}",
            revisionDate: "${universalManifest.revisionDate}",
            sha256: "${sha256(universal)}"
          }`;

let tests = originalTests;
tests = replaceManifestExpectation(tests, hrpBase, hrpTarget, "HRP MCP expectation");
tests = replaceManifestExpectation(
  tests,
  universalBase,
  universalTarget,
  "Universal MCP expectation"
);

await writeFile(MCP_TEST_PATH, tests, "utf8");
console.log(`MCP HRP manifest synchronized to ${hrpManifest.version} sha256=${sha256(hrp)}`);
console.log(
  `MCP Universal manifest synchronized to ${universalManifest.version} sha256=${sha256(universal)}`
);
