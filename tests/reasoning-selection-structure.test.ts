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

const CURRENT_PROJECT_APPLICATION = `### Reasoning and interview-evidence application

Use Universal reasoning_selection; it cannot replace protocols/modules. Define claim, population, intervention/exposure, comparator, outcome, horizon. Separate mechanism, association, treatment effect, and personal applicability. Compare absolute benefits/harms and alternatives including nonaction; examine bias, confounding, precision, heterogeneity, and evidence dependence. Generate competing explanations; critique without averaging incompatible findings. Preserve exact populations, formulations, concentrations, contexts, and endpoints before claiming contradiction. Selected reports do not establish incidence or causality.

For histories, recurrence, surveys, follow-ups, extraction, and dialogue, apply Universal/HRP interview-evidence gates. Preserve recurrence separately from other roles; probe scope, exceptions, conditions, timing, and contrasts before anecdotes. True frequency needs valid sampling; optional questions need information gain. Retrieve owner methodology, use human controls, and version pre-collection defects without altering frozen methods/data.

Respect phase/provenance gates: development-fitted evidence is not independent confirmation; missing access is not negative, nor partial evidence completion. Separate operational/scientific/release adequacy. Source-bound authority/server-selected work control; no new execution, spending, publication, or release permission.

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
      /<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.22" revisionDate="2026-09-08"/u,
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
      `${CURRENT_REASONING_SELECTION_ELEMENT}\n\n<interview_evidence_information_gain_gate priority="Critical">`,
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

    const priorInterviewUniversal = universal
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
      "c85378c9993731bf93daa65a9d49438d25b1008e065bd3eb9aaac215c0af1426",
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
      "5365f5fcb8e9abac0b60a5cbbfa23183cf08018f1c0f6ab9a3bb1e8df87ad9b3",
    );

    const recovered = priorUniversal
      .replace('version="20.5.20" revisionDate="2026-09-08"', 'version="20.5.19" revisionDate="2026-09-07"')
      .replace(`${REVISION_ELEMENT}\n`, "")
      .replace(`\n${REASONING_SELECTION_ELEMENT}\n`, "");
    expect(sha256(recovered)).toBe(
      "e996eb5385062c7dd445c9dae3c6950bc2da045440526e1ba67b4108e0ddd752",
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
    expect(Array.from(project)).toHaveLength(7964);
    expect(project.split(/\s+/u).filter(Boolean)).toHaveLength(899);
    expect(sha256(project)).toBe(
      "143e17ecffb330f98a0be85f52c0cd284a05d0ca08f325afd9443054bb9efc43",
    );
    expect(sha256(project.replace(CURRENT_PROJECT_APPLICATION, PROJECT_APPLICATION))).toBe(
      "58d8c8387e962064a393af1cab7d78391e18dfa78571cbb0372aad8455b7db70",
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
      "19b23a6b66162a2b734c3197fc287ce740a82bee92cd84d5a9e1e2b9380e8659",
    );
    expect(sha256(forum)).toBe(
      "75c088ba0edeb821d3d664d2f0b48b33f7dd3e627c01dfe830053d6dac2aed13",
    );
  });
});
