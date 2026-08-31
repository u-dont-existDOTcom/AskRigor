import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn()
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: readFileMock };
});

import {
  getProtocolManifest,
  loadProtocol,
  verifyProtocolIntegrity
} from "@askrigor/protocol";

const HRP_SHA_256 =
  "dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1";
const UNIVERSAL_SHA_256 =
  "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172";

describe("canonical protocol loader", () => {
  let actualReadFile: typeof import("node:fs/promises").readFile;

  beforeEach(async () => {
    actualReadFile = (
      await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    ).readFile;
    readFileMock.mockReset();
    readFileMock.mockImplementation(actualReadFile);
  });

  it("derives the HRP manifest from its root attributes", async () => {
    await expect(getProtocolManifest("hrp")).resolves.toMatchObject({
      name: "HRP",
      version: "20.5.24",
      revisionDate: "2026-08-31"
    });
  });

  it("requires the HRP 20.5.18 premise-integrity and truth-priority gate", async () => {
    const text = await loadProtocol("hrp");

    for (const required of [
      '<Revision version="20.5.18" priority="Critical">',
      '<PremiseIntegrityAndTruthPriorityGate priority="Critical">',
      'id="premise_integrity_and_truth_priority"',
      "Accuracy outranks agreement",
      "factual assertions embedded in a prompt",
      "This does not exist.",
      "I could not verify that this exists",
      "I cannot independently verify this source/data.",
      "Labeled inference and estimation remain permitted"
    ]) {
      expect(text).toContain(required);
    }

    for (const id of [
      "FalsePremiseCompliance",
      "NonexistentSourceHallucination",
      "SearchFailureIsNotNonexistence",
      "ConfidentUserAssertionStillChecked",
      "ForcedCausalConnection",
      "CitationDoesNotEntailPromptPremise",
      "ArithmeticContradictionBlocksSynthesis",
      "LegitimateLabeledInferenceRemainsAllowed"
    ]) {
      expect(text).toContain(`<Case id="${id}">`);
    }

    for (let id = 164; id <= 171; id += 1) {
      expect(text).toContain(`<Check id="FS${id}">`);
    }
  });

  it("preserves the HRP community corpus completion gate and regression", async () => {
    const text = await loadProtocol("hrp");
    const section = (startMarker: string, endMarker: string): string => {
      const start = text.indexOf(startMarker);
      const end = text.indexOf(endMarker, start);
      expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
      expect(end, `missing ${endMarker} after ${startMarker}`).toBeGreaterThan(start);
      return text.slice(start, end);
    };
    const communityGateStart = text.indexOf("<CommunityCorpusCompletionGate");
    const protocolGateStart = text.indexOf("<ProtocolExecutionAndComplianceGate");

    expect(communityGateStart).toBeGreaterThanOrEqual(0);
    expect(protocolGateStart).toBeGreaterThanOrEqual(0);
    expect(communityGateStart).toBeLessThan(protocolGateStart);

    for (const required of [
      '<CommunityCorpusCompletionGate priority="Critical">',
      'name="PartialRetrievalRemainsBoundedEvidence"',
      "access_status",
      "extraction_coverage",
      "next_cursor",
      "has_more=true",
      'name="QueryBoundedYouTubeSearchIsDiscoveryOnly"',
      'name="NoPrematureSaturation"',
      'name="CoverageStateBeforeSynthesis"',
      "complete / completed-with-access-boundary / partial",
      'id="OneQueryBoundedYouTubeCommentPresentedAsReconnaissance"',
      'id="ApiVisibleCompleteYouTubeCorpusIsTerminalSuccess"'
    ]) {
      expect(text).toContain(required);
    }

    const gateText = text.slice(communityGateStart, protocolGateStart);
    expect(gateText).toContain("discovery operation only");
    expect(gateText).toContain("unfiltered top-level comment corpus");
    expect(gateText).toContain("paginate until exhausted");
    expect(gateText).toContain("retrieve accessible replies");
    expect(gateText).toContain("reconcile expected versus retrieved replies");
    expect(gateText).toContain("continue automatically");
    expect(gateText).toContain("never exclude them solely because the corpus is partial");
    expect(gateText).toContain("Do not extrapolate their composition, prevalence, direction, rarity, typicality");
    expect(gateText).toContain("CommunityCorpusAccessBoundaryCompletion");
    expect(gateText).toContain("complete and api_visible_complete");

    const ledgerFields = [
      "principal_platforms_mapped",
      "acquisition_mode",
      "unfiltered_retrieval_attempted",
      "pagination_exhausted",
      "replies_reconciled",
      "unique_firsthand_people",
      "unique_treatment_episodes",
      "benefit_search_completed",
      "no_effect_search_completed",
      "harm_search_completed",
      "discontinuation_search_completed",
      "independent_discussion_pools_sampled",
      "final_coverage_state"
    ];
    const protocolLedger = section(
      '<Template id="ProtocolExecutionLedger">',
      "</Template>"
    );
    const iterationLedger = section(
      '<Template id="BidirectionalEvidenceIterationLedger">',
      "</Template>"
    );
    for (const field of ledgerFields) {
      expect(protocolLedger).toContain(field);
      expect(iterationLedger).toContain(field);
    }

    const queryBoundedRegression = section(
      '<Case id="OneQueryBoundedYouTubeCommentPresentedAsReconnaissance">',
      "</Case>"
    ).replace(/\s+/g, " ");
    for (const required of [
      'search term "used"',
      'search term "results"',
      "returns one comment",
      "returns zero",
      "access_status=partial",
      "extraction_coverage=partial",
      "real-world evidence is weak or indeterminate and finishes the review",
      "discovery-only",
      "unfiltered comments",
      "paginate until exhausted",
      "retrieve accessible replies",
      "reconcile expected versus retrieved replies",
      "benefit, no-effect, harm, and discontinuation",
      "CommunityCorpusAccessBoundaryCompletion",
      "Review the one retrieved comment as bounded evidence rather than excluding it",
      "Do not characterize corpus-wide prevalence"
    ]) {
      expect(queryBoundedRegression).toContain(required);
    }

    const completeCorpusRegression = section(
      '<Case id="ApiVisibleCompleteYouTubeCorpusIsTerminalSuccess">',
      "</Case>"
    ).replace(/\s+/g, " ");
    expect(completeCorpusRegression).toContain("access_status=api_visible_complete");
    expect(completeCorpusRegression).toContain("extraction_coverage=api_visible_complete");
    expect(completeCorpusRegression).toContain("terminal successful retrieval");
    expect(completeCorpusRegression).toContain("must not remain incomplete solely because");
    expect(text).toContain('<Check id="FS197">');
  });

  it("scopes independent community weighting and actionability to the HRP 20.5.17 gate", async () => {
    const text = await loadProtocol("hrp");
    const gateStart = text.indexOf(
      '<CommunityEvidenceIndependenceAndActionabilityGate priority="Critical">'
    );
    const gateEnd = text.indexOf(
      "</CommunityEvidenceIndependenceAndActionabilityGate>",
      gateStart
    );
    expect(gateStart).toBeGreaterThanOrEqual(0);
    expect(gateEnd).toBeGreaterThan(gateStart);
    const gate = text.slice(gateStart, gateEnd).replace(/\s+/g, " ");

    for (const required of [
      'name="FormalAbsenceCannotEraseCommunitySignal"',
      "Community signal is an independent evidence layer",
      "support_not_located",
      "must not, by itself, downgrade the observed community signal",
      'name="MatchedContradictionAndOutcomeAlignment"',
      "materially aligned population, intervention, comparator, outcome, and timeframe",
      "outcome_mismatch",
      'name="ActionabilityIntegration"',
      "risk, cost, reversibility, and the opportunity cost of delay",
      "corroborated | contradicted | support_not_located | outcome_mismatch"
    ]) {
      expect(gate).toContain(required);
    }
  });

  it("keeps the exact hip anti-erasure and positive-information-gain regressions", async () => {
    const text = await loadProtocol("hrp");
    const section = (id: string): string => {
      const start = text.indexOf(`<Case id="${id}">`);
      const end = text.indexOf("</Case>", start);
      expect(start, `missing ${id}`).toBeGreaterThanOrEqual(0);
      expect(end, `unterminated ${id}`).toBeGreaterThan(start);
      return text.slice(start, end).replace(/\s+/g, " ");
    };
    const hip = section("HipCommunitySignalWithoutMatchedFormalSupport");
    for (const required of [
      "old hip that barely works and hurts",
      "gelatin, keto, and swimming",
      "support_not_located",
      "not negative evidence",
      "risk, cost, reversibility",
      "opportunity cost",
      "time-bounded trial",
      "urgent diagnosis"
    ]) {
      expect(hip).toContain(required);
    }
    const expansion = section("FinalAnswerStopsWhileYouTubeExpansionStillLikelyUseful");
    expect(expansion).toContain("further_expansion_likely_to_improve_answer=yes");
    expect(expansion.toLowerCase()).toContain("continue the executable wider or deeper retrieval");
    expect(expansion).toContain("must not emit the final synthesis");
  });

  it("requires the HRP 20.5.19 treatment-landscape and video-selection gate", async () => {
    const text = await loadProtocol("hrp");
    const section = (id: string): string => {
      const start = text.indexOf(`<Case id="${id}">`);
      const end = text.indexOf("</Case>", start);
      expect(start, `missing ${id}`).toBeGreaterThanOrEqual(0);
      expect(end, `unterminated ${id}`).toBeGreaterThan(start);
      return text.slice(start, end).replace(/\s+/g, " ");
    };

    expect(text).toMatch(
      /<Protocol name="HRP" version="20\.5\.24" revisionDate="2026-08-31"/
    );
    for (const required of [
      '<Revision version="20.5.19" priority="Critical">',
      '<TreatmentLandscapeAndVideoSelectionGate priority="Critical">',
      'name="TreatmentSpaceInventoryBeforeSelection"',
      'name="ExactProgramFingerprint"',
      'name="DiversityBeforeConcentration"',
      'name="AggregateLandscapeSynthesisLock"',
      "treatment_classes_discovered",
      "materially_distinct_program_fingerprints",
      "candidate_videos_screened",
      "material_videos_selected",
      "material_videos_fully_audited",
      "independent_channels_or_pools",
      "treatment_classes_with_no_selected_video",
      "treatment_classes_with_no_formal_evidence_follow_up",
      "program_fingerprints_with_no_formal_evidence_follow_up",
      "unresolved_new_program_hypotheses_from_all_discovery_batches",
      "uncovered_material_treatment_classes",
      "further_expansion_likely_to_improve_answer",
      "selection_coverage_lock",
      "per_video_depth_lock",
      "treatment_landscape_synthesis_lock"
    ]) {
      expect(text).toContain(required);
    }
    const normalizedText = text.replace(/\s+/gu, " ");
    for (const required of [
      "reciprocally linked discovery-batch, class, candidate, fingerprint, and selection records",
      "Derive a stable signature from the normalized program-field tuple",
      "caller-supplied fingerprint IDs cannot establish diversity",
      "stable source identifiers linked to retrieval receipts",
      "Hard-block decision-relevant or uncertain omissions",
      "only a terminal, nonretryable boundary after attempted recovery",
      "caller-supplied claim that the corpus is small, narrow, or non-substantial cannot deactivate them",
      "authenticated opaque continuation or server-held state proving one contiguous chain"
    ]) expect(normalizedText).toContain(required);

    const many = section("ManyVideosButOneTreatmentClass");
    expect(many).toContain("ten videos");
    expect(many).toContain("eight concern substantially similar programs inside one umbrella class");
    expect(many).toContain("Raw video count does not establish diversity");
    expect(many).toContain("Fail treatment-space coverage");

    const two = section("TwoVideosPresentedAsBroadCommunityAudit");
    expect(two).toContain("two material YouTube videos");
    expect(two).toContain("additional specific programs, treatment classes, and independent channels are readily discoverable");
    expect(two).toContain("Fail the treatment-landscape synthesis lock");
    expect(two).toContain("positive expected information gain");

    expect(section("RenamedFingerprintsPresentedAsDiversity"))
      .toContain("Caller-chosen IDs and display names cannot manufacture diversity");
    expect(section("AggregateCandidateCountWithoutCandidateLedger"))
      .toContain("Derive the screen count from reciprocally linked candidate and discovery-batch records");
    expect(section("RetryableBoundaryPresentedAsTerminalCompletion"))
      .toContain("Only a terminal, nonretryable boundary");
    expect(section("FourVideosRepeatOneProgramAcrossChannels"))
      .toContain("Independent channels do not turn one repeated program into treatment diversity");
    expect(section("UnsupportedNotRelevantWaiver"))
      .toContain("caller assertion cannot erase material work");
    expect(section("LiveCursorLabeledTerminalBoundary"))
      .toContain("boundary record cannot override a live cursor");
    expect(section("ClassSearchHidesProgramFormalGap"))
      .toContain("Class-level searching cannot substitute for per-program follow-up");
    expect(section("CoverageProjectionNotOnProductionAction"))
      .toContain("callable production Action");
    expect(section("SkippedTranscriptPagesPresentedAsComplete"))
      .toContain("forged offset, skipped page, or lone continued page");
    expect(section("CallerSmallCorpusLabelWaivesCoverage"))
      .toContain("Caller-supplied corpus-size or scope labels cannot deactivate");
    expect(text).toContain('<Check id="FS184">');
    expect(text).toContain('<Check id="FS185">');
  });

  it("requires the HRP 20.5.20 generic specific-program and provisional-scout gate", async () => {
    const text = await loadProtocol("hrp");

    for (const required of [
      '<Revision version="20.5.20" priority="Critical">',
      'name="SpecificImplementationDiscoveryAndProvisionalScouts"',
      "every material umbrella class",
      "exercise, physical therapy, diet, injection, surgery, conservative care, alternative treatment, program, approach, method",
      "Independently validate each",
      "provisional discovery lead",
      'Case id="GenericUmbrellaCandidatesHideSpecificPrograms"',
      'Case id="GenericSearchFalselyClosedAsSpecificZeroResults"',
      'Case id="SpecificSearchClosedByWrongCandidate"',
      'Case id="ProvisionalScoutCandidateDiscardedWithoutTranscript"',
      'Case id="ExternalScoutFrontierCandidateOmittedOrUnresolved"',
      'Case id="ProvisionalScoutSummaryUsedAsTreatmentEvidence"',
      "Selected creator-content evidence still requires transcript verification",
      "A genuine terminal boundary permits only",
      '<Check id="FS186">',
      '<Check id="FS187">'
    ]) {
      expect(text).toContain(required);
    }
  });

  it("requires the HRP 20.5.21 executable broad-coverage and plain-render gate", async () => {
    const text = await loadProtocol("hrp");

    for (const required of [
      '<Revision version="20.5.21" priority="Critical">',
      "availability-conditioned synthesis block",
      "at least eight fully audited material videos spanning at least six",
      "configured external high-recall scout",
      'Case id="FourDistinctVideosPresentedAsBroadCoverage"',
      'Case id="ConfiguredExternalScoutSilentlySkipped"',
      'Case id="InternalAuditJargonLeaksIntoOrdinaryAnswer"',
      '<Check id="FS188">',
      '<Check id="FS189">',
      '<Check id="FS190">'
    ]) {
      expect(text).toContain(required);
    }
  });

  it("requires the HRP 20.5.22 study-method and claim-local full-text gate", async () => {
    const text = await loadProtocol("hrp");

    for (const required of [
      '<Revision version="20.5.22" priority="Critical">',
      '<StudyMethodReliabilityGate priority="Critical">',
      'name="NoDesignOrPublicationStatusReliabilityShortcut"',
      'name="DecisionImportantStudyAudit"',
      'name="AccessibleFullTextFirst"',
      "does not make a study scientific",
      "Peer review, journal prestige, indexing, guideline",
      "Unpaywall",
      'name="ClaimLocalStatusUntilMaterialGapResolved"',
      "possibly useful research lead",
      "Do not impose a global `Partial HRP` label",
      'Case id="RandomizedPeerReviewedStudyUsedAsScienceShortcut"'
    ]) {
      expect(text).toContain(required);
    }
  });

  it("returns the original canonical file text unchanged", async () => {
    const original = await actualReadFile(
      new URL("../protocols/HRP_Full.xml", import.meta.url),
      "utf8"
    );

    await expect(loadProtocol("hrp")).resolves.toBe(original);
  });

  it("rejects an expected digest that does not match the exact file bytes", async () => {
    await expect(
      verifyProtocolIntegrity("hrp", "0".repeat(64))
    ).rejects.toThrow("Protocol SHA-256 mismatch");
  });

  it("accepts the published digest for the canonical HRP file", async () => {
    await expect(verifyProtocolIntegrity("hrp", HRP_SHA_256)).resolves.toMatchObject({
      name: "HRP",
      sha256: HRP_SHA_256
    });
  });

  it("derives the Universal manifest from its root attributes", async () => {
    await expect(getProtocolManifest("universal")).resolves.toMatchObject({
      name: "AskRigor.com universal saved instructions",
      version: "20.5.15",
      revisionDate: "2026-08-24"
    });
  });

  it("preserves the Universal 20.5.12 premise-integrity and truth-priority gate", async () => {
    const text = await loadProtocol("universal");

    for (const required of [
      '<revision version="20.5.12" priority="Critical">',
      '<premise_integrity_and_truth_priority_gate priority="Critical">',
      "Accuracy outranks agreement",
      "factual assertions embedded in a prompt",
      "This does not exist.",
      "I could not verify that this exists",
      "I cannot independently verify this source/data.",
      "Labeled inference and estimation remain permitted",
      "Premise-integrity check:"
    ]) {
      expect(text).toContain(required);
    }
  });

  it("returns the original Universal file text unchanged", async () => {
    const original = await actualReadFile(
      new URL("../protocols/Universal_Instructions.xml", import.meta.url),
      "utf8"
    );

    await expect(loadProtocol("universal")).resolves.toBe(original);
  });

  it("accepts the published digest for the canonical Universal file", async () => {
    await expect(verifyProtocolIntegrity("universal", UNIVERSAL_SHA_256)).resolves.toMatchObject({
      name: "AskRigor.com universal saved instructions",
      sha256: UNIVERSAL_SHA_256
    });
  });

  it("preserves every Universal 20.5.11 return-artifact closure gate", async () => {
    const text = await loadProtocol("universal");

    expect(text).toContain('<revision version="20.5.11" priority="Critical">');
    expect(text).toContain("Added a domain-general Return-Artifact Closure and End-State Design rule.");
    expect(text).toContain("12. Return-artifact closure:");
    expect(text).toContain("13. End-state design before implementation:");
    expect(text).toContain("14. End-to-end completion test:");
    expect(text).toContain("Return-artifact closure check:");
    expect(text).toContain("UPLOAD THIS FILE: /path/to/artifact");
  });

  it("fails closed when required root attributes are absent", async () => {
    readFileMock.mockResolvedValueOnce(
      Buffer.from(
        "<?xml version=\"1.0\"?><Protocol name=\"HRP\" version=\"20.5.16\" />"
      )
    );

    await expect(getProtocolManifest("hrp")).rejects.toThrow(
      "Protocol root attribute revisionDate is required"
    );
  });

  it("fails closed when the canonical XML is malformed", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from("<Protocol name=\"HRP\">"));

    await expect(loadProtocol("hrp")).rejects.toThrow("Protocol XML is malformed");
  });

  it("fails closed when the canonical file cannot be read", async () => {
    readFileMock.mockRejectedValueOnce(new Error("permission denied"));

    await expect(loadProtocol("hrp")).rejects.toThrow("Unable to read protocol file");
  });

  it("fails closed when the canonical file is not valid UTF-8", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from([0xc3, 0x28]));

    await expect(loadProtocol("hrp")).rejects.toThrow("Protocol file is not valid UTF-8");
  });
});
