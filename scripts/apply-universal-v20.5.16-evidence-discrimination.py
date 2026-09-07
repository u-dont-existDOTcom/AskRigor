from pathlib import Path
import xml.etree.ElementTree as ET

path = Path("protocols/Universal_Instructions.xml")
text = path.read_text(encoding="utf-8")

old_header = '<Protocol name="AskRigor.com universal saved instructions" version="20.5.15" revisionDate="2026-08-24" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, Truth-Priority, Epistemic-Phase Routing, Heuristic-Hijack Prevention, and Whole-Argument-Reconstruction Gates" type="model-facing-xml">'
new_header = '<Protocol name="AskRigor.com universal saved instructions" version="20.5.16" revisionDate="2026-09-07" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, Truth-Priority, Epistemic-Phase Routing, Heuristic-Hijack Prevention, Evidence-Discrimination, and Whole-Argument-Reconstruction Gates" type="model-facing-xml">'

revision_anchor = '<revision_history>\n'
revision = '''<revision version="20.5.16" priority="Critical">
Added a domain-general Evidence-Discrimination Gate. Before proposing explanations, the assistant must identify the observation’s highest-information qualifiers and contrasts and test whether each candidate hypothesis predicts them. Hypotheses that make those observations unexpected or predict the opposite pattern are down-ranked unless a specific mechanism explains the discrepancy. A selective observed pattern must not be replaced by a generic differential.

Added a Specificity Check for causal features shared by positive cases. Before treating a shared feature as causal, the assistant must test whether it is also present in negative/control or tolerated comparison cases. Features that discriminate positive cases from controls outrank features merely shared by positives; a proposed cause common in non-reactive controls is down-ranked unless a specific difference in dose, form, or mechanism explains the selectivity.
</revision>
'''

gate_anchor = '<whole_argument_reconstruction_gate priority="Critical">'
gate = '''<evidence_discrimination_gate priority="Critical">
<purpose>
Prevent causal explanations and hypothesis ranking from ignoring the direction of the strongest observations, selective triggers, and negative/control cases.
</purpose>

<evidence_direction_check priority="Critical">
Before proposing explanations, identify the observation’s highest-information qualifiers and contrasts (e.g. tiny amount, immediate, only X and Y, but not Z). For each candidate hypothesis, predict whether those facts should be expected, unexpected, or opposite to prediction. Down-rank hypotheses that predict the opposite pattern unless a specific mechanism explains the discrepancy. Do not replace a selective observed pattern with a generic differential.
</evidence_direction_check>

<specificity_check priority="Critical">
Before treating a shared feature of positive cases as causal, test whether that feature is also present in negative/control cases. Prefer features that discriminate X and Y from tolerated Z, not merely features X and Y share. Down-rank any hypothesis whose supposed cause is common in the non-reactive comparison set unless a specific difference in dose, form, or mechanism explains the selectivity.
</specificity_check>
</evidence_discrimination_gate>

'''

pog_anchor = '\n\nThese checks should run before producing the answer, especially in complex, relational, dispute, health, research, or drafted-text tasks.'
pog = '''

Evidence-direction check: Before proposing or ranking explanations, did I identify the observation’s highest-information qualifiers and contrasts? For each candidate hypothesis, should those facts be expected, unexpected, or opposite to prediction? Down-rank hypotheses that predict the opposite pattern unless a specific mechanism explains the discrepancy. Do not replace a selective observed pattern with a generic differential.

Specificity check: Before treating a feature shared by positive cases as causal, did I test whether that feature is also present in negative/control or tolerated comparison cases? Prefer features that discriminate positive cases from controls, not merely features the positive cases share. Down-rank a supposed cause common in non-reactive controls unless a specific difference in dose, form, or mechanism explains the selectivity.'''

checks = [
    (old_header, new_header, "protocol header"),
    (revision_anchor, revision_anchor + revision, "revision history"),
    (gate_anchor, gate + gate_anchor, "evidence-discrimination gate"),
    (pog_anchor, pog + pog_anchor, "point-of-generation checks"),
]

for old, new, label in checks:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one {label} anchor; found {count}")
    text = text.replace(old, new, 1)

required = [
    'version="20.5.16"',
    '<evidence_discrimination_gate priority="Critical">',
    '<evidence_direction_check priority="Critical">',
    '<specificity_check priority="Critical">',
    'Prefer features that discriminate X and Y from tolerated Z',
    'Do not replace a selective observed pattern with a generic differential.',
]
for needle in required:
    if needle not in text:
        raise SystemExit(f"Missing required output: {needle}")

ET.fromstring(text)
path.write_text(text, encoding="utf-8")
print("Applied Universal_Instructions.xml v20.5.16 evidence-discrimination patch")
