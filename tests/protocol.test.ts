import { createHash } from "node:crypto";

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
  loadProtocolSnapshot,
  verifyProtocolIntegrity
} from "@askrigor/protocol";

const HRP_SHA_256 =
  "14dca942e63d8381108e55915a2a19a542d9b0eb02ecc8a0d4065ef614aac2a5";
const UNIVERSAL_SHA_256 =
  "4e907f9ac53873fe3df51c6d4d6f8886afcb39201195b000d970d90a5ea76caf";

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
      version: "20.6.12",
      revisionDate: "2026-10-07"
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
      /<Protocol name="HRP" version="20\.6\.12" revisionDate="2026-10-07"/
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
      "caller-supplied claim that the corpus is small, narrow, or non-substantial cannot end discovery",
      "the first pass is a broad sweep with a cap, not a minimum",
      "two consecutive rounds from different angles that add no new approach and no new video worth auditing",
      "a niche topic may end with one video or none",
      "only saturation or a completed first pass with its open leads can",
      "Deep research continues rounds until saturation",
      "authenticated opaque continuation or server-held state proving one contiguous chain"
    ]) expect(normalizedText).toContain(required);

    // HRP 20.6.3 and 20.6.6 (owner approval of 2026-09-29): the final self-check and regression case follow the
    // shorter first pass.
    const selfCheck = normalizedText.match(/<Check id="FS188">[^<]*<\/Check>/u)?.[0] ?? "";
    expect(selfCheck).toContain(
      "Stop a first pass at the earliest of saturation, about three fully audited videos, or about two discovery rounds"
    );
    expect(selfCheck).not.toContain("at least eight");
    const fourDistinct = normalizedText.match(
      /<Case id="FourDistinctVideosPresentedAsBroadCoverage">.*?<\/Case>/u
    )?.[0] ?? "";
    expect(fourDistinct).toContain("Two rounds and four fully audited videos complete a first pass");
    expect(fourDistinct).toContain("the remaining programs become its open leads, never a final comparison or ranking");
    expect(fourDistinct).toContain("In deep research, fail the treatment-landscape synthesis lock");
    expect(fourDistinct).not.toContain("completion minimum");

    // HRP 20.6.6: a shorter first pass that also searches beyond YouTube, no coverage lock in it, and an answer
    // that ends with a deeper study review and deeper community research.
    const broad = normalizedText.match(/<Rule name="BroadDiscoveryBeforeDeepAudit"[^>]*>.*?<\/Rule>/u)?.[0] ?? "";
    expect(broad).toContain("about three fully audited videos; or about two rounds.");
    expect(broad).toContain(
      "briefly searches the dominant community and one independent one, not only YouTube (PrincipalPlatformMapping, " +
        "MultipleIndependentCommunities)"
    );
    expect(broad).not.toContain("about six fully audited videos");
    for (const required of [
      "A first pass does not run this lock. It still searches every direction (DirectionalSearchSymmetry)",
      "and it emits no final treatment ranking. In deeper research, skipped directional searches",
      "After a first pass, offer the two directions it left open, a sentence or two each: a deeper study review",
      "suggest two or three specific focuses within each to help them narrow the next investigation"
    ]) expect(normalizedText).toContain(required);
    expect(normalizedText).not.toContain("After a completed first pass, breadth gaps");

    // HRP 20.6.4 (owner lesson of 2026-09-26): a source's advice is read in its own use context before a safety label.
    const relevance = normalizedText.match(/<Rule name="RelevanceBeforeWarning"[^>]*>.*?<\/Rule>/u)?.[0] ?? "";
    for (const required of [
      "Apply the same test to a source's advice to avoid, reduce, stop, space, replace or not rely on a treatment",
      "read it in the source's own use context (maintenance or rescue, starting or stopping, combined or spaced, dose, duration, population and stage)",
      "state remaining ambiguity instead of assuming the riskiest reading",
      "An explicit call to withhold rescue treatment in an emergency still gets a warning."
    ]) expect(relevance).toContain(required);
    const reduction = normalizedText.match(
      /<Case id="ReductionAdviceReadAsRescueWithholding">.*?<\/Case>/u
    )?.[0] ?? "";
    expect(reduction).toContain("separate maintenance from rescue use and combined from spaced use");
    expect(reduction).toContain("Warn about withholding rescue treatment only when the source actually advises it");

    // HRP 20.6.5 (owner direction of 2026-09-27): a deeper-research offer says what it would focus on; a long prompt
    // comes on request instead of being pasted.
    const limits = normalizedText.match(/<Rule name="LimitsNote"[^>]*>.*?<\/Rule>/u)?.[0] ?? "";
    for (const required of [
      "say in plain words what the deeper research would focus on",
      "Show its prompt only when it is about 60 words or shorter",
      "“Show me the full deeper-research prompt and help me fine-tune it,”",
      "give the complete prompt and help adjust its scope before it runs"
    ]) expect(limits).toContain(required);
    const forumPrompt = normalizedText.match(/<Rule name="DeepForumAuditActivationPrompt"[^>]*>.*?<\/Rule>/u)?.[0] ?? "";
    expect(forumPrompt).toContain("must end with a deeper-research offer for a dedicated deep forum-corpus audit");
    expect(forumPrompt).toContain("When the user asks for the full prompt, give it from this template");
    expect(forumPrompt).not.toContain("must include a concise, topic-specific, copyable prompt");
    const handoff = normalizedText.match(/<Rule name="ModeSpecificPromptAndHandoff"[^>]*>.*?<\/Rule>/u)?.[0] ?? "";
    expect(handoff).toContain("After analysis, a prompt longer than about 60 words comes as the LimitsNote's deeper-research offer");
    expect(handoff).not.toContain("offering one later");
    expect(normalizedText).toMatch(/<Case id="PastedDeepResearchPromptHidesItsFocus">.*?Show me the full deeper-research prompt/u);
    // Older cases agree: before research the prompt still comes automatically; after analysis a long one is offered.
    const deepResearchCase = normalizedText.match(/<Case id="DeepResearchRecommendedWithoutPrompt">.*?<\/Case>/u)?.[0] ?? "";
    expect(deepResearchCase).toContain("Before research, provide the complete copyable prompt automatically.");
    expect(deepResearchCase).toContain("After analysis, show a prompt of about 60 words or fewer and offer a longer one");
    const modeClaimCase = normalizedText.match(/<Case id="UserControlledModeClaimedWithoutSelection">.*?<\/Case>/u)?.[0] ?? "";
    expect(modeClaimCase).toContain("after analysis, one longer than about 60 words comes as the deeper-research offer");
    const modeSelection = normalizedText.match(/<Rule name="ModeSelection"[^>]*>.*?<\/Rule>/u)?.[0] ?? "";
    expect(modeSelection).toContain("after analysis, one longer than about 60 words comes as the LimitsNote's deeper-research offer");

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
      "selected creator-content evidence still requires transcript",
      "genuine terminal boundary permits only",
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
      "Do not mark the whole answer partial solely because one lawful full text cannot be obtained",
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
      version: "20.5.35",
      revisionDate: "2026-10-06"
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

  it("returns exact text and its byte-derived manifest from one validated snapshot", async () => {
    const original = await actualReadFile(
      new URL("../protocols/Universal_Instructions.xml", import.meta.url),
      "utf8"
    );
    const snapshot = await loadProtocolSnapshot("universal");

    expect(snapshot.text).toBe(original);
    expect(snapshot.manifest).toEqual(await getProtocolManifest("universal"));
    expect(snapshot.manifest.sha256).toBe(UNIVERSAL_SHA_256);
  });

  it.each([
    { protocol: "universal" as const, name: "Universal" },
    { protocol: "hrp" as const, name: "HRP" }
  ])("preserves a leading UTF-8 BOM in the $protocol snapshot and its byte identity", async ({
    protocol,
    name
  }) => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(
        `<?xml version="1.0"?><Protocol name="${name}" version="test" revisionDate="2026-09-08" />`,
        "utf8"
      )
    ]);
    readFileMock.mockResolvedValueOnce(bytes);

    const snapshot = await loadProtocolSnapshot(protocol);
    expect(snapshot.text.startsWith("\ufeff")).toBe(true);
    expect(Buffer.from(snapshot.text, "utf8")).toEqual(bytes);
    expect(snapshot.manifest.sha256).toBe(
      createHash("sha256").update(bytes).digest("hex")
    );
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

    await expect(loadProtocolSnapshot("hrp")).rejects.toThrow(
      "Protocol XML is malformed"
    );
  });

  it("fails closed when the canonical file cannot be read", async () => {
    readFileMock.mockRejectedValueOnce(new Error("permission denied"));

    await expect(loadProtocol("hrp")).rejects.toThrow("Unable to read protocol file");
  });

  it("fails closed when the canonical file is not valid UTF-8", async () => {
    readFileMock.mockResolvedValueOnce(Buffer.from([0xc3, 0x28]));

    await expect(loadProtocolSnapshot("hrp")).rejects.toThrow(
      "Protocol file is not valid UTF-8"
    );
  });
});


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
