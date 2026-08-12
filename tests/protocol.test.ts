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
  "d41e37b13357542c8439ca5199d50eef9eec8aa6ec4beeafbfbbe44213362597";
const UNIVERSAL_SHA_256 =
  "1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa";

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
      version: "20.5.16",
      revisionDate: "2026-08-12"
    });
  });

  it("preserves the HRP 20.5.16 community corpus completion gate and regression", async () => {
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
      "access_status=partial",
      "extraction_coverage=partial",
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
      version: "20.5.11",
      revisionDate: "2026-08-07"
    });
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
