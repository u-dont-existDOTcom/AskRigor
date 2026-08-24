#!/usr/bin/env python3
"""Apply the 2026-08-24 epistemic phase + attractor safeguards.

This is a one-shot, idempotent migration for the canonical AskRigor Universal
and HRP protocols plus their high-level routing surfaces. It exists so the
canonical XML remains the single source of truth rather than being amended by a
sidecar supplement.
"""

from __future__ import annotations

import hashlib
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UNIVERSAL = ROOT / "protocols" / "Universal_Instructions.xml"
HRP = ROOT / "protocols" / "HRP_Full.xml"
AGENTS = ROOT / "AGENTS.md"
ROUTER = ROOT / "project" / "PROJECT_INSTRUCTIONS.md"
TEST = ROOT / "tests" / "epistemic-phase-routing-structure.test.ts"
PLAN = ROOT / "docs" / "superpowers" / "plans" / "2026-08-24-epistemic-phase-router.md"


def replace_once(text: str, old: str, new: str, *, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_universal() -> None:
    text = UNIVERSAL.read_text(encoding="utf-8")
    if '<epistemic_attractor_audit_gate priority="Critical">' in text:
        if '<epistemic_phase_routing_gate priority="Critical">' not in text:
            raise RuntimeError("Universal has attractor gate without phase router")
        return

    text = replace_once(
        text,
        'version="20.5.14" revisionDate="2026-08-18"',
        'version="20.5.15" revisionDate="2026-08-24"',
        label="Universal version",
    )
    text = replace_once(
        text,
        'Truth-Priority, and Whole-Argument-Reconstruction Gates',
        'Truth-Priority, Epistemic-Attractor Audit, Epistemic-Phase Routing, and Whole-Argument-Reconstruction Gates',
        label="Universal fullName",
    )

    revision = '''<revision version="20.5.15" priority="Critical">
Added two domain-general epistemic regression guards.

First, a Pre-Reasoning Epistemic Attractor Audit detects recurrent cases where a highly salient generic heuristic, instruction, or learned response pattern is being applied outside its proper scope. Before substantive reasoning, the assistant checks for relevant prior owner corrections or known recurring failure modes, names any concrete heuristic likely to dominate by familiarity rather than fit, verifies that heuristic against the current object, phase, objective, and instruction precedence, and runs an inverse-error check so fixing one mistake does not create its opposite. The audit is deliberately bounded: if no specific conflict is found, it ends immediately so attractor-checking cannot itself become an attractor or a source of paralysis.

Second, an Epistemic Phase Routing Gate prevents validation safeguards from being applied to hypothesis discovery. Before freeze, holdout, preregistration, anti-overfitting, model-selection, or post-hoc rules are applied, every material dataset or partition is classified by use as DEVELOPMENT or VALIDATION. DEVELOPMENT data may influence hypotheses and models and therefore should be optimized aggressively; those same data cannot independently confirm generalization. VALIDATION data may support or refute a frozen claim, but their outcomes may not influence model selection or analysis choices while retaining the validation label. Cross-validation repeatedly consulted during development is explicitly a search/model-selection tool rather than confirmation. Core invariant: freeze before VALIDATION, not before DISCOVERY; do not optimize VALIDATION cases; optimize DEVELOPMENT cases aggressively.
</revision>
'''
    text = replace_once(
        text,
        '<revision_history>\n',
        '<revision_history>\n' + revision,
        label="Universal revision history",
    )

    attractor_gate = '''<epistemic_attractor_audit_gate priority="Critical">
<purpose>
Prevent a recurrent generic heuristic, instruction pattern, safety/rigor reflex, consensus default, symmetry preference, workflow habit, or prior correction from becoming a strange attractor that pulls reasoning away from the actual task.
</purpose>

<activation priority="Critical">
Run one bounded audit before substantive reasoning on a nontrivial task, especially when the current task resembles a prior correction, the user says the same mistake has recurred, several instructions point in different directions, or a generic rule is unusually salient.
</activation>

<rules priority="Critical">
1. Check whether the current task matches a prior user correction, recorded lesson, regression, or recurring failure mode that is materially relevant now. Do not broaden into unrelated memory or profile context.
2. Identify any specific generic heuristic or instruction likely to dominate because it is familiar, repeated, emotionally/safety salient, or structurally prominent rather than because it best fits this task. Examples include `freeze everything`, `avoid post-hoc work`, `preserve a holdout`, `prefer consensus`, `maximize caution`, `force symmetry`, `use the standard workflow`, `never ask questions`, or the inverse of a recently corrected rule.
3. Ask: **Am I solving this task, or merely satisfying the most salient generic rule?** Test the candidate heuristic against the current object, epistemic phase, actual objective, user instruction, and instruction precedence. Specific applicable instructions and explicit owner corrections outrank a generic heuristic where no higher-priority platform/safety requirement conflicts.
4. Run an inverse-error check. A correction to one failure mode does not authorize blindly adopting the opposite extreme. Seek the calibrated rule that explains when each behavior applies.
5. When two valid rules appear to conflict, resolve the scope boundary before proceeding: identify which object, phase, population, claim type, or workflow state each rule governs. Do not average incompatible rules or let repetition determine precedence.
6. If a concrete attractor conflict is found, explicitly route around it in the operative task state before analysis. The user-visible answer need not narrate internal reasoning unless the conflict materially affects the result.
7. If no concrete conflict is found, terminate the audit immediately and proceed. Do not create speculative attractors, endlessly self-monitor, or turn this gate into a ceremonial preamble.
8. If the same corrected failure recurs, treat it as a regression in the durable instruction/workflow/test architecture. Patch the governing rule or regression test when authorized instead of merely apologizing or relying on memory.
9. This gate is subordinate to higher-priority platform, law, and safety rules. It is a scope-and-calibration audit, not permission to bypass them.
</rules>
</epistemic_attractor_audit_gate>

'''

    phase_gate = '''<epistemic_phase_routing_gate priority="Critical">
<purpose>
Prevent the assistant from applying a methodologically correct validation safeguard to the wrong epistemic phase and thereby suppressing legitimate hypothesis discovery.
</purpose>

<classification priority="Critical">
Before applying any freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, model-selection, or confirmation rule, classify each material dataset or partition by its current use:
- DEVELOPMENT: its outcomes may influence hypotheses, representations, features, formulas, target definitions, preprocessing, thresholds, hyperparameters, or analysis choices.
- VALIDATION: it is reserved to test a hypothesis/model/analysis package frozen before its outcomes are inspected.
A project may contain both phases in separate datasets or partitions. Phase is a property of use, not a moral quality of the data.
</classification>

<two_question_checksum priority="Critical">
Ask, in this order:
1. May these data influence the hypothesis or model?
2. May these data support the claim that the resulting hypothesis or model generalizes beyond those data?
DEVELOPMENT normally answers YES / NO. VALIDATION normally answers NO / YES. If both answers are YES because validation outcomes were inspected and then used to change the model, reclassify those data as DEVELOPMENT and obtain new independent validation for confirmatory claims.
</two_question_checksum>

<rules priority="Critical">
1. DEVELOPMENT is for learning. Optimize it aggressively when useful. Post-hoc hypotheses, broad feature search, symbolic regression, representation search, target refinement, ablations, interaction search, repeated cross-validation, bootstrap/stability analysis, error inspection, and iterative model revision are allowed and encouraged.
2. Performance on DEVELOPMENT data, including internal cross-validation repeatedly consulted during model development, is model-selection or search evidence. It may rank candidates and estimate stability, but it is not independent confirmation and must not be presented as proof of generalization.
3. VALIDATION is for testing. Freeze the hypothesis, model/formula, target, preprocessing, exclusions, thresholds, controls, metrics, and material analysis rules before validation outcomes are inspected. Do not retune on those outcomes and still call the same data untouched validation.
4. Validation safeguards MUST NOT restrict exploration on data explicitly designated DEVELOPMENT merely because those safeguards would be mandatory in VALIDATION. Generic instructions such as avoid overfitting, freeze predictions, preserve holdouts, or do not optimize evaluation cases apply according to phase, not indiscriminately.
5. An internal holdout remains VALIDATION only while its outcomes are genuinely uninspected and do not influence any choice. Once its results are inspected and used iteratively, it becomes DEVELOPMENT for subsequent claims.
6. When the user is exploring existing data to generate a testable hypothesis and a genuinely independent future dataset can test it, default the current exploratory data to DEVELOPMENT unless the user explicitly reserves them for validation.
7. Do not preserve part of a development dataset as ceremonially untouched if doing so materially weakens discovery and genuinely independent external validation is available or planned. Preserve an internal validation partition only when there is a concrete reason to spend scarce validation data there.
8. When phase materially affects interpretation, begin the experiment, analysis plan, or report with exactly `PHASE: DEVELOPMENT` or `PHASE: VALIDATION`, and state the permitted and forbidden epistemic uses of that phase.
9. Discovery may produce candidate laws, formulas, mechanisms, mappings, and hypotheses. Label them as development-selected. The confirmatory test is whether the frozen candidate succeeds on later independent validation data.
10. When a broad anti-bias heuristic conflicts with this gate, route by phase first. Core memory aid: “Freeze before VALIDATION, not before DISCOVERY. Do not optimize VALIDATION cases. Optimize DEVELOPMENT cases aggressively.”
</rules>
</epistemic_phase_routing_gate>

'''

    text = replace_once(
        text,
        '<canonical_protocol_execution_gate>',
        attractor_gate + phase_gate + '<canonical_protocol_execution_gate>',
        label="Universal gate insertion",
    )

    checks = '''Epistemic-attractor check: Before substantive reasoning on a nontrivial task, is a generic heuristic, repeated instruction, prior correction, consensus/safety reflex, symmetry preference, or standard workflow pulling the answer by salience rather than fit? If yes, name the concrete rule internally, test its scope against the current task and instruction precedence, and run the inverse-error check. If no concrete conflict exists, stop this audit immediately; do not let self-monitoring become an attractor.\n\nEpistemic-phase check: Before applying freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, or model-selection restrictions, did I classify each material dataset/partition by use as DEVELOPMENT or VALIDATION and run the two-question checksum? If DEVELOPMENT, am I allowing aggressive hypothesis/model search while withholding confirmatory claims? If VALIDATION, was the complete analysis package frozen before outcomes were inspected? If a holdout was inspected and then used to retune, did I reclassify it as DEVELOPMENT rather than preserve a false validation label?\n\n'''
    text = replace_once(
        text,
        '<point_of_generation_checks>\n',
        '<point_of_generation_checks>\n' + checks,
        label="Universal point checks",
    )

    UNIVERSAL.write_text(text, encoding="utf-8")


def patch_hrp() -> None:
    text = HRP.read_text(encoding="utf-8")
    if '<EpistemicAttractorAuditGate priority="Critical">' in text:
        if '<EpistemicPhaseRoutingGate priority="Critical">' not in text:
            raise RuntimeError("HRP has attractor gate without phase router")
        return

    text = replace_once(
        text,
        'version="20.5.22" revisionDate="2026-08-23"',
        'version="20.5.23" revisionDate="2026-08-24"',
        label="HRP version",
    )
    text = replace_once(
        text,
        'Project-Release Packaging Controls, Premise-Integrity, and Truth-Priority Controls',
        'Project-Release Packaging Controls, Epistemic-Attractor Audit, Epistemic-Phase Routing, Premise-Integrity, and Truth-Priority Controls',
        label="HRP fullName",
    )

    revision = '''  <Revision version="20.5.23" priority="Critical">
   Added a bounded Pre-Reasoning Epistemic Attractor Audit plus an Epistemic Phase Routing Gate. The attractor audit checks whether a recurring correction or highly salient generic heuristic is being applied outside its scope, tests it against the current object/phase/objective and instruction precedence, and performs an inverse-error check. It terminates immediately when no concrete conflict is found so the audit cannot become a new source of paralysis.

   Research data must also be classified by use as DEVELOPMENT or VALIDATION before freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, or model-selection restrictions are applied. DEVELOPMENT may influence hypotheses and models and should be searched and optimized aggressively; it cannot independently confirm generalization. VALIDATION may support or refute a frozen claim but may not influence the model or analysis package. An inspected holdout used for revision becomes DEVELOPMENT. Cross-validation repeatedly consulted during development is a selection tool, not independent confirmation. Core invariant: freeze before VALIDATION, not before DISCOVERY.
  </Revision>

'''
    text = replace_once(
        text,
        '<RevisionHistory>\n',
        '<RevisionHistory>\n' + revision,
        label="HRP revision history",
    )

    attractor_gate = ''' <EpistemicAttractorAuditGate priority="Critical">
  <Purpose>Detect recurrent reasoning attractors before they misroute a research task, without turning self-monitoring into a ceremonial or paralyzing step.</Purpose>
  <Rule name="RelevantRegressionScan" priority="Critical">Before substantive reasoning on a nontrivial task, check whether the task matches a prior owner correction, recorded lesson, regression, or recurring failure mode that is materially relevant now.</Rule>
  <Rule name="SalientHeuristicScan" priority="Critical">Identify any concrete generic heuristic likely to dominate by familiarity or salience rather than fit, including over-freezing, anti-post-hoc reflexes, consensus defaulting, excessive caution, forced symmetry, standard-workflow inertia, or the inverse of a recently corrected rule.</Rule>
  <Rule name="ScopeAndPrecedenceTest" priority="Critical">Ask internally: “Am I solving this task, or merely satisfying the most salient generic rule?” Test the heuristic against the actual object, epistemic phase, objective, current owner instruction, and instruction precedence before applying it.</Rule>
  <Rule name="InverseErrorCheck" priority="Critical">Do not repair one recurrent mistake by adopting its opposite as a universal rule. Resolve the conditional boundary that determines when each behavior applies.</Rule>
  <Rule name="BoundedAudit" priority="Critical">If a concrete conflict is found, route around it before analysis. If no concrete conflict is found, terminate the audit immediately. Do not invent speculative attractors, endlessly self-monitor, or expose private chain-of-thought.</Rule>
  <Rule name="RegressionRequiresDurableRepair" priority="High">If the same corrected failure recurs, treat it as an instruction/workflow regression and patch the durable rule or test when authorized rather than relying on another apology.</Rule>
 </EpistemicAttractorAuditGate>

'''

    phase_gate = ''' <EpistemicPhaseRoutingGate priority="Critical">
  <Purpose>Prevent validation discipline from being misapplied to hypothesis discovery while preserving a hard firewall for genuine confirmation.</Purpose>
  <Rule name="ClassifyPhaseBeforeSafeguards" priority="Critical">Before applying freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, model-selection, or confirmatory rules, classify each material dataset or partition by current use as DEVELOPMENT or VALIDATION.</Rule>
  <Rule name="TwoQuestionChecksum" priority="Critical">Ask: (1) May these data influence the hypothesis or model? (2) May these data support a claim that the resulting hypothesis or model generalizes? DEVELOPMENT is normally YES/NO. VALIDATION is normally NO/YES. If validation outcomes are inspected and then used to change the model or analysis, those data become DEVELOPMENT for subsequent claims and new independent validation is required.</Rule>
  <Rule name="DevelopmentIsForLearning" priority="Critical">On DEVELOPMENT data, post-hoc hypothesis generation, feature and representation search, symbolic regression, target refinement, ablation, interaction search, repeated cross-validation, stability analysis, error inspection, and iterative model revision are allowed and encouraged. Optimize DEVELOPMENT cases aggressively when doing so improves hypothesis discovery.</Rule>
  <Rule name="DevelopmentCannotConfirm" priority="Critical">Performance on DEVELOPMENT data, including cross-validation repeatedly consulted during model construction, may rank candidates and estimate stability but may not be presented as independent confirmation, prospective evidence, or proof of generalization.</Rule>
  <Rule name="ValidationIsForTesting" priority="Critical">On VALIDATION data, freeze the hypothesis/model/formula, target, preprocessing, exclusions, thresholds, controls, metrics, and material analysis rules before outcomes are inspected. Do not retune using validation outcomes and preserve the label untouched validation.</Rule>
  <Rule name="PhasePrecedesGenericAntiOverfitHeuristics" priority="Critical">Validation safeguards MUST NOT restrict exploration on explicitly DEVELOPMENT data merely because they would be mandatory during VALIDATION. Apply avoid-overfitting, preserve-holdout, preregister, freeze-predictions, and do-not-optimize-evaluation rules according to phase rather than as universal bans on learning.</Rule>
  <Rule name="ExternalValidationDefault" priority="High">When existing data are being explored to generate hypotheses and a genuinely independent future dataset can test them, default the current exploratory data to DEVELOPMENT unless they were explicitly reserved for validation. Do not spend development information merely to create ceremonial internal untouchedness when external validation is available or planned.</Rule>
  <Rule name="VisiblePhaseLabel" priority="High">When phase materially affects interpretation, begin the experiment, research plan, or report with exactly `PHASE: DEVELOPMENT` or `PHASE: VALIDATION` and state what that phase may and may not establish.</Rule>
  <Rule name="CoreInvariant" priority="Critical">Freeze before VALIDATION, not before DISCOVERY. Do not optimize VALIDATION cases. Optimize DEVELOPMENT cases aggressively.</Rule>
 </EpistemicPhaseRoutingGate>

'''

    closing = '</RevisionHistory>'
    pos = text.find(closing)
    if pos < 0:
        raise RuntimeError("HRP RevisionHistory close not found")
    pos += len(closing)
    text = text[:pos] + '\n\n' + attractor_gate + phase_gate + text[pos:]

    final_checks = ''' <Check id="FS191">Before substantive reasoning on a nontrivial task, did I run the bounded attractor audit for relevant recurring corrections and salient generic heuristics, test any concrete conflict against scope/precedence, and avoid inverse overcorrection?</Check>
 <Check id="FS192">Before applying freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, or model-selection restrictions, did I classify each material dataset or partition as DEVELOPMENT or VALIDATION by current use?</Check>
 <Check id="FS193">For DEVELOPMENT data, did I allow useful aggressive hypothesis/model search while withholding independent-confirmation claims?</Check>
 <Check id="FS194">For VALIDATION data, was the material hypothesis/model/analysis package frozen before outcomes were inspected, with no outcome-driven retuning mislabeled as untouched validation?</Check>
 <Check id="FS195">If an internal holdout was inspected and then influenced revision, did I reclassify it as DEVELOPMENT and require new independent validation for confirmation?</Check>
'''
    text = replace_once(
        text,
        '</FinalSelfCheck>',
        final_checks + '</FinalSelfCheck>',
        label="HRP final checks",
    )

    HRP.write_text(text, encoding="utf-8")


def patch_agents() -> None:
    text = AGENTS.read_text(encoding="utf-8")
    if '## Pre-reasoning epistemic attractor audit' in text:
        return
    section = '''## Pre-reasoning epistemic attractor audit\n\nBefore substantive reasoning on a nontrivial task, run one bounded regression check: is a prior corrected failure mode or highly salient generic heuristic pulling the solution by familiarity rather than fit? Test any concrete candidate against the current object, phase, objective, owner instruction, and instruction precedence. Run an inverse-error check so a previous correction does not become the opposite universal mistake. If no concrete conflict exists, stop the audit immediately; do not let self-monitoring become a new attractor. Repeated recurrence is an instruction/test regression and should receive a durable repair when authorized.\n\nMemory aid: **Am I solving this task, or merely satisfying the most salient generic rule?**\n\n## Epistemic phase routing\n\nBefore applying freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, or model-selection rules, classify each material dataset/partition by use as `DEVELOPMENT` or `VALIDATION`. Use the checksum: may these data influence the hypothesis/model, and may they support a claim of generalization? Development is normally YES/NO; validation is normally NO/YES.\n\nOn `DEVELOPMENT`, optimize aggressively: post-hoc hypothesis generation, feature/formula search, symbolic regression, ablation, target refinement, repeated cross-validation, stability analysis, and failure inspection are allowed and encouraged. They are selection tools, not independent confirmation. On `VALIDATION`, freeze the material model and analysis package before outcomes are inspected; if those outcomes are then used to revise the model, reclassify that set as development and obtain new independent validation.\n\nValidation safeguards must not suppress legitimate discovery merely because they are highly salient elsewhere in the repository. Current explicit owner corrections take precedence over a generic anti-overfitting heuristic where no higher-priority requirement conflicts. Core invariant: **freeze before VALIDATION, not before DISCOVERY; do not optimize VALIDATION cases; optimize DEVELOPMENT cases aggressively.**\n\n'''
    text = replace_once(text, '## Validation\n', section + '## Validation\n', label="AGENTS insertion")
    AGENTS.write_text(text, encoding="utf-8")


def patch_router() -> None:
    text = ROUTER.read_text(encoding="utf-8")
    if '## 0. Pre-reasoning attractor and epistemic phase routing' in text:
        return
    section = '''## 0. Pre-reasoning attractor and epistemic phase routing\n\nBefore substantive research reasoning, run one bounded attractor audit: check for a materially relevant prior correction/regression and any concrete generic heuristic likely to dominate by salience rather than fit. Test it against the current object, phase, objective, owner instruction, and precedence; run an inverse-error check; then stop the audit if no conflict remains. Do not let the audit itself become a workflow ritual.\n\nBefore any research freeze, holdout, preregistration, anti-overfitting, post-hoc, leakage, or model-selection restriction, label each material dataset/partition `DEVELOPMENT` or `VALIDATION`. Development may influence hypotheses/models but cannot independently establish generalization. Validation may test a frozen claim but may not influence its selection. An inspected holdout that affects revision becomes development. Repeated cross-validation inside development is a search/model-selection tool, not confirmation.\n\nWhen existing data are being explored to generate a hypothesis and genuinely independent future data can test it, default the current exploratory data to `DEVELOPMENT` unless explicitly reserved otherwise. Validation rules MUST NOT constrain development search merely by analogy. Use the checksum: “May these data influence the model?” / “May these data support generalization?” = DEVELOPMENT `YES/NO`, VALIDATION `NO/YES`.\n\nFor phase-sensitive research artifacts, begin with exactly `PHASE: DEVELOPMENT` or `PHASE: VALIDATION`. Core invariant: **freeze before VALIDATION, not before DISCOVERY; optimize DEVELOPMENT aggressively; never optimize VALIDATION and still call it untouched.**\n\n'''
    text = replace_once(
        text,
        '## 1. Run before HRP/research\n',
        section + '## 1. Run before HRP/research\n',
        label="router insertion",
    )
    ROUTER.write_text(text, encoding="utf-8")


def write_regression_test_and_plan() -> None:
    TEST.write_text(
        '''import { readFile } from "node:fs/promises";\nimport { describe, expect, it } from "vitest";\n\ndescribe("epistemic attractor and phase routing structural integration", () => {\n  it("protects discovery/validation routing and recurrent-heuristic regressions", async () => {\n    const universal = await readFile(new URL("../protocols/Universal_Instructions.xml", import.meta.url), "utf8");\n    const hrp = await readFile(new URL("../protocols/HRP_Full.xml", import.meta.url), "utf8");\n    const agents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");\n    const router = await readFile(new URL("../project/PROJECT_INSTRUCTIONS.md", import.meta.url), "utf8");\n\n    expect(universal).toContain('version="20.5.15" revisionDate="2026-08-24"');\n    expect(universal).toContain('<epistemic_attractor_audit_gate priority="Critical">');\n    expect(universal).toContain('<epistemic_phase_routing_gate priority="Critical">');\n    expect(universal).toContain("Am I solving this task, or merely satisfying the most salient generic rule?");\n    expect(universal).toContain("Freeze before VALIDATION, not before DISCOVERY");\n    expect(universal).toContain("DEVELOPMENT normally answers YES / NO");\n    expect(universal).toContain("VALIDATION normally answers NO / YES");\n\n    expect(hrp).toContain('version="20.5.23" revisionDate="2026-08-24"');\n    expect(hrp).toContain('<EpistemicAttractorAuditGate priority="Critical">');\n    expect(hrp).toContain('<EpistemicPhaseRoutingGate priority="Critical">');\n    expect(hrp).toContain('name="InverseErrorCheck"');\n    expect(hrp).toContain('name="DevelopmentIsForLearning"');\n    expect(hrp).toContain('name="ValidationIsForTesting"');\n    expect(hrp).toContain('id="FS195"');\n\n    expect(agents).toContain("## Pre-reasoning epistemic attractor audit");\n    expect(router).toContain("## 0. Pre-reasoning attractor and epistemic phase routing");\n    expect(router).toContain("PHASE: DEVELOPMENT");\n    expect(router).toContain("PHASE: VALIDATION");\n  });\n});\n''',
        encoding="utf-8",
    )
    PLAN.write_text(
        '''# Epistemic attractor + phase router patch\n\nOwner correction: validation safeguards were repeatedly being overgeneralized into discovery, suppressing legitimate post-hoc hypothesis search even when independent future validation was available. The owner also identified the broader meta-failure: recurrent generic heuristics can act as strange attractors and keep reappearing after correction.\n\nSafeguard 1: a bounded pre-reasoning attractor audit checks relevant prior corrections/regressions, names any concrete over-salient heuristic, tests scope and instruction precedence, and performs an inverse-error check. It terminates immediately when no specific conflict exists.\n\nSafeguard 2: classify data by use before applying anti-overfitting safeguards. DEVELOPMENT may influence the model and cannot confirm generalization. VALIDATION may test a frozen model and may not influence it.\n\nPatched surfaces: canonical Universal instructions, canonical HRP, AskRigor agent map, AskRigor project router, and a structural regression test.\n''',
        encoding="utf-8",
    )


def write_hash_receipts() -> None:
    out = ROOT / "docs" / "superpowers" / "plans"
    (out / "2026-08-24-universal-20-5-15-sha256.txt").write_text(
        hashlib.sha256(UNIVERSAL.read_bytes()).hexdigest()
        + "  protocols/Universal_Instructions.xml\n",
        encoding="utf-8",
    )
    (out / "2026-08-24-hrp-20-5-23-sha256.txt").write_text(
        hashlib.sha256(HRP.read_bytes()).hexdigest() + "  protocols/HRP_Full.xml\n",
        encoding="utf-8",
    )


def main() -> None:
    patch_universal()
    patch_hrp()
    patch_agents()
    patch_router()
    write_regression_test_and_plan()

    ET.parse(UNIVERSAL)
    ET.parse(HRP)
    universal = UNIVERSAL.read_text(encoding="utf-8")
    hrp = HRP.read_text(encoding="utf-8")
    assert '<epistemic_attractor_audit_gate priority="Critical">' in universal
    assert '<epistemic_phase_routing_gate priority="Critical">' in universal
    assert '<EpistemicAttractorAuditGate priority="Critical">' in hrp
    assert '<EpistemicPhaseRoutingGate priority="Critical">' in hrp
    write_hash_receipts()


if __name__ == "__main__":
    main()
