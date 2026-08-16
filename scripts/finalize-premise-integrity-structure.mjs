import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const HRP_PATH = "protocols/HRP_Full.xml";
const PROTOCOL_TEST_PATH = "tests/protocol.test.ts";
const MCP_TEST_PATH = "tests/mcp-tools.test.ts";
const CURRENT_DIGEST = "791c6e33b791c375d9a1861d7a0eae430ac656c658312b40b5dd4ed1fa367b26";

function replaceExactlyOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0 || text.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: expected marker exactly once`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const [originalHrp, originalProtocolTests, originalMcpTests] = await Promise.all([
  readFile(HRP_PATH, "utf8"),
  readFile(PROTOCOL_TEST_PATH, "utf8"),
  readFile(MCP_TEST_PATH, "utf8")
]);

if (!originalHrp.includes('version="20.5.18" revisionDate="2026-08-16"')) {
  throw new Error("Expected HRP 20.5.18 / 2026-08-16 before structural finalization");
}

let hrp = originalHrp;
const revisionPattern = /  <Revision version="20\.5\.18" priority="Critical">[\s\S]*?  <\/Revision>\n/;
const revisionMatches = [...hrp.matchAll(new RegExp(revisionPattern.source, "g"))];
if (revisionMatches.length !== 1) {
  throw new Error(`Expected exactly one HRP 20.5.18 revision block, found ${revisionMatches.length}`);
}
const revisionBlock = revisionMatches[0][0];
hrp = hrp.replace(revisionPattern, "");
hrp = replaceExactlyOnce(
  hrp,
  "</RevisionHistory>",
  `${revisionBlock}</RevisionHistory>`,
  "HRP revision-history terminator"
);

hrp = replaceExactlyOnce(
  hrp,
  "Protocol execution controls activation, completion, and compliance labeling. The AudienceAccessibleTerminologyGate controls",
  "Protocol execution controls activation, completion, and compliance labeling. The PremiseIntegrityAndTruthPriorityGate controls verification of material prompt premises, nonexistence classification, truth-over-agreement behavior, and labeled inference boundaries. The AudienceAccessibleTerminologyGate controls",
  "HRP SingleSourceOfTruth premise gate wiring"
);

hrp = replaceExactlyOnce(
  hrp,
  "may override a failed safety, research-",
  "may override a failed premise-integrity, safety, research-",
  "HRP NoSilentOverride premise-integrity check"
);

const revision17 = hrp.indexOf('<Revision version="20.5.17" priority="Critical">');
const revision18 = hrp.indexOf('<Revision version="20.5.18" priority="Critical">');
if (revision17 < 0 || revision18 <= revision17) {
  throw new Error("HRP 20.5.18 revision is not chronologically after 20.5.17");
}
if (!hrp.includes("PremiseIntegrityAndTruthPriorityGate controls verification of material prompt premises")) {
  throw new Error("HRP SingleSourceOfTruth premise integration missing");
}
if (!hrp.includes("failed premise-integrity, safety")) {
  throw new Error("HRP NoSilentOverride premise-integrity check missing");
}

const newDigest = sha256(hrp);
let protocolTests = replaceExactlyOnce(
  originalProtocolTests,
  CURRENT_DIGEST,
  newDigest,
  "protocol-test HRP digest"
);
let mcpTests = replaceExactlyOnce(
  originalMcpTests,
  CURRENT_DIGEST,
  newDigest,
  "MCP-test HRP digest"
);

await Promise.all([
  writeFile(HRP_PATH, hrp, "utf8"),
  writeFile(PROTOCOL_TEST_PATH, protocolTests, "utf8"),
  writeFile(MCP_TEST_PATH, mcpTests, "utf8")
]);

console.log(`HRP 20.5.18 structural integration finalized; sha256=${newDigest}`);
