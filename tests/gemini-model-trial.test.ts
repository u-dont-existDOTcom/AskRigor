import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference
} from "@askrigor/evidence-repository";

import { decodeScoutContinuation } from "../apps/research-mcp/src/scout-continuation.js";

const execute = vi.hoisted(() => vi.fn());
vi.mock("../apps/research-mcp/src/actions/gemini-scout-route.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../apps/research-mcp/src/actions/gemini-scout-route.js")>(),
  executeResumableAutomatedGeminiScout: execute
}));
const { registerTools } = await import("../apps/research-mcp/src/register-tools.js");

const SECRET = "gemini-model-trial-test-secret-0123456789";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-model-trial-identity-secret-of-32-bytes-or-more");
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true
} as const;
const TARGET = {
  research_target: "Adults trying to avoid a hip replacement: what they tried and what happened",
  diagnosis_status: "diagnosis_not_specified" as const
};
const CHECKPOINT = {
  interaction_id: "interaction-trial-1",
  phase: "INITIAL" as const,
  provider_interaction_count: 1 as const,
  poll_attempts: 0,
  executed_search_queries: []
};

// Owner answer 146b (2026-10-21): the Gemini 4 trial is the owner's, for the dev accounts the server's settings list.
describe("the Gemini model trial on the MCP scout", () => {
  beforeEach(() => {
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_GEMINI_BILLING", "none");
    execute.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function scout() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|free", AGREEMENT);
    await service.acceptFreeContributor("auth0|dev", AGREEMENT);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", researchAccountReference(service.accountKeyForSubject("auth0|dev")));
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, run: typeof handler) => {
        if (registered === "scout_gemini_youtube_candidates") handler = run;
      }
    } as unknown as McpServer, {
      researchAccessRequired: true, mcpSurface: "/mcp/claude", researchContributorAccessService: service
    });
    return (input: Record<string, unknown>, subject: string) => handler!(input, {
      authInfo: {
        token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject }
      }
    });
  }

  it("refuses a trial arm from an account the settings do not list, before any provider call", async () => {
    const call = await scout();
    const refused = await call({ ...TARGET, model_trial: "gemini-4-high" }, "auth0|free");
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("gemini_model_trial_dev_only");
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs a dev account's arm, carries it in the token, and reports the arm's real cost", async () => {
    const call = await scout();
    execute.mockResolvedValueOnce({
      controller_progress: { checkpoint: CHECKPOINT, accounted_nano_usd: 1_966_666_667 }
    });
    const pending = await call({ ...TARGET, model_trial: "gemini-4-high" }, "auth0|dev");
    expect(execute).toHaveBeenLastCalledWith(TARGET, undefined, {
      deadlineMs: expect.any(Number), modelSetting: { model: "gemini-4-argon", thinking: "high" }
    }, []);
    const output = pending.structuredContent as { continuation_token: string; model_trial: unknown };
    expect(output.model_trial).toEqual({ arm: "gemini-4-high", model: "gemini-4-argon", thinking: "high" });
    expect(decodeScoutContinuation(output.continuation_token, SECRET, Date.now()).model_trial).toBe("gemini-4-high");

    // The resumed call keeps the arm from the signed token; it cannot be sent again with it.
    execute.mockResolvedValueOnce({
      controller_completion: {
        provider_response_id: "response-trial",
        packet: { discovery_queries: [], search_gaps: [], candidates: [] },
        validation: { validated_candidates: [], rejected_candidates: [], unresolved_candidates: [] },
        provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
        accounted_nano_usd: 139_000_000
      }
    });
    const done = await call({ continuation_token: output.continuation_token }, "auth0|dev");
    expect(execute).toHaveBeenLastCalledWith(TARGET, {
      checkpoint: CHECKPOINT, accountedNanoUsd: 1_966_666_667, modelSetting: { model: "gemini-4-argon", thinking: "high" }
    }, { deadlineMs: expect.any(Number), modelSetting: { model: "gemini-4-argon", thinking: "high" } }, []);
    expect((done.structuredContent as { model_trial: unknown }).model_trial)
      .toEqual({ arm: "gemini-4-high", model: "gemini-4-argon", thinking: "high", cost_usd: 0.139 });
  });
});
