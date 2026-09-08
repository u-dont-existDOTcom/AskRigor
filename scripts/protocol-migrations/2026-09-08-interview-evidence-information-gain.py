from __future__ import annotations

import hashlib
import re
from pathlib import Path

U = Path("protocols/Universal_Instructions.xml")
H = Path("protocols/HRP_Full.xml")
T = Path("tests/protocol.test.ts")
R = Path("README.md")
P = Path("project/PROJECT_INSTRUCTIONS.md")

OLD_U_SHA = "c85378c9993731bf93daa65a9d49438d25b1008e065bd3eb9aaac215c0af1426"
OLD_H_SHA = "2da6edf410c54182b3aa333d7cf9e9a11c24cf86138dfcaa508b019e3a84e2e9"
NEW_U_SHA = "d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6"
NEW_H_SHA = "19b23a6b66162a2b734c3197fc287ce740a82bee92cd84d5a9e1e2b9380e8659"


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one marker, found {count}")
    return text.replace(old, new, 1)


def replace_expected(
    text: str,
    old: str,
    new: str,
    label: str,
    expected_count: int = 1,
) -> str:
    old_count = text.count(old)
    if old_count == expected_count:
        return text.replace(old, new)
    if old_count == 0 and text.count(new) >= expected_count:
        return text
    raise SystemExit(
        f"{label}: expected {expected_count} old marker(s) or synchronized value; "
        f"found old={old_count} new={text.count(new)}"
    )


def patch_file(path: Path, replacements: list[tuple[str, str, str, int]]) -> None:
    text = path.read_text(encoding="utf-8")
    for old, new, label, expected_count in replacements:
        text = replace_expected(text, old, new, label, expected_count)
    path.write_text(text, encoding="utf-8")


def patch_universal() -> None:
    text = U.read_text(encoding="utf-8")
    if 'version="20.5.22"' in text and '<interview_evidence_information_gain_gate priority="Critical">' in text:
        if hashlib.sha256(U.read_bytes()).hexdigest() != NEW_U_SHA:
            raise SystemExit("Universal 20.5.22 bytes differ from the migration output")
        return
    if hashlib.sha256(U.read_bytes()).hexdigest() != OLD_U_SHA:
        raise SystemExit("Universal input is not the exact 20.5.21 base")

    text = once(
        text,
        '<Protocol name="AskRigor.com universal saved instructions" version="20.5.21" revisionDate="2026-09-08"',
        '<Protocol name="AskRigor.com universal saved instructions" version="20.5.22" revisionDate="2026-09-08"',
        "Universal root version",
    )
    text = once(
        text,
        "Evidence-Depth, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Universal fullName",
    )
    revision = '''<revision version="20.5.22" priority="Critical">
Added a domain-general Interview-Evidence and Information-Gain Gate. Specificity and vividness are separated from evidential independence; a self-selected confirming incident may clarify a recurrence claim but is not another unbiased opportunity observation. Direct behavioral recurrence self-report remains evidence of what the respondent reports, with its proposition, original quantifier, scope or denominator, context, exceptions, and uncertainty preserved rather than discarded for lacking a bounded episode.

The revision makes recurrence probing exception-first, accepts natural uncertainty without forced numerical precision, restricts incident requests and other nonmandatory follow-ups to questions that can change an inference or next step, prohibits unjustified example quotas, and distinguishes recurrence reports, bounded episodes, counterexamples, boundary statements, sampled opportunities, trait labels, causal explanations, and analyst inference. Actual opportunity-frequency claims require a defensible sampling frame. Human judgment requires a human-facing interface, relevant owner-supplied methodology precedes bespoke design, and a load-bearing pre-collection defect triggers a versioned theory-blind method repair rather than silent reinterpretation of a frozen artifact.
</revision>
'''
    text = once(text, "<revision_history>\n", "<revision_history>\n" + revision, "Universal revision")
    text = once(
        text,
        "- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Update proportionately; do not invent confidence percentages.",
        "- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Distinguish specificity and detail from evidential independence; a self-selected concrete example is not automatically an independent observation. Update proportionately; do not invent confidence percentages.",
        "Universal empirical selector",
    )
    text = once(
        text,
        "Agreement, fluency and repeated self-review are not independent evidence.",
        "Agreement, fluency, specificity, vividness, repeated examples and repeated self-review are not independent evidence.",
        "Universal independence selector",
    )
    text = once(
        text,
        "Follow current project authority and non-waivable gates. Before substantial bespoke design, preserve independent ideas when needed, scan existing work, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder.",
        "Follow current project authority and non-waivable gates. Before a nonmandatory follow-up, identify what uncertainty it can reduce and what plausible answer could alter the inference, decision, code, or next question. Before substantial bespoke design, preserve independent ideas when needed, scan existing work including relevant owner-supplied methodology, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder.",
        "Universal follow-up selector",
    )

    gate = '''<interview_evidence_information_gain_gate priority="Critical">
INTERVIEW-EVIDENCE AND INFORMATION-GAIN INTEGRITY

<purpose>Prevent interviews, surveys, qualitative coding, history-taking, expert elicitation, and evidence-gathering dialogue from confusing detail with independent support, flattening different evidence roles, imposing anecdote quotas, or burdening a respondent with questions that cannot change the inference.</purpose>

<activation>Apply when eliciting, extracting, coding, or interpreting generalized recurrence or frequency statements; examples, episodes, incidents, exceptions, or counterexamples; behavioral or trait claims; and follow-up questions in any interview, survey, case history, chart review, qualitative review, or annotation workflow. Also apply before substantially designing such a method when relevant owner-supplied books, papers, manuals, protocols, transcripts, or prior work may exist.</activation>

<rules priority="Critical">
<rule name="SuppliedMethodologyFirst" priority="Critical">Retrieve and inspect relevant owner-supplied methodology before freezing or substantially refining a bespoke collection method. Search a large corpus for the actual methodological question rather than substituting remembered summaries, generic instincts, or a homemade method. If the material is unavailable, record that dependency.</rule>

<rule name="SpecificityIsNotIndependence" priority="Critical">A concrete or vivid incident can clarify a claim without independently supporting it. After a respondent says “I always X,” a self-selected confirming example of X is conditionally sampled. It may clarify meaning, sequence, prerequisites, context, consequences, mechanism, or a boundary, but do not count it as a random opportunity, independent replication, or unbiased frequency observation. More detail can improve interpretability without increasing evidential independence.</rule>

<rule name="DirectRecurrenceSelfReport" priority="Critical">Treat a generalized behavioral recurrence statement as direct evidence that the respondent reports or perceives recurrence at the stated strength. Preserve separately the behavioral proposition, original quantifier, scope or denominator, relevant life period or context, stated exceptions, and uncertainty. Do not discard it merely because it is not a bounded episode.</rule>

<rule name="OrdinaryLanguageQuantifierCalibration" priority="Critical">Do not automatically interpret ordinary-language “always” as a logically exceptionless universal. Calibrate its scope and exceptions. If exceptions are acknowledged, qualify the recurrence strength; do not silently rescue or retain the original universal interpretation.</rule>

<rule name="ExceptionFirstRecurrenceProbe" priority="Critical">For a generalized recurrence claim, default to the cheapest discriminating sequence: clarify which situations or opportunities the quantifier covers; ask whether conditions exist where the behavior or outcome does not occur; ask how often it fails within those opportunities; and, when material, ask whether the pattern changed across relevant periods. Accept natural resolution such as never, almost never, sometimes, context-dependent, a rough fraction, or a bounded count. Do not force false numerical precision.</rule>

<rule name="IncidentInformationGain" priority="Critical">Ask for a concrete incident only when it can add information: clarify what the behavior or outcome means, distinguish live interpretations, resolve chronology, establish opportunity, feasibility, or non-action, specify a boundary or exception, clarify consequences or mechanism, or obtain an observation under a valid sampling design. Do not request a confirming anecdote as ritual corroboration.</rule>

<rule name="CounterexampleValue" priority="Critical">A genuine counterexample can falsify or materially qualify a strong claim and may be more informative than another confirming example. Do not ritualistically demand an exception episode. A clearly stated boundary condition and approximate exception frequency may be sufficient; request a bounded exception only when it resolves additional uncertainty.</rule>

<rule name="FrequencySamplingFrame" priority="Critical">When actual opportunity-level frequency is the target, use a defensible frame such as prospective diary or event sampling, random or structured opportunity sampling, bounded exhaustive enumeration, external logs or observation, or repeated measures. Several volunteered examples do not become representative because there are several.</rule>

<rule name="NoFormatQuota" priority="Critical">Do not require two examples, three episodes, or another format quota unless the threshold is causally or statistically justified for the inference. A quota can create selection bias, participant burden, duplicated evidence, pressure to invent, and false confidence. Stop when the needed decision is supported or the unresolved uncertainty is bounded.</rule>

<rule name="EvidenceRoleSeparation" priority="Critical">At minimum distinguish direct recurrence self-report, bounded episode, exception or counterexample, context or boundary statement, sampled opportunity-level observation, trait or interpretive label, causal explanation, and analyst or coder inference. Preserve provenance and sampling status. Do not let one role silently substitute for another.</rule>

<rule name="BehaviorVersusTrait" priority="Critical">“I always check the door” is behavioral recurrence self-report. “I am always cautious” is primarily a trait or interpretive label unless behavioral content supports it. Do not convert either into the other without evidence.</rule>

<rule name="FollowUpExpectedInformationGain" priority="Critical">Before asking a nonmandatory follow-up, identify the uncertainty it can reduce and at least one plausible answer that could change the inference, differential, recommendation, code, or next question. If no plausible answer would change anything, normally do not ask. Mandatory consent, safety, legal, provenance, explicit owner-requested, and valid predetermined study fields remain required.</rule>

<rule name="HumanJudgmentInterface" priority="Critical">JSON, JSONL, and schemas are machine interchange formats, not the default interface for substantive human judgment. Give human reviewers ordinary controls that present one judgment unit at a time, show only authorized evidence and rules, prevent invalid combinations, capture uncertainty, exceptions, provenance, and notes, and export the exact machine contract. Preserve blinding when required.</rule>

<rule name="PreCollectionMethodDefect" priority="Critical">If a load-bearing methodological defect is found before collection or calibration, stop that pass. Preserve the old frozen artifact unchanged for history, record the defect, create a new versioned theory- or target-blind revision, regenerate dependent development artifacts, and then collect. Do not knowingly collect under a defective rule for procedural continuity or silently reinterpret a frozen method. This does not authorize post-hoc rescue after confirmation outcomes are visible.</rule>
</rules>

<regression_cases priority="Critical">
<case id="ConfirmingExampleDoesNotIndependentlyValidateAlways"><scenario>A person reports “I always X” and is asked for an example of X.</scenario><expected_behavior>Preserve the original statement as direct reported recurrence. Treat the selected example as conditionally sampled detail, not independent frequency support. Clarify the denominator and probe exceptions or boundary conditions before deciding whether any incident would add information.</expected_behavior></case>
<case id="ExceptionsQualifyOrdinaryAlways"><scenario>A respondent uses “always,” then reports conditions where X sometimes does not occur.</scenario><expected_behavior>Preserve the original wording and the exceptions, qualify the estimated recurrence strength, and do not silently keep an exceptionless interpretation. Accept natural uncertainty without forcing an invented percentage.</expected_behavior></case>
</regression_cases>
</interview_evidence_information_gain_gate>

'''
    text = once(
        text,
        '<heuristic_attractor_check priority="Critical">',
        gate + '<heuristic_attractor_check priority="Critical">',
        "Universal active interview gate",
    )
    check = "Interview-evidence check: If I am eliciting or coding recurrence, did I preserve the direct recurrence report and its quantifier, denominator, context, exceptions, and uncertainty; distinguish it from episodes, traits, causes, coder inference, and genuinely sampled opportunities; probe exceptions before ritual confirming anecdotes; and ask each nonmandatory follow-up only for identifiable information gain? If a human must judge it, is there a human-facing interface, and if a load-bearing pre-collection defect appeared, did I version the method rather than reinterpret a frozen one?\n\n"
    text = once(
        text,
        "Heuristic-attractor check: Before substantive reasoning on a complex task,",
        check + "Heuristic-attractor check: Before substantive reasoning on a complex task,",
        "Universal point-of-generation check",
    )
    U.write_text(text, encoding="utf-8")


def patch_hrp() -> None:
    text = H.read_text(encoding="utf-8")
    if 'version="20.5.26"' in text and '<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">' in text:
        if hashlib.sha256(H.read_bytes()).hexdigest() != NEW_H_SHA:
            raise SystemExit("HRP 20.5.26 bytes differ from the migration output")
        return
    if hashlib.sha256(H.read_bytes()).hexdigest() != OLD_H_SHA:
        raise SystemExit("HRP input is not the exact 20.5.25 base")

    text = once(
        text,
        '<Protocol name="HRP" version="20.5.25" revisionDate="2026-09-08"',
        '<Protocol name="HRP" version="20.5.26" revisionDate="2026-09-08"',
        "HRP root version",
    )
    text = once(
        text,
        "Cross-Agent Estimand and Exposure Comparability, Self-Directed Harm-Reduction Research",
        "Cross-Agent Estimand and Exposure Comparability, Patient-History and Recurrence-Evidence Integrity, Self-Directed Harm-Reduction Research",
        "HRP fullName",
    )
    revision = '''  <Revision version="20.5.26" priority="Critical">
   Added patient-history and recurrence-evidence integrity for symptom recurrence, adverse-effect reports, behavioral and lifestyle history, survey follow-ups, reviewer extraction, and health evidence-gathering dialogue. A patient's generalized recurrence report is retained as direct self-report evidence with its original quantifier, opportunity denominator, context, exceptions, timing, and uncertainty. A requested confirming incident is conditionally sampled detail rather than independent frequency validation.

   Health follow-ups now default to exception-first discrimination, separate evidence roles, require valid sampling for opportunity-level frequency, reject ritual episode quotas, and use expected information gain for nonmandatory questions. Human judgment requires a usable human interface. A load-bearing defect found before collection triggers a new theory-blind method version while frozen methods and prior data remain unchanged.
  </Revision>
'''
    text = once(text, " <RevisionHistory>\n", " <RevisionHistory>\n" + revision, "HRP revision")
    gate = ''' <PatientHistoryAndRecurrenceEvidenceGate priority="Critical">
  <Purpose>Apply the compatible Universal Interview-Evidence and Information-Gain Gate to patient-history intake, symptom recurrence, adverse-effect reports, behavioral and lifestyle history, surveys, reviewer extraction, and any health evidence-gathering dialogue without weakening HRP chronology, denominator, Dose-Regime, safety, causal-attribution, privacy, or forum controls.</Purpose>

  <Rule name="ReportedRecurrenceIsEvidence" priority="Critical">A patient's statement such as “this happens every time I eat X” is direct evidence of reported recurrence, not zero evidence and not automatic proof of true frequency or causality. Preserve the reported event or behavior, original quantifier, eligible exposures or opportunities, dose or formulation when relevant, life period and context, timing, exceptions, and uncertainty. Keep behavioral or symptom recurrence separate from trait labels and diagnostic or causal interpretations.</Rule>

  <Rule name="PatientExceptionFirstProbe" priority="Critical">Before asking for a confirming incident, clarify the denominator and conditions: which exposures or opportunities count; when the outcome does not happen; how often it fails at the respondent's natural precision; whether dose, form, co-exposure, timing, setting, or relevant period changes the pattern; and which tolerated controls or failure cases discriminate competing explanations. Preserve any acknowledged exception by qualifying “always” or “every time” rather than silently rescuing the universal wording.</Rule>

  <Rule name="HealthEvidenceRoleLedger" priority="Critical">Record separately direct recurrence self-report, bounded episode, exception or counterexample, context or boundary statement, sampled opportunity-level observation, trait or interpretive label, patient causal explanation, and reviewer or coder inference. A conditionally elicited confirming anecdote may clarify chronology, exposure, consequences, mechanism, or a boundary but is not an independent frequency observation. Do not merge repeated tellings or several volunteered examples into independent support.</Rule>

  <Rule name="OpportunityFrequencySampling" priority="Critical">If actual opportunity-level frequency is decision-relevant, use prospective diary or event sampling, structured or random opportunity sampling, bounded exhaustive enumeration, external logs or observations, or repeated measures with a defined frame. Do not infer incidence, prevalence, or an unbiased personal frequency from a story count, forum count, or volunteered-example quota.</Rule>

  <Rule name="HealthFollowUpInformationGain" priority="Critical">Before a nonmandatory health follow-up, state internally what uncertainty it can reduce and which plausible response would change the differential, causal assessment, recommendation, evidence code, or next question. Ask for a bounded incident only when it resolves such uncertainty or belongs to a valid sampling design. Consent, acute safety, legal, provenance, owner-required, and predetermined valid study fields remain mandatory when applicable.</Rule>

  <Rule name="HealthCollectionMethodIntegrity" priority="Critical">Do not make a patient, interviewer, or reviewer manipulate JSON or JSONL to perform substantive judgment. Provide ordinary controls that preserve the exact schema, invalid-combination rules, provenance, uncertainty, and any required blinding. If a load-bearing intake, survey, extraction, or coding defect is discovered before collection, preserve the old frozen artifact and prior data unchanged, record the defect, create a new theory- or target-blind version, regenerate its dependents, and collect only under the corrected version.</Rule>

  <RegressionCase id="EveryFoodExposureRecurrenceReport"><Scenario>A patient says “this happens every time I eat X.”</Scenario><RequiredBehavior>Preserve it as a direct recurrence self-report. First probe the exposure denominator, exceptions, conditions, dose or form, timing, tolerated contrasts, and failure cases that discriminate hypotheses. Do not demand a confirming meal as though the selected incident independently validates frequency. If true exposure-level frequency is required, use a defined sampling frame.</RequiredBehavior></RegressionCase>
 </PatientHistoryAndRecurrenceEvidenceGate>

'''
    text = once(
        text,
        " </ComparisonEstimandAndDoseExposureIntegrityGate>\n\n <HeuristicAttractorCheck",
        " </ComparisonEstimandAndDoseExposureIntegrityGate>\n\n" + gate + " <HeuristicAttractorCheck",
        "HRP active interview gate",
    )
    checks = ''' <Check id="FS198">For patient histories and health dialogue, did I preserve a generalized symptom or behavioral recurrence report as direct self-report with its original quantifier, denominator, context, exceptions, timing, and uncertainty rather than discard it for lacking a bounded episode?</Check>
 <Check id="FS199">Did I distinguish recurrence reports, bounded episodes, exceptions, boundary statements, sampled opportunities, trait labels, causal explanations, and reviewer inference, and avoid counting a conditionally selected confirming anecdote as independent frequency support?</Check>
 <Check id="FS200">Did recurrence follow-up probe denominator, conditions, exceptions, exception frequency, relevant temporal change, contrasts, and failure cases before requesting an incident, while avoiding unjustified example quotas and false numerical precision?</Check>
 <Check id="FS201">For every nonmandatory interview or survey follow-up, could a plausible answer change the differential, inference, recommendation, evidence code, or next question; and when actual opportunity frequency mattered, did I use a defensible sampling frame?</Check>
 <Check id="FS202">Did human judgment use a human-facing interface, and did any load-bearing pre-collection method defect trigger a recorded versioned theory-blind repair without altering frozen methods or prior data?</Check>
'''
    text = once(text, "</FinalSelfCheck>", checks + "</FinalSelfCheck>", "HRP final checks")
    H.write_text(text, encoding="utf-8")


def patch_project_router() -> None:
    text = P.read_text(encoding="utf-8")
    heading = "### Reasoning and interview-evidence application"
    if heading in text:
        return
    application = '''### Reasoning and interview-evidence application

Use Universal reasoning_selection. Define the research target; separate mechanism, association, effect, and applicability; assess bias, confounding, and evidence dependence; compare alternatives including nonaction; and preserve populations, contexts, and endpoints. Selected reports do not establish incidence or causality.

For patient histories, symptom/adverse-effect recurrence, surveys, reviewer extraction, and evidence dialogue, activate the canonical Universal and HRP interview-evidence gates. Preserve recurrence self-report with its proposition, quantifier, denominator, context, exceptions, and uncertainty separately from episodes, boundaries, sampled opportunities, traits, causes, and coder inference. Probe denominator, exceptions, conditions, timing, and contrasts first. A selected confirming incident is not independent frequency evidence; actual frequency needs a valid sampling frame. Ask nonmandatory follow-ups only for identifiable information gain. Retrieve owner-supplied methodology, give human reviewers ordinary controls, and version load-bearing pre-collection defects without changing frozen methods or data. Protocols, phase, provenance, privacy, source-bound authority, and gates control; this grants no execution, spending, publication, or release authority.

'''
    start_marker = "### Reasoning-selection application"
    end_marker = "## 1. Run before HRP/research"
    if text.count(start_marker) != 1 or text.count(end_marker) != 1:
        raise SystemExit("project router: expected one reasoning application and one section-1 marker")
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    text = text[:start] + application + text[end:]
    P.write_text(text, encoding="utf-8")


def patch_reasoning_selection_test(h_sha: str) -> None:
    path = Path("tests/reasoning-selection-structure.test.ts")
    text = path.read_text(encoding="utf-8")
    if "const CURRENT_REASONING_SELECTION_TEXT" not in text:
        old_element = '''const REASONING_SELECTION_ELEMENT =
  `<reasoning_selection priority="Critical">\\n${REASONING_SELECTION_TEXT}\\n</reasoning_selection>`;
'''
        current_block = old_element + '''
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
  `<reasoning_selection priority="Critical">\\n${CURRENT_REASONING_SELECTION_TEXT}\\n</reasoning_selection>`;

const INTERVIEW_POINT_CHECK =
  "Interview-evidence check: If I am eliciting or coding recurrence, did I preserve the direct recurrence report and its quantifier, denominator, context, exceptions, and uncertainty; distinguish it from episodes, traits, causes, coder inference, and genuinely sampled opportunities; probe exceptions before ritual confirming anecdotes; and ask each nonmandatory follow-up only for identifiable information gain? If a human must judge it, is there a human-facing interface, and if a load-bearing pre-collection defect appeared, did I version the method rather than reinterpret a frozen one?";
'''
        text = once(text, old_element, current_block, "reasoning-selection current constants")
        text = once(text, 'version="20\\.5\\.21" revisionDate="2026-09-08"/u', 'version="20\\.5\\.22" revisionDate="2026-09-08"/u', "reasoning-selection current root")
        text = once(text, "expect(occurrences(universal, REASONING_SELECTION_ELEMENT)).toBe(1);", "expect(occurrences(universal, CURRENT_REASONING_SELECTION_ELEMENT)).toBe(1);", "reasoning-selection occurrence")
        text = once(text, '${REASONING_SELECTION_ELEMENT}\\n\\n<heuristic_attractor_check priority="Critical">', '${CURRENT_REASONING_SELECTION_ELEMENT}\\n\\n<interview_evidence_information_gain_gate priority="Critical">', "reasoning-selection adjacency")
        text = once(text, "expect(occurrences(REASONING_SELECTION_TEXT, `- ${method}:`), method).toBe(1);", "expect(occurrences(CURRENT_REASONING_SELECTION_TEXT, `- ${method}:`), method).toBe(1);", "reasoning-selection method inventory")
        old_prior = "    const priorUniversal = universal\n      .replace('version=\"20.5.21\" revisionDate=\"2026-09-08\"', 'version=\"20.5.20\" revisionDate=\"2026-09-08\"')"
        new_prior = '''    const priorInterviewUniversal = universal
      .replace('version="20.5.22" revisionDate="2026-09-08"', 'version="20.5.21" revisionDate="2026-09-08"')
      .replace(
        "Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Evidence-Depth, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
      )
      .replace(/<revision version="20\\.5\\.22" priority="Critical">[\\s\\S]*?<\\/revision>\\n/u, "")
      .replace(/<interview_evidence_information_gain_gate priority="Critical">[\\s\\S]*?<\\/interview_evidence_information_gain_gate>\\n\\n/u, "")
      .replace(`${INTERVIEW_POINT_CHECK}\\n\\n`, "")
      .replace(CURRENT_REASONING_SELECTION_ELEMENT, REASONING_SELECTION_ELEMENT);
    expect(sha256(priorInterviewUniversal)).toBe(
      "''' + OLD_U_SHA + '''",
    );

    const priorUniversal = priorInterviewUniversal
      .replace('version="20.5.21" revisionDate="2026-09-08"', 'version="20.5.20" revisionDate="2026-09-08"')'''
        text = once(text, old_prior, new_prior, "reasoning-selection historical inverse")
    if "const CURRENT_PROJECT_APPLICATION" not in text:
        current_project_constant = '''const CURRENT_PROJECT_APPLICATION = `### Reasoning and interview-evidence application

Use Universal reasoning_selection. Define the research target; separate mechanism, association, effect, and applicability; assess bias, confounding, and evidence dependence; compare alternatives including nonaction; and preserve populations, contexts, and endpoints. Selected reports do not establish incidence or causality.

For patient histories, symptom/adverse-effect recurrence, surveys, reviewer extraction, and evidence dialogue, activate the canonical Universal and HRP interview-evidence gates. Preserve recurrence self-report with its proposition, quantifier, denominator, context, exceptions, and uncertainty separately from episodes, boundaries, sampled opportunities, traits, causes, and coder inference. Probe denominator, exceptions, conditions, timing, and contrasts first. A selected confirming incident is not independent frequency evidence; actual frequency needs a valid sampling frame. Ask nonmandatory follow-ups only for identifiable information gain. Retrieve owner-supplied methodology, give human reviewers ordinary controls, and version load-bearing pre-collection defects without changing frozen methods or data. Protocols, phase, provenance, privacy, source-bound authority, and gates control; this grants no execution, spending, publication, or release authority.

`;

'''
        text = once(text, "const AGENTS_APPLICATION =", current_project_constant + "const AGENTS_APPLICATION =", "reasoning-selection current project constant")
    old_project_assertions = '''    expect(project).toContain(`\\n${PROJECT_APPLICATION}## 1. Run before HRP/research`);
    expect(Buffer.byteLength(project, "utf8")).toBe(7751);
    expect(Array.from(project)).toHaveLength(7737);
    expect(project.split(/\\s+/u).filter(Boolean)).toHaveLength(886);
    expect(sha256(project)).toBe(
      "58d8c8387e962064a393af1cab7d78391e18dfa78571cbb0372aad8455b7db70",
    );'''
    new_project_assertions = '''    expect(project).toContain(`\\n${CURRENT_PROJECT_APPLICATION}## 1. Run before HRP/research`);
    expect(Buffer.byteLength(project, "utf8")).toBe(7867);
    expect(Array.from(project)).toHaveLength(7853);
    expect(project.split(/\\s+/u).filter(Boolean)).toHaveLength(899);
    expect(sha256(project)).toBe(
      "be778b6604baa81ea20d3fd97adabcd0586accbbece1722ae1abf6d549dc02b2",
    );
    expect(sha256(project.replace(CURRENT_PROJECT_APPLICATION, PROJECT_APPLICATION))).toBe(
      "58d8c8387e962064a393af1cab7d78391e18dfa78571cbb0372aad8455b7db70",
    );'''
    text = replace_expected(text, old_project_assertions, new_project_assertions, "reasoning-selection project historical inverse")
    text = replace_expected(text, OLD_H_SHA, h_sha, "reasoning-selection HRP digest")
    path.write_text(text, encoding="utf-8")


def patch_project_router_test() -> None:
    path = Path("tests/project-router.test.ts")
    text = path.read_text(encoding="utf-8")
    old = '''    expect(instructions).toContain(`### Reasoning-selection application

Use canonical Universal reasoning_selection for the actual question; it does not replace either complete protocol or required modules.

For research, define the claim, population, intervention/exposure, comparator, outcome and horizon as applicable. Keep mechanism, association, treatment effect and personal applicability distinct. For decisions, compare absolute benefits/harms and realistic alternatives, including nonaction. Examine bias, confounding, precision, heterogeneity and evidence dependence.

Generate competing explanations; critique assumptions without averaging incompatible findings. Preserve exact populations, formulations, concentrations, contexts and endpoints before calling results contradictory. Do not turn selected experience/forum reports into incidence estimates or causal proof.

Respect phase-specific gates and provenance; development-fitted evidence is not independent confirmation. Missing access is not a negative result; partial evidence is not completion. Separate operational, scientific and release adequacy. Source-bound authority and server-selected work control; this supplement grants no new execution, spending, publication or release permission.`);'''
    new = '''    expect(instructions).toContain(`### Reasoning and interview-evidence application

Use Universal reasoning_selection. Define the research target; separate mechanism, association, effect, and applicability; assess bias, confounding, and evidence dependence; compare alternatives including nonaction; and preserve populations, contexts, and endpoints. Selected reports do not establish incidence or causality.

For patient histories, symptom/adverse-effect recurrence, surveys, reviewer extraction, and evidence dialogue, activate the canonical Universal and HRP interview-evidence gates. Preserve recurrence self-report with its proposition, quantifier, denominator, context, exceptions, and uncertainty separately from episodes, boundaries, sampled opportunities, traits, causes, and coder inference. Probe denominator, exceptions, conditions, timing, and contrasts first. A selected confirming incident is not independent frequency evidence; actual frequency needs a valid sampling frame. Ask nonmandatory follow-ups only for identifiable information gain. Retrieve owner-supplied methodology, give human reviewers ordinary controls, and version load-bearing pre-collection defects without changing frozen methods or data. Protocols, phase, provenance, privacy, source-bound authority, and gates control; this grants no execution, spending, publication, or release authority.`);'''
    text = replace_expected(text, old, new, "project router exact application")
    path.write_text(text, encoding="utf-8")


def patch_policy_transport_tests() -> None:
    for path in [
        Path("tests/controlled-research-route.test.ts"),
        Path("tests/private-research-orchestration.test.ts"),
    ]:
        patch_file(
            path,
            [
                (
                    "d128da3c9edcea70bc2651cf7a26e765a88f2860b2eaeae74cd2489c503b00c9",
                    "2661aa8269fc9254825181433ff420e08f35acf6de1678d88a7be0af4fc92f57",
                    f"{path.name} reasoning selector digest",
                    1,
                ),
                (
                    'project.indexOf("### Reasoning-selection application")',
                    'project.indexOf("### Reasoning and interview-evidence application")',
                    f"{path.name} project application marker",
                    1,
                ),
                (
                    "d5a4b02bc53fda30bbb586d2ec34233f19bb981d38427f6311f453b84209ba5a",
                    "b734cc43f57f2d4cb2b3f302f88f8725e89ceb7e4ed4e1cf30774f1275fbfc31",
                    f"{path.name} project application digest",
                    1,
                ),
            ],
        )

    path = Path("tests/research-semantic-policy-input.test.ts")
    text = path.read_text(encoding="utf-8")
    text = replace_expected(
        text,
        "- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Update proportionately; do not invent confidence percentages.",
        "- Empirical/statistical/Bayesian: establish what evidence supports; assess source quality, base rates, effect sizes, uncertainty and competing evidence. Distinguish specificity and detail from evidential independence; a self-selected concrete example is not automatically an independent observation. Update proportionately; do not invent confidence percentages.",
        "semantic policy selector empirical line",
    )
    text = replace_expected(
        text,
        "Agreement, fluency and repeated self-review are not independent evidence.",
        "Agreement, fluency, specificity, vividness, repeated examples and repeated self-review are not independent evidence.",
        "semantic policy selector independence line",
    )
    text = replace_expected(
        text,
        "Follow current project authority and non-waivable gates. Before substantial bespoke design, preserve independent ideas when needed, scan existing work, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder.",
        "Follow current project authority and non-waivable gates. Before a nonmandatory follow-up, identify what uncertainty it can reduce and what plausible answer could alter the inference, decision, code, or next question. Before substantial bespoke design, preserve independent ideas when needed, scan existing work including relevant owner-supplied methodology, choose reuse/adapt/compose/invent/experiment, and benchmark the remainder.",
        "semantic policy selector follow-up line",
    )
    old_project = '''const PROJECT_APPLICATION_TEXT = `### Reasoning-selection application

Use canonical Universal reasoning_selection for the actual question; it does not replace either complete protocol or required modules.

For research, define the claim, population, intervention/exposure, comparator, outcome and horizon as applicable. Keep mechanism, association, treatment effect and personal applicability distinct. For decisions, compare absolute benefits/harms and realistic alternatives, including nonaction. Examine bias, confounding, precision, heterogeneity and evidence dependence.

Generate competing explanations; critique assumptions without averaging incompatible findings. Preserve exact populations, formulations, concentrations, contexts and endpoints before calling results contradictory. Do not turn selected experience/forum reports into incidence estimates or causal proof.

Respect phase-specific gates and provenance; development-fitted evidence is not independent confirmation. Missing access is not a negative result; partial evidence is not completion. Separate operational, scientific and release adequacy. Source-bound authority and server-selected work control; this supplement grants no new execution, spending, publication or release permission.`;'''
    new_project = '''const PROJECT_APPLICATION_TEXT = `### Reasoning and interview-evidence application

Use Universal reasoning_selection. Define the research target; separate mechanism, association, effect, and applicability; assess bias, confounding, and evidence dependence; compare alternatives including nonaction; and preserve populations, contexts, and endpoints. Selected reports do not establish incidence or causality.

For patient histories, symptom/adverse-effect recurrence, surveys, reviewer extraction, and evidence dialogue, activate the canonical Universal and HRP interview-evidence gates. Preserve recurrence self-report with its proposition, quantifier, denominator, context, exceptions, and uncertainty separately from episodes, boundaries, sampled opportunities, traits, causes, and coder inference. Probe denominator, exceptions, conditions, timing, and contrasts first. A selected confirming incident is not independent frequency evidence; actual frequency needs a valid sampling frame. Ask nonmandatory follow-ups only for identifiable information gain. Retrieve owner-supplied methodology, give human reviewers ordinary controls, and version load-bearing pre-collection defects without changing frozen methods or data. Protocols, phase, provenance, privacy, source-bound authority, and gates control; this grants no execution, spending, publication, or release authority.`;'''
    text = replace_expected(text, old_project, new_project, "semantic policy project application")
    path.write_text(text, encoding="utf-8")


def patch_current_consumers(u_sha: str, h_sha: str) -> None:
    patch_file(
        T,
        [
            (OLD_U_SHA, u_sha, "protocol Universal digest", 1),
            (OLD_H_SHA, h_sha, "protocol HRP digest", 1),
            ('version: "20.5.21",\n      revisionDate: "2026-09-08"', 'version: "20.5.22",\n      revisionDate: "2026-09-08"', "protocol Universal manifest", 1),
            ('version: "20.5.25",\n      revisionDate: "2026-09-08"', 'version: "20.5.26",\n      revisionDate: "2026-09-08"', "protocol HRP manifest", 1),
            ('/<Protocol name="HRP" version="20\\.5\\.25" revisionDate="2026-09-08"/', '/<Protocol name="HRP" version="20\\.5\\.26" revisionDate="2026-09-08"/', "protocol HRP current root regression", 1),
        ],
    )
    patch_file(
        Path("tests/epistemic-phase-routing.test.ts"),
        [
            ('/version="20\\.5\\.21" revisionDate="2026-09-08"/u', '/version="20\\.5\\.22" revisionDate="2026-09-08"/u', "epistemic Universal root", 1),
            ('/version="20\\.5\\.25" revisionDate="2026-09-08"/u', '/version="20\\.5\\.26" revisionDate="2026-09-08"/u', "epistemic HRP root", 1),
        ],
    )
    patch_file(
        Path("tests/explicit-commitment-obligation-structure.test.ts"),
        [('version="20\\.5\\.21" revisionDate="2026-09-08"[^>]+Explicit-Commitment-Obligation-Closure', 'version="20\\.5\\.22" revisionDate="2026-09-08"[^>]+Explicit-Commitment-Obligation-Closure', "explicit-obligation root", 1)],
    )
    patch_file(
        Path("tests/mcp-tools.test.ts"),
        [
            ('version: "20.5.25"', 'version: "20.5.26"', "MCP HRP version", 1),
            (OLD_H_SHA, h_sha, "MCP HRP digest", 1),
            ('version: "20.5.21"', 'version: "20.5.22"', "MCP Universal version", 3),
            (OLD_U_SHA, u_sha, "MCP Universal digest", 3),
        ],
    )
    patch_file(
        Path("tests/normality-base-rate-structure.test.ts"),
        [('version="20\\.5\\.21" revisionDate="2026-09-08"[^>]+Normality-Base-Rate', 'version="20\\.5\\.22" revisionDate="2026-09-08"[^>]+Normality-Base-Rate', "normality root", 1)],
    )
    patch_file(
        Path("tests/release-packet.test.ts"),
        [
            ('Universal Instructions `20.5.21`', 'Universal Instructions `20.5.22`', "release Universal version", 1),
            (OLD_U_SHA, u_sha, "release Universal digest", 1),
        ],
    )
    patch_file(
        Path("tests/research-before-reinvention-structure.test.ts"),
        [(
            'version="20\\.5\\.21" revisionDate="2026-09-08"',
            'version="20\\.5\\.22" revisionDate="2026-09-08"',
            "reinvention root",
            1,
        )],
    )
    old_frontier = f'''        name: "AskRigor.com universal saved instructions",
        version: "20.5.21",
        revisionDate: "2026-09-08",
        sha256: "{OLD_U_SHA}",
      }},
      {{
        name: "HRP",
        version: "20.5.25",
        revisionDate: "2026-09-08",
        sha256: "{OLD_H_SHA}",'''
    new_frontier = f'''        name: "AskRigor.com universal saved instructions",
        version: "20.5.22",
        revisionDate: "2026-09-08",
        sha256: "{u_sha}",
      }},
      {{
        name: "HRP",
        version: "20.5.26",
        revisionDate: "2026-09-08",
        sha256: "{h_sha}",'''
    patch_file(
        Path("tests/research-frontier-repository.test.ts"),
        [(old_frontier, new_frontier, "research frontier current manifests", 1)],
    )
    patch_file(
        Path("tests/whole-argument-reconstruction-structure.test.ts"),
        [
            ('version="20\\.5\\.21" revisionDate="2026-09-08"', 'version="20\\.5\\.22" revisionDate="2026-09-08"', "whole-argument root", 1),
            (OLD_H_SHA, h_sha, "whole-argument HRP digest", 1),
        ],
    )
    # OLD_U_SHA remains deliberately as the reconstructed 20.5.21 receipt.
    patch_reasoning_selection_test(h_sha)
    patch_project_router_test()
    patch_policy_transport_tests()


def patch_readme(u_sha: str, h_sha: str) -> None:
    text = R.read_text(encoding="utf-8")
    old = (
        "The current canonical files identify HRP `20.5.25` (2026-09-08), SHA-256\n"
        f"`{OLD_H_SHA}`,\n"
        "and Universal Instructions `20.5.21` (2026-09-08), SHA-256\n"
        f"`{OLD_U_SHA}`."
    )
    new = (
        "The current canonical files identify HRP `20.5.26` (2026-09-08), SHA-256\n"
        f"`{h_sha}`,\n"
        "and Universal Instructions `20.5.22` (2026-09-08), SHA-256\n"
        f"`{u_sha}`."
    )
    text = replace_expected(text, old, new, "README canonical receipt")
    R.write_text(text, encoding="utf-8")


patch_universal()
patch_hrp()
patch_project_router()
new_u_sha = hashlib.sha256(U.read_bytes()).hexdigest()
new_h_sha = hashlib.sha256(H.read_bytes()).hexdigest()
patch_current_consumers(new_u_sha, new_h_sha)
patch_readme(new_u_sha, new_h_sha)
print(f"Universal 20.5.22 {new_u_sha}")
print(f"HRP 20.5.26 {new_h_sha}")
