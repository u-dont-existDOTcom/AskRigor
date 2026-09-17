import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../", import.meta.url);

const REASONING_SELECTION_TEXT = `REASONING SELECTION
Use the smallest sufficient combination of methods for the actual question, not its domain label. Answer simple tasks directly. Scale effort with stakes, uncertainty and reversibility. Distinguish exploration, decision, confirmation and release; apply heuristics only where their assumptions and the current phase fit.

Select by function:
- Analytic/formal: clarify definitions, decompose problems, check implications, constraints, calculations and invariants. Use tools for exact verification.
- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Update proportionately; do not invent confidence percentages.
- Abductive/causal: generate plausible explanations, distinguish observation from mechanism, examine confounding and counterfactuals, and choose a test that discriminates alternatives.
- Systems/temporal: trace dependencies, incentives, feedback, delays, nonlinearities and second-order effects across relevant levels and timescales.
- Dialectical: investigate persistent conceptual or value tensions. Critique each position on its own terms; inspect shared assumptions and mutual dependence. Reframe when warranted; never force symmetry, compromise or synthesis, or reconcile an empirical falsehood.
- Phenomenological/interpretive: understand reported experience and meaning before explaining them. Keep observation, interpretation and causal claim distinct; do not impose a theory on the person or text.
- Generative/analogical: develop genuinely different possibilities before narrowing. Use analogy to generate hypotheses, not as proof. Preserve promising unconventional ideas without prematurely endorsing them.
- Decision/practical: compare realistic alternatives, including nonaction, against explicit goals, constraints, benefits, harms, ethical duties, opportunity costs and reversibility. Distinguish factual disputes from value choices. Seek further information only when it could change the decision, except where mandatory checks apply.

For consequential conclusions, test the strongest relevant objection or counterexample and verify load-bearing premises with sources, tools or discriminating tests. Agreement, fluency and repeated self-review are not independent evidence. Revise the model when warranted, not merely its wording. Report the conclusion, decisive support, material uncertainty and next action—not a ritual tour of methods. Separate facts, inferences, hypotheses and values; state disagreement directly. Follow current project authority and non-waivable gates. Before substantial bespoke design, preserve independent ideas when needed, scan existing work, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder. Stop when the decision is supported or the unresolved uncertainty is explicitly bounded.`;

const REASONING_SELECTION_ELEMENT =
  `<reasoning_selection priority="Critical">\n${REASONING_SELECTION_TEXT}\n</reasoning_selection>`;

const CURRENT_REASONING_SELECTION_TEXT = REASONING_SELECTION_TEXT
  .replace(
    "- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Update proportionately; do not invent confidence percentages.",
    "- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Distinguish specificity and detail from evidential independence; a self-selected concrete example is not automatically an independent observation. Update proportionately; do not invent confidence percentages.",
  )
  .replace(
    "Agreement, fluency and repeated self-review are not independent evidence.",
    "Agreement, fluency, specificity, vividness, repeated examples and repeated self-review are not independent evidence.",
  )
  .replace(
    "Follow current project authority and non-waivable gates. Before substantial bespoke design, preserve independent ideas when needed, scan existing work, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder.",
    "Follow current project authority and non-waivable gates. Before a nonmandatory follow-up, identify what uncertainty it can reduce and what plausible answer could alter the inference, decision, code, or next question. Before substantial bespoke design, preserve independent ideas when needed, scan existing work including relevant owner-supplied methodology, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder.",
  );
const CURRENT_REASONING_SELECTION_ELEMENT =
  `<reasoning_selection priority="Critical">\n${CURRENT_REASONING_SELECTION_TEXT}\n</reasoning_selection>`;

const INTERVIEW_POINT_CHECK =
  "Interview-evidence check: If I am eliciting or coding recurrence, did I preserve the direct recurrence report and its quantifier, denominator, context, exceptions, and uncertainty; distinguish it from episodes, traits, causes, coder inference, and genuinely sampled opportunities; probe exceptions before ritual confirming anecdotes; and ask each nonmandatory follow-up only for identifiable information gain? If a human must judge it, is there a human-facing interface, and if a load-bearing pre-collection defect appeared, did I version the method rather than reinterpret a frozen one?";

const LONGITUDINAL_POINT_CHECK =
  "Longitudinal-evidence check: Before an individual-case differential or causal ranking, did I extract the three to seven highest-information longitudinal constraints from the complete supplied history, score every leading hypothesis against all of them, and keep morphology or another cross-sectional phenotype description separate from etiology? If a later message changed the ranking, did I distinguish genuinely new evidence from correction or reweighting of evidence that was already present and name any earlier weighting or representation failure?";

const LONGITUDINAL_UPDATE_RULE =
  "When a later user message changes the conclusion or ranking, first compare its decisive content with the complete evidence already supplied. Classify the update as new evidence or as reweighting/correction of already-present evidence. If the decisive facts were already present, identify the earlier evidence-weighting or semantic-representation failure and do not describe those facts as newly supplied.";

const REVISION_TEXT =
  "Added the owner-supplied Reasoning Selection supplement: choose the smallest sufficient combination of methods by question function, scale effort with stakes, uncertainty and reversibility, and preserve phase-specific and non-waivable gates. Existing protocol authority, execution-only roles, and source-verification, completion, privacy and spending controls remain unchanged. The selector is guidance, not an executable model-quality guarantee.";
const REVISION_ELEMENT =
  `<revision version="20.5.20" priority="Critical">\n${REVISION_TEXT}\n</revision>`;

const PROJECT_APPLICATION = `### Reasoning-selection application

Use canonical Universal reasoning_selection for the actual question; it does not replace either complete protocol or required modules.

For research, define the claim, population, intervention/exposure, comparator, outcome and horizon as applicable. Keep mechanism, association, treatment effect and personal applicability distinct. For decisions, compare absolute benefits/harms and realistic alternatives, including nonaction. Examine bias, confounding, precision, heterogeneity and evidence dependence.

Generate competing explanations; critique assumptions without averaging incompatible findings. Preserve exact populations, formulations, concentrations, contexts and endpoints before calling results contradictory. Do not turn selected experience/forum reports into incidence estimates or causal proof.

Respect phase-specific gates and provenance; development-fitted evidence is not independent confirmation. Missing access is not a negative result; partial evidence is not completion. Separate operational, scientific and release adequacy. Source-bound authority and server-selected work control; this supplement grants no new execution, spending, publication or release permission.

`;

const CURRENT_PROJECT_APPLICATION = `### Reasoning, interview, and longitudinal evidence

Use Universal reasoning_selection; protocols/modules control. Define the exact claim, population, exposure/intervention, comparator, outcome, and horizon. Distinguish mechanism, association, treatment effect, and personal applicability. Preserve exact contexts and endpoints; selected reports prove neither incidence nor causality.

Apply Universal/HRP interview and longitudinal gates to histories, surveys, follow-ups, extraction, and dialogue. Before an individual-case differential, extract the 3–7 strongest longitudinal constraints and test every leading hypothesis against them. Keep phenotype/morphology separate from etiology. A later message that only highlights existing facts is a weighting or representation correction, not new evidence. Probe recurrence scope, exceptions, conditions, timing, and contrasts before anecdotes; require valid frequency sampling and information gain for optional questions. Retrieve owner methodology, use human controls, and version pre-collection defects without altering frozen methods/data.

Development-fitted evidence is not confirmation; missing access is neither negative evidence nor completion. Separate adequacy planes. This grants no new execution, spending, publication, or release permission.

`;

const AGENTS_APPLICATION = `Apply canonical Universal reasoning_selection and the AskRigor application in
project/PROJECT_INSTRUCTIONS.md within the current source-bound role. They
do not replace complete protocols, required modules, or authority gates.
Execution-only workers gain no strategic, methodological, spending, or release
authority from selecting a reasoning method.

`;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("canonical Reasoning Selection application", () => {
  it("adds the exact Critical selector and revision without reserializing Universal", async () => {
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");

    expect(XMLValidator.validate(universal)).toBe(true);
    expect(universal).toMatch(
      /<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.26" revisionDate="2026-09-17"/u,
    );
    expect(Buffer.byteLength(REASONING_SELECTION_TEXT, "utf8")).toBe(2884);
    expect(sha256(REASONING_SELECTION_TEXT)).toBe(
      "d128da3c9edcea70bc2651cf7a26e765a88f2860b2eaeae74cd2489c503b00c9",
    );
    expect(occurrences(universal, REVISION_ELEMENT)).toBe(1);
    expect(occurrences(universal, CURRENT_REASONING_SELECTION_ELEMENT)).toBe(1);
    expect(universal).toContain(
      `${REVISION_ELEMENT}\n<revision version="20.5.19" priority="Critical">`,
    );
    expect(universal).toContain(
      `${CURRENT_REASONING_SELECTION_ELEMENT}\n\n<claim_scope_predicate_alignment_gate priority="Critical">`,
    );

    for (const method of [
      "Analytic/formal",
      "Empirical/statistical/Bayesian",
      "Abductive/causal",
      "Systems/temporal",
      "Dialectical",
      "Phenomenological/interpretive",
      "Generative/analogical",
      "Decision/practical",
    ]) {
      expect(occurrences(CURRENT_REASONING_SELECTION_TEXT, `- ${method}:`), method).toBe(1);
    }

    const priorRecommendationUniversal = universal
      .replace('version="20.5.26" revisionDate="2026-09-17"', 'version="20.5.25" revisionDate="2026-09-14"')
      .replace("Important-Task Optimization, Recommendation-Preflight Integrity, Approval", "Important-Task Optimization, Approval")
      .replace(/<revision version="20\.5\.26" priority="Critical">[\s\S]*?<\/revision>\n/u, "")
      .replace(/<recommendation_preflight_integrity_gate priority="Critical">[\s\S]*?<\/recommendation_preflight_integrity_gate>\n\n/u, "")
      .replace(/Recommendation-preflight check:[^\n]*\n\n/u, "");
    expect(sha256(priorRecommendationUniversal)).toBe(
      "6f17c7285f383a71306cea46249e7eb45c3d5e890b10edd983e178ab6e173ef5",
    );

    const priorLongitudinalUniversal = priorRecommendationUniversal
      .replace('version="20.5.25" revisionDate="2026-09-14"', 'version="20.5.24" revisionDate="2026-09-12"')
      .replace("Target-Preservation, Claim-Scope / Predicate-Alignment, Normality-Base-Rate", "Target-Preservation, Normality-Base-Rate")
      .replace(/<revision version="20\.5\.25" priority="Critical">[\s\S]*?<\/revision>\n/u, "")
      .replace(/<claim_scope_predicate_alignment_gate priority="Critical">[\s\S]*?<\/claim_scope_predicate_alignment_gate>\n\n/u, "")
      .replace(/\nClaim-scope \/ predicate-alignment check:[^\n]*\n/u, "")
      .replace('version="20.5.24" revisionDate="2026-09-12"', 'version="20.5.22" revisionDate="2026-09-08"')
      .replace(
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Longitudinal-Evidence Preservation, Phenotype–Etiology Separation, Outcome-Directed Strategy-Switching",
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching",
      )
      .replace(/<revision version="20\.5\.24" priority="Critical">[\s\S]*?<\/revision>\n/u, "")
      .replace(
        "Prevent causal explanations and hypothesis ranking from ignoring the direction of the strongest observations, selective triggers, longitudinal constraints, and negative/control cases.",
        "Prevent causal explanations and hypothesis ranking from ignoring the direction of the strongest observations, selective triggers, and negative/control cases.",
      )
      .replace(/<high_information_qualifier_check priority="Critical">[\s\S]*?<\/high_information_qualifier_check>\n\n/u, "")
      .replace(/<phenotype_etiology_firewall priority="Critical">[\s\S]*?<\/phenotype_etiology_firewall>\n\n/u, "")
      .replace(`\n${LONGITUDINAL_POINT_CHECK}\n\n`, "")
      .replace(`\n${LONGITUDINAL_UPDATE_RULE}\n`, "");
    expect(sha256(priorLongitudinalUniversal)).toBe(
      "dd8cba1df28c40cc76ac4dbb2de1fedc1aa99c861ef3e2bd2ff9e3dd7cc2a3bb",
    );

    const priorInterviewUniversal = priorLongitudinalUniversal
      .replace('version="20.5.22" revisionDate="2026-09-08"', 'version="20.5.21" revisionDate="2026-09-08"')
      .replace(
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Evidence-Depth, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
      )
      .replace(/<revision version="20\.5\.22" priority="Critical">[\s\S]*?<\/revision>\n/u, "")
      .replace(/<interview_evidence_information_gain_gate priority="Critical">[\s\S]*?<\/interview_evidence_information_gain_gate>\n\n/u, "")
      .replace(`${INTERVIEW_POINT_CHECK}\n\n`, "")
      .replace(CURRENT_REASONING_SELECTION_ELEMENT, REASONING_SELECTION_ELEMENT);
    expect(sha256(priorInterviewUniversal)).toBe(
      "27ecae1e494b70f50f7f27fefb588525b0df3bebe0dd4a0483ce9dc9f9511907",
    );

    const priorUniversal = priorInterviewUniversal
      .replace('version="20.5.21" revisionDate="2026-09-08"', 'version="20.5.20" revisionDate="2026-09-08"')
      .replace(
        "Evidence-Discrimination, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Evidence-Discrimination, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
      )
      .replace(/<revision version="20\.5\.21" priority="Critical">[\s\S]*?<\/revision>\n/u, "")
      .replace(/<comparison_integrity_gate priority="Critical">[\s\S]*?<\/comparison_integrity_gate>\n\n/u, "");
    expect(sha256(priorUniversal)).toBe(
      "c1d7e2dac2d90fd402228e3c94aa4fa2ce3bdb5735bda88f1af8eecc52777ce1",
    );

    const recovered = priorUniversal
      .replace('version="20.5.20" revisionDate="2026-09-08"', 'version="20.5.19" revisionDate="2026-09-07"')
      .replace(`${REVISION_ELEMENT}\n`, "")
      .replace(`\n${REASONING_SELECTION_ELEMENT}\n`, "");
    expect(sha256(recovered)).toBe(
      "d488f61f76b6239c9dcd0dbed5d2c31634002119fd1dd2748ac109aaa345251a",
    );
  });

  it("adds the exact compact Project and execution-role applications", async () => {
    const [project, agents] = await Promise.all([
      readFile(new URL("project/PROJECT_INSTRUCTIONS.md", ROOT), "utf8"),
      readFile(new URL("AGENTS.md", ROOT), "utf8"),
    ]);

    expect(sha256(PROJECT_APPLICATION)).toBe(
      "d5a4b02bc53fda30bbb586d2ec34233f19bb981d38427f6311f453b84209ba5a",
    );
    expect(project).toContain(`\n${CURRENT_PROJECT_APPLICATION}## 1. Run before HRP/research`);
    expect(Buffer.byteLength(project, "utf8")).toBe(7978);
    expect(Array.from(project)).toHaveLength(7962);
    expect(project.split(/\s+/u).filter(Boolean)).toHaveLength(920);
    expect(sha256(project)).toBe(
      "093aeeb0029eb7ba5e6238e74eef1788841524acf21b9f4ac35281e2587b7285",
    );
    expect(sha256(project.replace(CURRENT_PROJECT_APPLICATION, PROJECT_APPLICATION))).toBe(
      "0a6085528b6f4412198d0e9a3b225a1069a40e8f494b47cbd652b69fb07a4ca8",
    );

    expect(sha256(AGENTS_APPLICATION)).toBe(
      "a2b9daec82e1d2db9b889ce625814b47951ebbe426362410cb341ba4517ed094",
    );
    expect(agents).toContain(`\n${AGENTS_APPLICATION}## Chat-to-Work authority gate`);
  });

  it("keeps the canonical HRP and Forum module byte-identical", async () => {
    const [hrp, forum] = await Promise.all([
      readFile(new URL("protocols/HRP_Full.xml", ROOT)),
      readFile(new URL("project/FORUM_SIGNAL_MODULE.md", ROOT)),
    ]);

    expect(sha256(hrp)).toBe(
      "254759df38934c28b06709dace9fcb266fc9967913be1296de99a461be596816",
    );
    expect(sha256(forum)).toBe(
      "75c088ba0edeb821d3d664d2f0b48b33f7dd3e627c01dfe830053d6dac2aed13",
    );
  });
});
