import { describe, expect, it, vi } from "vitest";
import { okEnvelope } from "@askrigor/contracts";
import { scoutGeminiYoutubeCandidates } from "@askrigor/sources";

import {
  RESEARCH_MODULE_IDS,
  ResearchAdvanceDependencyUnavailableError,
  advanceResearchSessionDeterministically,
  applyResearchSemanticResult,
  applyServerModuleApplicability,
  createCandidateScreeningWorkPackage,
  createInitialResearchSessionState,
  createResearchSessionRuntimeDependencies,
  deriveResearchSemanticWorkForState,
  executeResearchSessionFormalSearch,
  protocolBindingsFromManifests,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordNativeYoutubeDiscovery,
  researchSemanticModelOutputSchema,
  researchSessionStateDigest,
  researchSessionStateSchema,
  type ResearchSessionState
} from "../apps/research-mcp/src/index.js";
import {
  RESEARCH_FIXTURE_VIDEO_IDS,
  nativeSurvey,
  researchPacket,
  researchReceipt
} from "./helpers/research-session-fixtures.js";
import {
  discussionOutput,
  transcriptOutput
} from "./helpers/research-video-depth-fixtures.js";

const SESSION_ID = `ars1_${"K".repeat(32)}`;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function manifest(protocol: "universal" | "hrp") {
  return {
    name: protocol === "universal"
      ? "Universal Instructions"
      : "Health Research Protocol",
    version: protocol === "universal" ? "20.5.14" : "20.5.22",
    revisionDate: protocol === "universal" ? "2026-08-18" : "2026-08-23",
    sha256: protocol === "universal" ? HASH_A : HASH_B
  };
}

function initialState(): ResearchSessionState {
  return createInitialResearchSessionState({
    research_target: "de-identified treatment comparison",
    diagnosis_status: "diagnosis_not_specified"
  }, protocolBindingsFromManifests(manifest("universal"), manifest("hrp")));
}

function routedState(): ResearchSessionState {
  const state = initialState();
  return applyServerModuleApplicability(
    state,
    Object.fromEntries(RESEARCH_MODULE_IDS
      .filter((moduleId) => state.modules[moduleId].applicability === "UNRESOLVED")
      .map((moduleId) => [moduleId, "REQUIRED"])),
    "SERVER_ROUTER"
  );
}

async function depthReadyState(): Promise<ResearchSessionState> {
  const scout = recordAutomatedScoutCompletion(routedState(), {
    providerResponseId: "phase-k-scout",
    packet: researchPacket(),
    receipt: researchReceipt()
  });
  const discovered = recordNativeYoutubeDiscovery(scout, nativeSurvey());
  const work = createCandidateScreeningWorkPackage(discovered.candidate_discovery);
  const selected = RESEARCH_FIXTURE_VIDEO_IDS[0];
  const screened = recordCandidateScreeningCompletion(discovered, {
    package_version: work.package_version,
    discovery_digest: work.discovery_digest,
    decisions: discovered.candidate_discovery.candidates.map(({ video_id }) => ({
      video_id,
      materiality: video_id === selected ? "MATERIAL" : "NOT_MATERIAL",
      redundancy: "DISTINCT",
      selection_status: video_id === selected ? "SELECTED" : "NOT_SELECTED",
      rationale: video_id === selected
        ? "Selected exact nonredundant fixture."
        : "Not decision material in this bounded fixture."
    }))
  });
  let state = screened;
  const executors = {
    searchPubmed: vi.fn(async (input: { query: string }) => okEnvelope({
      provider: "pubmed",
      recordType: "pubmed_search_result",
      query: { query: input.query },
      accessStatus: "complete",
      pagination: { page_size: 100, returned: 0, exhausted: true },
      data: []
    })) as never,
    fetchPubmedRecord: vi.fn() as never,
    searchEuropePmc: vi.fn(async (input: { query: string }) => okEnvelope({
      provider: "europe_pmc",
      recordType: "europe_pmc_search_result",
      query: { query: input.query },
      accessStatus: "complete",
      pagination: { page_size: 100, returned: 0, exhausted: true },
      data: []
    })) as never,
    pubmedConfig: { tool: "askrigor-test", email: "research@example.test" }
  };
  for (const hypothesis of state.formal_evidence.hypotheses) {
    state = await executeResearchSessionFormalSearch(
      state,
      hypothesis.hypothesis_id,
      executors
    );
  }
  return researchSessionStateSchema.parse(state);
}

describe("transport-independent research-session advancement", () => {
  it("derives and applies only the exact current state-bound semantic package", async () => {
    const state = initialState();
    const work = deriveResearchSemanticWorkForState(SESSION_ID, state);
    expect(work).toMatchObject({
      kind: "module_applicability",
      package: {
        state_digest: researchSessionStateDigest(state),
        unresolved_module_ids: expect.any(Array)
      }
    });
    if (work?.kind !== "module_applicability") {
      throw new Error("Missing module work package");
    }
    const output = researchSemanticModelOutputSchema.parse({
      contract_version: "askrigor_hermes_semantic_result_v1",
      session_id: SESSION_ID,
      state_digest: work.package.state_digest,
      work_type: "module_applicability",
      submission: {
        package_version: "askrigor_module_applicability_v1",
        decisions: work.package.unresolved_module_ids.map((module_id) => ({
          module_id,
          applicability: "REQUIRED",
          rationale: "The broad research fixture requires this module."
        }))
      }
    });
    const next = await applyResearchSemanticResult(
      SESSION_ID,
      state,
      output,
      {}
    );
    expect(researchSessionStateDigest(next)).not.toBe(work.package.state_digest);
    await expect(applyResearchSemanticResult(
      SESSION_ID,
      next,
      output,
      {}
    )).rejects.toThrow(/another work package|no current semantic/u);

    expect(researchSemanticModelOutputSchema.safeParse({
      ...output,
      complete: true,
      completed_operations: ["everything"]
    }).success).toBe(false);
  });

  it("chooses the server-derived transcript capability and ingests its real receipt", async () => {
    const state = await depthReadyState();
    const getTranscript = vi.fn(async ({ video_id_or_url }) =>
      transcriptOutput(String(video_id_or_url))
    );
    const auditDiscussion = vi.fn(async ({ video_id_or_url }) =>
      discussionOutput(String(video_id_or_url))
    );
    const result = await advanceResearchSessionDeterministically(
      SESSION_ID,
      state,
      { videoDepth: { getTranscript, auditDiscussion } }
    );
    expect(result).toMatchObject({
      capability: "transcript_acquisition",
      state_changed: true
    });
    expect(getTranscript).toHaveBeenCalledTimes(1);
    expect(auditDiscussion).not.toHaveBeenCalled();
    expect(result.state.video_depth.transcripts[0]).toMatchObject({
      status: "COMPLETE",
      receipt: { source_video_id: RESEARCH_FIXTURE_VIDEO_IDS[0] }
    });
  });

  it("fails closed instead of skipping a missing deterministic dependency", async () => {
    await expect(advanceResearchSessionDeterministically(
      SESSION_ID,
      await depthReadyState(),
      {}
    )).rejects.toMatchObject({
      name: "ResearchAdvanceDependencyUnavailableError",
      capability: "transcript_acquisition"
    });
    await expect(advanceResearchSessionDeterministically(
      SESSION_ID,
      await depthReadyState(),
      {}
    )).rejects.toBeInstanceOf(ResearchAdvanceDependencyUnavailableError);
  });

  it("builds one budgeted runtime graph and ingests the private scout completion only", async () => {
    const packet = researchPacket();
    const commit = vi.fn(async () => undefined);
    const forfeit = vi.fn(async () => undefined);
    const budget = {
      reserve: vi.fn(async () => ({ commit, forfeit }))
    };
    const scout = vi.fn<typeof scoutGeminiYoutubeCandidates>(async () => ({
      provider: "gemini_api",
      record_type: "gemini_youtube_candidate_frontier",
      primary_identifier: "phase-k-budgeted-scout",
      retrieved_at: "2026-08-25T00:00:00.000Z",
      source_identity: {},
      pagination: { returned: packet.candidates.length, exhausted: true },
      access_status: "complete",
      limitations: [],
      data: {
        response_id: "phase-k-budgeted-scout",
        model: "gemini-3.6-flash",
        google_search_grounded: true,
        provider_storage_disabled: true,
        correction_attempted: false,
        provider_interaction_count: 1,
        executed_search_queries: packet.discovery_queries.map(({ query }) => query),
        usage: {
          total_input_tokens: 1_000,
          total_output_tokens: 2_000,
          total_thought_tokens: 100,
          google_search_queries: packet.discovery_queries.length
        },
        packet
      }
    }));
    const runtime = createResearchSessionRuntimeDependencies({
      env: {
        YOUTUBE_API_KEY: "server-held-youtube-key",
        ASKRIGOR_GEMINI_API_KEY: "server-held-gemini-key"
      },
      geminiScout: {
        budget,
        scout,
        validate: vi.fn(async () => researchReceipt()),
        loadScoutInstructions: async () => "Exact repository scout instructions"
      }
    });
    const executeScout = runtime.deterministic.automatedScout;
    if (executeScout === undefined) throw new Error("Missing runtime scout");

    const next = await executeScout(routedState());

    expect(next.operations.automated_video_scout.status).toBe("COMPLETE");
    expect(next.scout).toMatchObject({
      status: "COMPLETE",
      provider_response_id: "phase-k-budgeted-scout"
    });
    expect(budget.reserve).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
    expect(forfeit).not.toHaveBeenCalled();
  });

  it("keeps missing runtime provider configuration retryable instead of inventing a terminal boundary", async () => {
    const runtime = createResearchSessionRuntimeDependencies({
      env: { YOUTUBE_API_KEY: "server-held-youtube-key" }
    });
    const executeScout = runtime.deterministic.automatedScout;
    if (executeScout === undefined) throw new Error("Missing runtime scout");

    const next = await executeScout(routedState());

    expect(next.operations.automated_video_scout).toMatchObject({
      status: "BLOCKED_RETRYABLE",
      boundary: {
        classification: "RETRYABLE",
        code: "AUTOMATED_SCOUT_GEMINI_PROVIDER_NOT_CONFIGURED"
      }
    });
    expect(next.scout.candidate_count).toBe(0);
  });
});
