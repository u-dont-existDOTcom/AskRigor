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
  "791c6e33b791c375d9a1861d7a0eae430ac656c658312b40b5dd4ed1fa367b26";
const UNIVERSAL_SHA_256 =
  "3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7";

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
      version: "20.5.18",
      revisionDate: "2026-08-16"
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
      'name="PartialRetrievalCannotCompleteAudit"',
      "access_status",
      "extraction_coverage",
      "next_cursor",
      "has_more=true",
      'name="QueryBoundedYouTubeSearchIsDiscoveryOnly"',
      'name="NoPrematureSaturation"',
      'name="CoverageStateBeforeSynthesis"',
      "complete / completed-with-access-boundary / incomplete",
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
    expect(gateText).toContain("continue automatically before synthesis");
    expect(gateText).toContain("Do not characterize prevalence, direction, rarity, typicality, or strength");
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
      "Do not characterize prevalence"
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
      version: "20.5.12",
      revisionDate: "2026-08-16"
    });
  });

  it("requires the Universal 20.5.12 premise-integrity and truth-priority gate", async () => {
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
