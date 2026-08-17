import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const UNIVERSAL_PATH = "protocols/Universal_Instructions.xml";
const HRP_PATH = "protocols/HRP_Full.xml";
const PROTOCOL_TEST_PATH = "tests/protocol.test.ts";
const STATE_PATH = "project/CODEX-CURRENT-STATE.md";

const BASE_VERSION = "20.5.12";
const BASE_DATE = "2026-08-16";
const TARGET_VERSION = "20.5.13";
const TARGET_DATE = "2026-08-17";
const OLD_UNIVERSAL_SHA =
  "3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7";
const EXPECTED_HRP_SHA =
  "4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5";

const ACTIVE_SCAN_ROOTS = [
  "apps",
  "packages",
  "project",
  "skills",
  "tests",
  "AGENTS.md",
  "CURRENT-STATE.md",
  "README.md"
];

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function replaceExactlyOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`${label}: marker not found`);
  if (text.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: marker occurs more than once`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function count(text, marker) {
  return text.split(marker).length - 1;
}

function requireExactlyOnce(text, marker, label = marker) {
  const occurrences = count(text, marker);
  if (occurrences !== 1) {
    throw new Error(`${label}: expected exactly once, found ${occurrences}`);
  }
}

function rootState(text) {
  const match = text.match(
    /<Protocol name="AskRigor\.com universal saved instructions" version="([^"]+)" revisionDate="([^"]+)"/
  );
  if (!match) throw new Error("Unable to read Universal root version/date");
  return { version: match[1], revisionDate: match[2] };
}

const revision = `<revision version="20.5.13" priority="Critical">
Added a domain-general Whole-Argument Reconstruction Gate. Before criticizing, fact-checking, summarizing, editing, or transforming a substantial source, reconstruct the complete claim across its exact wording, operative object, modality, definitions, qualifications, examples, exceptions, and callbacks. A sentence-local quotation is not enough when the argument is distributed across the source.

The gate prevents narrow claims from being broadened during paraphrase, true behavior labels from being erased when later context explains them, existing concepts from being called missing when the real defect is delayed setup or unclear placement, generic outside frameworks from replacing the source's own architecture, and unaddressed proposals from disappearing after selective feedback.

Substantive repairs now require exact current text and location, the worker's exact reading, a source-wide concept trace, precise defect classification, exact replacement or movement, preserved claims and uncertainty, affected architecture or map nodes, and any evidence needed. If an objection disappears after reconstruction, it must be withdrawn rather than replaced merely to preserve the appearance of progress.
</revision>`;

const gate = `<whole_argument_reconstruction_gate priority="Critical">
<purpose>
Prevent sentence-local or fragment-local readings from changing the source's actual argument before critique, fact-checking, summarization, editing, or transformation.
</purpose>

<core_invariant priority="Critical">
Reconstruct the whole argument before judging or changing any part of it.
</core_invariant>

<activation>
Apply whenever the task depends on a substantial source whose controlling claim may be distributed across sections, definitions, examples, qualifications, exceptions, later applications, or an architecture map. Use proportional effort for short, self-contained passages; do not turn a simple direct edit into unnecessary bureaucracy.
</activation>

<rules priority="Critical">
1. Recover the complete current source boundary and its current architecture or map when one exists. Do not substitute a remembered theme, excerpt, search snippet, stale draft, or sentence-local reading.
2. For every proposed defect, quote the exact local passage and trace every other passage where the same concept is defined, qualified, narrowed, contradicted, exemplified, excepted, or applied later.
3. Reconstruct the claim with its full grammar and scope: subject or actor, action or relation, operative object, chronology, modality and certainty, population or domain, exceptions and concessions, evidence or epistemic status, and later qualification or callback.
4. State the complete reconstructed claim before evaluating it. Never broaden, narrow, universalize, decontextualize, or change its modality while paraphrasing. A rebuttal that applies only to the altered paraphrase does not rebut the source.
5. Classify the actual defect precisely as a factual conflict, local ambiguity, concept introduced too late, unclear primary explanatory home, unclear transition or causal dependency, repeated proof, genuine contradiction, or no defect.
6. If the objection disappears after reconstruction, withdraw it. Do not manufacture a replacement criticism merely to preserve the appearance of progress.
7. Do not force a choice between an accurate behavioral label and a broader context. A person may have lied, withdrawn, shouted, forgotten, or broken an agreement; mental illness, confusion, fear, incapacity, coercion, or another mechanism may explain the behavior without making the accurate behavioral label false. Preserve the movement accurate behavioral label → broader context unless the source actually retracts the label.
8. Distinguish missing content from missing setup. Identify the concept's first seed, primary explanatory home, and later applications. Prefer a clearer transition, short setup seed, or movement of existing prose over duplicating an argument already present elsewhere.
9. When the owner or reviewer responds selectively, apply every explicit correction and preserve every unaddressed proposal in the active durable ledger. Silence is approval only when the owner has established that bounded silence-as-approval convention for the current review. If a correction changes an unaddressed proposal, record the dependency rather than silently dropping it.
10. Before replacing the source's framework with a generic professional, clinical, academic, product, legal, or safety framework, show the exact conflict in the source. External frameworks may supplement analysis; they may not be presented as repairs for omissions that disappear after source-wide reconstruction.
11. Every substantive proposed repair must provide: exact current text and location; the worker's exact reading; the complete concept trace; the defect classification; exact replacement, deletion, or movement; the claims, qualifications, actors, severity, and uncertainty that remain unchanged; affected architecture or map nodes; and evidence needed if the objection is factual.
12. Keep the analysis structured when needed, but integrate approved prose naturally. Do not insert mechanical epistemic labels, audit jargon, or incident-report structure into memoir, argument, or conversational prose unless the artifact itself requires that form.
13. Before completion, run a whole-source cold read and verify that every criticism targets the source's actual claim, every relevant qualification was considered, no proposed fix merely repeats an existing argument, contextualization did not retract a behavior the source still affirms, no live proposal disappeared, and the source architecture still matches setup, primary home, and callbacks.
</rules>
</whole_argument_reconstruction_gate>`;

const pointCheck = `Whole-argument reconstruction check: Before criticizing, fact-checking, summarizing, editing, or transforming a substantial source, did I recover the complete current boundary, quote the exact disputed passage, trace its definitions, qualifications, examples, exceptions, and callbacks, preserve the operative object and modality, and state the reconstructed claim before evaluation? Did I distinguish missing content from late setup or unclear placement, preserve an accurate behavior label when context explains rather than retracts it, carry every unaddressed proposal forward under the owner's actual review convention, and withdraw any objection that disappeared after reconstruction?`;

async function updateUniversal() {
  let text = await readFile(UNIVERSAL_PATH, "utf8");
  const state = rootState(text);

  if (state.version === TARGET_VERSION && state.revisionDate === TARGET_DATE) {
    for (const marker of [
      '<revision version="20.5.13" priority="Critical">',
      '<whole_argument_reconstruction_gate priority="Critical">',
      "Whole-argument reconstruction check:"
    ]) {
      requireExactlyOnce(text, marker);
    }
    return { text, changed: false, digest: sha256(text) };
  }

  if (state.version !== BASE_VERSION || state.revisionDate !== BASE_DATE) {
    throw new Error(
      `Universal unexpected base ${state.version}/${state.revisionDate}; expected ${BASE_VERSION}/${BASE_DATE}`
    );
  }

  const oldRoot = '<Protocol name="AskRigor.com universal saved instructions" version="20.5.12" revisionDate="2026-08-16" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, and Truth-Priority Gates" type="model-facing-xml">';
  const newRoot = '<Protocol name="AskRigor.com universal saved instructions" version="20.5.13" revisionDate="2026-08-17" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, Truth-Priority, and Whole-Argument-Reconstruction Gates" type="model-facing-xml">';
  text = replaceExactlyOnce(text, oldRoot, newRoot, "Universal root");

  const revisionMarker = '<revision version="20.5.12" priority="Critical">';
  text = replaceExactlyOnce(
    text,
    revisionMarker,
    `${revision}\n${revisionMarker}`,
    "revision insertion"
  );

  const gateMarker =
    '</premise_integrity_and_truth_priority_gate>\n\n<point_of_generation_checks>';
  text = replaceExactlyOnce(
    text,
    gateMarker,
    `</premise_integrity_and_truth_priority_gate>\n\n${gate}\n\n<point_of_generation_checks>`,
    "gate insertion"
  );

  const pointMarker = '<point_of_generation_checks>\nPremise-integrity check:';
  text = replaceExactlyOnce(
    text,
    pointMarker,
    `<point_of_generation_checks>\n${pointCheck}\n\nPremise-integrity check:`,
    "point-of-generation insertion"
  );

  for (const marker of [
    '<revision version="20.5.13" priority="Critical">',
    '<whole_argument_reconstruction_gate priority="Critical">',
    "Reconstruct the whole argument before judging or changing any part of it.",
    "accurate behavioral label",
    "bounded silence-as-approval convention",
    "Whole-argument reconstruction check:"
  ]) {
    requireExactlyOnce(text, marker);
  }

  await writeFile(UNIVERSAL_PATH, text, "utf8");
  return { text, changed: true, digest: sha256(text) };
}

function updateUniversalManifestTriples(text) {
  const patterns = [
    /(name:\s*"AskRigor\.com universal saved instructions",[\s\S]{0,160}?version:\s*)"20\.5\.12"([\s\S]{0,100}?revisionDate:\s*)"2026-08-16"/g,
    /("name"\s*:\s*"AskRigor\.com universal saved instructions",[\s\S]{0,160}?"version"\s*:\s*)"20\.5\.12"([\s\S]{0,100}?"revisionDate"\s*:\s*)"2026-08-16"/g
  ];
  let output = text;
  for (const pattern of patterns) {
    output = output.replace(pattern, '$1"20.5.13"$2"2026-08-17"');
  }
  return output;
}

async function updateProtocolTest(newDigest) {
  let text = await readFile(PROTOCOL_TEST_PATH, "utf8");
  text = replaceExactlyOnce(
    text,
    `const UNIVERSAL_SHA_256 =\n  "${OLD_UNIVERSAL_SHA}";`,
    `const UNIVERSAL_SHA_256 =\n  "${newDigest}";`,
    "protocol-test Universal digest"
  );

  text = replaceExactlyOnce(
    text,
    'name: "AskRigor.com universal saved instructions",\n      version: "20.5.12",\n      revisionDate: "2026-08-16"',
    'name: "AskRigor.com universal saved instructions",\n      version: "20.5.13",\n      revisionDate: "2026-08-17"',
    "protocol-test Universal manifest"
  );

  text = replaceExactlyOnce(
    text,
    'it("requires the Universal 20.5.12 premise-integrity and truth-priority gate", async () => {',
    'it("preserves the Universal 20.5.12 premise-integrity and truth-priority gate", async () => {',
    "protocol-test preserved-gate title"
  );

  await writeFile(PROTOCOL_TEST_PATH, text, "utf8");
}

async function updateState(newDigest) {
  let text = await readFile(STATE_PATH, "utf8");
  text = replaceExactlyOnce(
    text,
    `Universal \`20.5.12\` / 2026-08-16 / \`${OLD_UNIVERSAL_SHA}\``,
    `Universal \`20.5.13\` / 2026-08-17 / \`${newDigest}\``,
    "current-state Universal receipt"
  );

  const marker =
    "- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`\n";
  if (!text.includes("Whole-argument reconstruction integration:")) {
    text = replaceExactlyOnce(
      text,
      marker,
      `${marker}- Whole-argument reconstruction integration: canonical Universal \`20.5.13\` adds the source-wide reconstruction gate promoted from \`u-dont-existDOTcom/universal-dev-architecture/patterns/whole-argument-reconstruction.md\`; HRP bytes remain unchanged.\n`,
      "current-state integration note"
    );
  }

  await writeFile(STATE_PATH, text, "utf8");
}

async function collectFiles(entry) {
  const info = await stat(entry);
  if (info.isFile()) return [entry];
  if (!info.isDirectory()) return [];
  const files = [];
  for (const child of await readdir(entry)) {
    if ([".git", "node_modules", "dist"].includes(child)) continue;
    files.push(...(await collectFiles(path.join(entry, child))));
  }
  return files;
}

async function reconcileActiveIdentity(newDigest) {
  const files = [];
  for (const root of ACTIVE_SCAN_ROOTS) {
    try {
      files.push(...(await collectFiles(root)));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  for (const file of [...new Set(files)]) {
    if ([UNIVERSAL_PATH, PROTOCOL_TEST_PATH, STATE_PATH, HRP_PATH].includes(file)) continue;
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    let next = text.replaceAll(OLD_UNIVERSAL_SHA, newDigest);
    next = updateUniversalManifestTriples(next);
    if (next !== text) await writeFile(file, next, "utf8");
  }

  const stale = [];
  for (const file of [...new Set(files)]) {
    if (file === HRP_PATH) continue;
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes(OLD_UNIVERSAL_SHA)) stale.push(`${file}: old Universal digest`);
  }
  if (stale.length) {
    throw new Error(`Unhandled active Universal identity references:\n${stale.join("\n")}`);
  }
}

async function main() {
  const hrp = await readFile(HRP_PATH, "utf8");
  if (sha256(hrp) !== EXPECTED_HRP_SHA) {
    throw new Error("HRP bytes differ from the declared unchanged boundary");
  }

  const universal = await updateUniversal();
  await updateProtocolTest(universal.digest);
  await updateState(universal.digest);
  await reconcileActiveIdentity(universal.digest);

  const finalUniversal = await readFile(UNIVERSAL_PATH, "utf8");
  if (sha256(finalUniversal) !== universal.digest) {
    throw new Error("Universal digest changed after identity reconciliation");
  }
  if (sha256(await readFile(HRP_PATH, "utf8")) !== EXPECTED_HRP_SHA) {
    throw new Error("HRP bytes changed during Universal update");
  }

  console.log(`Universal ${TARGET_VERSION} / ${TARGET_DATE}`);
  console.log(`Universal SHA-256 ${universal.digest}`);
  console.log(`HRP unchanged ${EXPECTED_HRP_SHA}`);
}

await main();
