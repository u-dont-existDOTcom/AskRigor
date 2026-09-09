from __future__ import annotations

import hashlib
import re
from pathlib import Path

U = Path("protocols/Universal_Instructions.xml")
H = Path("protocols/HRP_Full.xml")
T = Path("tests/protocol.test.ts")
R = Path("README.md")
D = Path("docs/logic-lessons-comparison-integrity-2026-09-08.md")

OLD_U_SHA = "5365f5fcb8e9abac0b60a5cbbfa23183cf08018f1c0f6ab9a3bb1e8df87ad9b3"
OLD_H_SHA = "dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1"


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
        f"{label}: expected {expected_count} old marker(s) or an already-synchronized value; "
        f"found old={old_count} new={text.count(new)}"
    )


def patch_file(path: Path, replacements: list[tuple[str, str, str, int]]) -> None:
    text = path.read_text(encoding="utf-8")
    for old, new, label, expected_count in replacements:
        text = replace_expected(text, old, new, label, expected_count)
    path.write_text(text, encoding="utf-8")


def patch_universal() -> None:
    u = U.read_text(encoding="utf-8")
    if 'version="20.5.21"' in u and '<comparison_integrity_gate priority="Critical">' in u:
        return
    u = once(
        u,
        '<Protocol name="AskRigor.com universal saved instructions" version="20.5.20" revisionDate="2026-09-08"',
        '<Protocol name="AskRigor.com universal saved instructions" version="20.5.21" revisionDate="2026-09-08"',
        "Universal root version",
    )
    u = once(
        u,
        "Evidence-Discrimination, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Evidence-Discrimination, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Universal fullName",
    )
    revision = '''<revision version="20.5.21" priority="Critical">
Added a domain-general Comparison-Set, Estimand, Ranking-Resolution, and Evidence-Depth Integrity Gate. Rankings, comparisons, enumerations, and summaries must preserve the intended reference set rather than silently inherit a salient or assistant-introduced subset; finalization requires an omission check against the resolved set.

The gate also locks the quantity actually estimated by each measurement. A fixed-dose response is not potency, maximal efficacy is not dose efficiency, a surrogate is not a clinical outcome, and association is not intervention effect. Sortable point estimates do not by themselves establish a resolvable ordinal ranking: uncertainty, design comparability, and measurement resolution must support the pairwise order, otherwise use ties, tiers, ranges, or indeterminate order. Effect magnitude is separated from evidential depth so a one-shot screen hit is not presented as equally established as replicated, dose-responsive, orthogonally validated evidence.
</revision>
'''
    u = once(u, "<revision_history>\n", "<revision_history>\n" + revision, "Universal revision history")
    gate = '''<comparison_integrity_gate priority="Critical">
COMPARISON-SET, ESTIMAND, RANKING-RESOLUTION, AND EVIDENCE-DEPTH INTEGRITY

<rule name="ReferenceSetPreservation" priority="Critical">Before ranking, comparing, enumerating, or summarizing a set, resolve the intended comparison/reference set from the user's wording, task context, and controlling source corpus. Do not silently substitute a salient example set, a convenience subset, or a subset introduced by the assistant. When the source defines a finite eligible set, run an omission check against that set before finalizing and identify any deliberate exclusions.</rule>

<rule name="EstimandPreservation" priority="Critical">Identify what quantity each reported metric or experiment actually estimates and keep that estimand fixed through interpretation. Do not relabel response at one chosen dose as potency; maximum efficacy as dose efficiency; a surrogate or model-specific endpoint as a clinical outcome; association as intervention effect; or a mechanistic readout as whole-organism efficacy. If the requested target was not directly measured, say so and use only the closest justified proxy without renaming it as the target.</rule>

<rule name="ComparabilityBeforeOrdering" priority="Critical">Before cross-item ordering, verify that units, normalization, dose or exposure basis, endpoint, timing, population or system, and design are sufficiently comparable for the claimed order. Equal nominal inputs are not automatically equal effective exposures, and a shared numeric scale does not erase materially different measurement conditions.</rule>

<rule name="RankingResolution" priority="Critical">A sortable table of point estimates does not imply a resolvable strict rank order. Inspect uncertainty, overlap, design comparability, multiplicity where relevant, and measurement resolution before assigning pairwise order. Use ties, tiers, equivalence bands, ranges, or explicitly indeterminate ordering when the evidence cannot distinguish adjacent items. Never manufacture precision by sorting noise.</rule>

<rule name="EvidenceDepthSeparation" priority="Critical">Separate observed effect magnitude from evidential depth and confidence. A single screen, one dose, one surrogate, or one model is not as established as a result supported by dose-response, replication, orthogonal endpoints, direct physiology or outcomes, mechanistic discrimination, or independent validation, even when its point estimate is numerically larger.</rule>
</comparison_integrity_gate>

'''
    u = once(u, '<reasoning_selection priority="Critical">', gate + '<reasoning_selection priority="Critical">', "Universal active gate")
    U.write_text(u, encoding="utf-8")


def patch_hrp() -> None:
    h = H.read_text(encoding="utf-8")
    if 'version="20.5.25"' in h and '<ComparisonEstimandAndDoseExposureIntegrityGate priority="Critical">' in h:
        return
    h = once(
        h,
        '<Protocol name="HRP" version="20.5.24" revisionDate="2026-08-31"',
        '<Protocol name="HRP" version="20.5.25" revisionDate="2026-09-08"',
        "HRP root version",
    )
    h = once(
        h,
        "Dose-Regime Integrity, Self-Directed Harm-Reduction Research",
        "Dose-Regime Integrity, Cross-Agent Estimand and Exposure Comparability, Self-Directed Harm-Reduction Research",
        "HRP fullName",
    )
    revision = '''  <Revision version="20.5.25" priority="Critical">
   Added cross-agent estimand and dose-exposure integrity for comparative pharmacology and treatment rankings. A common-dose or deliberately saturating screen is interpreted as response or efficacy at that chosen exposure, not as a potency ranking unless dose-response or exposure-response evidence supports potency. Equal mg/kg, concentration, or nominal dose across agents is not assumed to be equimolar or exposure-matched.

   The revision also requires ranking resolution to respect uncertainty and evidence depth, explicit classification of direct versus surrogate/model-specific endpoints, dose-rescue logic when distinguishing lower potency from lower maximal efficacy, and separate attribution for mixtures versus their components. These rules extend rather than replace the existing Dose-Regime and estimand requirements.
  </Revision>
'''
    h = once(h, " <RevisionHistory>\n", " <RevisionHistory>\n" + revision, "HRP revision history")
    gate = ''' <ComparisonEstimandAndDoseExposureIntegrityGate priority="Critical">
  <Purpose>Prevent cross-treatment and cross-compound comparisons from confusing potency, maximal efficacy, fixed-dose response, exposure, surrogate behavior, or evidential depth.</Purpose>

  <Rule name="CrossAgentEstimandLock" priority="Critical">Before ranking treatments or compounds, state internally whether the study is designed to estimate potency such as ED50 or EC50, maximal efficacy/Emax, response at one chosen dose, onset, duration, safety, or another quantity. A common-dose or deliberately saturating screen can classify efficacy or response at that dose but cannot establish potency order without dose-response or exposure-response evidence. Do not call a fixed-dose numerical ordering a potency ranking.</Rule>

  <Rule name="DoseExposureComparability" priority="Critical">For cross-agent comparisons, do not assume the same mg/kg, concentration, administered amount, or nominal schedule represents the same molar dose, systemic exposure, tissue exposure, or target engagement. Inspect molecular weight when relevant, route, formulation, bioavailability, pharmacokinetics, active metabolites, timing, target-tissue exposure, and evidence of saturation. If exposure equivalence is unknown, bound the comparison accordingly.</Rule>

  <Rule name="PotencyVersusMaximalEfficacyDiscriminator" priority="Critical">When an agent is partially effective at a screening dose, do not attribute the deficit to underdosing without evidence. Prefer dose-response data. Loss of a full effect at a lower dose supports lower potency; failure of dose escalation to rescue a partial effect supports lower maximal efficacy or a mechanistically different response, subject to exposure and toxicity checks.</Rule>

  <Rule name="EndpointHierarchyAndTriangulation" priority="Critical">Classify the comparison endpoint as direct clinical outcome, direct physiological measure, validated surrogate, contested surrogate, biomarker, behavioral proxy, or model-specific readout. Do not relabel a surrogate as the target outcome. A contested or indirect endpoint requires triangulation with orthogonal physiology, histology, biomarkers, outcomes, or other direct measures before broad efficacy claims receive high confidence.</Rule>

  <Rule name="CompositeInterventionAttribution" priority="Critical">Treat mixtures, botanicals, combination products, polypharmacy, and their individual components as distinct interventions. Do not transfer an effect from a headline component to the mixture, or from the mixture to a component, unless composition, exposure, interaction, and mechanistic or component-level evidence support that attribution. Preserve plausible independent contributions and interactions as separate hypotheses.</Rule>

  <Rule name="CrossAgentRankingResolution" priority="Critical">Before strict ordinal ranking, inspect uncertainty, overlap, design comparability, endpoint comparability, and evidence depth. Use tiers, ties, or indeterminate pairwise order when the data do not resolve a strict order. A numerically larger one-shot screen effect does not outrank a smaller but replicated, dose-responsive, orthogonally validated result on evidential confidence.</Rule>
 </ComparisonEstimandAndDoseExposureIntegrityGate>

'''
    h = once(h, "</RevisionHistory>\n\n <HeuristicAttractorCheck", "</RevisionHistory>\n\n" + gate + " <HeuristicAttractorCheck", "HRP active gate")
    H.write_text(h, encoding="utf-8")


def patch_tests_and_receipts() -> tuple[str, str]:
    u_sha = hashlib.sha256(U.read_bytes()).hexdigest()
    h_sha = hashlib.sha256(H.read_bytes()).hexdigest()

    t = T.read_text(encoding="utf-8")
    t = t.replace(OLD_U_SHA, u_sha).replace(OLD_H_SHA, h_sha)
    t = t.replace(
        'name: "HRP",\n      version: "20.5.24",\n      revisionDate: "2026-08-31"',
        'name: "HRP",\n      version: "20.5.25",\n      revisionDate: "2026-09-08"',
        1,
    )
    t = t.replace(
        '/<Protocol name="HRP" version="20\\.5\\.24" revisionDate="2026-08-31"/',
        '/<Protocol name="HRP" version="20\\.5\\.25" revisionDate="2026-09-08"/',
        1,
    )
    t = t.replace(
        'name: "AskRigor.com universal saved instructions",\n      version: "20.5.20",\n      revisionDate: "2026-09-08"',
        'name: "AskRigor.com universal saved instructions",\n      version: "20.5.21",\n      revisionDate: "2026-09-08"',
        1,
    )
    if 'describe("comparison-integrity protocol regressions"' not in t:
        t += r'''

describe("comparison-integrity protocol regressions", () => {
  it("requires Universal 20.5.21 comparison-set, estimand, and ranking-resolution controls", async () => {
    const text = await loadProtocol("universal");
    for (const required of [
      '<revision version="20.5.21" priority="Critical">',
      '<comparison_integrity_gate priority="Critical">',
      'name="ReferenceSetPreservation"',
      'subset introduced by the assistant',
      'name="EstimandPreservation"',
      'response at one chosen dose as potency',
      'name="ComparabilityBeforeOrdering"',
      'name="RankingResolution"',
      'Never manufacture precision by sorting noise',
      'name="EvidenceDepthSeparation"',
      'A single screen, one dose, one surrogate, or one model'
    ]) expect(text).toContain(required);
  });

  it("requires HRP 20.5.25 fixed-dose, exposure, endpoint, mixture, and ranking controls", async () => {
    const text = await loadProtocol("hrp");
    for (const required of [
      '<Revision version="20.5.25" priority="Critical">',
      '<ComparisonEstimandAndDoseExposureIntegrityGate priority="Critical">',
      'name="CrossAgentEstimandLock"',
      'cannot establish potency order without dose-response or exposure-response evidence',
      'name="DoseExposureComparability"',
      'same mg/kg',
      'name="PotencyVersusMaximalEfficacyDiscriminator"',
      'failure of dose escalation to rescue a partial effect',
      'name="EndpointHierarchyAndTriangulation"',
      'name="CompositeInterventionAttribution"',
      'name="CrossAgentRankingResolution"'
    ]) expect(text).toContain(required);
  });

  it("locks the Nichols-style regression against salient-subset and saturating-dose misranking", async () => {
    const universal = await loadProtocol("universal");
    const hrp = await loadProtocol("hrp");
    expect(universal).toContain('Do not silently substitute a salient example set');
    expect(universal).toContain('A sortable table of point estimates does not imply a resolvable strict rank order');
    expect(hrp).toContain('A common-dose or deliberately saturating screen can classify efficacy or response at that dose but cannot establish potency order');
    expect(hrp).toContain('Treat mixtures, botanicals, combination products, polypharmacy, and their individual components as distinct interventions');
  });
});
'''
    t = replace_expected(
        t,
        "'one screen, one dose, one surrogate, or one model'",
        "'A single screen, one dose, one surrogate, or one model'",
        "Universal evidence-depth regression wording",
    )
    T.write_text(t, encoding="utf-8")

    patch_current_protocol_consumers(u_sha, h_sha)

    r = R.read_text(encoding="utf-8")
    receipt = re.compile(
        r"The current canonical files identify HRP `20\.5\.24` \(2026-08-31\), SHA-256\n"
        + re.escape(f"`{OLD_H_SHA}`")
        + r",\nand Universal Instructions `20\.5\.20` \(2026-09-08\), SHA-256\n"
        + re.escape(f"`{OLD_U_SHA}`")
        + r"\."
    )
    replacement = (
        "The current canonical files identify HRP `20.5.25` (2026-09-08), SHA-256\n"
        f"`{h_sha}`,\n"
        "and Universal Instructions `20.5.21` (2026-09-08), SHA-256\n"
        f"`{u_sha}`."
    )
    r, count = receipt.subn(replacement, r, count=1)
    if count == 0 and "HRP `20.5.25`" not in r:
        raise SystemExit("README canonical receipt marker not found")
    R.write_text(r, encoding="utf-8")
    return u_sha, h_sha


def patch_current_protocol_consumers(u_sha: str, h_sha: str) -> None:
    patch_file(
        Path("tests/epistemic-phase-routing.test.ts"),
        [
            (
                '/version="20\\.5\\.20" revisionDate="2026-09-08"/u',
                '/version="20\\.5\\.21" revisionDate="2026-09-08"/u',
                "epistemic Universal current root",
                1,
            ),
            (
                '/version="20\\.5\\.24" revisionDate="2026-08-31"/u',
                '/version="20\\.5\\.25" revisionDate="2026-09-08"/u',
                "epistemic HRP current root",
                1,
            ),
        ],
    )
    patch_file(
        Path("tests/explicit-commitment-obligation-structure.test.ts"),
        [(
            'version="20\\.5\\.20" revisionDate="2026-09-08"[^>]+Explicit-Commitment-Obligation-Closure',
            'version="20\\.5\\.21" revisionDate="2026-09-08"[^>]+Explicit-Commitment-Obligation-Closure',
            "explicit-obligation Universal current root",
            1,
        )],
    )
    patch_file(
        Path("tests/mcp-tools.test.ts"),
        [
            ('version: "20.5.24"', 'version: "20.5.25"', "MCP HRP current version", 1),
            ('revisionDate: "2026-08-31"', 'revisionDate: "2026-09-08"', "MCP HRP current revision date", 1),
            (OLD_H_SHA, h_sha, "MCP HRP current digest", 1),
            ('version: "20.5.20"', 'version: "20.5.21"', "MCP Universal current version", 3),
            (OLD_U_SHA, u_sha, "MCP Universal current digest", 3),
        ],
    )
    patch_file(
        Path("tests/normality-base-rate-structure.test.ts"),
        [(
            'version="20\\.5\\.20" revisionDate="2026-09-08"[^>]+Normality-Base-Rate',
            'version="20\\.5\\.21" revisionDate="2026-09-08"[^>]+Normality-Base-Rate',
            "normality Universal current root",
            1,
        )],
    )
    old_recovery = '''    const recovered = universal
      .replace('version="20.5.20" revisionDate="2026-09-08"', 'version="20.5.19" revisionDate="2026-09-07"')
      .replace(`${REVISION_ELEMENT}\\n`, "")
      .replace(`\\n${REASONING_SELECTION_ELEMENT}\\n`, "");'''
    new_recovery = '''    const priorUniversal = universal
      .replace('version="20.5.21" revisionDate="2026-09-08"', 'version="20.5.20" revisionDate="2026-09-08"')
      .replace(
        "Evidence-Discrimination, Comparison-Set and Estimand Integrity, Ranking-Resolution, Evidence-Depth, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
        "Evidence-Discrimination, Outcome-Directed Strategy-Switching, and Whole-Argument-Reconstruction Gates",
      )
      .replace(/<revision version="20\\.5\\.21" priority="Critical">[\\s\\S]*?<\\/revision>\\n/u, "")
      .replace(/<comparison_integrity_gate priority="Critical">[\\s\\S]*?<\\/comparison_integrity_gate>\\n\\n/u, "");
    expect(sha256(priorUniversal)).toBe(
      "''' + OLD_U_SHA + '''",
    );

    const recovered = priorUniversal
      .replace('version="20.5.20" revisionDate="2026-09-08"', 'version="20.5.19" revisionDate="2026-09-07"')
      .replace(`${REVISION_ELEMENT}\\n`, "")
      .replace(`\\n${REASONING_SELECTION_ELEMENT}\\n`, "");'''
    patch_file(
        Path("tests/reasoning-selection-structure.test.ts"),
        [
            (
                'version="20\\.5\\.20" revisionDate="2026-09-08"/u',
                'version="20\\.5\\.21" revisionDate="2026-09-08"/u',
                "reasoning-selection Universal current root",
                1,
            ),
            (
                '`<revision_history>\\n${REVISION_ELEMENT}\\n<revision version="20.5.19" priority="Critical">`',
                '`${REVISION_ELEMENT}\\n<revision version="20.5.19" priority="Critical">`',
                "reasoning-selection historical revision adjacency",
                1,
            ),
            (
                '`</revision_history>\\n\\n${REASONING_SELECTION_ELEMENT}\\n\\n<heuristic_attractor_check priority="Critical">`',
                '`${REASONING_SELECTION_ELEMENT}\\n\\n<heuristic_attractor_check priority="Critical">`',
                "reasoning-selection active gate adjacency",
                1,
            ),
            (old_recovery, new_recovery, "reasoning-selection historical inverse", 1),
            (OLD_H_SHA, h_sha, "reasoning-selection HRP current digest", 1),
        ],
    )
    patch_file(
        Path("tests/release-packet.test.ts"),
        [
            (
                'Universal Instructions `20.5.20`',
                'Universal Instructions `20.5.21`',
                "release packet Universal current version",
                1,
            ),
            (OLD_U_SHA, u_sha, "release packet Universal current digest", 1),
        ],
    )
    patch_file(
        Path("tests/research-before-reinvention-structure.test.ts"),
        [(
            'version="20\\.5\\.20" revisionDate="2026-09-08"/',
            'version="20\\.5\\.21" revisionDate="2026-09-08"/',
            "research-before-reinvention Universal current root",
            1,
        )],
    )
    old_frontier = '''        name: "AskRigor.com universal saved instructions",
        version: "20.5.20",
        revisionDate: "2026-09-08",
        sha256: "''' + OLD_U_SHA + '''",
      },
      {
        name: "HRP",
        version: "20.5.24",
        revisionDate: "2026-08-31",
        sha256: "''' + OLD_H_SHA + '''",'''
    new_frontier = '''        name: "AskRigor.com universal saved instructions",
        version: "20.5.21",
        revisionDate: "2026-09-08",
        sha256: "''' + u_sha + '''",
      },
      {
        name: "HRP",
        version: "20.5.25",
        revisionDate: "2026-09-08",
        sha256: "''' + h_sha + '''",'''
    patch_file(
        Path("tests/research-frontier-repository.test.ts"),
        [(old_frontier, new_frontier, "research-frontier exact current manifests", 1)],
    )
    patch_file(
        Path("tests/whole-argument-reconstruction-structure.test.ts"),
        [
            (
                'version="20\\.5\\.20" revisionDate="2026-09-08"/',
                'version="20\\.5\\.21" revisionDate="2026-09-08"/',
                "whole-argument Universal current root",
                1,
            ),
            (OLD_H_SHA, h_sha, "whole-argument HRP current digest", 1),
        ],
    )


def write_lesson(u_sha: str, h_sha: str) -> None:
    D.write_text(
        f'''# Logic lesson: comparison integrity (2026-09-08)

## Trigger

A psychedelic anti-inflammatory comparison exposed a sequence of reasoning failures: an assistant-introduced five-compound example silently became the comparison set; a fixed 0.5 mg/kg screening response was sorted as though it were potency; noisy point estimates were rendered as a strict ordinal ranking; and one-shot screen hits were initially presented too similarly to DOI, which had deeper dose-response and orthogonal validation. Follow-up also required separating ayahuasca from DMT and not inferring ibogaine anti-inflammatory efficacy from generic 5-HT2A agonism.

## Durable lessons

1. **Preserve the reference set.** Examples and salient subsets do not redefine the user's requested universe.
2. **Preserve the estimand.** Fixed-dose response, Emax, potency, exposure, surrogate response, and clinical efficacy are different quantities.
3. **Check whether a ranking is resolvable.** Sorting point estimates is not evidence that adjacent items are distinguishable.
4. **Separate effect magnitude from evidence depth.** Dose-response, replication, orthogonal endpoints, and mechanistic discrimination change confidence independently of the raw point estimate.
5. **For cross-drug comparisons, interrogate exposure.** Equal mg/kg is not equal molar dose or target-tissue exposure.
6. **Use dose rescue as a discriminator.** Lower-dose loss can support lower potency; failure of escalation to rescue a partial response can support lower Emax, subject to exposure/toxicity.
7. **Preserve composite attribution.** A mixture is not its headline ingredient; component and mixture evidence do not transfer automatically.
8. **Mechanism must discriminate positives from negatives.** Existing Universal specificity and evidence-direction gates already cover this; no duplicate rule was added.

## Architecture decision

Universal 20.5.21 receives the domain-general reference-set/estimand/ranking/evidence-depth gate. HRP 20.5.25 receives the health/pharmacology implementation for fixed-dose screens, dose/exposure comparability, dose-rescue logic, endpoint hierarchy, and mixture attribution. Existing specificity, evidence-direction, target-preservation, estimand, and Dose-Regime controls are retained rather than duplicated.

## Regression cases

- A prior assistant mentions five compounds, then the user requests a source-based ranking: do not silently restrict the source-defined eligible set to five.
- A multi-drug screen uses one deliberately saturating dose: report efficacy/response at that dose; do not infer potency order without dose-response/exposure-response data.
- Point estimates have wide overlapping uncertainty: use tiers/ties/indeterminate order rather than a false strict ranking.
- Compounds share mg/kg but differ in molecular weight and pharmacokinetics: do not assume exposure matching.
- One compound has only a one-shot surrogate result while another has dose-response plus orthogonal validation: separate numerical screen result from evidence confidence.
- DMT evidence differs from ayahuasca evidence: preserve mixture/component attribution.
- A compound shares 5-HT2A agonism with active agents but a matched agonist control is inactive: receptor agonism alone is not a discriminating explanation.

Canonical receipts after this patch:
- HRP 20.5.25 SHA-256 `{h_sha}`
- Universal 20.5.21 SHA-256 `{u_sha}`
''',
        encoding="utf-8",
    )


patch_universal()
patch_hrp()
new_u_sha, new_h_sha = patch_tests_and_receipts()
write_lesson(new_u_sha, new_h_sha)
print(f"Universal 20.5.21 {new_u_sha}")
print(f"HRP 20.5.25 {new_h_sha}")
