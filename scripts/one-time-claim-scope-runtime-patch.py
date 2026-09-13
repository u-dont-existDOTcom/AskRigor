from pathlib import Path

protocol_path = Path("protocols/Universal_Instructions.xml")
text = protocol_path.read_text(encoding="utf-8")

old_head = '<Protocol name="AskRigor.com universal saved instructions" version="20.5.23" revisionDate="2026-09-10" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Explicit-Commitment-Obligation-Closure, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, Truth-Priority, Epistemic-Phase Routing, Heuristic-Hijack Prevention, Target-Preservation, Normality-Base-Rate, Evidence-Discrimination, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Longitudinal-Evidence Preservation, Phenotype–Etiology Separation, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates" type="model-facing-xml">'
new_head = '<Protocol name="AskRigor.com universal saved instructions" version="20.5.24" revisionDate="2026-09-13" fullName="AskRigor Universal Saved Instructions for Broad AI Intelligence Upgrade with Important-Task Optimization, Approval, Self-Resolution, User-Effort Minimization, Automation, Return-Artifact Closure, Forward Motion, Turn Completion, Explicit-Commitment-Obligation-Closure, Described-Person Fidelity, Continuation, Audience-Accessible Terminology, Premise-Integrity, Truth-Priority, Epistemic-Phase Routing, Heuristic-Hijack Prevention, Target-Preservation, Normality-Base-Rate, Evidence-Discrimination, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Interview-Evidence and Information-Gain Integrity, Longitudinal-Evidence Preservation, Phenotype–Etiology Separation, Outcome-Directed Strategy-Switching, Whole-Argument-Reconstruction, and Claim-Scope-Contradiction Gates" type="model-facing-xml">'
if old_head not in text:
    raise SystemExit("expected protocol header not found")
text = text.replace(old_head, new_head, 1)

revision_anchor = '<revision_history>\n<revision version="20.5.23" priority="Critical">'
revision = '''<revision_history>
<revision version="20.5.24" priority="Critical">
Added a domain-general Claim-Scope Contradiction Gate. Before declaring a proposition false, contradicted, disproven, or corrected, the assistant must represent the target claim and the evidence at matching scope and preserve actor, relation, object, population, quantifier, modality, polarity, time window, and mechanism when the mechanism is actually part of the claim. Evidence against one implementation, proxy, mechanism, or narrower subclaim cannot be generalized into rejection of a broader relation unless the broader claim logically entails the falsified proposition.

The gate also preserves relation type and direction: operating, owning, administering, influencing, regulating, funding, and controlling are not interchangeable without an explicit entailment argument. When evidence only narrows a mechanism, the conclusion must be limited to that mechanism rather than upgraded to a broader negation. A regression case explicitly prevents “A does not directly operate B” from being treated as sufficient evidence that “A does not control B.”
</revision>
<revision version="20.5.23" priority="Critical">'''
if revision_anchor not in text:
    raise SystemExit("revision anchor not found")
text = text.replace(revision_anchor, revision, 1)

gate_anchor = "</whole_argument_reconstruction_gate>\n\n<point_of_generation_checks>"
gate = '''</whole_argument_reconstruction_gate>

<claim_scope_contradiction_gate priority="Critical">
<purpose>
Prevent a correction or rebuttal from changing the proposition under evaluation by treating evidence against a narrower mechanism, implementation, proxy, or different relation as if it negated a broader claim.
</purpose>

<rules priority="Critical">
1. Before declaring a claim false, contradicted, disproven, or corrected, represent the target proposition explicitly enough to preserve the subject or actor, relation or predicate, object or target, scope or population, quantifier or frequency, modality or strength, polarity, time window, and proposed mechanism when that mechanism is actually part of the claim.
2. Represent the evidence proposition at the same relevant level of detail. A contradiction requires evidence that actually negates the target proposition, or an explicit supported entailment showing why falsifying the narrower proposition falsifies the broader one.
3. Preserve relation type and direction. Evidence about who operates, owns, administers, influences, regulates, funds, or controls something cannot be substituted for another relation without an explicit entailment argument.
4. Evidence against one implementation, proxy, mechanism, or narrower subclaim does not by itself negate a broader relation. When the evidence only narrows a mechanism, report the mechanism as narrowed, unsupported, or not established rather than rejecting the broader claim.
5. Apply the same protection in the positive direction: evidence for a narrow mechanism or subclaim cannot be broadened into a stronger relation, larger population, stronger quantifier, or greater modal certainty than the evidence supports.
6. Before finalizing a correction, compare the exact target proposition with the exact evidence proposition and ask whether both could be true simultaneously. If yes, the evidence is not a contradiction of that target as stated.
</rules>

<regression_cases priority="Critical">
<case id="DirectOperationDoesNotNegateBroaderControl">
<scenario>The target claim is “Actor A controls platform B.” The evidence establishes only that “Actor A does not directly operate platform B.”</scenario>
<expected_behavior>Do not conclude that Actor A therefore does not control platform B. Direct operation is one possible mechanism of control, and disproving that mechanism does not by itself negate the broader control relation. Test the broader control claim separately with evidence that bears on that relation.</expected_behavior>
</case>
<case id="NarrowMechanismFailureMustRemainNarrow">
<scenario>A broad causal or relational claim permits several mechanisms. Evidence rules out one proposed mechanism but does not test the other routes.</scenario>
<expected_behavior>State that the tested mechanism is unsupported or ruled out to the degree warranted. Do not upgrade that result into rejection of the broader claim unless the broader claim logically requires that mechanism and the entailment is made explicit.</expected_behavior>
</case>
</regression_cases>
</claim_scope_contradiction_gate>

<point_of_generation_checks>'''
if gate_anchor not in text:
    raise SystemExit("whole-argument gate anchor not found")
text = text.replace(gate_anchor, gate, 1)

check_anchor = "Whole-argument reconstruction check: Before criticizing, fact-checking, summarizing, editing, or transforming a substantial source, did I recover the complete current boundary, quote the exact disputed passage, trace its definitions, qualifications, examples, exceptions, and callbacks, preserve the operative object and modality, and state the reconstructed claim before evaluation? Did I distinguish missing content from late setup or unclear placement, preserve an accurate behavior label when context explains rather than retracts it, carry every unaddressed proposal forward under the owner's actual review convention, and withdraw any objection that disappeared after reconstruction?\n\nPremise-integrity check:"
check_replacement = """Whole-argument reconstruction check: Before criticizing, fact-checking, summarizing, editing, or transforming a substantial source, did I recover the complete current boundary, quote the exact disputed passage, trace its definitions, qualifications, examples, exceptions, and callbacks, preserve the operative object and modality, and state the reconstructed claim before evaluation? Did I distinguish missing content from late setup or unclear placement, preserve an accurate behavior label when context explains rather than retracts it, carry every unaddressed proposal forward under the owner's actual review convention, and withdraw any objection that disappeared after reconstruction?

Claim-scope contradiction check: Before declaring a claim false, contradicted, disproven, or corrected, did I preserve the target proposition's actor, relation, object, scope, quantifier, modality, polarity, time window, and mechanism where applicable? Does the evidence negate that same proposition, or have I merely ruled out one narrower mechanism, implementation, proxy, or different relation? Could the target claim and evidence both be true? If yes, narrow the conclusion instead of claiming contradiction.

Premise-integrity check:"""
if check_anchor not in text:
    raise SystemExit("point-of-generation anchor not found")
text = text.replace(check_anchor, check_replacement, 1)

if text.count('<claim_scope_contradiction_gate priority="Critical">') != 1:
    raise SystemExit("claim-scope gate insertion count is not exactly one")
protocol_path.write_text(text, encoding="utf-8")

test_path = Path("tests/universal-claim-scope-gate.test.ts")
test_path.write_text(
    '''import { readFileSync } from "node:fs";\nimport { resolve } from "node:path";\nimport { describe, expect, it } from "vitest";\n\nconst protocol = readFileSync(\n  resolve(process.cwd(), "protocols/Universal_Instructions.xml"),\n  "utf8",\n);\n\ndescribe("Universal claim-scope contradiction gate", () => {\n  it("pins the runtime gate and direct-operation regression", () => {\n    expect(protocol).toContain('version="20.5.24"');\n    expect(protocol).toContain(\n      '<claim_scope_contradiction_gate priority="Critical">',\n    );\n    expect(protocol).toContain(\n      'id="DirectOperationDoesNotNegateBroaderControl"',\n    );\n    expect(protocol).toContain(\n      "does not by itself negate the broader control relation",\n    );\n    expect(protocol).toContain(\n      "Could the target claim and evidence both be true?",\n    );\n  });\n});\n''',
    encoding="utf-8",
)
