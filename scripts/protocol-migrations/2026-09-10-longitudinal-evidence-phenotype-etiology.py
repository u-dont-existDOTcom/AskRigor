#!/usr/bin/env python3
"""Apply the 2026-09-10 longitudinal-evidence protocol migration.

The migration accepts only the exact merged 20.5.22/20.5.27 baseline. It is
idempotent after the expected output receipts below are filled from a reviewed
first run.
"""

from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
UNIVERSAL = ROOT / "protocols/Universal_Instructions.xml"
HRP = ROOT / "protocols/HRP_Full.xml"
PROJECT = ROOT / "project/PROJECT_INSTRUCTIONS.md"

OLD_UNIVERSAL_SHA256 = "d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6"
OLD_HRP_SHA256 = "65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a"
OLD_PROJECT_SHA256 = "143e17ecffb330f98a0be85f52c0cd284a05d0ca08f325afd9443054bb9efc43"

NEW_UNIVERSAL_SHA256 = "321686bf6cfb718ecef6ae4887a4691f0969304caedbbabee2c97ee19afaa303"
NEW_HRP_SHA256 = "bb886e1e1874eeba1d645b773937043c7d9d88c84a3427ad7c0fe7f4a9be713f"
NEW_PROJECT_SHA256 = "b34ddb6cffbbadafd8981ccb887247c24390c017133ba4791e2c49a4793ffcf0"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one baseline occurrence, found {count}")
    return text.replace(old, new, 1)


def patch_universal() -> None:
    if sha256(UNIVERSAL) == NEW_UNIVERSAL_SHA256 and NEW_UNIVERSAL_SHA256:
        return
    if sha256(UNIVERSAL) != OLD_UNIVERSAL_SHA256:
        raise SystemExit("Universal input is not the exact 20.5.22 baseline")
    text = UNIVERSAL.read_text(encoding="utf-8")
    text = once(
        text,
        'version="20.5.22" revisionDate="2026-09-08"',
        'version="20.5.23" revisionDate="2026-09-10"',
        "Universal root identity",
    )
    text = once(
        text,
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching",
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Longitudinal-Evidence Preservation, Phenotype–Etiology Separation, Outcome-Directed Strategy-Switching",
        "Universal full name",
    )
    revision = '''<revision version="20.5.23" priority="Critical">
Added domain-general longitudinal-evidence preservation and a phenotype–etiology firewall for individual-case causal reasoning. Before a differential or causal ranking, the assistant must extract the three to seven observations that most constrain causality from the complete supplied history, including exposure-relative onset, sequence, persistence, recurrence, dechallenge/rechallenge, treatment-class response, functional trajectory, and discriminating negative or tolerated comparisons when present. Every leading hypothesis must predict the complete constraint set; a visually salient or common cross-sectional pattern cannot silently outrank a hypothesis that better explains the trajectory.

The revision separates what a phenotype, lesion, photograph, examination finding, diagnostic label, biomarker, or other cross-sectional observation is from what initiated or maintains it. Morphological compatibility alone does not establish etiology, and a common phenotype may coexist with an upstream trigger. When a later message changes a conclusion, the assistant must classify the change as new evidence or reweighting/correction of already-present evidence. If the decisive facts were already supplied, it must name the earlier weighting or representation failure rather than call those facts new.
</revision>
'''
    text = once(text, "<revision_history>\n", "<revision_history>\n" + revision, "Universal revision")
    old_gate = '''<evidence_discrimination_gate priority="Critical">
<purpose>
Prevent causal explanations and hypothesis ranking from ignoring the direction of the strongest observations, selective triggers, and negative/control cases.
</purpose>

<evidence_direction_check priority="Critical">
Before proposing explanations, identify the observation’s highest-information qualifiers and contrasts (e.g. tiny amount, immediate, only X and Y, but not Z). For each candidate hypothesis, predict whether those facts should be expected, unexpected, or opposite to prediction. Down-rank hypotheses that predict the opposite pattern unless a specific mechanism explains the discrepancy. Do not replace a selective observed pattern with a generic differential.
</evidence_direction_check>

<specificity_check priority="Critical">
Before treating a shared feature of positive cases as causal, test whether that feature is also present in negative/control cases. Prefer features that discriminate X and Y from tolerated Z, not merely features X and Y share. Down-rank any hypothesis whose supposed cause is common in the non-reactive comparison set unless a specific difference in dose, form, or mechanism explains the selectivity.
</specificity_check>
</evidence_discrimination_gate>'''
    new_gate = '''<evidence_discrimination_gate priority="Critical">
<purpose>
Prevent causal explanations and hypothesis ranking from ignoring the direction of the strongest observations, selective triggers, longitudinal constraints, and negative/control cases.
</purpose>

<evidence_direction_check priority="Critical">
Before proposing explanations, identify the observation’s highest-information qualifiers and contrasts (e.g. tiny amount, immediate, only X and Y, but not Z). For each candidate hypothesis, predict whether those facts should be expected, unexpected, or opposite to prediction. Down-rank hypotheses that predict the opposite pattern unless a specific mechanism explains the discrepancy. Do not replace a selective observed pattern with a generic differential.
</evidence_direction_check>

<high_information_qualifier_check priority="Critical">
Before generating a differential or ranking causal hypotheses in an individual case, write internally the three to seven observations from the complete supplied history that most constrain causality. Include, when present, onset relative to candidate exposures, temporal sequence, persistence, recurrence, dechallenge or rechallenge, treatment-class response, functional trajectory, and discriminating negative or tolerated comparisons. Score every leading hypothesis against every listed observation. A hypothesis that explains a salient appearance but fails stronger temporal, recurrence, treatment-response, or comparator evidence must not outrank a hypothesis that explains the complete pattern unless an explicit evidence-supported reason resolves the mismatch.
</high_information_qualifier_check>

<phenotype_etiology_firewall priority="Critical">
Do not allow a photograph, examination morphology, diagnostic label, common pattern, biomarker, or other cross-sectional observation to erase or silently down-weight the longitudinal constraint set. State separately what the observed lesion or phenotype is and what may have initiated or may maintain it. A morphological diagnosis establishes phenotype unless independent evidence establishes cause. A common phenotype may coexist with an upstream infectious, immune, toxic, pharmacological, environmental, or other trigger. Compatibility with the current appearance is not a substitute for predicting the complete longitudinal pattern.
</phenotype_etiology_firewall>

<specificity_check priority="Critical">
Before treating a shared feature of positive cases as causal, test whether that feature is also present in negative/control cases. Prefer features that discriminate X and Y from tolerated Z, not merely features X and Y share. Down-rank any hypothesis whose supposed cause is common in the non-reactive comparison set unless a specific difference in dose, form, or mechanism explains the selectivity.
</specificity_check>
</evidence_discrimination_gate>'''
    text = once(text, old_gate, new_gate, "Universal evidence-discrimination gate")
    update_rule = '''
When a later user message changes the conclusion or ranking, first compare its decisive content with the complete evidence already supplied. Classify the update as new evidence or as reweighting/correction of already-present evidence. If the decisive facts were already present, identify the earlier evidence-weighting or semantic-representation failure and do not describe those facts as newly supplied.
'''
    text = once(
        text,
        "When I challenge reassuring null-evidence language,",
        update_rule + "When I challenge reassuring null-evidence language,",
        "Universal correction classification",
    )
    point_check = '''
Longitudinal-evidence check: Before an individual-case differential or causal ranking, did I extract the three to seven highest-information longitudinal constraints from the complete supplied history, score every leading hypothesis against all of them, and keep morphology or another cross-sectional phenotype description separate from etiology? If a later message changed the ranking, did I distinguish genuinely new evidence from correction or reweighting of evidence that was already present and name any earlier weighting or representation failure?

'''
    text = once(
        text,
        "Target-preservation check:",
        point_check + "Target-preservation check:",
        "Universal point-of-generation check",
    )
    UNIVERSAL.write_text(text, encoding="utf-8")


def patch_hrp() -> None:
    if sha256(HRP) == NEW_HRP_SHA256 and NEW_HRP_SHA256:
        return
    if sha256(HRP) != OLD_HRP_SHA256:
        raise SystemExit("HRP input is not the exact 20.5.27 baseline")
    text = HRP.read_text(encoding="utf-8")
    text = once(
        text,
        'version="20.5.27" revisionDate="2026-09-09"',
        'version="20.5.28" revisionDate="2026-09-10"',
        "HRP root identity",
    )
    text = once(
        text,
        "Cross-Agent Estimand and Exposure Comparability, Patient-History and Recurrence-Evidence Integrity,",
        "Cross-Agent Estimand and Exposure Comparability, Patient-History and Recurrence-Evidence Integrity, Longitudinal Causal-Constraint Preservation, Phenotype–Etiology Separation,",
        "HRP full name",
    )
    revision = '''  <Revision version="20.5.28" priority="Critical">
   Added longitudinal causal-constraint preservation and a phenotype–etiology firewall to the root patient-history gate.
   Before an individual-case differential or causal ranking, AskRigor now extracts the three to seven observations that
   most constrain causality from the complete supplied history and tests every leading hypothesis against the entire set.
   Exposure-relative onset, sequence, persistence, recurrence, dechallenge/rechallenge, treatment-class response,
   functional trajectory, and discriminating negative or tolerated comparisons cannot be displaced by a visually salient
   photograph, examination morphology, common diagnostic label, biomarker, or other cross-sectional observation.

   Phenotype description is now explicitly separated from evidence about initiation or maintenance. A common morphology
   may coexist with an upstream infectious, immune, toxic, pharmacological, environmental, or other trigger. Later changes
   in conclusion must be classified as new evidence or correction/reweighting of already-present evidence; when the
   decisive facts were already in the history, the earlier weighting or representation failure must be named.
  </Revision>
'''
    text = once(text, " <RevisionHistory>\n", " <RevisionHistory>\n" + revision, "HRP revision")
    old_gate_start = '<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">'
    start = text.index(old_gate_start)
    end = text.index(" </PatientHistoryAndRecurrenceEvidenceGate>", start) + len(" </PatientHistoryAndRecurrenceEvidenceGate>")
    old_gate = text[start:end]
    new_gate = '''<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">
  <Purpose>Apply the compatible Universal Interview-Evidence, Information-Gain, Evidence-Discrimination, and Longitudinal-Evidence gates to patient-history intake, symptom recurrence, adverse-effect reports, behavioral and lifestyle history, surveys, reviewer extraction, individual-case differentials, and any health evidence-gathering dialogue without weakening HRP chronology, denominator, Dose-Regime, safety, causal-attribution, privacy, or forum controls.</Purpose>

  <Rule name="ReportedRecurrenceIsEvidence" priority="Critical">A patient's statement such as “this happens every time I eat X” is direct evidence of reported recurrence, not zero evidence and not automatic proof of true frequency or causality. Preserve the reported event or behavior, original quantifier, eligible exposures or opportunities, dose or formulation when relevant, life period and context, timing, exceptions, and uncertainty. Keep behavioral or symptom recurrence separate from trait labels and diagnostic or causal interpretations.</Rule>

  <Rule name="PatientExceptionFirstProbe" priority="Critical">Before asking for a confirming incident, clarify the denominator and conditions: which exposures or opportunities count; when the outcome does not happen; how often it fails at the respondent's natural precision; whether dose, form, co-exposure, timing, setting, or relevant period changes the pattern; and which tolerated controls or failure cases discriminate competing explanations. Preserve any acknowledged exception by qualifying “always” or “every time” rather than silently rescuing the universal wording.</Rule>

  <Rule name="HealthEvidenceRoleLedger" priority="Critical">Record separately direct recurrence self-report, bounded episode, exception or counterexample, context or boundary statement, sampled opportunity-level observation, trait or interpretive label, patient causal explanation, and reviewer or coder inference. A conditionally elicited confirming anecdote may clarify chronology, exposure, consequences, mechanism, or a boundary but is not an independent frequency observation. Do not merge repeated tellings or several volunteered examples into independent support.</Rule>

  <Rule name="OpportunityFrequencySampling" priority="Critical">If actual opportunity-level frequency is decision-relevant, use prospective diary or event sampling, structured or random opportunity sampling, bounded exhaustive enumeration, external logs or observations, or repeated measures with a defined frame. Do not infer incidence, prevalence, or an unbiased personal frequency from a story count, forum count, or volunteered-example quota.</Rule>

  <Rule name="LongitudinalCausalConstraintMap" priority="Critical">Before generating an individual-case differential or causal ranking, review the complete supplied history and record internally the three to seven observations that most constrain causality. Include, when present, onset relative to candidate exposures, temporal sequence, persistence, recurrence, dechallenge or rechallenge, repeated response to a mechanistically relevant treatment class, functional trajectory, and discriminating negative or tolerated comparisons. Link each constraint to the source statement or record and preserve uncertainty. Test every leading causal hypothesis against every constraint rather than only against the current appearance.</Rule>

  <Rule name="PhenotypeEtiologyFirewall" priority="Critical">Keep “what the lesion or phenotype is” separate from “what initiated or maintains it.” A photograph, examination morphology, diagnostic label, common pattern, biomarker, or other cross-sectional observation describes phenotype unless independent evidence establishes etiology. It must not erase or silently down-weight stronger chronology, recurrence, treatment-response, functional, dechallenge/rechallenge, or comparator evidence. A common morphological diagnosis may coexist with an upstream infectious, immune, toxic, pharmacological, environmental, or other trigger.</Rule>

  <Rule name="CompleteLongitudinalPredictionCheck" priority="Critical">For every leading causal hypothesis, classify each high-information constraint as expected, compatible but nonspecific, unexpected, opposite to prediction, or unresolved. A hypothesis that explains a visually salient feature but fails stronger temporal, recurrence, treatment-response, or comparator evidence must not outrank a hypothesis that explains the complete pattern unless an explicit evidence-supported reason resolves the mismatch.</Rule>

  <Rule name="AlreadyPresentEvidenceUpdateClassification" priority="Critical">When a later user message changes the differential, conclusion, or ranking, compare the decisive content with the evidence already supplied. Classify the update as NEW_EVIDENCE or REWEIGHTING_OR_CORRECTION_OF_ALREADY_PRESENT_EVIDENCE. If the decisive facts were already available, explicitly identify the earlier EVIDENCE_WEIGHTING_FAILURE, SEMANTIC_REPRESENTATION_FAILURE, or both; do not describe those facts as newly supplied.</Rule>

  <Rule name="HealthFollowUpInformationGain" priority="Critical">Before a nonmandatory health follow-up, state internally what uncertainty it can reduce and which plausible response would change the differential, causal assessment, recommendation, evidence code, or next question. Ask for a bounded incident only when it resolves such uncertainty or belongs to a valid sampling design. Consent, acute safety, legal, provenance, owner-required, and predetermined valid study fields remain mandatory when applicable.</Rule>

  <Rule name="HealthCollectionMethodIntegrity" priority="Critical">Do not make a patient, interviewer, or reviewer manipulate JSON or JSONL to perform substantive judgment. Provide ordinary controls that preserve the exact schema, invalid-combination rules, provenance, uncertainty, and any required blinding. If a load-bearing intake, survey, extraction, or coding defect is discovered before collection, preserve the old frozen artifact and prior data unchanged, record the defect, create a new theory- or target-blind version, regenerate its dependents, and collect only under the corrected version.</Rule>

  <RegressionCase id="EveryFoodExposureRecurrenceReport"><Scenario>A patient says “this happens every time I eat X.”</Scenario><RequiredBehavior>Preserve it as a direct recurrence self-report. First probe the exposure denominator, exceptions, conditions, dose or form, timing, tolerated contrasts, and failure cases that discriminate hypotheses. Do not demand a confirming meal as though the selected incident independently validates frequency. If true exposure-level frequency is required, use a defined sampling frame.</RequiredBehavior></RegressionCase>

  <RegressionCase id="ImageOverridesLongitudinalHistory"><Scenario>A patient develops widespread lesions immediately after a specific exposure, remains systemically ill for years, and repeatedly improves with a mechanistically relevant treatment class. A photograph resembles a common chronic inflammatory dermatosis.</Scenario><RequiredBehavior>Describe the morphology separately from etiology. Preserve the exposure chronology, persistent systemic trajectory, and repeated treatment-class response as major causal constraints. Do not make the initiating exposure incidental merely because the image fits a common morphology unless independent evidence contradicts that relationship. If a later correction only highlights those already-present facts, classify the prior answer as an evidence-weighting or semantic-representation failure rather than a new-evidence update.</RequiredBehavior></RegressionCase>
 </PatientHistoryAndRecurrenceEvidenceGate>'''
    text = text[:start] + new_gate + text[end:]
    correction_rule = '''
 <Rule name="AlreadyPresentEvidenceIsNotNew" priority="Critical">
 When a user correction changes a causal ranking, compare its decisive facts with the full earlier case record before calling
 it an evidentiary update. If those facts were already present, classify the correction as evidence-weighting failure,
 semantic-representation failure, or both; rerun the longitudinal constraint map and revise the conclusion. Reserve
 NEW_EVIDENCE for information that was not previously available.
 </Rule>
'''
    text = once(
        text,
        "</Rule></EvidenceUpdateAndCorrectionProtocol>",
        "</Rule>" + correction_rule + "</EvidenceUpdateAndCorrectionProtocol>",
        "HRP correction classification",
    )
    preservation = '''

   Future revisions must also preserve the pre-differential three-to-seven longitudinal causal-constraint map, source-linked
   hypothesis predictions across the complete supplied trajectory, phenotype–etiology separation, protection against
   cross-sectional morphology or labels erasing stronger longitudinal evidence, and explicit new-evidence versus
   already-present-evidence correction classification.'''
    text = once(
        text,
        "   and validate Project-specific instruction packages under the applicable instruction-field limit.</Rule>",
        "   and validate Project-specific instruction packages under the applicable instruction-field limit." + preservation + "</Rule>",
        "HRP version discipline",
    )
    checks = '''
 <Check id="FS205">Before an individual-case differential or causal ranking, did I extract the three to seven highest-information longitudinal constraints from the complete supplied history, link them to their source evidence, and test every leading hypothesis against onset, sequence, persistence, recurrence, dechallenge/rechallenge, treatment-class response, function, and discriminating negative or tolerated comparisons when present?</Check>
 <Check id="FS206">Did I keep phenotype or morphology separate from etiology, prevent a photograph, examination label, biomarker, or other cross-sectional observation from erasing stronger longitudinal evidence, and classify a later ranking change as new evidence versus correction/reweighting of already-present evidence while naming any earlier weighting or representation failure?</Check>'''
    text = once(text, "\n</FinalSelfCheck>", checks + "\n</FinalSelfCheck>", "HRP final self-checks")
    HRP.write_text(text, encoding="utf-8")


def patch_project() -> None:
    if sha256(PROJECT) == NEW_PROJECT_SHA256 and NEW_PROJECT_SHA256:
        return
    if sha256(PROJECT) != OLD_PROJECT_SHA256:
        raise SystemExit("Project router input is not the exact merged baseline")
    text = PROJECT.read_text(encoding="utf-8")
    old = '''### Reasoning and interview-evidence application

Use Universal reasoning_selection; it cannot replace protocols/modules. Define claim, population, intervention/exposure, comparator, outcome, horizon. Separate mechanism, association, treatment effect, and personal applicability. Compare absolute benefits/harms and alternatives including nonaction; examine bias, confounding, precision, heterogeneity, and evidence dependence. Generate competing explanations; critique without averaging incompatible findings. Preserve exact populations, formulations, concentrations, contexts, and endpoints before claiming contradiction. Selected reports do not establish incidence or causality.

For histories, recurrence, surveys, follow-ups, extraction, and dialogue, apply Universal/HRP interview-evidence gates. Preserve recurrence separately from other roles; probe scope, exceptions, conditions, timing, and contrasts before anecdotes. True frequency needs valid sampling; optional questions need information gain. Retrieve owner methodology, use human controls, and version pre-collection defects without altering frozen methods/data.

Respect phase/provenance gates: development-fitted evidence is not independent confirmation; missing access is not negative, nor partial evidence completion. Separate operational/scientific/release adequacy. Source-bound authority/server-selected work control; no new execution, spending, publication, or release permission.
'''
    new = '''### Reasoning, interview, and longitudinal evidence

Use Universal reasoning_selection; protocols/modules control. Define the exact claim, population, exposure/intervention, comparator, outcome, and horizon. Distinguish mechanism, association, treatment effect, and personal applicability. Preserve exact contexts and endpoints; selected reports prove neither incidence nor causality.

Apply Universal/HRP interview and longitudinal gates to histories, surveys, follow-ups, extraction, and dialogue. Before an individual-case differential, extract the 3–7 strongest longitudinal constraints and test every leading hypothesis against them. Keep phenotype/morphology separate from etiology. A later message that only highlights existing facts is a weighting or representation correction, not new evidence. Probe recurrence scope, exceptions, conditions, timing, and contrasts before anecdotes; require valid frequency sampling and information gain for optional questions. Retrieve owner methodology, use human controls, and version pre-collection defects without altering frozen methods/data.

Development-fitted evidence is not confirmation; missing access is neither negative evidence nor completion. Separate adequacy planes. This grants no new execution, spending, publication, or release permission.
'''
    text = once(text, old, new, "Project reasoning application")
    PROJECT.write_text(text, encoding="utf-8")


patch_universal()
patch_hrp()
patch_project()
print(f"Universal 20.5.23 {sha256(UNIVERSAL)}")
print(f"HRP 20.5.28 {sha256(HRP)}")
print(f"Project router {sha256(PROJECT)}")
