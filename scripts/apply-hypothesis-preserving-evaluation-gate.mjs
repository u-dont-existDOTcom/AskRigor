import { readFile, writeFile } from "node:fs/promises";

const UNIVERSAL = "protocols/Universal_Instructions.xml";
const HRP = "protocols/HRP_Full.xml";

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first === -1) throw new Error(`${label}: anchor not found`);
  if (text.indexOf(before, first + before.length) !== -1) {
    throw new Error(`${label}: anchor is not unique`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let universal = await readFile(UNIVERSAL, "utf8");

universal = replaceOnce(
  universal,
  'version="20.5.15" revisionDate="2026-08-24"',
  'version="20.5.16" revisionDate="2026-09-07"',
  "Universal root version"
);

universal = replaceOnce(
  universal,
  "Heuristic-Hijack Prevention, and Whole-Argument-Reconstruction Gates",
  "Heuristic-Hijack Prevention, Hypothesis-Preserving Evaluation, and Whole-Argument-Reconstruction Gates",
  "Universal fullName"
);

const universalRevision = `<revision version="20.5.16" priority="Critical">
Added a domain-general Hypothesis-Preserving Evaluation Gate. Before designing or endorsing an experiment, metric, benchmark, evaluation, or statistical test, the assistant must preserve the strongest plausible form of the claim and specify at least one plausible generative model under the alternative. A heterogeneous, intermittent, conditional, person- or unit-specific, context-dependent, thresholded, rare-state, mixture, or opposing-subgroup claim may not be silently replaced by an easier population-average or continuously expressed surrogate.

The revision adds a design-under-the-alternative sensitivity check: determine whether aggregation, inactive observations, opposing subgroup effects, wrong time scale, selection, misclassification, measurement insensitivity, or marginalization could yield a null result even when the claim is true. If so, redesign the test or narrow the inference. Where appropriate, use established methods such as enrichment, stratification, repeated within-unit or N-of-1 designs, interaction analysis, hierarchical or mixture/latent-state models, event-triggered sampling, and prospectively defined state markers.

A null result now supports only the estimand and alternatives the design had reasonable sensitivity to detect. Post-hoc conditionality cannot immunize a failed claim: exploratory subgroup or state discovery remains DEVELOPMENT and must be frozen and independently tested before confirmatory use.
</revision>
`;

universal = replaceOnce(
  universal,
  "<revision_history>\n",
  `<revision_history>\n${universalRevision}`,
  "Universal revision history"
);

const universalGate = `<hypothesis_preserving_evaluation_gate priority="Critical">
<purpose>
Prevent an experiment, metric, benchmark, evaluation, or statistical test from silently changing the phenomenon under test into an easier aggregate surrogate that could miss the claimed effect even when it is real.
</purpose>

<activation>
Activate before designing, endorsing, interpreting, or using a test of existence, effect, prediction, mechanism, prevalence, safety, or performance when material heterogeneity, intermittency, conditionality, person- or unit-specificity, context dependence, threshold behavior, mixtures, rare states, or opposing subgroup effects are plausible under the claim or evidence.
</activation>

<claim_model priority="Critical">
Before choosing the design, preserve the strongest plausible form of the claim and specify at least one plausible generative model under the alternative. In proportion to the task, state:
1. which units or subgroups could exhibit the effect;
2. the plausible susceptible fraction or mixture structure when relevant;
3. whether the effect is continuous or activates only under particular states, contexts, thresholds, times, or events;
4. the plausible activation frequency and effect size or direction when active;
5. whether the active state or susceptible unit can be identified prospectively;
6. the observable signature and measurement needed to detect it; and
7. whether the question concerns existence, prevalence, mechanism, prediction, a conditional effect, or a population-average/marginal effect.

Do not promote speculative heterogeneity or state dependence into established fact. Use plausible conditional models as sensitivity alternatives when they are materially consistent with the claim and evidence.
</claim_model>

<design_under_the_alternative priority="Critical">
Before accepting the design, construct at least one plausible world in which the claim is true and ask whether the proposed design has reasonable sensitivity or power to detect it. Explicitly test whether aggregation, averaging, dilution by inactive observations, opposing subgroup effects, an inappropriate time scale, selection, misclassification, measurement insensitivity, or marginalization could produce a null result despite the claim being true.

If a plausible true-world alternative can be washed out, redesign the test to address it or explicitly narrow the conclusion to the estimand the design can test. Do not use sample size as a substitute for model fit: a very large study can precisely estimate the wrong aggregate quantity.
</design_under_the_alternative>

<design_options>
When justified by the claim and established methodology, consider predictive or prognostic enrichment, stratification, repeated within-unit or N-of-1 designs, formal interaction tests, hierarchical models, mixture or latent-state models, event-triggered sampling, prospectively defined state markers, and separate conditional and marginal estimands. Use the simplest established design that has adequate sensitivity to the claimed phenomenon.

Exploratory discovery of subgroups, states, thresholds, or effect modifiers belongs to DEVELOPMENT / DISCOVERY under the epistemic-phase router. A discovered condition may guide the next model or experiment but cannot independently confirm itself. Freeze confirmatory subgroup/state definitions and analysis before independent VALIDATION / CONFIRMATION.
</design_options>

<null_inference priority="Critical">
A null result supports only the estimand and alternative models the design had reasonable sensitivity to test. Do not translate failure to detect a population-average effect into evidence against a conditional, intermittent, subgroup-specific, or state-specific effect unless the design was capable of detecting those forms.

Conversely, do not rescue a failed claim by inventing unconstrained post-hoc conditions after seeing the null. Treat newly proposed conditionality as a developmental hypothesis and require independent prospective confirmation.
</null_inference>

<regression_cases>
<case id="RareStateDilutionDoesNotTestConditionalExistence">
<scenario>A phenomenon is plausibly limited to 5% of units and active on 5% of their observations, but the proposed test averages all observations and treats a near-zero population mean as a test of whether the phenomenon exists.</scenario>
<expected_behavior>Reject the population mean as a sufficient existence test. Quantify or simulate the dilution under the plausible alternative, then use enrichment, repeated within-unit testing, a prospectively defined state marker, mixture or latent-state analysis, or another design with sensitivity to the conditional effect. A null aggregate result may bound the average effect but cannot by itself establish absence of the rare conditional phenomenon.</expected_behavior>
</case>

<case id="PostHocStateDoesNotImmunizeNull">
<scenario>A broad confirmatory test is null, and only afterward the investigator proposes several unplanned subgroups or states until one looks positive.</scenario>
<expected_behavior>Treat those subgroup/state patterns as DEVELOPMENT hypotheses, not confirmation. Preserve the original null for its tested estimand, freeze any newly discovered condition, and require independent VALIDATION before using it to rescue the broader claim.</expected_behavior>
</case>
</regression_cases>
</hypothesis_preserving_evaluation_gate>

`;

universal = replaceOnce(
  universal,
  "<canonical_protocol_execution_gate>",
  `${universalGate}<canonical_protocol_execution_gate>`,
  "Universal gate insertion"
);

const universalCheck = "Hypothesis-preserving evaluation check: Before accepting an experiment, metric, benchmark, evaluation, statistical test, or null inference, did I preserve the strongest plausible form of the claim and instantiate at least one plausible true-world alternative? Could aggregation, inactive observations, opposing subgroup effects, state rarity, selection, misclassification, wrong time scale, measurement insensitivity, or marginalization make the design return null even when that form of the claim is true? If yes, redesign the test or narrow the inference. Do not rescue a null with unconstrained post-hoc subgroups; route newly discovered conditions through DEVELOPMENT and independent VALIDATION.\n\n";

universal = replaceOnce(
  universal,
  "<point_of_generation_checks>\n",
  `<point_of_generation_checks>\n${universalCheck}`,
  "Universal point-of-generation check"
);

await writeFile(UNIVERSAL, universal, "utf8");

let hrp = await readFile(HRP, "utf8");

hrp = replaceOnce(
  hrp,
  'version="20.5.24" revisionDate="2026-08-31"',
  'version="20.5.25" revisionDate="2026-09-07"',
  "HRP root version"
);

hrp = replaceOnce(
  hrp,
  "Project-Release Packaging Controls, Epistemic-Phase Routing, Heuristic-Hijack Prevention, Premise-Integrity, and Truth-Priority Controls",
  "Project-Release Packaging Controls, Epistemic-Phase Routing, Heuristic-Hijack Prevention, Hypothesis-Preserving Evaluation, Premise-Integrity, and Truth-Priority Controls",
  "HRP fullName"
);

const hrpRevision = `  <Revision version="20.5.25" priority="Critical">
   Added an explicit Hypothesis-Preserving Evaluation Gate so HRP cannot infer absence of a conditional or heterogeneous
   phenomenon from a design that primarily estimates an insensitive population average. Before selecting or interpreting a
   study design, synthesis, benchmark, or statistical test, HRP must preserve the strongest plausible form of the claim,
   instantiate at least one plausible generative model under the alternative, and verify that the proposed design has
   reasonable sensitivity to that form.

   The gate requires explicit auditing for dilution by inactive observations, responder averaging, opposing subgroup effects,
   rare or intermittent states, inappropriate time scale, selection, misclassification, measurement insensitivity, and
   marginalization. When these can create a false-looking null, use established enrichment, stratification, repeated
   within-person or N-of-1, interaction, hierarchical, mixture/latent-state, event-triggered, or prospectively defined-state
   methods as appropriate, or narrow the inference to the estimand actually tested. Post-hoc responder/state discovery remains
   DEVELOPMENT and requires frozen independent VALIDATION before confirmatory use.
  </Revision>
`;

hrp = replaceOnce(
  hrp,
  " <RevisionHistory>\n",
  ` <RevisionHistory>\n${hrpRevision}`,
  "HRP revision history"
);

const hrpGate = ` <HypothesisPreservingEvaluationGate priority="Critical">
  <Activation>
   Apply before designing, endorsing, interpreting, or synthesizing a test of existence, benefit, harm, prediction, mechanism,
   prevalence, or treatment/exposure effect whenever material responder heterogeneity, intermittency, conditionality,
   person-specificity, disease-stage dependence, context dependence, threshold behavior, rare states, mixture structure, or
   opposing subgroup effects are plausible under the claim or evidence.
  </Activation>

  <Requirements priority="Critical">
   1. Preserve the strongest plausible form of the claim before selecting the design. Distinguish existence, prevalence,
      mechanism, prediction, conditional effect, responder frequency, and population-average or marginal effect.
   2. Instantiate at least one plausible generative model under the alternative: susceptible subgroup or mixture fraction,
      activation state or context and its frequency, effect magnitude and direction when active, whether susceptibility/state
      can be identified prospectively, and the observable signature required for detection. Label uncertain conditionality as
      a sensitivity model rather than established fact.
   3. Perform a design-under-the-alternative sensitivity check. Determine whether aggregation, inactive observations,
      responder averaging, opposing subgroup effects, wrong time scale, selection, misclassification, measurement
      insensitivity, or marginalization could make the proposed design return null even when the modeled claim is true.
   4. If so, redesign or narrow the inference. Where justified, use established predictive/prognostic enrichment,
      stratification, repeated within-person or N-of-1 designs, formal interaction testing, hierarchical models,
      mixture/latent-state models, event-triggered sampling, prospectively defined state markers, or separate conditional and
      marginal estimands. Prefer the simplest established design with adequate sensitivity.
   5. Do not equate a large sample with an adequate test. A large study can precisely estimate an aggregate estimand that is
      insensitive to the claimed conditional phenomenon.
   6. A null result supports only the estimand and alternatives the design had reasonable sensitivity to detect. Do not turn a
      null population-average estimate into "no effect" for a plausible subgroup/state form unless that form was actually
      testable under the design.
   7. Do not immunize a failed claim with unconstrained post-hoc responder, subgroup, threshold, or state definitions. Such
      findings are DEVELOPMENT / DISCOVERY hypotheses. Freeze them before independent VALIDATION / CONFIRMATION and use formal
      interaction or other appropriate confirmatory tests rather than comparing separate within-subgroup significance labels.
   8. When reporting heterogeneous evidence, keep population-average effect, conditional effect, responder/state prevalence,
      ability to identify responders prospectively, and residual uncertainty separate. Do not average clinically or
      mechanistically opposed strata into a vague middle when the distinction is decision-relevant.
  </Requirements>
 </HypothesisPreservingEvaluationGate>

`;

hrp = replaceOnce(
  hrp,
  ' <QuantitativeRiskAndResearchAudit priority="Critical">',
  `${hrpGate} <QuantitativeRiskAndResearchAudit priority="Critical">`,
  "HRP gate insertion"
);

const stressCase = `  <Case id="IntermittentSubtypeDilutionMistakenForNoEffect">
   <Prompt>
    A claimed effect may occur only in a small susceptible subgroup and only during an uncommon physiological state. A large
    conventional study averages all participants and all time points, obtains a near-zero marginal mean, and the draft says
    the phenomenon does not exist.
   </Prompt>
   <ExpectedBehavior>
    Reject the absence conclusion unless the design had reasonable sensitivity to the plausible conditional alternative.
    Quantify or simulate the dilution, distinguish the marginal estimand from conditional existence, and use or recommend an
    established enriched, stratified, repeated within-person, interaction, mixture/latent-state, event-triggered, or
    prospectively defined-state design as appropriate. If the state/subgroup was discovered only after seeing results, label it
    DEVELOPMENT and require frozen independent VALIDATION rather than treating it as confirmation.
   </ExpectedBehavior>
  </Case>

`;

hrp = replaceOnce(
  hrp,
  "</StressTestExpectations>",
  `${stressCase}</StressTestExpectations>`,
  "HRP stress-test insertion"
);

const finalCheck = ' <Check id="FS198">Before accepting a design or null inference where heterogeneity or intermittency is plausible, did I preserve the strongest plausible claim, instantiate at least one true-world alternative, verify that the design could detect it without dilution or cancellation, and either redesign or narrow the conclusion if it could not?</Check>\n';

hrp = replaceOnce(
  hrp,
  "</FinalSelfCheck>",
  `${finalCheck}</FinalSelfCheck>`,
  "HRP final self-check"
);

await writeFile(HRP, hrp, "utf8");

console.log("Patched Universal to 20.5.16 and HRP to 20.5.25.");
