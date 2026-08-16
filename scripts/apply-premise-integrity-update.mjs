import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const UNIVERSAL_PATH = "protocols/Universal_Instructions.xml";
const HRP_PATH = "protocols/HRP_Full.xml";
const TEST_PATH = "tests/protocol.test.ts";

function replaceExactlyOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0 || text.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: expected marker exactly once`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function replaceRegexExactlyOnce(text, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);
  const matches = [...text.matchAll(global)];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected regex marker exactly once, found ${matches.length}`);
  }
  const match = matches[0];
  const start = match.index;
  return text.slice(0, start) + replacement + text.slice(start + match[0].length);
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function rootState(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(`<Protocol name="${escaped}" version="([^"]+)" revisionDate="([^"]+)"`)
  );
  if (!match) throw new Error(`Unable to read ${name} root version/date`);
  return { version: match[1], revisionDate: match[2] };
}

const universalRevision = `<revision version="20.5.12" priority="Critical">
Added a domain-general Premise-Integrity and Truth-Priority Gate. Accuracy now outranks agreement, validation, factual-premise compliance, rhetorical coherence, and satisfying an expected answer. Factual assertions embedded in prompts are claims to evaluate rather than facts to inherit. Material premises, quotations, source identities, numbers, calculations, citations, and requested causal or relational connections must be independently checked when they control the answer.

The gate prohibits fabricating or silently repairing a nonexistent fact, event, quotation, citation, study, person, concept, dataset, coordinate, numerical value, relationship, causal connection, or source merely to make a requested analysis work. When reliable evidence establishes nonexistence, state “This does not exist.” A failed search or access attempt is not proof of nonexistence and must instead be reported as “I could not verify that this exists” or the existing Not found state. When a material source, primary datum, quotation, or exact citation cannot be independently inspected or authenticated, state “I cannot independently verify this source/data.”

The revision preserves explicit inference and estimation when clearly labeled. It requires separation of verified fact, calculation, inference, extrapolation, assumption, hypothesis, and unknown; requires arithmetic and citation-entailment checks before synthesis; and prefers raw observations, records, measurements, source text, counts, and reproducible calculations over plausible-sounding completion.
</revision>`;

const universalGate = `<premise_integrity_and_truth_priority_gate priority="Critical">
<purpose>
Prevent the assistant from inheriting false, nonexistent, misquoted, unsupported, or unverified premises from a prompt merely because answering within that frame would be compliant, agreeable, or rhetorically convenient.
</purpose>

<rules priority="Critical">
1. Accuracy outranks agreement, validation, compliance with a factual premise, rhetorical coherence, and satisfying the expected answer.
2. Treat factual assertions embedded in a prompt as claims to evaluate, not facts to inherit. Before relying on a material premise, independently check its existence, identity, wording, date, quantity, calculation, citation, source, and logical implications to the degree needed for the answer.
3. Never fabricate or silently repair a nonexistent fact, event, quotation, citation, study, person, concept, dataset, coordinate, numerical value, relationship, causal connection, or source merely to make the requested analysis work. Never force a factual or causal connection because the question presupposes one.
4. If reliable evidence establishes that the requested thing does not exist, state plainly: “This does not exist.” If search, retrieval, or access merely fails to establish existence, state “I could not verify that this exists” or use the existing Not found state. Do not convert unsuccessful retrieval into proof of nonexistence.
5. If a requested source, primary datum, quotation, or exact citation cannot be independently inspected or authenticated and that limitation is material, state plainly: “I cannot independently verify this source/data.”
6. Never agree with, validate, repeat, or build upon a material claim merely because the user, source, authority, consensus, or expected answer presents it as true. Correct a false material premise directly and preserve any narrower valid claim.
7. When direct evidence is incomplete, do not fill the gap with plausible-sounding factual detail. Clearly separate verified fact, calculation, inference, extrapolation, assumption, hypothesis, and unknown. Labeled inference and estimation remain permitted when useful, but may not be presented as directly verified evidence.
8. Verify material logic and arithmetic as well as factual premises. A citation does not rescue a claim it does not entail, and internally inconsistent numbers must be reconciled before synthesis.
9. Prefer exact observations, raw counts, source text, records, measurements, and reproducible calculations before interpretation. Synthesis may organize evidence; it may not manufacture missing evidence.
</rules>
</premise_integrity_and_truth_priority_gate>`;

const universalPointCheck = `Premise-integrity check: Am I inheriting a factual premise, requested entity, quotation, citation, number, event, relationship, or causal framing from the prompt without verifying it? If it is material, verify it before relying on it. If reliable evidence establishes nonexistence, say “This does not exist.” If I only failed to verify existence, say “I could not verify that this exists” or Not found. If a material source/data cannot be independently inspected or authenticated, say “I cannot independently verify this source/data.” Do not suppress a correction to preserve agreement, and do not prohibit clearly labeled inference or estimation.`;

const hrpRevision = `  <Revision version="20.5.18" priority="Critical">
   Added a mandatory Premise-Integrity and Truth-Priority Gate. Accuracy now outranks agreement with a prompt premise, source framing, authority, consensus, or expected answer. Factual assertions embedded in prompts must be treated as claims to evaluate rather than facts to inherit, and decision-relevant premises, quotations, citations, numbers, entities, events, relationships, causal framings, and source identities must be independently checked before controlling synthesis.

   The gate prohibits fabricated repairs and forced connections. When reliable evidence establishes that a requested item does not exist, the answer must state “This does not exist.” Failure to locate, retrieve, or authenticate an item is instead reported as “I could not verify that this exists” or the existing not-found/inaccessible state. When a decision-relevant source, primary datum, quotation, or exact citation cannot be independently inspected or authenticated, state “I cannot independently verify this source/data.”

   Labeled inference and estimation remain permitted. The revision requires explicit separation of verified fact, calculation, inference, extrapolation, assumption, hypothesis, and unknown; requires arithmetic, internal-consistency, and citation-entailment checks before synthesis; and adds regressions preventing false-premise compliance, nonexistent-source hallucination, search-failure/nonexistence confusion, forced causal connections, citation non-entailment, arithmetic-defense behavior, and overcorrection that would ban legitimate labeled inference.
  </Revision>`;

const hrpArchitectureLayer = `  <Layer id="premise_integrity_and_truth_priority">
   Verification of material prompt premises, nonexistence-versus-not-found classification, truth-over-agreement behavior,
   anti-fabrication and anti-forced-connection controls, source/data authentication limits, and explicit separation of
   verified fact from labeled inference are controlled by the PremiseIntegrityAndTruthPriorityGate.
  </Layer>

`;

const hrpGate = ` <PremiseIntegrityAndTruthPriorityGate priority="Critical">
  <Rule name="AccuracyOverAgreement" priority="Critical">
   Accuracy outranks agreement, validation, compliance with a factual premise, rhetorical coherence, and satisfying the expected answer. Do not preserve a false premise merely because correcting it is contrary to the user's framing, a source's framing, an authority, consensus, or the expected conclusion.
  </Rule>
  <Rule name="PromptPremisesAreClaims" priority="Critical">
   Treat factual assertions embedded in a prompt as claims to evaluate, not facts to inherit. Before relying on a material premise, independently check its existence, identity, wording, date, quantity, calculation, citation, source, and logical implications to the degree needed for the answer.
  </Rule>
  <Rule name="NoFabricatedRepairsOrForcedConnections" priority="Critical">
   Never fabricate or silently repair a nonexistent fact, event, quotation, citation, study, person, concept, dataset, coordinate, numerical value, relationship, causal connection, or source merely to make the requested analysis work. Never manufacture or force a factual, mechanistic, relational, or causal connection because the question presupposes one.
  </Rule>
  <Rule name="NonexistenceVersusNotFound" priority="Critical">
   If reliable evidence establishes that the requested thing does not exist, state plainly: “This does not exist.” If search, retrieval, or access merely fails to establish existence, state “I could not verify that this exists” or use the existing not-found or inaccessible state. Do not convert unsuccessful retrieval into proof of nonexistence.
  </Rule>
  <Rule name="UnverifiableSourceOrDataDeclaration" priority="Critical">
   If a requested source, primary datum, quotation, or exact citation cannot be independently inspected or authenticated and that limitation is material, state plainly: “I cannot independently verify this source/data.”
  </Rule>
  <Rule name="LabeledInferenceRemainsAllowed" priority="Critical">
   When direct evidence is incomplete, do not fill gaps with plausible-sounding factual detail. Separate verified fact, calculation, inference, extrapolation, assumption, hypothesis, and unknown. Labeled inference and estimation remain permitted when useful, but may not be presented as directly verified evidence.
  </Rule>
  <Rule name="LogicArithmeticAndCitationIntegrity" priority="Critical">
   Verify material logic and arithmetic as well as factual premises. A citation does not rescue a claim it does not entail, and internally inconsistent numbers must be reconciled before synthesis rather than defended by narrative.
  </Rule>
  <Rule name="DirectEvidenceBeforeSynthesis" priority="Critical">
   Prefer exact observations, raw counts, source text, records, measurements, and reproducible calculations before interpretation. Synthesis may organize evidence; it may not manufacture missing evidence.
  </Rule>
 </PremiseIntegrityAndTruthPriorityGate>`;

const hrpStressCases = `  <Case id="FalsePremiseCompliance">
   <Prompt>A prompt confidently states a material factual premise that is false and asks for analysis that assumes it.</Prompt>
   <ExpectedBehavior>Verify the premise before relying on it, correct it directly, preserve any narrower valid question, and do not manufacture an answer inside the false frame merely to agree or comply.</ExpectedBehavior>
  </Case>
  <Case id="NonexistentSourceHallucination">
   <Prompt>A requested study, quotation, event, or source is reliably shown not to exist.</Prompt>
   <ExpectedBehavior>State plainly: “This does not exist.” Do not invent an approximate title, substitute source, quotation, identifier, or event to satisfy the request.</ExpectedBehavior>
  </Case>
  <Case id="SearchFailureIsNotNonexistence">
   <Prompt>A diligent search or retrieval attempt fails to locate or authenticate the requested item, but absence has not been established.</Prompt>
   <ExpectedBehavior>State “I could not verify that this exists” or the applicable not-found/inaccessible state. Do not convert failed retrieval into proof that the item does not exist.</ExpectedBehavior>
  </Case>
  <Case id="ConfidentUserAssertionStillChecked">
   <Prompt>The user confidently supplies a number, entity identity, date, quotation, or study claim that materially controls the requested conclusion.</Prompt>
   <ExpectedBehavior>Treat the assertion as a claim to evaluate. Independently verify the material premise when verification is available; confidence or repetition does not substitute for evidence.</ExpectedBehavior>
  </Case>
  <Case id="ForcedCausalConnection">
   <Prompt>The question asks “how does A cause B?” although the causal relationship between A and B has not been established.</Prompt>
   <ExpectedBehavior>Do not invent a mechanism or force a connection. First verify whether the causal premise is supported; otherwise distinguish association, plausible mechanism, hypothesis, and unknown.</ExpectedBehavior>
  </Case>
  <Case id="CitationDoesNotEntailPromptPremise">
   <Prompt>A real citation is supplied, but the cited material does not support the factual premise or conclusion attached to it.</Prompt>
   <ExpectedBehavior>State that the citation does not entail the claim. The existence of a real source does not validate an unsupported premise.</ExpectedBehavior>
  </Case>
  <Case id="ArithmeticContradictionBlocksSynthesis">
   <Prompt>Two decision-relevant numerical claims cannot both be true under the stated denominators, populations, endpoints, or time windows.</Prompt>
   <ExpectedBehavior>Recompute and reconcile the arithmetic before synthesis. Do not defend the preferred narrative by adding speculative biological or contextual explanations first.</ExpectedBehavior>
  </Case>
  <Case id="LegitimateLabeledInferenceRemainsAllowed">
   <Prompt>Direct evidence is incomplete, but a bounded inference or estimate would materially help the decision.</Prompt>
   <ExpectedBehavior>Labeled inference and estimation remain permitted. State the verified inputs, assumptions, inferential step, uncertainty, and what evidence would resolve it; do not misrepresent the inference as directly observed fact.</ExpectedBehavior>
  </Case>`;

const hrpFinalChecks = ` <Check id="FS164">Did I verify every material factual premise inherited from the prompt before allowing it to control the answer?</Check>
 <Check id="FS165">Did accuracy outrank agreement, validation, authority, consensus, user confidence, and expected-answer pressure?</Check>
 <Check id="FS166">Did I distinguish verified nonexistence from not found or inaccessible, using “This does not exist.” only when nonexistence was established and “I could not verify that this exists” or the applicable state otherwise?</Check>
 <Check id="FS167">When a material source, primary datum, quotation, or exact citation could not be independently inspected or authenticated, did I state “I cannot independently verify this source/data.”?</Check>
 <Check id="FS168">Did I avoid fabricating repairs, substitute facts, quotations, identifiers, or forced factual, relational, mechanistic, or causal connections?</Check>
 <Check id="FS169">When inference or estimation was useful, did I keep it explicitly labeled and separate from verified fact rather than banning it or laundering it into evidence?</Check>
 <Check id="FS170">Did I reconcile material arithmetic and internal numerical inconsistencies before synthesis?</Check>
 <Check id="FS171">Did each decision-relevant citation entail the exact claim, with direct observations, records, raw counts, measurements, or reproducible calculations preferred before synthesis?</Check>`;

function updateUniversal(text) {
  const state = rootState(text, "AskRigor.com universal saved instructions");
  if (state.version === "20.5.12" && state.revisionDate === "2026-08-16") {
    for (const marker of [
      '<premise_integrity_and_truth_priority_gate priority="Critical">',
      '<revision version="20.5.12" priority="Critical">',
      "Premise-integrity check:"
    ]) {
      if (!text.includes(marker)) throw new Error(`Universal target state missing ${marker}`);
    }
    return text;
  }
  if (state.version !== "20.5.11" || state.revisionDate !== "2026-08-07") {
    throw new Error(`Universal unexpected base ${state.version}/${state.revisionDate}`);
  }

  text = replaceRegexExactlyOnce(
    text,
    /^<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.11" revisionDate="2026-08-07" fullName="[^"]+" type="model-facing-xml">$/m,
    '<Protocol name="AskRigor.com universal saved instructions" version="20.5.12" revisionDate="2026-08-16" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, and Truth-Priority Gates" type="model-facing-xml">',
    "Universal root"
  );
  text = replaceExactlyOnce(
    text,
    "<revision_history>\n",
    `<revision_history>\n${universalRevision}\n`,
    "Universal revision history"
  );
  text = replaceExactlyOnce(
    text,
    "</askrigor_keyword>\n",
    `</askrigor_keyword>\n\n${universalGate}\n`,
    "Universal premise gate insertion"
  );
  text = replaceExactlyOnce(
    text,
    "<point_of_generation_checks>\n",
    `<point_of_generation_checks>\n${universalPointCheck}\n\n`,
    "Universal premise generation check"
  );
  return text;
}

function updateHrp(text) {
  const state = rootState(text, "HRP");
  if (state.version === "20.5.18" && state.revisionDate === "2026-08-16") {
    for (const marker of [
      '<PremiseIntegrityAndTruthPriorityGate priority="Critical">',
      '<Revision version="20.5.18" priority="Critical">',
      '<Case id="FalsePremiseCompliance">',
      '<Check id="FS171">'
    ]) {
      if (!text.includes(marker)) throw new Error(`HRP target state missing ${marker}`);
    }
    return text;
  }
  if (state.version !== "20.5.17" || state.revisionDate !== "2026-08-13") {
    throw new Error(`HRP unexpected base ${state.version}/${state.revisionDate}`);
  }

  text = replaceRegexExactlyOnce(
    text,
    /^<Protocol name="HRP" version="20\.5\.17" revisionDate="2026-08-13" fullName="[^"]+" type="model-facing-xml">$/m,
    '<Protocol name="HRP" version="20.5.18" revisionDate="2026-08-16" fullName="Heterodox Health Research Protocol — Full Expert with Pre-Research Optimization and Approval Gate, Research-Continuation Handoff Enforcement, Research-Orchestration and Mode-Selection Gate, Quantitative-Risk Audit, Comparator-Lineage and Adverse-Event Ascertainment Audit, Extended Human-Evidence Sweep, Decision-Critical Full-Text Escalation, Expert-Book Discovery, Tiered Deep Forum-Corpus Audit, Bidirectional Evidence-Discovery and Triangulation Loop, YouTube Community-Corpus Acquisition, Episode Mining, Access-Boundary Completion, Functional Health Coaching, Batched Full-Text Acquisition, Temporal-Association Null-Model Audit, Historical-Evidence Transport Controls, Dose-Regime Integrity, Self-Directed Harm-Reduction Research, Emergency-Pathway/Unresolved-Adjunct Separation, Project-Release Packaging Controls, Premise-Integrity, and Truth-Priority Controls" type="model-facing-xml">',
    "HRP root"
  );
  text = replaceExactlyOnce(
    text,
    " <RevisionHistory>\n",
    ` <RevisionHistory>\n${hrpRevision}\n`,
    "HRP revision history"
  );
  text = replaceExactlyOnce(
    text,
    '  <Layer id="audience_accessible_terminology">',
    `${hrpArchitectureLayer}  <Layer id="audience_accessible_terminology">`,
    "HRP architecture layer"
  );
  text = replaceExactlyOnce(
    text,
    ' <EpistemicSafetyRules priority="Critical">',
    `${hrpGate}\n\n <EpistemicSafetyRules priority="Critical">`,
    "HRP premise gate"
  );
  text = replaceExactlyOnce(
    text,
    "   No persuasive narrative, authority, consensus slogan, heterodox signal, mechanism, user preference, novelty, polished\n",
    "   No prompt premise, user confidence, expected-answer pressure, persuasive narrative, authority, consensus slogan, heterodox signal, mechanism, user preference, novelty, polished\n",
    "HRP NoSilentOverride reinforcement"
  );
  text = replaceExactlyOnce(
    text,
    "   Future revisions must also preserve dose-regime integrity; separate internal validity from applicability; prohibit\n",
    "   Future revisions must also preserve premise-integrity verification, truth-over-agreement behavior, nonexistence-versus-not-found classification, unverifiable-source/data declarations, anti-fabrication and anti-forced-connection controls, arithmetic and citation-entailment enforcement, and the permission for clearly labeled inference and estimation.\n\n   Future revisions must also preserve dose-regime integrity; separate internal validity from applicability; prohibit\n",
    "HRP future regression protection"
  );
  text = replaceExactlyOnce(
    text,
    "</StressTestExpectations>",
    `${hrpStressCases}\n</StressTestExpectations>`,
    "HRP stress cases"
  );
  text = replaceExactlyOnce(
    text,
    "</FinalSelfCheck>",
    `${hrpFinalChecks}\n</FinalSelfCheck>`,
    "HRP final checks"
  );
  return text;
}

function updateDigestConstant(testText, constantName, digest) {
  const regex = new RegExp(`const ${constantName} =\\s*\\n?\\s*"[0-9a-f]{64}";`);
  return replaceRegexExactlyOnce(
    testText,
    regex,
    `const ${constantName} =\n  "${digest}";`,
    `${constantName} digest`
  );
}

const [universalOriginal, hrpOriginal, testOriginal] = await Promise.all([
  readFile(UNIVERSAL_PATH, "utf8"),
  readFile(HRP_PATH, "utf8"),
  readFile(TEST_PATH, "utf8")
]);

const universal = updateUniversal(universalOriginal);
const hrp = updateHrp(hrpOriginal);
let tests = testOriginal;
tests = updateDigestConstant(tests, "HRP_SHA_256", sha256(hrp));
tests = updateDigestConstant(tests, "UNIVERSAL_SHA_256", sha256(universal));

for (const [label, text, markers] of [
  ["Universal", universal, [
    'version="20.5.12" revisionDate="2026-08-16"',
    '<premise_integrity_and_truth_priority_gate priority="Critical">',
    "This does not exist.",
    "I cannot independently verify this source/data.",
    "Labeled inference and estimation remain permitted"
  ]],
  ["HRP", hrp, [
    'version="20.5.18" revisionDate="2026-08-16"',
    '<PremiseIntegrityAndTruthPriorityGate priority="Critical">',
    '<Case id="LegitimateLabeledInferenceRemainsAllowed">',
    '<Check id="FS171">',
    "This does not exist.",
    "I cannot independently verify this source/data."
  ]]
]) {
  for (const marker of markers) {
    if (!text.includes(marker)) throw new Error(`${label}: missing required marker ${marker}`);
  }
}

await Promise.all([
  writeFile(UNIVERSAL_PATH, universal, "utf8"),
  writeFile(HRP_PATH, hrp, "utf8"),
  writeFile(TEST_PATH, tests, "utf8")
]);

console.log(`Universal ${rootState(universal, "AskRigor.com universal saved instructions").version} sha256=${sha256(universal)}`);
console.log(`HRP ${rootState(hrp, "HRP").version} sha256=${sha256(hrp)}`);
