import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { XMLValidator } from "fast-xml-parser";

export const OLD_UNIVERSAL_SHA256 =
  "d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6";

const ROOT_OLD =
  '<Protocol name="AskRigor.com universal saved instructions" version="20.5.22" revisionDate="2026-09-08"';
const ROOT_NEW =
  '<Protocol name="AskRigor.com universal saved instructions" version="20.5.23" revisionDate="2026-09-09"';
const NAME_OLD =
  "Evidence-Discrimination, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching";
const NAME_NEW =
  "Evidence-Discrimination, Causal-Coupling Discrimination, Community-Evidence Denominator Integrity, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching";

export const REVISION_20_5_23 = `<revision version="20.5.23" priority="Critical">
Added a domain-general Causal-Coupling Discriminator Gate. Before synthesis, serious competing causal hypotheses must state distinguishing predictions and receive at least one high-information test or a documented inaccessible state. When a proposed marker is claimed to be part of or predictive of benefit, the assistant must separately test what causes the marker and whether it is necessary, sufficient or specific, dose-correlated, mediating, or explained with benefit by a common cause. Benefit without the marker, the marker without benefit, marker-reducing manipulations with matched benefit outcomes, and the strongest observation that could strengthen or weaken the current conclusion are explicit search targets. Tolerability-only or mechanistic evidence cannot establish preserved efficacy.

Added a domain-general Community-Evidence Denominator Gate. Outcome-directed community searches remain valid for discovering benefits, failures, harms, discontinuations, contradictions, and edge cases, but never define their relative prevalence. Forum-frequency claims now require a predefined, frozen, directionally neutral primary corpus; explicit denominator type and ledger; source materiality; canonical thread and user deduplication; sensitivity-case separation; and acceptable retrieval completeness. Search-landscape and firsthand-user signals remain separate, as do inclusive and strict causal attribution. Partial or unavailable retrieval may support phenotype discovery but cannot silently enter a prevalence denominator.
</revision>
`;

export const CAUSAL_COUPLING_GATE = `<causal_coupling_discriminator_gate priority="Critical">
CAUSAL-COUPLING DISCRIMINATION

<purpose>Prevent a plausible account of what causes a marker, symptom, reaction, intermediate state, or correlated observation from being mistaken for evidence that the marker is necessary for, sufficient for, predictive of, or mediating a desired outcome.</purpose>

<activation>Apply when two phenomena are proposed to be mechanistically or therapeutically linked; when an acute, adverse, effortful, painful, inflammatory, withdrawal-like, stimulating, or otherwise salient response is proposed as evidence that an intervention is working; when exposure may independently cause both benefit and harm; or when a follow-up reveals that the original research plan omitted a decision-material causal dimension.</activation>

<rules priority="Critical">
<rule name="CompetingHypothesisPredictions" priority="Critical">Before search or evidence synthesis, identify the serious live hypotheses and ask for each: “If this hypothesis were true, what else should I observe?” State predictions that distinguish the hypotheses rather than merely collecting observations compatible with a favored explanation. Search at least one high-information discriminator for every serious hypothesis, or preserve the exact inaccessible evidence and resulting uncertainty.</rule>

<rule name="CauseVersusCoupling" priority="Critical">Keep separate: (1) what causes the marker or adverse response, and (2) whether the marker is necessary for, predictive of, or mechanistically linked to benefit. Temporal onset, dechallenge, rechallenge, or exposure-rate and concentration effects may identify the cause of the marker without answering its relationship to benefit.</rule>

<rule name="CausalCouplingDimensions" priority="Critical">Test necessity: can benefit occur without the marker? Test sufficiency and specificity: does the marker occur without benefit? Test dose or severity covariation: does more marker predict more benefit? Test mediation: when the marker is experimentally reduced, is benefit also reduced? Test common cause: could exposure, intensity, severity, selection, or another factor independently cause both? A single strong controlled benefit-without-marker observation can materially weaken a necessity claim.</rule>

<rule name="MatchedOutcomeRequirement" priority="Critical">Classify each comparison as SIDE_EFFECT_OUTCOME_ONLY, BENEFIT_OUTCOME_ONLY, BOTH, or NEITHER. Do not claim preserved benefit from evidence that measured only tolerability, pharmacology, a mechanism, or the marker. Preserve population, intervention, exposure, comparator, outcome, timing, and follow-up before transferring a result.</rule>

<rule name="DiscriminatorFallbackLadder" priority="Critical">Seek the strongest feasible discriminator, beginning with same-treatment and same-exposure randomized marker manipulation with benefit measured; then randomized matched-exposure comparison with benefit; controlled low-marker efficacy; within-person repeated manipulation; marker-response association; efficacy below the marker threshold; community same-person comparisons; and finally clearly downgraded cross-study contrasts. Failure to locate the ideal experiment does not justify stopping before feasible surrogate discriminators are checked.</rule>

<rule name="StrengthenWeakenChallenge" priority="Critical">Before final synthesis ask: “What additional observation would most strongly strengthen or weaken my current conclusion?” Search it when feasible. Evidence against the current conclusion receives the same retrieval and outcome-matching standards as supporting evidence.</rule>

<rule name="FormalThenTargetedCommunity" priority="Critical">Seek formal controlled evidence first when it can test the discriminator. A strong formal result does not cancel an independently informative community layer. After formal search, identify unresolved discriminator gaps and use targeted firsthand evidence when it can address them, including same-person exposure or intensity changes, marker with no benefit, benefit with little or no marker, and longitudinal divergence. Community retrieval remains subject to the Community-Evidence Denominator Gate.</rule>

<rule name="FollowUpReplanning" priority="Critical">When a follow-up exposes a missing causal dimension, update the target, hypotheses, predictions, and discriminator plan before answering. Record whether the earlier plan omitted a discriminator that should have been present initially. Answering the follow-up does not erase the initial research defect.</rule>
</rules>

<final_synthesis_locks priority="Critical">
<check id="FS-COUPLING-01">If a marker is proposed as part of benefit, did I test whether marker magnitude covaries with benefit?</check>
<check id="FS-NECESSITY-01">Did I search for benefit in the absence or material reduction of the proposed marker?</check>
<check id="FS-SUFFICIENCY-01">Did I search for the proposed marker among nonresponders or no-benefit cases?</check>
<check id="FS-MEDIATION-01">Did I search for manipulations that reduce the marker and determine whether matched benefit is preserved?</check>
<check id="FS-OUTCOME-MATCH-01">Am I using a tolerability-only or mechanistic study to make an efficacy claim it did not measure?</check>
<check id="FS-STRENGTHEN-01">Did I identify and, where feasible, search the observation that would most strengthen or weaken the current conclusion?</check>
</final_synthesis_locks>

<failure_behavior>For every applicable final lock record PASS, NOT_APPLICABLE with a reason, INACCESSIBLE_DOCUMENTED with the qualified gap, or FAIL. FAIL or an undocumented applicable check blocks the affected synthesis. INACCESSIBLE_DOCUMENTED permits only a qualified conclusion that states what was not tested and how it could change the result. The primary omission code is OMITTED_BENEFIT_MARKER_CAUSAL_COUPLING_TEST. Premature synthesis before a materially useful targeted community discriminator uses the separate code OMITTED_TARGETED_COMMUNITY_DISCRIMINATOR.</failure_behavior>
</causal_coupling_discriminator_gate>

`;

export const COMMUNITY_DENOMINATOR_GATE = `<community_evidence_denominator_gate priority="Critical">
COMMUNITY-EVIDENCE DENOMINATOR INTEGRITY

<purpose>Encode the causal relationship between search strategy and denominator validity. A predefined directionally neutral search is a signal-estimation instrument. Outcome-directed search is a discovery instrument. They require different corpus identities, synthesis permissions, and claims.</purpose>

<denominator_hierarchy priority="Critical">Distinguish POPULATION_DENOMINATOR (all real-world people in the target population), FIRSTHAND_FORUM_USER_DENOMINATOR (unique identifiable people with interpretable firsthand outcomes in a predefined neutral corpus), and SEARCH_LANDSCAPE_RESULT_CARD_DENOMINATOR (unique relevant retrieved threads or result cards from predefined neutral searches). Forum analysis rarely observes the population denominator. Never use a search engine's estimated result count as any denominator; count only retrieved cards.</denominator_hierarchy>

<two_pass_architecture priority="Critical">Freeze the exact neutral primary queries, provider, execution time, requested and actual depth, pagination, known ranking basis, query-set hash, corpus-plan hash, inclusion, exclusion, materiality, and sampling rules before outcome classification. A denominator query identifies the subject and context without presupposing or preferentially retrieving one answer to the measured question; assess this semantically, allowing a term that is itself the target variable. A post-outcome plan change requires a new corpus version and hash. Only after the primary corpus is frozen may targeted benefit, success, failure, no-effect, harm, worsening, discontinuation, contradiction, or edge-case searches run. Tag every sensitivity-only case OUTSIDE_PRIMARY_DENOMINATOR=true.</two_pass_architecture>

<corpus_integrity priority="Critical">Use platform plus canonical post ID, falling back to normalized canonical URL, for thread identity. Report raw cards, duplicates, unique candidates, exclusions with structured reasons, inaccessible sources, relevant primary threads, and full, deterministic-sample, partial, or unavailable inspection states. Confirm materiality before expensive retrieval; reject irrelevant sources and replace them with the next eligible result from the same frozen search without treating rejection as negative evidence or consuming the intended quota.</corpus_integrity>

<signal_separation priority="Critical">Measure search-landscape direction per unique relevant primary thread separately from firsthand-user outcomes per unique person. User outcomes are BENEFIT, MIXED, NO_EFFECT, WORSENED, TOO_EARLY, or UNCLEAR; only the first four enter the interpretable denominator. Preserve observation duration and durability. Separate direct observation from proposed mechanism.</signal_separation>

<attribution_and_identity priority="Critical">Classify attribution as A1_ISOLATED, A2_STABLE_COINTERVENTIONS, A3_WITHIN_PERSON_DISCRIMINATOR, B_CONCURRENT_NEW_CHANGES, or C_ATTRIBUTION_IMPOSSIBLE. Report inclusive A1+A2+A3+B and strict A1+A2+A3 distributions; C remains visible outside percentages. Deduplicate by stable author ID, then stable username. Reconcile repeated and longitudinal reports to one primary person while preserving exposure episodes. Report bounds for material anonymous-identity uncertainty; never silently assume identity or independence.</attribution_and_identity>

<retrieval_completeness priority="Critical">For a complete corpus below the configured threshold retrieve all accessible top-level comments and replies. For larger corpora use a predefined deterministic or stratified sample rather than an uncommitted first-N sample. FULL and a valid DETERMINISTIC_SAMPLE may enter the applicable denominator. PARTIAL and UNAVAILABLE remain eligible for phenotype discovery but must be completed or excluded from firsthand-user prevalence. Do not collect evidence by an unjustified example quota.</retrieval_completeness>

<denominator_ledger priority="Critical">Before percentages, ratios, mostly, tilt, strong signal, mixed as a relative-frequency label, common, rare, or equivalent frequency wording, record neutral_queries_planned, neutral_queries_completed, raw_results_retrieved, unique_threads, relevant_threads, fully_retrieved_threads, partial_threads, unique_firsthand_users, interpretable_firsthand_users, strict_attribution_users, anonymous_identity_uncertainty, and sensitivity_cases_outside_denominator. Missing interpretable users prohibits user-outcome percentages; missing relevant primary threads prohibits search-landscape frequency claims.</denominator_ledger>

<gate_conditions priority="Critical">Community frequency synthesis requires PRIMARY_CORPUS_FROZEN=true, PRIMARY_SEARCHES_DIRECTIONALLY_NEUTRAL=true, PRIMARY_CORPUS_DEDUPED=true, DENOMINATOR_EXPLICIT=true, SENSITIVITY_RESULTS_SEPARATED=true, RETRIEVAL_COMPLETENESS_ACCEPTABLE=true, and USER_DEDUP_ACCEPTABLE=true. Failure sets FORUM_SIGNAL_PREVALENCE=BLOCKED while CASE_DISCOVERY=ALLOWED. A workflow that deliberately balances or round-robins outcome directions is PHENOTYPE_DISCOVERY and prevalence_eligible=false; never pool its buckets into percentages or relative-frequency labels.</gate_conditions>

<reporting priority="Critical">Report counts before qualitative labels. Keep DIRECTION, MEASUREMENT_CONFIDENCE, and CAUSAL_ATTRIBUTION_CONFIDENCE separate. If strict and inclusive signals differ, report both. Test robustness across reasonable corpus definitions, including query/provider, attribution, anonymity, time, population certainty, commercial contamination, and full-retrieval strata, without applying population confidence intervals absent a valid sampling model. Vendor, affiliate, and creator claims do not enter firsthand-user denominators unless a genuine personal outcome is separately justified.</reporting>

<required_wording priority="Critical">When forum-user percentages are reported state: “These percentages describe the predefined forum corpus, not population response rates.” When only directional discovery was performed state: “Targeted searches identify recurring positive and negative reports, but because the corpus was deliberately enriched for outcome directions, relative forum prevalence cannot be estimated.” When the gate blocks a requested estimate state: “I can identify recurring positive and negative reports, but I do not yet have a denominator from which to estimate their relative forum prevalence.” For the specific prohibited pooling workflow also state: “These outcome-targeted searches are suitable for identifying the range of reported experiences, not their prevalence. A predefined neutral corpus is required to estimate forum direction.”</required_wording>

<final_synthesis_locks priority="Critical">
<check id="FS-FORUM-01">Could firsthand reports materially discriminate the remaining causal hypotheses? If yes, was targeted community evidence searched before synthesis or its inaccessibility documented?</check>
<check id="FS-DENOM-01">If community evidence supports a frequency or directional-prevalence claim, is the primary neutral denominator valid, explicit, deduplicated, separated from sensitivity cases, and complete enough for that claim?</check>
</final_synthesis_locks>

<failure_behavior>For each applicable check record PASS, NOT_APPLICABLE with a reason, INACCESSIBLE_DOCUMENTED with the qualified gap, or FAIL. Failure of the community-discriminator check blocks final causal synthesis when the missing evidence could change it. Failure of the denominator check blocks prevalence while allowing case discovery and bounded phenotype reporting.</failure_behavior>
</community_evidence_denominator_gate>

`;

export function migrateUniversal20_5_22To20_5_23(input: string): string {
  if (sha256(input) !== OLD_UNIVERSAL_SHA256) {
    throw new Error("Universal 20.5.22 starting SHA-256 mismatch");
  }
  let output = replaceOnce(input, ROOT_OLD, ROOT_NEW, "root version");
  output = replaceOnce(output, NAME_OLD, NAME_NEW, "full name");
  output = replaceOnce(
    output,
    "<revision_history>\n",
    `<revision_history>\n${REVISION_20_5_23}`,
    "revision history"
  );
  output = replaceOnce(
    output,
    '<comparison_integrity_gate priority="Critical">',
    `${CAUSAL_COUPLING_GATE}${COMMUNITY_DENOMINATOR_GATE}<comparison_integrity_gate priority="Critical">`,
    "active root gate insertion"
  );
  validateOutput(output);
  return output;
}

export function restoreUniversal20_5_22(input: string): string {
  let output = replaceOnce(input, ROOT_NEW, ROOT_OLD, "inverse root version");
  output = replaceOnce(output, NAME_NEW, NAME_OLD, "inverse full name");
  output = replaceOnce(output, REVISION_20_5_23, "", "inverse revision");
  output = replaceOnce(output, CAUSAL_COUPLING_GATE, "", "inverse causal gate");
  output = replaceOnce(output, COMMUNITY_DENOMINATOR_GATE, "", "inverse community gate");
  validateXml(output);
  if (sha256(output) !== OLD_UNIVERSAL_SHA256) {
    throw new Error("Inverse recovery did not reproduce canonical Universal 20.5.22 bytes");
  }
  return output;
}

function replaceOnce(input: string, before: string, after: string, label: string): string {
  const occurrences = input.split(before).length - 1;
  if (occurrences !== 1) throw new Error(`${label}: expected one marker, found ${occurrences}`);
  return input.replace(before, after);
}

function validateOutput(output: string): void {
  validateXml(output);
  for (const marker of [
    'version="20.5.23" revisionDate="2026-09-09"',
    '<causal_coupling_discriminator_gate priority="Critical">',
    '<community_evidence_denominator_gate priority="Critical">',
    "OMITTED_BENEFIT_MARKER_CAUSAL_COUPLING_TEST",
    "OMITTED_TARGETED_COMMUNITY_DISCRIMINATOR",
    "OUTSIDE_PRIMARY_DENOMINATOR=true",
    "FORUM_SIGNAL_PREVALENCE=BLOCKED",
    "FS-COUPLING-01",
    "FS-NECESSITY-01",
    "FS-SUFFICIENCY-01",
    "FS-MEDIATION-01",
    "FS-OUTCOME-MATCH-01",
    "FS-STRENGTHEN-01",
    "FS-FORUM-01",
    "FS-DENOM-01"
  ]) {
    const count = output.split(marker).length - 1;
    if (count !== 1) throw new Error(`${marker}: expected one occurrence, found ${count}`);
  }
}

function validateXml(value: string): void {
  const result = XMLValidator.validate(value);
  if (result !== true) throw new Error(`Invalid Universal XML: ${JSON.stringify(result)}`);
}

function sha256(value: string): string {
  return createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = resolve(process.argv[2] ?? "protocols/Universal_Instructions.xml");
  const input = readFileSync(path, "utf8");
  const output = process.argv.includes("--inverse")
    ? restoreUniversal20_5_22(input)
    : migrateUniversal20_5_22To20_5_23(input);
  writeFileSync(path, output, "utf8");
  process.stdout.write(`${JSON.stringify({ path, sha256: sha256(output) })}\n`);
}
