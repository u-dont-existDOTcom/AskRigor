import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAskRigorHttpServer,
  createAskRigorServer
} from "../apps/research-mcp/src/server.js";
import {
  GEMINI_COMPATIBLE_MCP_PATH,
  PUBLIC_MCP_CONCURRENCY_LIMIT,
  PUBLIC_TOOL_LIMITS,
  SERVER_INSTRUCTIONS
} from "../apps/research-mcp/src/config.js";
import {
  createYoutubeAuditIdentifierMembership,
  encodeYoutubeAuditContinuation
} from
  "../apps/research-mcp/src/youtube-audit-continuation.js";
import { resetClinicalTrialsFreshnessCacheForTests } from "../packages/sources/src/clinical-trials.js";
import { getProtocolManifest, protocolNamedElements, protocolSections } from "../packages/protocol/src/index.js";
import { pageKey, researchTargetDigest, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat } from "../apps/research-mcp/src/research-finalization-gate.js";
import { TOOL_LIST_REFRESH_SENTENCE } from "../apps/research-mcp/src/tool-list-currency.js";
import { mcpYoutubeCommunityAuditOutputSchema, mcpYoutubeVideoCommunityAuditOutputSchema }
  from "../apps/research-mcp/src/youtube-mcp-sample.js";
import { youtubeCommunitySurveyOutputSchema } from "../apps/research-mcp/src/youtube-community-survey.js";
import { COMMUNITY_RESEARCH_REMINDER, VIDEO_COMMENT_MAP_REMINDER, expectCommunityRemindersInTextOnly }
  from "./helpers/community-result-reminders.js";

const TOOL_NAMES = [
  "get_protocol_manifest",
  "load_protocol",
  "verify_protocol_integrity",
  "search_pubmed",
  "fetch_pubmed_record",
  "search_europe_pmc",
  "acquire_open_full_text",
  "continue_open_full_text",
  "validate_study_method_audit",
  "validate_review_method_audit",
  "search_clinical_trials",
  "fetch_clinical_trial",
  "resolve_doi",
  "check_retraction_status",
  "search_youtube",
  "get_youtube_video",
  "get_youtube_comments",
  "search_youtube_comments",
  "audit_youtube_community",
  "survey_youtube_community",
  "audit_youtube_video_community",
  "get_research_frontier",
  "search_research_frontiers",
  "manage_research_access",
  "submit_research_contribution",
  "review_research_contribution",
  "review_evidence_gap_submissions",
  "assess_treatment_landscape_coverage",
  "scout_gemini_youtube_candidates",
  "extract_youtube_video_claims",
  "finalize_research",
  "submit_lesson_candidate",
  "save_research_findings"
];
const GEMINI_TOOL_NAMES = TOOL_NAMES.filter((name) =>
  ![
    "review_evidence_gap_submissions",
    "review_research_contribution",
    "search_research_frontiers",
    "manage_research_access",
    "submit_research_contribution",
    "assess_treatment_landscape_coverage",
    "scout_gemini_youtube_candidates",
    "extract_youtube_video_claims",
    "finalize_research",
    "submit_lesson_candidate",
    "save_research_findings",
  ].includes(name)
);

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};
const MUTATING_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
// The owner's review withdraws findings and, with decision 7, forgets cards (Atlas phase 2, owner choice 6a).
const OWNER_REVIEW_ANNOTATIONS = { ...MUTATING_ANNOTATIONS, destructiveHint: true };

const clients: Client[] = [];
const clinicalFixture = (name: string) =>
  readFile(new URL(`fixtures/clinical-trials/${name}`, import.meta.url), "utf8");
const youtubeFixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");

afterEach(async () => {
  resetClinicalTrialsFreshnessCacheForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

// What a literature search with few records adds to its result.
const SPARSE_SEARCH_NOTE = " Few records: before saying anything was not found, try synonyms, older or variant terms, " +
  "the components of a mixed exposure, and citation chains.";

describe("AskRigor MCP tools", () => {
  it("registers the exact thirty-three-tool catalog with six declared writes", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();

      expect(tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
      expect(tools.map(({ annotations }) => annotations)).toEqual(
        TOOL_NAMES.map((name) => name === "review_research_contribution"
          ? OWNER_REVIEW_ANNOTATIONS
          : [
            "manage_research_access",
            "submit_research_contribution",
            "submit_lesson_candidate",
            "finalize_research",
            "save_research_findings",
          ].includes(name) ? MUTATING_ANNOTATIONS : READ_ONLY_ANNOTATIONS)
      );
      expect(tools.every(({ inputSchema, outputSchema }) =>
        inputSchema.type === "object" && outputSchema?.type === "object"
      )).toBe(true);
    } finally {
      await server.close();
    }
  });

  // Atlas phase 2 (design section 6): the owner's findings actions ride on the owner review tool, so the catalog keeps
  // 33 tools; every field is flat, and no call writes canonical evidence.
  it("publishes the owner's findings actions on the owner review tool, flat, with no canonical write", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const review = tools.find(({ name }) => name === "review_research_contribution")!;
      expect(review.description).toContain("Findings for the Atlas: list_findings shows the findings cards that wait");
      // Decision 171, section 4B: a free contributor's card is published as soon as it is saved; a paid one is not.
      expect(review.description).toContain("a card saved in free contributor mode is published in the Atlas as soon as " +
        "it is saved");
      expect(review.description).toContain("A paid private card's findings are published only after you accept them.");
      expect(review.description).toContain("this call never writes canonical evidence");
      const input = review.inputSchema as { properties: Record<string, { enum?: string[]; type?: string; pattern?: string }> };
      expect(input.properties.action).toMatchObject({ type: "string" });
      expect(input.properties.action).not.toHaveProperty("enum");
      for (const action of ["inspect", "status", "accept", "reject", "list_findings",
        "inspect_finding", "accept_finding", "edit_finding", "reject_finding", "withdraw_finding", "link_findings",
        "forget_card", "list_youtube_findings", "move_youtube_findings", "delete_youtube_findings",
        "delete_all_youtube_findings", "list_publications", "unpublish_finding", "publish_cards", "set_aside_cards",
        "list_comments", "hide_comment", "show_comment", "remove_comment", "stop_commenter", "restore_commenter",
        "set_picks"]) expect(input.properties.action).toMatchObject({ description: expect.stringContaining(action) });
      expect(review.description).toContain("forget_card (card ARF-0142) removes what ties a card to its contributor");
      // Owner answer 173: the held YouTube findings ride on the same tool, so the catalog stays at 33 tools.
      // Kept until deleted, on request or if YouTube asks (the owner's rule, 25 Oct): no deletion by age.
      expect(review.description).toContain("the findings drawn from YouTube comments that a saved card leaves out are " +
        "kept apart from it for your review");
      expect(review.description).toContain("they are kept until deleted, on request or if YouTube asks.");
      expect(review.description).not.toMatch(/30 days|30-day|then deleted/u);
      expect(review.description).toContain("They are never decided, accepted or published.");
      expect(review.description).toContain("list_youtube_findings lists those with no card (newest first, each with its " +
        "question and topic; cursor for the next page)");
      expect(review.description).toContain("delete_all_youtube_findings deletes every one at once, only with confirm: " +
        "true after the owner said to (as when YouTube asks)");
      // Atlas phase 3: kind, subject, subjectType and direction, flat, after the topic.
      expect(Object.keys(input.properties)).toEqual(["action", "proposalId", "expectedPayloadSha256", "reason", "card",
        "cards", "finding", "lead", "atlasNumber", "cardSha256", "version", "topicKey", "topicLabel", "kind", "subject",
        "subjectType", "direction", "wording", "appliesTo", "whyNotUsual", "whatWouldChangeIt", "question", "sources",
        "numbers", "note", "correction", "eraseWording", "confirm", "relation", "to", "disagreement", "rationale",
        "cursor", "includeSetAside", "publicationState", "publication", "cardsFrom", "cardsTo", "reported", "comment",
        "commenter", "picks", "later_inputs"]);
      for (const field of ["kind", "subjectType", "direction"]) {
        expect(input.properties[field]!.type, field).toBe("string");
        expect(input.properties[field]!.enum!.length, field).toBeGreaterThan(1);
      }
      expect(review.description).toContain("by default, the card's topic, numbers, kind, subject, subject type and direction");
      // Flat: the only nested inputs are the lists of source identifiers, of figures and of cards, whose entries are
      // flat too.
      const numbers = input.properties.numbers as unknown as { items: { properties: Record<string, { type?: string }> } };
      expect(Object.values(numbers.items.properties).every(({ type }) => type !== "object" && type !== "array")).toBe(true);
      expect(input.properties.card!.pattern).toBe("^[Aa][Rr][Ff]-[0-9]{1,9}$");
      const output = review.outputSchema as { properties: Record<string, unknown>; required?: string[] };
      expect(output.required).toEqual(["ok", "canonicalEvidenceChangedByThisCall"]);
      expect(output.properties.canonicalEvidenceChangedByThisCall).toMatchObject({ type: "boolean" });
      expect(output.properties.canonicalEvidenceChangedByThisCall).not.toHaveProperty("const");
      expect(Object.keys(output.properties)).toEqual(["ok", "outcome", "proposal", "findings", "card", "atlas", "checks",
        "retry", "forget", "youtubeFindings", "heldWithoutCard", "publications", "participation",
        "canonicalEvidenceChangedByThisCall", "error"]);
      // Decision 171, section 4E: the picks' entries are flat too.
      const picks = input.properties.picks as unknown as { items: { properties: Record<string, { type?: string }> } };
      expect(Object.values(picks.items.properties).every(({ type }) => type === "string")).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("says paid private mode saves findings or lessons only after the user accepts, per answer", async () => {
    // Owner correction to Q11 (2026-09-30): paid users' findings and lessons "are saved when saving is
    // accepted per turn", not never saved.
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const description = tools.find(({ name }) => name === "manage_research_access")?.description ?? "";

      expect(description).toContain(
        "Paid private mode saves an answer's findings card, files its research map or saves lesson feedback only when the user accepts that for that answer"
      );
      expect(description).not.toContain("saves nothing");
    } finally {
      await server.close();
    }
  });

  it("prioritizes reciprocal access before the adaptive research workflow", () => {
    const criticalInstructions = SERVER_INSTRUCTIONS.slice(0, 512);

    expect(criticalInstructions).toContain("manage_research_access");
    expect(criticalInstructions).toContain("explicitly accept free contributor mode");
    expect(criticalInstructions).toContain("never infer consent");
    expect(criticalInstructions).toContain("never raw chat");
    expect(SERVER_INSTRUCTIONS).toContain("submit_research_contribution");
    expect(SERVER_INSTRUCTIONS).toContain("Paid-private mode submits nothing");
    expect(SERVER_INSTRUCTIONS).toContain("survey_youtube_community");
    expect(SERVER_INSTRUCTIONS).toContain("audit_youtube_video_community");
    expect(SERVER_INSTRUCTIONS).toContain("could plausibly matter");
    expect(SERVER_INSTRUCTIONS).toContain("excellent RCT does not remove this requirement");
    expect(SERVER_INSTRUCTIONS).toContain("continuation_recommended");
    expect(SERVER_INSTRUCTIONS).toContain("widen discovery until finalize_research accepts it");
    expect(SERVER_INSTRUCTIONS).toContain("unfiltered YouTube comments and replies");
    expect(SERVER_INSTRUCTIONS).toContain(
      "search_youtube_comments is query-bounded discovery only"
    );
    // Claude clients cut server instructions near 2,048 characters.
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(2_048);
    expect(SERVER_INSTRUCTIONS.slice(0, 1_024)).toContain(
      "call finalize_research with every research_receipt"
    );
    // Owner decisions Q9 to Q11 (2026-09-30): the final check carries a findings card, which free contributor
    // mode saves; a paid-private answer offers the save, which waits for the user's yes.
    expect(SERVER_INSTRUCTIONS).toContain("a findings_card of its best findings");
    expect(SERVER_INSTRUCTIONS).toContain(
      "else copy its caveats. If they offer a save, call save_research_findings only after the user's yes."
    );
  });

  it("publishes one-chain full-text handle and source-hash guidance", () => {
    expect(SERVER_INSTRUCTIONS).toContain(
      "call acquire_open_full_text once with exactly one doi and an optional pmcid"
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "bind coverage_receipt.document_handle and coverage_receipt.source_content_sha256"
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "call continue_open_full_text only while exhausted is false"
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "same bound document_handle"
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "returned coverage_receipt.document_handle and coverage_receipt.source_content_sha256"
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "match the acquisition byte-for-byte; any mismatch blocks synthesis"
    );
    expect(SERVER_INSTRUCTIONS).toContain(
      "discard that chain and reacquire; never combine chains"
    );
  });

  it("publishes strict full-text chain rules in each composing tool description", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const descriptions = Object.fromEntries(
        tools.map(({ name, description }) => [name, description])
      );

      expect(descriptions.acquire_open_full_text).toBe(
        "Acquires one DOI through Europe PMC, Unpaywall PDFs, up to five public HTTPS candidate_urls, and up to two AI-supplied candidate_texts from a client search index, with an optional PMCID. When none of these is admitted, the configured owner library serves the signed-in owner, or an active free-contributor or paid-private account whose paper shows a verified public basis: a public page with the paper's own text beyond its abstract, or an open license. Library copies cite the public basis URL and expose no library link. Supplied texts receive the same identity, admission and embedded-block checks plus an exact abstract cross-check when available; audits carry a search-copy caveat. Records expanded public-copy searches with public_copy_search; lead receipts require exact DOI and known-title queries without technical failures. Reports identity, structural completeness, source class and its basis, and route failures. Full text has a handle and content hash for contiguous reading and source-linked audit; reusable repository audits include a version ID."
      );
      expect(descriptions.continue_open_full_text).toBe(
        "Retrieves the next contiguous page of an existing document_handle from its server-owned cursor. Coverage binds the handle and content hash; exhausted, expired, or invalid handles cannot advance. Pages preserve the exact document chain for source-linked audit."
      );
      expect(descriptions.validate_study_method_audit).toBe(
        "Validates a full-text, source-linked individual-study audit on the exact exhausted document_handle. Accepts a newly performed audit or the repository_analysis_version_id advertised by the same acquisition. Repository reuse repeats exact source/protocol/rubric/freshness/impact checks and runs the same validator; fresh_study_audit_required records the need for a newly performed audit. Validated coverage binds the acquisition handle and content hash. Audits of client_supplied copies sign search-index provenance for the required finalization caveat. Validation checks that the findings cite the document's own blocks and that every domain is covered, not that each interpretation is right."
      );
      expect(descriptions.validate_review_method_audit).toBe(
        "Validates a full-text, source-linked review or guideline audit on the exact exhausted acquisition document_handle, including search coverage, study ancestry, heterogeneity, bias, conflicts, and claim scope. Coverage binds the acquisition handle and source_content_sha256; mismatches block synthesis. Audits of client_supplied copies sign search-index provenance for the required finalization caveat. Validation checks that the findings cite the document's own blocks and that every domain is covered, not that each interpretation is right."
      );
    } finally {
      await server.close();
    }
  });

  it("keeps the compound audit comment phase below the default MCP deadline", () => {
    expect(PUBLIC_TOOL_LIMITS.youtubeCommunityAuditElapsedMs).toBe(15_000);
    expect(PUBLIC_TOOL_LIMITS.youtubeCommunityAuditElapsedMs)
      .toBeLessThan(PUBLIC_TOOL_LIMITS.youtubeElapsedMs);
  });

  it("keeps each adaptive video segment below the MCP deadline with a bounded provider budget", () => {
    expect(PUBLIC_TOOL_LIMITS.youtubeVideoAuditElapsedMs).toBe(15_000);
    expect(PUBLIC_TOOL_LIMITS.youtubeVideoAuditProviderRequests).toBe(50);
    expect(PUBLIC_TOOL_LIMITS.youtubeVideoAuditElapsedMs)
      .toBeLessThan(PUBLIC_TOOL_LIMITS.youtubeElapsedMs);
    // MCP calls read longer, still well inside the 60 seconds Claude waits for a tool,
    // and only two at once, so they cannot fill the shared public pool.
    expect(PUBLIC_TOOL_LIMITS.mcpYoutubeVideoAuditElapsedMs).toBe(40_000);
    expect(PUBLIC_TOOL_LIMITS.mcpYoutubeVideoAuditProviderRequests).toBe(300);
    expect(PUBLIC_TOOL_LIMITS.mcpLongYoutubeVideoAuditSlots).toBe(2);
    expect(PUBLIC_TOOL_LIMITS.mcpLongYoutubeVideoAuditSlots).toBeLessThan(PUBLIC_MCP_CONCURRENCY_LIMIT);
  });

  it("gives the longer MCP audit budget to at most two calls at once", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    const holds: Array<() => void> = [];
    let replyRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/videos")) {
        // Audits of this video wait in their first request, keeping their slots.
        if (url.searchParams.get("id") === "dQw4w9WgXcQ") {
          await new Promise<void>((resolve) => holds.push(resolve));
        }
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(await youtubeFixture("comment-threads-page-1.json"), { status: 200 });
      }
      if (url.searchParams.has("id")) return mcpCommentIdResponse(url);
      // Replies never finish, so each call reads until its request budget ends.
      replyRequests += 1;
      return Response.json({
        nextPageToken: `stalled-replies-${replyRequests}`,
        pageInfo: { totalResults: 3, resultsPerPage: 0 },
        items: []
      });
    }));
    const audit = (video: string) => client.callTool({
      name: "audit_youtube_video_community",
      arguments: { video_id_or_url: video }
    });

    try {
      const holders = [audit("dQw4w9WgXcQ"), audit("dQw4w9WgXcQ")];
      await vi.waitFor(() => expect(holds).toHaveLength(2));
      // Both slots are taken: this call reads with the Action's 50 requests,
      // one thread page and 49 reply pages.
      expect((await audit("XpZHKGGCK-o")).isError).not.toBe(true);
      expect(replyRequests).toBe(PUBLIC_TOOL_LIMITS.youtubeVideoAuditProviderRequests - 1);

      holds.forEach((release) => release());
      await Promise.all(holders);
      // The slots are free again, so the next call reads with the longer budget.
      replyRequests = 0;
      expect((await audit("XpZHKGGCK-o")).isError).not.toBe(true);
      expect(replyRequests).toBe(PUBLIC_TOOL_LIMITS.mcpYoutubeVideoAuditProviderRequests - 1);
    } finally {
      holds.forEach((release) => release());
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await client.close();
      await server.close();
    }
  });

  it("publishes strict read-only adaptive YouTube survey and per-video audit schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const survey = tools.find(({ name }) => name === "survey_youtube_community");
      const audit = tools.find(({ name }) => name === "audit_youtube_video_community");

      expect(survey).toMatchObject({
        description: "Surveys bounded YouTube video candidates for a community-evidence question and returns deduplicated metadata, canonical watch links, provider comment counts, pagination, and access receipts. Optional product_identity classifies provider metadata, keeps admitted candidates and lists excluded videos; no medical conclusions are generated. It covers YouTube only. " +
          "For research, research_question records the same research_target as the other tools.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["research_question", "searches"],
          additionalProperties: false,
          properties: {
            research_question: { type: "string", minLength: 1, maxLength: 5000 },
            searches: { type: "array", minItems: 1, maxItems: 6 },
            results_per_search: { type: "integer", minimum: 1, maximum: 10, default: 10 }
          }
        },
        outputSchema: {
          type: "object",
          required: [
            "provider", "record_type", "retrieved_at", "research_question",
            "access_status", "limitations", "searches", "candidates"
          ],
          additionalProperties: true
        }
      });
      expect(survey!.outputSchema.properties.candidates.items.properties).toMatchObject({
        canonical_url: { type: "string", format: "uri" },
        provider_reported_comments: { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
        metadata_access_status: expect.any(Object)
      });

      expect(audit).toMatchObject({
        description: "Retrieves one material YouTube video's unfiltered API-visible top-level comments and independently paginated replies through authenticated stateless continuation. Optional product_identity admits matching provider metadata, refuses other products or variants, and classifies each comment and reply. Identity continuations require the same declaration; only its digest is retained. Returns exact retrieved-versus-analyzed counts and a separate receipt covering this video only; the comment sample comes with the last page (or when the chain stops), for bounded review; no medical conclusions are generated. Sample records are compact: id, reply_to, a per-video pseudonymous author key for counting distinct people, date, likes, text.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 },
            continuation_token: { type: "string", minLength: 1, maxLength: 65536 },
            analysis_limit: { type: "integer", minimum: 1, maximum: 500, default: 500 }
          }
        },
        outputSchema: { type: "object", additionalProperties: true }
      });
      expect(audit!.outputSchema.required).toEqual(expect.arrayContaining([
        "top_level_comments_retrieved_cumulative",
        "replies_retrieved_cumulative",
        "records_retrieved_cumulative",
        "records_returned_for_analysis",
        "continuation_recommended",
        "insufficient_depth",
        "receipt"
      ]));
      expect(audit!.outputSchema.properties.provider_reported_comments)
        .toMatchObject({ type: "string", pattern: "^(0|[1-9][0-9]*)$" });
      expect(audit!.outputSchema.properties.receipt).toMatchObject({
        type: "object",
        required: [
          "scope", "comment_retrieval_state", "video_comments_lock", "chain_started_at_first_page",
          "top_level_pagination_exhausted", "replies_reconciled",
          "query_bounded_comments_used_as_corpus", "blockers"
        ],
        additionalProperties: true
      });
    } finally {
      await server.close();
    }
  });

  it("publishes a strict read-only compound YouTube community-audit schema", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const audit = tools.find(({ name }) => name === "audit_youtube_community");

      expect(audit).toMatchObject({
        description:
          "Retrieves YouTube community evidence in one read-only call: bounded provider-ranked discovery, deduplicated metadata, unfiltered comments and all accessible replies, and a deterministic receipt for these videos. Optional product_identity skips excluded videos down the existing ranking and classifies admitted videos and comments; no medical conclusions are generated. " +
          "It covers YouTube only; Reddit, specialist forums and other communities form separate evidence lanes. " +
          "research_question records the same research_target as the other tools.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["research_question", "searches"],
          additionalProperties: false,
          properties: {
            research_question: { type: "string", minLength: 1, maxLength: 5000 },
            searches: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: {
                type: "object",
                required: ["direction", "query"],
                additionalProperties: false,
                properties: {
                  direction: {
                    enum: [
                      "general", "benefit", "no_effect", "harm",
                      "discontinuation", "formal_discriminator"
                    ]
                  },
                  query: { type: "string", minLength: 1, maxLength: 5000 }
                }
              }
            },
            max_videos: { type: "integer", minimum: 1, maximum: 3, default: 2 },
            sample_comments_per_video: {
              type: "integer", minimum: 20, maximum: 500, default: 250
            }
          }
        },
        outputSchema: {
          type: "object",
          required: [
            "provider", "record_type", "retrieved_at", "research_question",
            "access_status", "limitations", "selection", "searches", "videos", "receipt"
          ],
          additionalProperties: true
        }
      });
      expect(audit!.outputSchema.properties.receipt).toMatchObject({
        type: "object",
        required: [
          "scope", "comment_retrieval_state", "youtube_comments_lock", "searches_requested",
          "searches_completed", "selected_video_ids",
          "unfiltered_retrieval_attempted_for_all", "replies_requested_for_all",
          "pagination_exhausted_for_complete_videos",
          "replies_reconciled_for_complete_videos",
          "query_bounded_comments_used_as_corpus", "blockers"
        ],
        additionalProperties: true
      });
    } finally {
      await server.close();
    }
  });

  it("returns the complete community-audit receipt through the MCP boundary", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return new Response(await youtubeFixture("search-page-1.json"), { status: 200 });
      }
      if (url.pathname.endsWith("/videos")) {
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      return mcpCompleteCommentResponse(url);
    }));

    try {
      const result = await client.callTool({
        name: "audit_youtube_community",
        arguments: {
          research_question: "Which hip treatment works in practice?",
          searches: [{
            direction: "general",
            query: "hip treatment patient experience"
          }],
          max_videos: 1,
          sample_comments_per_video: 20
        }
      });

      expect(result.isError).not.toBe(true);
      expect((result.content as unknown[])[0]).toEqual({
        type: "text",
        text: "YouTube community audit selected 1 video(s); comment retrieval api_visible_complete; YouTube comments lock " +
          `pass (these videos only). ${COMMUNITY_RESEARCH_REMINDER} This lock covers retrieving these YouTube comments only; other communities and the ` +
          "final check are separate. Note now what these comments show (benefit, no-effect and adverse reports), and " +
          "give it to finalize_research as community_findings, even if the signal is weak or neutral."
      });
      expectCommunityRemindersInTextOnly(result);
      expect(result.structuredContent).toStrictEqual(mcpYoutubeCommunityAuditOutputSchema.parse(result.structuredContent));
      // MCP gets compact records: a per-video pseudonymous author key, never
      // the commenter's display name or channel ID.
      const comments = (result.structuredContent as {
        videos: Array<{ sample: { comments: Array<Record<string, unknown>> } }>
      }).videos[0]!.sample.comments;
      expect(Object.keys(comments[0]!).sort()).toEqual(expect.arrayContaining(["author", "date", "id", "likes", "text"]));
      expect(comments.every((comment) => typeof comment.author === "string" && /^[a-f0-9]{8}$/u.test(comment.author)))
        .toBe(true);
      expect(JSON.stringify(result.structuredContent)).not.toMatch(/author_display_name|author_channel_id/u);
      // The receipt names the videos whose comments were read, for finalize_research.
      const communityReceipt = verifyResearchReceipt(
        (result.structuredContent as { research_receipt: string }).research_receipt,
        { secret: "mcp-continuation-secret-value-32-bytes" }
      );
      expect(communityReceipt).toMatchObject({
        ok: true,
        kind: "youtube_community_audit",
        claims: { videos: ["XpZHKGGCK-o"], read: ["XpZHKGGCK-o"] }
      });
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_community_audit",
        access_status: "api_visible_complete",
        receipt: {
          comment_retrieval_state: "api_visible_complete",
          youtube_comments_lock: "pass",
          selected_video_ids: ["XpZHKGGCK-o"],
          query_bounded_comments_used_as_corpus: false
        },
        videos: [{
          video_id: "XpZHKGGCK-o",
          comments_access_status: "api_visible_complete",
          sample: { corpus_count: 6, sampled_count: 6 }
        }]
      });
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("keeps a full audit view, its text and its receipt within the MCP response budget", async () => {
    // The view was once cut to the whole budget before the text and the
    // receipt were added, so a full view pushed the result past it.
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    const comment = (id: string) => ({
      kind: "youtube#comment",
      id,
      snippet: {
        videoId: "XpZHKGGCK-o",
        textDisplay: "I took it for a few weeks; my sleep deepened and my digestion settled, then both faded. ".repeat(2),
        authorDisplayName: `Author ${id}`,
        authorChannelId: { value: `UC${id.slice(-22)}` },
        likeCount: 1,
        publishedAt: "2025-02-01T10:00:00Z",
        updatedAt: "2025-02-01T10:00:00Z"
      }
    });
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/videos")) {
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      if (url.pathname.endsWith("/commentThreads")) {
        const page = Number(url.searchParams.get("pageToken")?.replace("page-", "") ?? "0");
        return Response.json({
          ...(page < 2 ? { nextPageToken: `page-${page + 1}` } : {}),
          pageInfo: { totalResults: 250, resultsPerPage: 100 },
          items: Array.from({ length: page < 2 ? 100 : 50 }, (_, index) => {
            const id = `UgxLong${String(page * 100 + index).padStart(16, "0")}`;
            return {
              kind: "youtube#commentThread",
              id: `UgxThread${id.slice(-15)}`,
              snippet: { videoId: "XpZHKGGCK-o", topLevelComment: comment(id), totalReplyCount: 0 }
            };
          })
        });
      }
      // The audit refetches its sample by identifier.
      const ids = url.searchParams.get("id")?.split(",") ?? [];
      return Response.json({ pageInfo: { totalResults: ids.length, resultsPerPage: ids.length }, items: ids.map(comment) });
    }));

    try {
      const result = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        records_retrieved_cumulative: 250,
        receipt: { comment_retrieval_state: "api_visible_complete", video_comments_lock: "pass" }
      });
      expectCommunityRemindersInTextOnly(result, true);
      expect(result.structuredContent).toStrictEqual(mcpYoutubeVideoCommunityAuditOutputSchema.parse(result.structuredContent));
      expect((result.structuredContent as { research_receipt?: string }).research_receipt).toEqual(expect.any(String));
      // Cut to fit, and filled close to the budget.
      const returned = (result.structuredContent as { records_returned_for_analysis: number }).records_returned_for_analysis;
      expect(returned).toBeGreaterThan(100);
      expect(returned).toBeLessThan(250);
      const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
      expect(bytes).toBeLessThanOrEqual(40_000);
      expect(bytes).toBeGreaterThan(38_000);
    } finally {
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      await server.close();
    }
  });

  it("signs how many comments a finished per-video view returned", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    // One comment of 15,000 CJK characters (45,000 bytes): retrieved, but too
    // large for any view.
    const comment = (id: string) => ({
      kind: "youtube#comment",
      id,
      snippet: {
        videoId: "XpZHKGGCK-o",
        textDisplay: "睡眠".repeat(7_500),
        authorDisplayName: "Recorded Author",
        authorChannelId: { value: "UC0123456789abcdefghijkl" },
        likeCount: 0,
        publishedAt: "2025-02-01T10:00:00Z",
        updatedAt: "2025-02-01T10:00:00Z"
      }
    });
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/videos")) {
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      if (url.pathname.endsWith("/commentThreads")) {
        return Response.json({
          pageInfo: { totalResults: 1, resultsPerPage: 1 },
          items: [{
            kind: "youtube#commentThread",
            id: "UgxThreadLongComment01",
            snippet: { videoId: "XpZHKGGCK-o", topLevelComment: comment("UgxLongComment0000000001"), totalReplyCount: 0 }
          }]
        });
      }
      const ids = url.searchParams.get("id")?.split(",") ?? [];
      return Response.json({ pageInfo: { totalResults: ids.length, resultsPerPage: ids.length }, items: ids.map(comment) });
    }));

    try {
      const result = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(result.isError).not.toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(40_000);
      const view = result.structuredContent as {
        records_retrieved_cumulative: number;
        sample: { comments: unknown[] };
        research_receipt: string;
      };
      expect(view.records_retrieved_cumulative).toBe(1);
      expect(view.sample.comments).toEqual([]);
      expect((result.content as unknown[])[0]).toEqual({
        type: "text",
        text: `YouTube video audit retrieved 1 record(s) cumulatively; this video's comments lock pass (this video only). ${COMMUNITY_RESEARCH_REMINDER} ${VIDEO_COMMENT_MAP_REMINDER} No comment fitted in this ` +
          "view, so none was returned; say in the answer that this video's comments could not be shown."
      });
      expect(verifyResearchReceipt(view.research_receipt, { secret: "mcp-continuation-secret-value-32-bytes" }))
        // The receipt signs what the view returned, not the untrimmed audit.
        .toMatchObject({
          ok: true, kind: "youtube_video_audit", claims: { records: "1", shown: "0", ret: "0", rtop: "0", rrep: "0" }
        });
    } finally {
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      await server.close();
    }
  });

  it("signs as read only the videos whose comments fit the one-call audit view", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    const videoIds = ["XpZHKGGCK-o", "dQw4w9WgXcQ", "abcdefghijk"];
    const video = JSON.parse(await youtubeFixture("video-found.json")) as { items: Array<Record<string, unknown>> };
    const { nextPageToken: _next, ...search } = JSON.parse(await youtubeFixture("search-page-1.json")) as {
      nextPageToken: string;
      items: Array<{ id: Record<string, unknown>; snippet: Record<string, unknown> }>;
    };
    // One long comment per video (5,000 CJK characters, 15,000 bytes): three
    // of them exceed the budget, so not even one per video fits.
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) {
        return Response.json({
          ...search,
          pageInfo: { totalResults: 3, resultsPerPage: 3 },
          items: videoIds.map((videoId) => ({
            ...search.items[0]!,
            id: { ...search.items[0]!.id, videoId },
            snippet: { ...search.items[0]!.snippet, title: `Recorded video ${videoId}` }
          }))
        });
      }
      if (url.pathname.endsWith("/videos")) {
        return Response.json({ ...video, items: [{ ...video.items[0], id: url.searchParams.get("id") }] });
      }
      const videoId = url.searchParams.get("videoId")!;
      return Response.json({
        kind: "youtube#commentThreadListResponse",
        pageInfo: { totalResults: 1, resultsPerPage: 1 },
        items: [{
          kind: "youtube#commentThread",
          id: `UgxThread${videoId}`,
          snippet: {
            videoId,
            topLevelComment: {
              kind: "youtube#comment",
              id: `UgxLong${videoId}`,
              snippet: {
                videoId,
                textDisplay: "睡眠".repeat(2_500),
                authorDisplayName: "Recorded Author",
                authorChannelId: { value: "UC0123456789abcdefghijkl" },
                likeCount: 0,
                publishedAt: "2025-02-01T10:00:00Z",
                updatedAt: "2025-02-01T10:00:00Z"
              }
            },
            totalReplyCount: 0
          }
        }]
      });
    }));

    try {
      const result = await client.callTool({
        name: "audit_youtube_community",
        arguments: {
          research_question: "Adults using sermorelin for sleep and digestion",
          searches: [{ direction: "general", query: "sermorelin sleep digestion experience" }],
          max_videos: 3,
          sample_comments_per_video: 20
        }
      });

      expect(result.isError).not.toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(40_000);
      const view = result.structuredContent as {
        research_receipt: string;
        videos: Array<{ video_id: string; sample: { corpus_count: number; comments: unknown[] } }>;
      };
      expect(view.videos.map(({ video_id, sample }) => [video_id, sample.corpus_count, sample.comments.length]))
        .toEqual(videoIds.map((videoId) => [videoId, 1, 0]));
      // The model saw no comment, so it is told where to read them, and the
      // receipt asks finalize_research for no findings on them.
      expect((result.content as unknown[])[0]).toEqual({
        type: "text",
        text: `YouTube community audit selected 3 video(s); comment retrieval api_visible_complete; YouTube comments lock pass (these videos only). ${COMMUNITY_RESEARCH_REMINDER} ` +
          "No comment fitted in this view; read each video's comments with audit_youtube_video_community."
      });
      expect(verifyResearchReceipt(view.research_receipt, { secret: "mcp-continuation-secret-value-32-bytes" }))
        .toMatchObject({ ok: true, kind: "youtube_community_audit", claims: { videos: videoIds, read: [] } });
    } finally {
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      await server.close();
    }
  });

  it("returns deduplicated survey candidates with canonical links and provider counts through MCP", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/search")
        ? new Response(await youtubeFixture("search-page-1.json"), { status: 200 })
        : new Response(await youtubeFixture("video-found.json"), { status: 200 });
    }));

    try {
      const result = await client.callTool({
        name: "survey_youtube_community",
        arguments: {
          research_question: "Which hip approaches help in real life?",
          searches: [
            { direction: "general", query: "hip treatment experience" },
            { direction: "benefit", query: "hip treatment helped" }
          ]
        }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: `YouTube community survey returned 1 deduplicated candidate video(s). ${COMMUNITY_RESEARCH_REMINDER}`
      }]);
      expectCommunityRemindersInTextOnly(result);
      const { research_receipt: _receipt, ...surveyContent } = result.structuredContent!;
      expect(surveyContent).toStrictEqual(youtubeCommunitySurveyOutputSchema.parse(surveyContent));
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_community_survey",
        access_status: "complete",
        candidates: [{
          video_id: "XpZHKGGCK-o",
          canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
          directions: ["general", "benefit"],
          provider_reported_comments: "7",
          metadata_access_status: "api_visible_complete"
        }]
      });
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      await server.close();
    }
  });

  it("gates the final answer on server-issued research receipts", async () => {
    const { client, server } = await createInMemoryClient();
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const previousFinalizationSecret = process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    try {
      const unsupported = await client.callTool({
        name: "finalize_research",
        arguments: {
          receipts: ["rr1~study_audit~doi=10.1000%2Fforged~1790000000~AAAAAAAAAAAAAAAAAAAAAA"],
          community_evidence: "researched",
          treatment_choice: "not_compared",
          research_target: "Adults with hip osteoarthritis comparing treatment programs",
          answer_draft: "Synthetic answer awaiting receipt verification.",
          intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded or multi-ingredient product." },
          key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1000/forged", status: "validated" }]
        }
      });
      expect(unsupported.isError).not.toBe(true);
      expect(unsupported.structuredContent).toMatchObject({
        status: "not_ready",
        receipts_verified: 0,
        receipts_rejected: [{ index: 0, reason: "signature_invalid" }]
      });
      const steps = (unsupported.structuredContent as { next_steps: string[] }).next_steps.join(" ");
      expect(steps).toContain("Key source 10.1000/forged has no receipt");
      const notes = (unsupported.structuredContent as { notes: string[] }).notes.join(" ");
      expect(notes).toContain("survey_youtube_community");
      expect(notes).toContain("For 10.1000/forged: acquire_open_full_text");

      const dosing = {
        receipts: [],
        community_evidence: "not_relevant",
        not_relevant_basis: "no_real_world_outcome", question_about: "other",
        treatment_choice: "not_compared",
        research_target: "Adults asking about a dosing calculation",
        not_relevant_reason: "A dosing arithmetic question with no treatment choice.",
        intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded or multi-ingredient product." },
        key_sources: [],
        absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: []
      };
      // The answer must carry the limits before it is signed: no study read in full text, and the community search
      // skipped for no real-world outcome, in the server's sentence with the declared reason (owner question 125).
      const noStudy = "No study's methods were checked in full text for this answer.";
      const skip = communitySkipCaveat(dosing.not_relevant_reason);
      expect(skip).toBe("I did not search firsthand reports or community discussions for this answer: A dosing " +
        "arithmetic question with no treatment choice.");
      const uncaveated = await client.callTool({
        name: "finalize_research",
        arguments: { ...dosing, answer_draft: "Multiply the dose per kilogram by the body weight: 5 mg/kg for 20 kg is 100 mg." }
      });
      expect(uncaveated.structuredContent).toMatchObject({
        status: "ready_with_limits", caveats: [skip, noStudy], limits: [skip, noStudy], next_steps: []
      });
      expect((uncaveated.structuredContent as { finalization_receipt?: string }).finalization_receipt).toEqual(expect.any(String));
      const declined = await client.callTool({
        name: "finalize_research",
        arguments: {
          ...dosing,
          answer_draft: "Multiply the dose per kilogram by the body weight: 5 mg/kg for 20 kg is 100 mg. No study's " +
            `methods were checked in full text for this answer. ${skip}`
        }
      });
      expect(declined.structuredContent).toMatchObject({
        status: "ready_with_limits",
        answer_checked: true,
        limits: [
          skip,
          noStudy
        ]
      });
      // An answer in another language states each caveat in that language and says which sentence it is.
      const french = "Aucune étude n'a été vérifiée en texte intégral pour cette réponse.";
      const frenchSkip = "Je n'ai pas cherché de témoignages directs ni de discussions de communautés pour cette " +
        "réponse : c'est une question de calcul de dose, sans choix de traitement.";
      const inFrench = await client.callTool({
        name: "finalize_research",
        arguments: {
          ...dosing,
          answer_draft: `Multipliez la dose par kilogramme par le poids : 5 mg/kg pour 20 kg font 100 mg. ${french}\n\n` +
            frenchSkip,
          answer_language: "fr",
          caveat_renderings: [{ caveat: noStudy, text: french }, { caveat: skip, text: frenchSkip }]
        }
      });
      expect(inFrench.structuredContent).toMatchObject({ status: "ready_with_limits", next_steps: [], answer_checked: true });
      const permit = (declined.structuredContent as { finalization_receipt: string }).finalization_receipt;
      expect(verifyResearchReceipt(permit, {
        secret: "mcp-continuation-secret-value-32-bytes"
      })).toMatchObject({ ok: true, kind: "finalization", claims: { status: "ready_with_limits" } });

      // The server knows the canonical protocols' rule names, so an answer
      // that shows one goes back, as the option A rerun's did.
      const leaky = await client.callTool({
        name: "finalize_research",
        arguments: {
          ...dosing,
          answer_draft: "5 mg/kg for 20 kg is 100 mg. No study's methods were checked in full text for this answer. " +
            `DeepForumAuditActivationPrompt: none needed (LimitsNote). ${skip}`
        }
      });
      expect(leaky.structuredContent).toMatchObject({
        status: "ready_with_limits",
        answer_checked: true,
        next_steps: [], notes: [
          "The answer shows internal labels (DeepForumAuditActivationPrompt, LimitsNote): say what each means in " +
            "plain words, or leave it out."
        ]
      });
      expect((leaky.structuredContent as { finalization_receipt?: string }).finalization_receipt).toEqual(expect.any(String));
    } finally {
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previousFinalizationSecret);
      await client.close();
      await server.close();
    }
  });

  it("starts, continues, and completes one video audit through the MCP boundary", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    let stalledReplyRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/videos")) {
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(await youtubeFixture(
          url.searchParams.get("pageToken") === "thread-page-2"
            ? "comment-threads-page-2.json"
            : "comment-threads-page-1.json"
        ), { status: 200 });
      }
      if (url.searchParams.has("id")) return mcpCommentIdResponse(url);
      if (url.searchParams.get("parentId") === "UgxTop00000000000000002") {
        return new Response(await youtubeFixture("comments-top-2-page-1.json"), { status: 200 });
      }
      stalledReplyRequests += 1;
      // Stall until the first call has spent its MCP request budget.
      if (stalledReplyRequests < PUBLIC_TOOL_LIMITS.mcpYoutubeVideoAuditProviderRequests) {
        return Response.json({
          nextPageToken: `resume-replies-${stalledReplyRequests}`,
          pageInfo: { totalResults: 3, resultsPerPage: 0 },
          items: []
        });
      }
      const [firstPage, secondPage] = await Promise.all([
        youtubeFixture("comments-top-1-page-1.json"),
        youtubeFixture("comments-top-1-page-2.json")
      ]).then((values) => values.map((value) => JSON.parse(value)));
      return Response.json({
        pageInfo: { totalResults: 3, resultsPerPage: 3 },
        items: [...firstPage.items, ...secondPage.items]
      });
    }));

    try {
      const first = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { video_id_or_url: "XpZHKGGCK-o", analysis_limit: 5 }
      });

      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        record_type: "youtube_video_community_audit",
        provider_reported_comments: "7",
        records_retrieved_this_call: 1,
        records_retrieved_cumulative: 1,
        records_returned_for_analysis: 0,
        continuation_recommended: true,
        receipt: { comment_retrieval_state: "incomplete", video_comments_lock: "block" }
      });
      // Mid-chain, the comment sample waits for the audit's last page.
      expect((first.structuredContent as { sample?: unknown }).sample).toBeUndefined();
      expect((first.structuredContent as { limitations: string[] }).limitations)
        .toContain("The comment sample comes with this audit's last page; continue with continuation_token to read it.");
      const token = (first.structuredContent as { continuation_token: string }).continuation_token;
      expect(token).toEqual(expect.any(String));

      // A limit or another video sent with the token must not fail the chain:
      // the token carries the chain's video and analysis limit.
      const second = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { continuation_token: token, analysis_limit: 7, video_id_or_url: "dQw4w9WgXcQ" }
      });

      expect(second.isError).not.toBe(true);
      const researchReceipt = (second.structuredContent as { research_receipt: string }).research_receipt;
      expect(second.content).toEqual([{
        type: "text",
        text: `YouTube video audit retrieved 6 record(s) cumulatively; this video's comments lock pass (this video only). ${COMMUNITY_RESEARCH_REMINDER} ${VIDEO_COMMENT_MAP_REMINDER} ` +
          "This lock covers retrieving these YouTube comments only; other communities and the final check are separate. " +
          "Note now what these comments show (benefit, no-effect and adverse reports), and give it to finalize_research " +
          "as community_findings, even if the signal is weak or neutral."
      }, {
        type: "text",
        text: `research_receipt: ${researchReceipt}`
      }, {
        // Owner question 86: every research result reminds the AI of the final check, in any turn.
        type: "text",
        text: "Answers that use this research are checked with finalize_research before they are given, in this " +
          "turn or a later one."
      }]);
      // Only the completed audit carries a receipt; it binds the video and its terminal state.
      expect((first.structuredContent as { research_receipt?: string }).research_receipt).toBeUndefined();
      const verified = verifyResearchReceipt(researchReceipt, {
        secret: "mcp-continuation-secret-value-32-bytes"
      });
      expect(verified).toMatchObject({
        ok: true,
        kind: "youtube_video_audit",
        claims: { state: "api_visible_complete", lock: "pass", records: "6" }
      });
      expect(second.structuredContent).toMatchObject({
        access_status: "api_visible_complete",
        top_level_comments_retrieved_cumulative: 2,
        replies_retrieved_cumulative: 4,
        records_retrieved_cumulative: 6,
        records_returned_for_analysis: 6,
        continuation_recommended: false,
        sample: {
          mode: "all",
          corpus_count: 6,
          sampled_count: 6
        },
        receipt: {
          comment_retrieval_state: "api_visible_complete",
          video_comments_lock: "pass",
          top_level_pagination_exhausted: true,
          replies_reconciled: true
        }
      });
      expect(JSON.stringify([first, second])).not.toContain("mcp-youtube-secret");
      expect(JSON.stringify([first, second]))
        .not.toContain("mcp-continuation-secret-value-32-bytes");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await server.close();
    }
  });

  it("returns a structured synthesis-blocking failure when the continuation secret is missing", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    delete process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    try {
      const result = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube video audit retrieved 0 record(s) cumulatively; this video's comments lock block (this video only). Error: youtube_video_community_audit_failed. YouTube video community audit failed before reaching a valid completion state."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_video_community_audit",
        access_status: "error",
        error: { code: "youtube_video_community_audit_failed" },
        receipt: {
          comment_retrieval_state: "incomplete",
          video_comments_lock: "block"
        }
      });
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await server.close();
    }
  });

  it("reports invalid and expired continuations as literal restart-required failures", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const secret = "mcp-continuation-secret-value-32-bytes";
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = secret;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const now = Date.now();
    const expiredToken = encodeYoutubeAuditContinuation({
      version: 1,
      video_id: "XpZHKGGCK-o",
      analysis_limit: 500,
      started_at_ms: now - 3_600_001,
      expires_at_ms: now - 1,
      segment_index: 0,
      cursor: { thread_offset: 0, top_level_emitted: false },
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 0,
      reply_pages: 0,
      records_retrieved_cumulative: 0,
      rolling_sha256: "0".repeat(64),
      sample_identifiers: [],
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([]),
      reply_count_mismatches: []
    }, secret);

    try {
      const [invalid, expired] = await Promise.all([
        client.callTool({
          name: "audit_youtube_video_community",
          arguments: { continuation_token: `${expiredToken}x` }
        }),
        client.callTool({
          name: "audit_youtube_video_community",
          arguments: { continuation_token: expiredToken }
        })
      ]);

      expect(upstream).not.toHaveBeenCalled();
      expect(invalid.structuredContent).toMatchObject({
        error: { code: "youtube_video_audit_continuation_invalid" },
        limitations: [expect.stringMatching(/restart.*video/i)],
        receipt: { comment_retrieval_state: "incomplete", video_comments_lock: "block" }
      });
      expect(expired.structuredContent).toMatchObject({
        error: { code: "youtube_video_audit_continuation_expired" },
        limitations: [expect.stringMatching(/restart.*video/i)],
        receipt: { comment_retrieval_state: "incomplete", video_comments_lock: "block" }
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await server.close();
    }
  });

  it("counts a repeat-filter match the exact sample cannot settle, states it and keeps the sample", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const secret = "mcp-continuation-secret-value-32-bytes";
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = secret;
    const duplicateId = "corpus-0500";
    const identifiers = Array.from(
      { length: 501 },
      (_, index) => `corpus-${String(index).padStart(4, "0")}`
    );
    const now = Date.now();
    const continuation = encodeYoutubeAuditContinuation({
      version: 1,
      video_id: "XpZHKGGCK-o",
      analysis_limit: 500,
      started_at_ms: now,
      expires_at_ms: now + 3_600_000,
      segment_index: 6,
      cursor: { thread_offset: 0, top_level_emitted: false },
      provider_reported_comments: "501",
      top_level_comments_retrieved: 501,
      replies_retrieved: 0,
      comment_thread_pages: 26,
      reply_pages: 0,
      pagination_overlaps_reconciled: 0,
      records_retrieved_cumulative: 501,
      rolling_sha256: "b".repeat(64),
      sample_identifiers: identifiers.slice(0, 500),
      seen_identifier_membership: createYoutubeAuditIdentifierMembership(identifiers),
      reply_count_mismatches: []
    }, secret);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/videos")) {
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      if (url.searchParams.has("id")) return mcpCommentIdResponse(url);
      if (url.pathname.endsWith("/comments")) {
        return Response.json({ pageInfo: { totalResults: 0, resultsPerPage: 0 }, items: [] });
      }
      return Response.json({
        pageInfo: { totalResults: 1, resultsPerPage: 1 },
        items: [{
          kind: "youtube#commentThread",
          id: "UgxThreadDuplicateBoundary",
          snippet: {
            videoId: "XpZHKGGCK-o",
            topLevelComment: {
              kind: "youtube#comment",
              id: duplicateId,
              snippet: {
                videoId: "XpZHKGGCK-o",
                textDisplay: "Repeated boundary record",
                textOriginal: "Repeated boundary record",
                authorDisplayName: "Recorded Author",
                likeCount: 0,
                publishedAt: "2025-02-01T10:00:00Z",
                updatedAt: "2025-02-01T10:00:00Z"
              }
            },
            totalReplyCount: 0
          }
        }]
      });
    }));

    try {
      const result = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { continuation_token: continuation }
      });

      expect(result.structuredContent).toMatchObject({
        video_id: "XpZHKGGCK-o",
        segment_index: 7,
        access_status: "partial",
        extraction_coverage: "completed_with_access_boundary",
        top_level_comments_retrieved_cumulative: 502,
        records_retrieved_cumulative: 502,
        comment_thread_pages_cumulative: 27,
        limitations: expect.arrayContaining([
          expect.stringMatching(/^1 record\(s\) matched the audit's repeat filter but not its exact sample\..*counted as new.*too high\.$/)
        ]),
        continuation_recommended: false,
        receipt: {
          comment_retrieval_state: "completed_with_access_boundary",
          video_comments_lock: "pass",
          blockers: []
        }
      });
      // The audit goes on instead of stopping, so it has no error and returns its sample.
      expect(result.structuredContent).not.toHaveProperty("error");
      const content = result.structuredContent as { records_returned_for_analysis: number; research_receipt: string };
      expect(content.records_returned_for_analysis).toBeGreaterThan(0);
      expect(verifyResearchReceipt(content.research_receipt, { secret })).toMatchObject({
        ok: true, kind: "youtube_video_audit", claims: {
          video: "XpZHKGGCK-o", state: "completed_with_access_boundary", lock: "pass", records: "502", top: "502"
        }
      });
      expect(verifyResearchReceipt(content.research_receipt, { secret })).not.toMatchObject({
        claims: { boundary: "identifier_membership" }
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await server.close();
    }
  });

  it("reconciles an exact duplicate below 500 as a moving-pagination boundary", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const secret = "mcp-continuation-secret-value-32-bytes";
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = secret;
    const duplicateId = "corpus-0000";
    const now = Date.now();
    const continuation = encodeYoutubeAuditContinuation({
      version: 1,
      video_id: "XpZHKGGCK-o",
      analysis_limit: 500,
      started_at_ms: now,
      expires_at_ms: now + 3_600_000,
      segment_index: 1,
      cursor: { thread_offset: 0, top_level_emitted: false },
      provider_reported_comments: "1",
      top_level_comments_retrieved: 1,
      replies_retrieved: 0,
      comment_thread_pages: 1,
      reply_pages: 0,
      pagination_overlaps_reconciled: 0,
      records_retrieved_cumulative: 1,
      rolling_sha256: "c".repeat(64),
      sample_identifiers: [duplicateId],
      seen_identifier_membership: createYoutubeAuditIdentifierMembership([duplicateId]),
      reply_count_mismatches: []
    }, secret);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/videos")) {
        return new Response(await youtubeFixture("video-found.json"), { status: 200 });
      }
      if (url.searchParams.has("id")) return mcpCommentIdResponse(url);
      if (url.pathname.endsWith("/comments")) {
        return Response.json({
          pageInfo: { totalResults: 0, resultsPerPage: 0 },
          items: []
        });
      }
      return Response.json({
        pageInfo: { totalResults: 1, resultsPerPage: 1 },
        items: [{
          kind: "youtube#commentThread",
          id: "UgxThreadExactDuplicate",
          snippet: {
            videoId: "XpZHKGGCK-o",
            topLevelComment: {
              kind: "youtube#comment",
              id: duplicateId,
              snippet: {
                videoId: "XpZHKGGCK-o",
                textDisplay: "Exact duplicate",
                textOriginal: "Exact duplicate",
                authorDisplayName: "Recorded Author",
                likeCount: 0,
                publishedAt: "2025-02-01T10:00:00Z",
                updatedAt: "2025-02-01T10:00:00Z"
              }
            },
            totalReplyCount: 0
          }
        }]
      });
    }));

    try {
      const result = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { continuation_token: continuation }
      });

      expect(result.structuredContent).toMatchObject({
        video_id: "XpZHKGGCK-o",
        segment_index: 2,
        access_status: "partial",
        extraction_coverage: "completed_with_access_boundary",
        top_level_comments_retrieved_this_call: 0,
        records_retrieved_this_call: 0,
        records_retrieved_cumulative: 1,
        records_returned_for_analysis: 1,
        corpus_rolling_sha256: "c".repeat(64),
        limitations: [expect.stringMatching(/moving provider pagination/i)],
        receipt: {
          comment_retrieval_state: "completed_with_access_boundary",
          video_comments_lock: "pass"
        }
      });
      expect(result.structuredContent).not.toHaveProperty("error");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await server.close();
    }
  });

  it("reports a signed legacy corpus continuation as migration restart required", async () => {
    const { client, server } = await createInMemoryClient();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    const previousContinuationSecret = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    const secret = "mcp-continuation-secret-value-32-bytes";
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = secret;
    const now = Date.now();
    const payload = Buffer.from(JSON.stringify({
      version: 1,
      video_id: "XpZHKGGCK-o",
      analysis_limit: 500,
      started_at_ms: now,
      expires_at_ms: now + 3_600_000,
      segment_index: 6,
      cursor: { thread_offset: 0, top_level_emitted: false },
      provider_reported_comments: "501",
      top_level_comments_retrieved: 501,
      replies_retrieved: 0,
      comment_thread_pages: 26,
      reply_pages: 0,
      records_retrieved_cumulative: 501,
      rolling_sha256: "b".repeat(64),
      sample_identifiers: Array.from(
        { length: 500 },
        (_, index) => ({ comment_id: `legacy-${String(index).padStart(4, "0")}` })
      ),
      reply_count_mismatches: []
    }), "utf8").toString("base64url");
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    try {
      const result = await client.callTool({
        name: "audit_youtube_video_community",
        arguments: { continuation_token: `${payload}.${signature}` }
      });

      expect(upstream).not.toHaveBeenCalled();
      expect(result.structuredContent).toMatchObject({
        video_id: "XpZHKGGCK-o",
        segment_index: 6,
        error: {
          code: "youtube_video_audit_continuation_migration_restart_required",
          retryable: false
        },
        records_retrieved_cumulative: 501,
        comment_thread_pages_cumulative: 26,
        limitations: [expect.stringMatching(/upgrade|migration/i)]
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previousContinuationSecret);
      await server.close();
    }
  });

  it("publishes strict, retrieval-only YouTube discovery schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_youtube");
      const video = tools.find(({ name }) => name === "get_youtube_video");

      expect(search).toMatchObject({
        description: "Searches YouTube videos and returns API-visible metadata with explicit pagination and access state. Optional product_identity marks each result from search snippets and reports that limitation; no medical conclusions are generated. " +
          "An optional research_target binds the search to a research discovery round.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1, maxLength: 5000 },
            page_size: { type: "integer", minimum: 1, maximum: 50 },
            cursor: { type: "string", minLength: 1, maxLength: 4096 },
            research_target: { type: "string", minLength: 1, maxLength: 5000 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect(video).toMatchObject({
        description: "Retrieve one API-visible YouTube video by supported ID or URL without interpreting its content or making medical conclusions.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["video_id_or_url"],
          additionalProperties: false,
          properties: { video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 } }
        },
        outputSchema: { type: "object" }
      });
      expect(search!.outputSchema.properties.data).toMatchObject({
        type: "array",
        maxItems: 50
      });
      expect(search!.outputSchema.properties.data.items).toMatchObject({
        type: "object",
        additionalProperties: true
      });
      expect(search!.outputSchema.properties.data.items.properties).toMatchObject({
        video_id: { type: "string", pattern: "^[A-Za-z0-9_-]{11}$" },
        channel_id: { type: "string", pattern: "^UC[A-Za-z0-9_-]{22}$" },
        title: { type: "string", minLength: 1, maxLength: 10000 },
        description: { type: "string", maxLength: 100000 },
        published_at: { type: "string", pattern: expect.any(String) }
      });
      const videoDataVariants = video!.outputSchema.properties.data.anyOf;
      expect(videoDataVariants).toHaveLength(2);
      expect(videoDataVariants[0]).toMatchObject({
        type: "object",
        required: ["video_id"]
      });
      expect(videoDataVariants[0].properties.duration).toMatchObject({ type: "string", pattern: expect.any(String) });
      expect(videoDataVariants[0].properties.video_id).toMatchObject({ pattern: "^[A-Za-z0-9_-]{11}$" });
      expect(videoDataVariants[0].properties.statistics.properties.view_count).toMatchObject({ pattern: "^\\d+$" });
      expect(videoDataVariants[0].properties.published_at).toMatchObject({ pattern: expect.any(String) });
      expect(videoDataVariants[0].properties.live_broadcast_content).toEqual({ type: "string" });
      expect(videoDataVariants[0].properties.privacy_status).toEqual({ type: "string" });
      expect(videoDataVariants[1]).toMatchObject({
        type: "object",
        additionalProperties: true
      });
    } finally {
      await server.close();
    }
  });

  it("returns a deterministic missing-key YouTube MCP error before an upstream request", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    delete process.env.YOUTUBE_API_KEY;

    try {
      const result = await client.callTool({
        name: "search_youtube",
        arguments: { query: "recorded subject" }
      });

      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube search returned 0 video record(s); access status inaccessible. Error: youtube_api_key_missing. YouTube retrieval cannot run until the server-side API key is configured."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_search_result",
        access_status: "inaccessible",
        error: { code: "youtube_api_key_missing", message: "YouTube API key is not configured" },
        data: []
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns the same deterministic missing-key envelope for YouTube video retrieval", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    delete process.env.YOUTUBE_API_KEY;

    try {
      const result = await client.callTool({
        name: "get_youtube_video",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube video retrieval finished with access status inaccessible. Error: youtube_api_key_missing. YouTube retrieval cannot run until the server-side API key is configured."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_video",
        access_status: "inaccessible",
        error: { code: "youtube_api_key_missing", message: "YouTube API key is not configured" },
        data: {}
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("signs a successful video metadata lookup for later scout settlement", async () => {
    const { client, server } = await createInMemoryClient();
    const previousKey = process.env.YOUTUBE_API_KEY;
    const previousSecret = process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    const secret = "metadata-receipt-secret-0123456789abcdef";
    process.env.YOUTUBE_API_KEY = "synthetic-youtube-key";
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = secret;
    const body = await youtubeFixture("video-found.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    try {
      const result = await client.callTool({ name: "get_youtube_video", arguments: { video_id_or_url: "XpZHKGGCK-o" } });
      expect(result.isError).not.toBe(true);
      expect(verifyResearchReceipt(result.structuredContent!.research_receipt as string, { secret })).toMatchObject({
        ok: true, kind: "youtube_video_metadata", claims: { video: "XpZHKGGCK-o", access: "api_visible_complete" }
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousKey);
      restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previousSecret);
      await client.close();
      await server.close();
    }
  });

  it("returns deterministic structured YouTube search and video successes through MCP", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const [searchBody, videoBody] = await Promise.all([
      youtubeFixture("search-page-1.json"),
      youtubeFixture("video-found.json")
    ]);
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return new Response(url.pathname.endsWith("/search") ? searchBody : videoBody, { status: 200 });
    }));

    try {
      const search = await client.callTool({
        name: "search_youtube",
        arguments: { query: "recorded subject", page_size: 1 }
      });
      const video = await client.callTool({
        name: "get_youtube_video",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(search.isError).not.toBe(true);
      expect(search.content).toEqual([{
        type: "text",
        text: "YouTube search returned 1 video record(s); access status complete."
      }]);
      expect(search.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_search_result",
        access_status: "complete",
        data: [{ video_id: "XpZHKGGCK-o", published_at: "2025-01-02T03:04:05Z" }]
      });
      expect(video.isError).not.toBe(true);
      expect(video.content).toEqual([{
        type: "text",
        text: "YouTube video retrieval finished with access status api_visible_complete."
      }]);
      expect(video.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_video",
        access_status: "api_visible_complete",
        data: { video_id: "XpZHKGGCK-o", duration: "PT12M34S", privacy_status: "public" }
      });
      expect(JSON.stringify([search, video])).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("issues a discovery receipt for every completed search, including one that finds nothing", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = {
      apiKey: process.env.YOUTUBE_API_KEY,
      continuationSecret: process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET,
      finalizationSecret: process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET
    };
    const [found, empty] = await Promise.all([youtubeFixture("search-page-1.json"), youtubeFixture("search-empty.json")]);
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      new Response(new URL(String(input)).searchParams.get("q") === "nothing here" ? empty : found, { status: 200 })
    ));

    try {
      const receiptOf = async (query: string, researchTarget?: string) => {
        const result = await client.callTool({
          name: "search_youtube",
          arguments: { query, page_size: 1, ...(researchTarget === undefined ? {} : { research_target: researchTarget }) }
        });
        const receipt = (result.structuredContent as { research_receipt: string }).research_receipt;
        return verifyResearchReceipt(receipt, { secret: "mcp-continuation-secret-value-32-bytes" });
      };
      const first = await receiptOf("recorded subject");
      const second = await receiptOf("nothing here");
      const repeat = await receiptOf("  Recorded   SUBJECT ");
      const targeted = await receiptOf("recorded subject", "Adults with hip pain");

      // A page with more results after it leaves the round open.
      expect(first).toMatchObject({ ok: true, kind: "youtube_search", claims: { videos: ["XpZHKGGCK-o"], open: "1" } });
      // An empty round is evidence that discovery has saturated, so it is signed too.
      expect(second).toMatchObject({ ok: true, kind: "youtube_search", claims: { videos: [], open: "0" } });
      const angle = (verification: typeof first) => verification.ok ? verification.claims.q : undefined;
      expect(angle(first)).toMatch(/^[a-f0-9]{12}$/u);
      expect(angle(second)).not.toBe(angle(first));
      expect(angle(repeat)).toBe(angle(first));
      // The research target binds the round to its research; the signed order
      // increases with every receipt.
      expect(first.ok && first.claims.target).toBeUndefined();
      expect(targeted).toMatchObject({ ok: true, claims: { target: researchTargetDigest("adults with  HIP pain") } });
      const order = [first, second, repeat, targeted].map((verification) => verification.ok ? Number(verification.claims.t) : NaN);
      expect(order.every((value, index) => index === 0 || value > order[index - 1]!)).toBe(true);
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous.apiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previous.continuationSecret);
      restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previous.finalizationSecret);
      await server.close();
    }
  });

  it("signs the pages a search read and the searches a limit stopped", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = {
      apiKey: process.env.YOUTUBE_API_KEY,
      continuationSecret: process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET,
      finalizationSecret: process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET
    };
    const [firstPage, finalPage, quota] = await Promise.all([
      youtubeFixture("search-page-1.json"),
      youtubeFixture("search-partial-final.json"),
      youtubeFixture("error-quota-exceeded.json")
    ]);
    const secret = "mcp-continuation-secret-value-32-bytes";
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = secret;
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    let quotaSpent = false;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => quotaSpent
      ? new Response(quota, { status: 403 })
      : new Response(new URL(String(input)).searchParams.has("pageToken") ? finalPage : firstPage, { status: 200 })
    ));
    const target = "Adults with hip pain";
    const receiptOf = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      const receipt = (result.structuredContent as { research_receipt?: string }).research_receipt;
      expect(receipt).toBeDefined();
      return verifyResearchReceipt(receipt!, { secret });
    };
    const claimsOf = (verification: Awaited<ReturnType<typeof receiptOf>>) => verification.ok ? verification.claims : {};

    try {
      // Page one signs the page it left; page two, the page it read. Both are
      // keyed to the query, whatever its case and spacing.
      const next = pageKey("hip pain what worked", "opaque+/next-token");
      const pageOne = await receiptOf("search_youtube", { query: "hip pain what worked", page_size: 1, research_target: target });
      const pageTwo = await receiptOf("search_youtube", {
        query: "Hip pain  what worked", page_size: 1, cursor: "opaque+/next-token", research_target: target
      });
      expect(pageOne).toMatchObject({ ok: true, claims: { open: "1", nx: next, rl: "0", inc: "0" } });
      expect(pageTwo).toMatchObject({ ok: true, claims: { open: "0", pg: next } });
      expect(claimsOf(pageTwo).nx).toBeUndefined();
      // A survey signs its searches' pages as lists, keyed to the caller's terms.
      const survey = await receiptOf("survey_youtube_community", {
        research_question: target,
        searches: [{ direction: "general", query: "hip pain what worked" }]
      });
      expect(survey).toMatchObject({ ok: true, kind: "youtube_survey", claims: { open: "1", nx: [next] } });
      expect(claimsOf(survey).pg).toBeUndefined();

      // With the daily quota spent, each discovery tool still signs its round
      // and what stopped it; a page it could not read is not signed as read.
      quotaSpent = true;
      const stoppedPage = await receiptOf("search_youtube", {
        query: "hip pain what worked", page_size: 1, cursor: "opaque+/next-token", research_target: target
      });
      expect(stoppedPage).toMatchObject({ ok: true, claims: { access: "rate_limited", rl: "1", inc: "1", videos: [] } });
      expect(claimsOf(stoppedPage).pg).toBeUndefined();
      const stoppedSurvey = await receiptOf("survey_youtube_community", {
        research_question: target,
        searches: [
          { direction: "general", query: "hip pain what worked" },
          { direction: "benefit", query: "hip pain finally helped" }
        ]
      });
      expect(stoppedSurvey).toMatchObject({ ok: true, kind: "youtube_survey", claims: { rl: "2", inc: "2", videos: [] } });
      const stoppedAudit = await receiptOf("audit_youtube_community", {
        research_question: target,
        searches: [{ direction: "general", query: "hip pain what worked" }],
        max_videos: 1
      });
      expect(stoppedAudit).toMatchObject({
        ok: true, kind: "youtube_community_audit", claims: { state: "incomplete", access: "partial", rl: "1", inc: "1", videos: [] }
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous.apiKey);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previous.continuationSecret);
      restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previous.finalizationSecret);
      await server.close();
    }
  });

  it("publishes strict, source-aligned retrieval-only YouTube comment schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const getComments = tools.find(({ name }) => name === "get_youtube_comments");
      const searchComments = tools.find(({ name }) => name === "search_youtube_comments");

      expect(getComments).toMatchObject({
        description: "Retrieve all API-visible YouTube top-level comments and, by default, every independently paginated reply with explicit completeness accounting; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["video_id_or_url"],
          additionalProperties: false,
          properties: {
            video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 },
            include_replies: { type: "boolean", default: true },
            cursor: { type: "string", minLength: 1, maxLength: 4096 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect(searchComments).toMatchObject({
        description: "Retrieve a query-bounded API-visible YouTube comment-thread subset and independently paginate replies with explicit partial coverage; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["video_id_or_url", "query"],
          additionalProperties: false,
          properties: {
            video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 },
            query: { type: "string", minLength: 1, maxLength: 5000 },
            include_replies: { type: "boolean", default: true },
            cursor: { type: "string", minLength: 1, maxLength: 4096 }
          }
        },
        outputSchema: { type: "object" }
      });

      for (const tool of [getComments!, searchComments!]) {
        const commentData = tool.outputSchema.properties.data.anyOf[0];
        expect(commentData).toMatchObject({
          type: "object",
          required: ["comments", "manifest"],
          additionalProperties: true
        });
        expect(commentData.properties.comments.items).toMatchObject({
          type: "object",
          required: [
            "video_id", "comment_id", "parent_id", "top_level_comment_id",
            "is_reply", "text", "like_count", "published_at", "updated_at"
          ],
          additionalProperties: true
        });
        expect(commentData.properties.manifest).toMatchObject({
          type: "object",
          required: [
            "video_id", "top_level_comments_retrieved", "expected_replies",
            "replies_retrieved", "total_comments_and_replies",
            "reply_count_mismatches", "pages", "extraction_coverage"
          ],
          additionalProperties: true
        });
      }
    } finally {
      await server.close();
    }
  });

  it("returns a complete reconciled YouTube comment manifest through MCP", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      mcpCompleteCommentResponse(new URL(String(input)))
    ));

    try {
      const result = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 6 comment/reply record(s); access status api_visible_complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_comments",
        access_status: "api_visible_complete",
        data: {
          manifest: {
            expected_replies: 4,
            replies_retrieved: 4,
            reply_count_mismatches: [],
            extraction_coverage: "api_visible_complete"
          }
        }
      });
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("accepts an exact channel id through later_inputs and excludes similarly named channels", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    const page = JSON.parse(await youtubeFixture("search-page-1.json"));
    const channelId = page.items[0].snippet.channelId;
    page.items.push({ ...page.items[0], id: { kind: "youtube#video", videoId: "abcdefghijk" },
      snippet: { ...page.items[0].snippet, channelId: "UCabcdefghijkl0123456789" } });
    page.items.push({ ...page.items[0], id: { kind: "youtube#video", videoId: "lmnopqrstuv" }, snippet: { title: "Unknown channel" } });
    page.pageInfo = { totalResults: 3, resultsPerPage: 3 };
    delete page.nextPageToken;
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return Response.json(page);
    }));
    try {
      for (const args of [{ later_inputs: { channel_id: channelId } }, { channel_id: channelId }]) {
        const result = await client.callTool({ name: "search_youtube", arguments: { query: "Recorded health channel", ...args } });
        expect(result.isError).not.toBe(true);
        expect((result.structuredContent as any).data.map(({ channel_id }: any) => channel_id)).toEqual([channelId]);
      }
      expect(requests.every((url) => url.searchParams.get("channelId") === channelId)).toBe(true);
      const duplicate = await client.callTool({ name: "search_youtube", arguments: {
        query: "Recorded health channel", channel_id: channelId, later_inputs: { channel_id: channelId }
      } });
      expect(duplicate.isError).toBe(true);
      expect(requests).toHaveLength(2);
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it.each(["get_youtube_comments", "search_youtube_comments"])("%s marks empty-text replies as found with unread content", async (name) => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    const replies = JSON.parse(await youtubeFixture("comments-query-parent.json"));
    replies.items[0].snippet.textDisplay = "";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => new URL(String(input)).pathname.endsWith("/commentThreads")
      ? Response.json(JSON.parse(await youtubeFixture("comment-threads-query.json"))) : Response.json(replies)));
    try {
      const result = await client.callTool({ name, arguments: { video_id_or_url: "XpZHKGGCK-o",
        ...(name === "search_youtube_comments" ? { query: "recorded episode" } : {}) } });
      expect(result.isError).not.toBe(true);
      const comments = (result.structuredContent as any).data.comments;
      expect(comments.find(({ is_reply }: any) => is_reply)).toMatchObject({ text: "", comment_found: true,
        content_read: false, source_modality: "unknown", content_verified: false, audio_available: null, transcript_read: false });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns targeted YouTube comment search as query-bounded partial without isError", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/commentThreads")
        ? new Response(await youtubeFixture("comment-threads-query.json"), { status: 200 })
        : new Response(await youtubeFixture("comments-query-parent.json"), { status: 200 });
    }));

    try {
      const result = await client.callTool({
        name: "search_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o", query: "recorded episode" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube targeted comment retrieval returned 2 comment/reply record(s); access status partial. " +
          "Query-bounded: matches show only comments that contain these terms. Zero or few matches are no evidence " +
          "that commenters do not report something; read the full comments with audit_youtube_video_community before " +
          "saying so."
      }]);
      // No count from a query-bounded search, zero included, may be read as absence.
      expect(result.structuredContent).toMatchObject({
        absence_inference_permitted: false,
        query: { query: "recorded episode" },
        access_status: "partial",
        data: { manifest: { extraction_coverage: "partial" } }
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns deterministic comments-disabled and missing-key MCP errors", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;

    try {
      delete process.env.YOUTUBE_API_KEY;
      const missingKey = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });
      expect(missingKey.isError).toBe(true);
      expect(missingKey.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 0 comment/reply record(s); access status inaccessible. Error: youtube_api_key_missing. YouTube retrieval cannot run until the server-side API key is configured."
      }]);
      expect(missingKey.structuredContent).toMatchObject({
        access_status: "inaccessible",
        error: { code: "youtube_api_key_missing" },
        data: {}
      });

      process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
      vi.stubGlobal("fetch", vi.fn(async () => new Response(
        await youtubeFixture("error-comments-disabled.json"), { status: 403 }
      )));
      const disabled = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });
      expect(disabled.isError).toBe(true);
      expect(disabled.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 0 comment/reply record(s); access status comments_disabled. Error: youtube_comments_disabled. YouTube top-level comment retrieval stopped before every API-visible page could be exhausted."
      }]);
      expect(disabled.structuredContent).toMatchObject({
        access_status: "comments_disabled",
        error: { code: "youtube_comments_disabled", message: "YouTube comments are disabled" }
      });
      expect(JSON.stringify(disabled)).not.toContain("provider-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("marks a mid-pagination YouTube MCP failure partial and never leaks raw provider details", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments") && url.searchParams.has("pageToken")) {
        return new Response(await youtubeFixture("error-access-denied.json"), { status: 403 });
      }
      return mcpCompleteCommentResponse(url);
    }));

    try {
      const result = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 5 comment/reply record(s); access status partial. Error: youtube_access_denied. Reply counts did not reconcile for 2 top-level comment(s). YouTube reply retrieval stopped before every expected reply corpus could be exhausted."
      }]);
      expect(result.structuredContent).toMatchObject({
        access_status: "partial",
        error: { code: "youtube_access_denied", message: "YouTube access denied" },
        data: { manifest: { extraction_coverage: "partial" } }
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret-mid-pagination");
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("publishes strict, retrieval-only DOI and retraction schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const resolve = tools.find(({ name }) => name === "resolve_doi");
      const retraction = tools.find(({ name }) => name === "check_retraction_status");

      expect(resolve).toMatchObject({
        description: "Resolve a DOI or bibliographic citation through Crossref metadata; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["doi_or_citation"],
          additionalProperties: false,
          properties: { doi_or_citation: { type: "string", minLength: 1, maxLength: 5000 } }
        },
        outputSchema: { type: "object" }
      });
      // The DOI under either name: the 22 Oct regressions' 27 failed calls here all named it doi.
      expect(retraction).toMatchObject({
        description: "Check traceable Crossref update metadata for a DOI without inferring validity, safety, or medical conclusions.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            identifier: { type: "string", minLength: 1, maxLength: 5000 },
            doi: { type: "string", minLength: 1, maxLength: 5000 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect((retraction?.inputSchema as { required?: string[] }).required ?? []).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("takes the retraction check's DOI as identifier or doi, and says which to give when neither is", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 503 })));
    process.env.CROSSREF_MAILTO = "maintainer@example.test";

    try {
      for (const args of [{ identifier: "10.0000/unresolvable" }, { doi: "10.0000/unresolvable" }]) {
        const result = await client.callTool({ name: "check_retraction_status", arguments: args });
        expect(result.structuredContent).toMatchObject({ error: { code: "crossref_upstream_unavailable" } });
      }
      const missing = await client.callTool({ name: "check_retraction_status", arguments: {} });
      expect(missing.isError).toBe(true);
      expect(missing.content).toEqual([{ type: "text", text: "Give the DOI to inspect as identifier." }]);
      expect(missing.structuredContent).toMatchObject({
        data: { status: "unknown" }, error: { code: "crossref_identifier_missing" }
      });
    } finally {
      vi.unstubAllGlobals();
      if (previous === undefined) delete process.env.CROSSREF_MAILTO;
      else process.env.CROSSREF_MAILTO = previous;
      await server.close();
    }
  });

  it("returns a valid structured DOI resolution through the real in-memory MCP boundary", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    const body = await readFile(new URL(
      "fixtures/crossref/work-no-marker.json",
      import.meta.url
    ), "utf8");
    process.env.CROSSREF_MAILTO = "mcp-maintainer@example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    try {
      const result = await client.callTool({
        name: "resolve_doi",
        arguments: { doi_or_citation: "10.5555/no.marker" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Crossref DOI resolution finished with access status metadata_only."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "crossref",
        record_type: "doi_resolution",
        primary_identifier: "10.5555/no.marker",
        access_status: "metadata_only",
        data: {
          resolved_doi: "10.5555/no.marker",
          candidates: [{ doi: "10.5555/no.marker" }]
        }
      });
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("returns a conservative retraction envelope as an MCP error when Crossref fails", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 503 })));
    process.env.CROSSREF_MAILTO = "maintainer@example.test";

    try {
      const result = await client.callTool({
        name: "check_retraction_status",
        arguments: { identifier: "10.0000/unresolvable" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Crossref retraction-status lookup finished with status unknown; access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "crossref",
        record_type: "retraction_status",
        access_status: "error",
        data: { status: "unknown", evidence: [], sources_checked: ["crossref"] },
        error: { code: "crossref_upstream_unavailable" }
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("requires CROSSREF_MAILTO and sends it only to Crossref", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    const requests: Array<{ url: URL; userAgent: string | null }> = [];
    const body = await readFile(new URL("fixtures/crossref/work-no-marker.json", import.meta.url), "utf8");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), userAgent: new Headers(init?.headers).get("user-agent") });
      return new Response(body, { status: 200 });
    }));
    process.env.CROSSREF_MAILTO = "mcp-maintainer@example.test";

    try {
      const result = await client.callTool({ name: "check_retraction_status", arguments: { identifier: "10.5555/no.marker" } });
      expect(result.isError).not.toBe(true);
      expect(requests).toEqual([{
        url: expect.objectContaining({ pathname: "/works/10.5555%2Fno.marker" }),
        userAgent: "askrigor-research/0.1.0 (mailto:mcp-maintainer@example.test)"
      }]);
      expect(requests[0]!.url.searchParams.get("mailto")).toBe("mcp-maintainer@example.test");
      expect(JSON.stringify(result)).not.toContain("mcp-maintainer@example.test");
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("returns a structured Crossref error without a request when CROSSREF_MAILTO is absent", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    delete process.env.CROSSREF_MAILTO;

    try {
      const result = await client.callTool({ name: "check_retraction_status", arguments: { identifier: "10.5555/no.marker" } });
      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        data: { status: "unknown", evidence: [] },
        error: { code: "crossref_configuration_invalid" }
      });
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("publishes bounded PubMed input schemas and retrieval-only descriptions", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_pubmed")!;
      const fetchRecord = tools.find(({ name }) => name === "fetch_pubmed_record")!;

      expect(search.description).toBe(
        "Search PubMed citations and return stable PMIDs with titles, explicit pagination and access state; no medical conclusions are generated."
      );
      expect(search.inputSchema).toMatchObject({
        type: "object",
        required: ["query"],
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1 },
          page_size: { type: "integer", minimum: 1, maximum: 100 },
          cursor: { type: "string", minLength: 1 },
          date_range: {
            type: "object",
            required: ["start", "end"],
            additionalProperties: false
          }
        }
      });
      expect(fetchRecord.description).toBe(
        "Retrieve one PubMed citation by PMID, preserving only metadata PubMed supplies and making no full-text or medical inference."
      );
      expect(fetchRecord.inputSchema).toMatchObject({
        type: "object",
        required: ["pmid"],
        additionalProperties: false,
        properties: {
          pmid: { type: "string", pattern: "^[1-9]\\d{0,15}$" }
        }
      });
      expect(search.outputSchema).toMatchObject({ type: "object" });
      expect(fetchRecord.outputSchema).toMatchObject({ type: "object" });
    } finally {
      await server.close();
    }
  });

  it("publishes a bounded read-only Europe PMC search schema", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_europe_pmc");

      expect(search).toMatchObject({
        description:
          "Search Europe PMC records while preserving provider source identifiers and cursors with explicit pagination and access state; no medical conclusions are generated. A query can search within article sections of Europe PMC's full texts: INTRO, METHODS, RESULTS, DISCUSS, CONCL, TABLE, FIG, SUPPL, ACK_FUND, COMP_INT, CASE, REF and BODY. Such results carry full_text_scope with the sections and coverage: Europe PMC full texts only, about 30% of PubMed records.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1 },
            page_size: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", minLength: 1 },
            date_range: {
              type: "object",
              required: ["start", "end"],
              additionalProperties: false
            }
          }
        },
        outputSchema: { type: "object" }
      });
    } finally {
      await server.close();
    }
  });

  it("publishes bounded ClinicalTrials.gov search and study retrieval schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_clinical_trials");
      const fetchStudy = tools.find(({ name }) => name === "fetch_clinical_trial");

      expect(search).toMatchObject({
        description:
          "Search ClinicalTrials.gov studies with provider pagination and explicit access state; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1 },
            page_size: { type: "integer", minimum: 1, maximum: 100 },
            page_token: { type: "string", minLength: 1 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect(fetchStudy).toMatchObject({
        description:
          "Retrieve one ClinicalTrials.gov study by NCT ID, preserving supplied metadata without medical inference.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["nct_id"],
          additionalProperties: false,
          properties: { nct_id: { type: "string", pattern: "^NCT\\d{8}$" } }
        },
        outputSchema: { type: "object" }
      });
    } finally {
      await server.close();
    }
  });

  it("returns deterministic structured PubMed search results without exposing the API key", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(
      new URL("fixtures/pubmed/esearch-page-1.json", import.meta.url),
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.NCBI_API_KEY = "mcp-secret-value";

    try {
      const result = await client.callTool({
        name: "search_pubmed",
        arguments: {
          query: "example intervention[Title/Abstract]",
          page_size: 2
        }
      });

      expect(result.isError).not.toBe(true);
      // Few records: the result says what to try before calling anything not found (owner report, 2026-09-30).
      expect(result.content).toEqual([{
        type: "text",
        text: `PubMed search returned 2 PMID record(s); access status complete.${SPARSE_SEARCH_NOTE}`
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_search_result",
        access_status: "complete",
        data: [{ pmid: "40123456" }, { pmid: "39876543" }]
      });
      expect(JSON.stringify(result)).not.toContain("mcp-secret-value");
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("issues a pubmed_record receipt carrying the DOI PubMed lists", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(new URL("fixtures/pubmed/efetch-record.xml", import.meta.url), "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      continuationSecret: process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET,
      finalizationSecret: process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = "mcp-continuation-secret-value-32-bytes";
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;

    try {
      const result = await client.callTool({ name: "fetch_pubmed_record", arguments: { pmid: "40123456" } });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ access_status: "api_visible_complete" });
      const receipt = (result.structuredContent as { research_receipt: string }).research_receipt;
      expect(verifyResearchReceipt(receipt, { secret: "mcp-continuation-secret-value-32-bytes" })).toMatchObject({
        ok: true,
        kind: "pubmed_record",
        claims: { pmid: "40123456", doi: "10.1234/recorded.example" }
      });
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", previous.continuationSecret);
      restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previous.finalizationSecret);
      await server.close();
    }
  });

  it("returns a normalized Europe PMC envelope with provider identifiers and cursor", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(
      new URL("fixtures/europe-pmc/search-page-1.json", import.meta.url),
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    try {
      const result = await client.callTool({
        name: "search_europe_pmc",
        arguments: { query: "example intervention", page_size: 2 }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: `Europe PMC search returned 2 record(s); access status complete.${SPARSE_SEARCH_NOTE}`
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "europe_pmc",
        record_type: "europe_pmc_search_result",
        access_status: "complete",
        pagination: {
          next_cursor: "AoIIQHNhbXBsZS1uZXh0LWN1cnNvcg=="
        },
        data: [
          { source: "MED", id: "40123456" },
          { source: "PPR", id: "PPR987654" }
        ]
      });
      expect(JSON.stringify(result)).not.toContain("https://www.ebi.ac.uk");

      // With a signing secret, the search signs its database, its query's digest and its counts, so
      // finalize_research can name what was searched where the answer says something was not found.
      const previousSecret = process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
      process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = "literature-search-secret-value-32-bytes";
      try {
        const signed = await client.callTool({
          name: "search_europe_pmc",
          arguments: { query: "example intervention", page_size: 2 }
        });
        const receipt = (signed.structuredContent as { research_receipt: string }).research_receipt;
        expect(verifyResearchReceipt(receipt, { secret: "literature-search-secret-value-32-bytes" })).toMatchObject({
          ok: true, kind: "literature_search", claims: { src: "europepmc", ret: "2", n: "3" }
        });
        expect(receipt).not.toContain("example%20intervention");
        expect(receipt).not.toContain("example intervention");
      } finally {
        restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previousSecret);
      }
    } finally {
      await server.close();
    }
  });

  // Owner rule (geosmin report, 2026-09-30): before anything is called not found, every record of a
  // small search is seen, so a first page that stops short of 50 or fewer records is fetched whole.
  describe("a search that finds 50 or fewer records", () => {
    const SECRET = "literature-search-secret-value-32-bytes";
    const ids = (start: number, end: number) =>
      Array.from({ length: Math.max(0, end - start) }, (_, index) => String(40_000_001 + start + index));
    // Answers ESearch with the PMIDs from retstart up to retmax of `count` (a retmax of 50 gets a 403
    // or no answer when `whole` says so) and ESummary with an unreadable body; returns each ESearch
    // retmax in order.
    const stubPubmed = (count: number, whole: "answer" | "refuse" | "hang" = "answer"): number[] => {
      const retmaxes: number[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        if (!url.pathname.endsWith("/esearch.fcgi")) return new Response("{}", { status: 200 });
        const retmax = Number(url.searchParams.get("retmax"));
        const retstart = Number(url.searchParams.get("retstart"));
        retmaxes.push(retmax);
        if (whole === "refuse" && retmax === 50) return new Response("unavailable", { status: 403 });
        if (whole === "hang" && retmax === 50) return new Promise<Response>(() => undefined);
        const idlist = ids(retstart, Math.min(count, retstart + retmax));
        return new Response(JSON.stringify({
          header: { type: "esearch", version: "0.3" },
          esearchresult: { count: String(count), retmax: String(idlist.length), retstart: String(retstart), idlist }
        }), { status: 200 });
      }));
      return retmaxes;
    };
    const call = async (name: string, args: Record<string, unknown>) => {
      const { client, server } = await createInMemoryClient();
      const previous = {
        tool: process.env.NCBI_TOOL,
        email: process.env.NCBI_EMAIL,
        apiKey: process.env.NCBI_API_KEY,
        secret: process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET
      };
      process.env.NCBI_TOOL = "askrigor-mcp-tests";
      process.env.NCBI_EMAIL = "maintainer@example.test";
      process.env.NCBI_API_KEY = "mcp-secret-value";
      process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
      try {
        const result = await client.callTool({ name, arguments: args });
        const content = result.structuredContent as {
          data: unknown[];
          pagination: { returned: number; exhausted: boolean; next_cursor?: string };
          research_receipt?: string;
        };
        return {
          result,
          content,
          receipt: content.research_receipt === undefined
            ? undefined
            : verifyResearchReceipt(content.research_receipt, { secret: SECRET })
        };
      } finally {
        restoreEnvironment("NCBI_TOOL", previous.tool);
        restoreEnvironment("NCBI_EMAIL", previous.email);
        restoreEnvironment("NCBI_API_KEY", previous.apiKey);
        restoreEnvironment("ASKRIGOR_FINALIZATION_SIGNING_SECRET", previous.secret);
        await server.close();
      }
    };

    it("signs a search's date range with its query, so a card can carry the range it searched (review finding 8)", async () => {
      stubPubmed(3);
      const ranged = await call("search_pubmed", { query: "ranged search",
        date_range: { start: "2015-01-01", end: "2026-10-22" } });
      expect(ranged.receipt).toMatchObject({ ok: true, kind: "literature_search",
        claims: { src: "pubmed", dr: "2015-01-01/2026-10-22" } });
      stubPubmed(3);
      const open = await call("search_pubmed", { query: "open search" });
      expect(open.receipt).toMatchObject({ ok: true, kind: "literature_search", claims: { src: "pubmed" } });
      expect(open.receipt?.ok === true ? open.receipt.claims.dr : "missing").toBeUndefined();

      // Europe PMC echoes the request it answered, the date restriction inside the query; this page echoes the request.
      const page = JSON.parse(await readFile(new URL("fixtures/europe-pmc/search-page-1.json", import.meta.url), "utf8"));
      vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        return new Response(JSON.stringify({ ...page, hitCount: 2, request: { ...page.request,
          queryString: url.searchParams.get("query"), cursorMark: url.searchParams.get("cursorMark"),
          pageSize: Number(url.searchParams.get("pageSize")) } }), { status: 200 });
      }));
      const europe = await call("search_europe_pmc", { query: "ranged search", page_size: 2,
        date_range: { start: "2020-01-01", end: "2020-12-31" } });
      expect(europe.receipt).toMatchObject({ ok: true, kind: "literature_search",
        claims: { src: "europepmc", dr: "2020-01-01/2020-12-31" } });
    });

    it("returns every PubMed record in one call and signs the whole count", async () => {
      const retmaxes = stubPubmed(35);

      const { result, content, receipt } = await call("search_pubmed", { query: "small search", page_size: 20 });

      expect(result.isError).not.toBe(true);
      expect(retmaxes).toEqual([20, 50]);
      expect(content.data).toHaveLength(35);
      expect(content.pagination).toMatchObject({ returned: 35, exhausted: true });
      expect(receipt).toMatchObject({ ok: true, kind: "literature_search", claims: { src: "pubmed", ret: "35", n: "35" } });
      expect(receipt.ok && receipt.claims.ids).toEqual((content.data as Array<{ pmid: string }>).map(({ pmid }) => pmid));
    });

    it("pages PubMed as asked past 50 records and after the first page", async () => {
      const larger = stubPubmed(51);
      const first = await call("search_pubmed", { query: "larger search", page_size: 20 });
      expect(larger).toEqual([20]);
      expect(first.content.pagination).toMatchObject({ returned: 20, exhausted: false });

      const later = stubPubmed(35);
      const second = await call("search_pubmed", {
        query: "small search",
        page_size: 10,
        cursor: Buffer.from(JSON.stringify({ retstart: 10 })).toString("base64url")
      });
      expect(later).toEqual([10]);
      expect(second.content.pagination).toMatchObject({ returned: 10, exhausted: false });
    });

    it("keeps the first PubMed page when the whole search fails", async () => {
      const retmaxes = stubPubmed(35, "refuse");

      const { result, content, receipt } = await call("search_pubmed", { query: "small search", page_size: 20 });

      expect(result.isError).not.toBe(true);
      expect(retmaxes).toEqual([20, 50]);
      expect(result.structuredContent).toMatchObject({ access_status: "complete" });
      expect(content.pagination).toMatchObject({ returned: 20, exhausted: false });
      expect(content.pagination.next_cursor).toBeDefined();
      expect(receipt).toMatchObject({ ok: true, claims: { src: "pubmed", ret: "20", n: "35" } });
    });

    it("keeps the first PubMed page when the whole search takes more than 10 seconds", async () => {
      const retmaxes = stubPubmed(35, "hang");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const pending = call("search_pubmed", { query: "small search", page_size: 20 });
      for (let step = 0; step < 400 && retmaxes.length < 2; step += 1) {
        await vi.advanceTimersByTimeAsync(50);
      }
      expect(retmaxes).toEqual([20, 50]);
      await vi.advanceTimersByTimeAsync(9_000);
      let settled = false;
      void pending.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      const { result, content } = await pending;

      expect(result.isError).not.toBe(true);
      expect(content.pagination).toMatchObject({ returned: 20, exhausted: false });
    });

    it("returns every Europe PMC record in one call", async () => {
      const pageSizes: number[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        const pageSize = Number(url.searchParams.get("pageSize"));
        const cursorMark = url.searchParams.get("cursorMark")!;
        pageSizes.push(pageSize);
        const start = cursorMark === "*" ? 0 : Number(cursorMark.slice("after-".length));
        const end = Math.min(35, start + pageSize);
        return new Response(JSON.stringify({
          hitCount: 35,
          ...(end < 35 ? { nextCursorMark: `after-${end}` } : {}),
          request: { queryString: url.searchParams.get("query"), cursorMark, pageSize },
          resultList: { result: ids(start, end).map((id) => ({ source: "MED", id })) }
        }), { status: 200 });
      }));

      const { result, content, receipt } = await call("search_europe_pmc", { query: "small search", page_size: 20 });

      expect(result.isError).not.toBe(true);
      expect(pageSizes).toEqual([20, 50]);
      expect(content.data).toHaveLength(35);
      expect(content.pagination).toMatchObject({ returned: 35, exhausted: true });
      expect(receipt).toMatchObject({ ok: true, claims: { src: "europepmc", ret: "35", n: "35" } });
    });
  });

  it("marks Europe PMC provider failures as MCP tool errors", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider detail", {
      status: 403
    })));

    try {
      const result = await client.callTool({
        name: "search_europe_pmc",
        arguments: { query: "restricted record" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Europe PMC search returned 0 record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "europe_pmc",
        record_type: "europe_pmc_search_result",
        access_status: "inaccessible",
        error: {
          code: "europe_pmc_access_denied",
          message: "Europe PMC access denied",
          http_status: 403,
          retryable: false
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("provider detail");
    } finally {
      await server.close();
    }
  });

  it("marks a normalized PubMed provider failure as an MCP tool error", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret-detail", {
      status: 403
    })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.NCBI_API_KEY = "mcp-secret-value";

    try {
      const result = await client.callTool({
        name: "search_pubmed",
        arguments: { query: "restricted citation" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed search returned 0 PMID record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_search_result",
        access_status: "inaccessible",
        pagination: { returned: 0, exhausted: false },
        error: {
          code: "pubmed_access_denied",
          message: "PubMed access denied",
          http_status: 403,
          retryable: false
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("mcp-secret-value");
      expect(JSON.stringify(result)).not.toContain("provider-secret-detail");
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("normalizes configuration failures into deterministic PubMed error envelopes", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    delete process.env.NCBI_EMAIL;
    delete process.env.NCBI_API_KEY;

    try {
      const result = await client.callTool({
        name: "fetch_pubmed_record",
        arguments: { pmid: "40123456" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed record 40123456 retrieval failed; access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_record",
        primary_identifier: "40123456",
        access_status: "error",
        pagination: { returned: 0, exhausted: false },
        limitations: [
          "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated."
        ],
        error: {
          code: "pubmed_configuration_failed",
          message: "PubMed configuration failed",
          retryable: false
        },
        data: {}
      });
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("returns a deterministic normalized ClinicalTrials.gov search result without provider URLs or bodies", async () => {
    const { client, server } = await createInMemoryClient();
    const [searchBody, versionBody] = await Promise.all([
      clinicalFixture("search-page-1.json"),
      clinicalFixture("version.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      return new Response(request.pathname === "/api/v2/version" ? versionBody : searchBody, {
        status: 200
      });
    }));

    try {
      const result = await client.callTool({
        name: "search_clinical_trials",
        arguments: { query: "example intervention", page_size: 1 }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov search returned 1 study record(s); access status complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial_search_result",
        access_status: "complete",
        pagination: { next_cursor: "provider-token+/opaque" },
        data: [{ nct_id: "NCT01234567" }]
      });
      expect(JSON.stringify(result)).not.toContain("https://clinicaltrials.gov");
    } finally {
      await server.close();
    }
  });

  it("marks a ClinicalTrials.gov not_found retrieval as an MCP tool error without leaking a provider body", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 404 })));

    try {
      const result = await client.callTool({
        name: "fetch_clinical_trial",
        arguments: { nct_id: "NCT99999999" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov study NCT99999999 retrieval finished with access status not_found."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial",
        primary_identifier: "NCT99999999",
        access_status: "not_found",
        error: {
          code: "clinical_trial_not_found",
          message: "ClinicalTrials.gov study not found",
          http_status: 404,
          retryable: false
        },
        data: {}
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
    } finally {
      await server.close();
    }
  });

  it("returns a deterministic normalized ClinicalTrials.gov study retrieval result", async () => {
    const { client, server } = await createInMemoryClient();
    const [studyBody, versionBody] = await Promise.all([
      clinicalFixture("study-NCT01234567.json"),
      clinicalFixture("version.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      return new Response(request.pathname === "/api/v2/version" ? versionBody : studyBody, {
        status: 200
      });
    }));

    try {
      const result = await client.callTool({
        name: "fetch_clinical_trial",
        arguments: { nct_id: "NCT01234567" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov study NCT01234567 retrieval finished with access status api_visible_complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial",
        primary_identifier: "NCT01234567",
        access_status: "api_visible_complete",
        data: { nct_id: "NCT01234567" }
      });
      expect(JSON.stringify(result)).not.toContain("https://clinicaltrials.gov");
    } finally {
      await server.close();
    }
  });

  it("marks a ClinicalTrials.gov upstream failure as an MCP tool error", async () => {
    const { client, server } = await createInMemoryClient();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 503 })));

    try {
      const pending = client.callTool({
        name: "search_clinical_trials",
        arguments: { query: "upstream failure" }
      });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov search returned 0 study record(s); access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial_search_result",
        access_status: "error",
        error: {
          code: "clinical_trials_upstream_unavailable",
          message: "ClinicalTrials.gov upstream service unavailable",
          http_status: 503,
          retryable: true
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
    } finally {
      await server.close();
    }
  });

  it("returns the complete canonical protocol losslessly in bounded pages", async () => {
    const { client, server } = await createInMemoryClient();
    const canonicalText = await readFile(
      new URL("../protocols/HRP_Full.xml", import.meta.url),
      "utf8"
    );

    try {
      const first = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "hrp" }
      });

      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        ok: true,
        protocol: "hrp",
        manifest: {
          name: "HRP",
          version: "20.6.34",
          revisionDate: "2026-10-30",
          sha256: "7b933620ecca1116f1d4c45c87046e37d8b2a6f97bc4e7a38b6dfd30aa23c74a"
        },
        scope: "full",
        page: 1,
        next_page: 2,
        complete: false,
        scope_sha256: "7b933620ecca1116f1d4c45c87046e37d8b2a6f97bc4e7a38b6dfd30aa23c74a"
      });
      const pageCount = (first.structuredContent as { page_count: number }).page_count;
      expect(first.content).toEqual([
        {
          type: "text",
          text: `Loaded complete canonical HRP text, page 1 of ${pageCount} (exact canonical bytes). Call load_protocol again with page 2 to continue.`
        }
      ]);
      const texts = [(first.structuredContent as { text: string }).text];
      for (let page = 2; page <= pageCount; page += 1) {
        const result = await client.callTool({
          name: "load_protocol",
          arguments: { protocol: "hrp", page }
        });
        expect(result.isError).not.toBe(true);
        expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(60_000);
        texts.push((result.structuredContent as { text: string }).text);
      }
      expect(texts.join("")).toBe(canonicalText);
    } finally {
      await server.close();
    }
  });

  it("serves the section index and exact Universal sections", async () => {
    const { client, server } = await createInMemoryClient();
    const canonicalBytes = await readFile(
      new URL("../protocols/Universal_Instructions.xml", import.meta.url)
    );

    try {
      const index = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "universal", section: "index" }
      });
      expect(index.isError).not.toBe(true);
      const indexContent = index.structuredContent as {
        manifest: { version: string; sha256: string };
        index: Array<{ name: string; core: boolean; runtime: boolean; sha256: string }>;
        core_sections: string[];
      };
      expect(indexContent.manifest).toMatchObject({
        version: "20.5.46",
        sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e"
      });
      expect(indexContent.index).toHaveLength(40);
      expect(indexContent.core_sections).toContain("epistemics");
      expect(indexContent.index.find(({ name }) => name === "revision_history")?.runtime).toBe(false);

      const section = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "universal", section: "normality_base_rate_gate" }
      });
      expect(section.isError).not.toBe(true);
      const sectionContent = section.structuredContent as {
        scope: string;
        section: string;
        complete: boolean;
        byte_start: number;
        byte_end_exclusive: number;
        scope_sha256: string;
        text: string;
      };
      expect(sectionContent).toMatchObject({ scope: "section", section: "normality_base_rate_gate", complete: true });
      expect(sectionContent.text).toBe(
        canonicalBytes.subarray(sectionContent.byte_start, sectionContent.byte_end_exclusive).toString("utf8")
      );
      expect(sectionContent.scope_sha256).toBe(
        indexContent.index.find(({ name }) => name === "normality_base_rate_gate")?.sha256
      );
      expect(sectionContent.text).toContain('<normality_base_rate_gate priority="Critical">');
      expect(sectionContent.text).toContain(
        "For frequency questions, explaining why X can happen does not answer how often X happens."
      );
    } finally {
      await server.close();
    }
  });

  it("loads a nested rule by name, and names the other elements that share it", async () => {
    const { client, server } = await createInMemoryClient();
    const canonicalBytes = await readFile(new URL("../protocols/HRP_Full.xml", import.meta.url));
    const exact = (content: { byte_start: number; byte_end_exclusive: number }) =>
      canonicalBytes.subarray(content.byte_start, content.byte_end_exclusive).toString("utf8");

    try {
      const rule = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "hrp", section: "ResolveConflictsBeforeRecommendationOrRanking" }
      });
      expect(rule.isError).not.toBe(true);
      const ruleContent = rule.structuredContent as {
        scope: string;
        section: string;
        complete: boolean;
        byte_start: number;
        byte_end_exclusive: number;
        scope_bytes: number;
        text: string;
      };
      expect(ruleContent).toMatchObject({
        scope: "section",
        section: "ResolveConflictsBeforeRecommendationOrRanking",
        complete: true
      });
      expect(ruleContent.text).toBe(exact(ruleContent));
      expect(ruleContent.scope_bytes).toBe(Buffer.byteLength(ruleContent.text, "utf8"));
      expect(ruleContent.text).toMatch(/^<Rule name="ResolveConflictsBeforeRecommendationOrRanking"[^>]*>[\s\S]*<\/Rule>$/u);
      expect((rule.content as Array<{ text: string }>)[0]!.text).toMatch(
        /^Loaded HRP Rule ResolveConflictsBeforeRecommendationOrRanking in section \w+, page 1 of 1 \(exact canonical bytes\)\.$/u
      );

      // A rule and a template share this name: the rule loads, and the template is named.
      const shared = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "hrp", section: "WholeReportAudit" }
      });
      expect(shared.isError).not.toBe(true);
      const sharedContent = shared.structuredContent as {
        byte_start: number;
        byte_end_exclusive: number;
        text: string;
      };
      expect(sharedContent.text).toBe(exact(sharedContent));
      expect(sharedContent.text.startsWith('<Rule name="WholeReportAudit"')).toBe(true);
      expect((shared.content as Array<{ text: string }>)[0]!.text).toContain(
        "Also named WholeReportAudit: Template in section ResearchAuditTemplates."
      );
    } finally {
      await server.close();
    }
  });

  it.each(["hrp", "universal"] as const)("loads every %s core section in one call, each as its exact bytes", async (protocol) => {
    const { client, server } = await createInMemoryClient();
    const file = protocol === "hrp" ? "HRP_Full.xml" : "Universal_Instructions.xml";
    const canonicalBytes = await readFile(new URL(`../protocols/${file}`, import.meta.url));

    try {
      // No section or named element is called "core", so the name loads nothing else.
      const text = canonicalBytes.toString("utf8");
      expect(protocolNamedElements(text, "core")).toEqual([]);
      const index = await client.callTool({ name: "load_protocol", arguments: { protocol, section: "index" } });
      const indexContent = index.structuredContent as {
        index: Array<{ name: string; core: boolean }>;
        core_sections: string[];
      };
      expect(indexContent.index.map(({ name }) => name)).not.toContain("core");
      expect((index.content as Array<{ text: string }>)[0]!.text).toContain(
        `Load the core sections first: section "core" loads all of them (${indexContent.core_sections.join(", ")}) in one call.`
      );

      const core = await client.callTool({ name: "load_protocol", arguments: { protocol, section: "core" } });
      expect(core.isError).not.toBe(true);
      const sections = protocolSections(protocol, text).filter(({ core: isCore }) => isCore);
      expect(sections.map(({ name }) => name).sort()).toEqual([...indexContent.core_sections].sort());
      const expected = sections
        .map(({ byte_start, byte_end_exclusive }) => canonicalBytes.subarray(byte_start, byte_end_exclusive).toString("utf8"))
        .join("\n\n");
      expect(core.structuredContent).toMatchObject({
        ok: true, protocol, scope: "section", section: "core", page: 1, page_count: 1, complete: true,
        scope_bytes: Buffer.byteLength(expected, "utf8"),
        scope_sha256: createHash("sha256").update(expected, "utf8").digest("hex"),
        text: expected
      });
      expect(core.structuredContent).not.toHaveProperty("byte_start");
      const { manifest } = core.structuredContent as { manifest: { name: string } };
      expect((core.content as Array<{ text: string }>)[0]!.text).toBe(
        `Loaded ${manifest.name} ${sections.map(({ name }) => name).join(", ")}, page 1 of 1 ` +
          "(exact canonical bytes of each, in this order, a blank line between two)."
      );
    } finally {
      await server.close();
    }
  });

  it("loads several named sections and rules in one call, without one already inside another", async () => {
    const { client, server } = await createInMemoryClient();
    const canonicalBytes = await readFile(new URL("../protocols/HRP_Full.xml", import.meta.url));
    const text = canonicalBytes.toString("utf8");
    const exact = (name: string) => {
      const section = protocolSections("hrp", text).find((entry) => entry.name === name);
      const span = section ?? protocolNamedElements(text, name).find(({ tag }) => tag === "Rule")!;
      return canonicalBytes.subarray(span.byte_start, span.byte_end_exclusive).toString("utf8");
    };

    try {
      // FS233 is a check inside FinalSelfCheck, and a name given twice loads once.
      const several = await client.callTool({
        name: "load_protocol",
        arguments: {
          protocol: "hrp",
          section: "FinalSelfCheck, FS233,ResolveConflictsBeforeRecommendationOrRanking , FinalSelfCheck"
        }
      });
      expect(several.isError).not.toBe(true);
      const expected = [exact("FinalSelfCheck"), exact("ResolveConflictsBeforeRecommendationOrRanking")].join("\n\n");
      expect(several.structuredContent).toMatchObject({ scope: "section", complete: true, page_count: 1, text: expected });
      expect((several.content as Array<{ text: string }>)[0]!.text).toMatch(
        /^Loaded HRP FinalSelfCheck, Rule ResolveConflictsBeforeRecommendationOrRanking, page 1 of 1 /u
      );

      // A list longer than one page continues with the same section and the next page.
      const section = "CrowdSourcedAndClinicalSignalAudit, ResearchOrchestrationAndModeSelectionGate";
      const first = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section } });
      const firstContent = first.structuredContent as { page_count: number; next_page: number; scope_sha256: string; text: string };
      expect(firstContent).toMatchObject({ page: 1, page_count: 2, next_page: 2, complete: false });
      expect((first.content as Array<{ text: string }>)[0]!.text).toContain(
        "Call load_protocol again with the same section and page 2 to continue."
      );
      const second = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section, page: 2 } });
      const secondContent = second.structuredContent as { scope_sha256: string; text: string; complete: boolean };
      expect(secondContent).toMatchObject({ complete: true, scope_sha256: firstContent.scope_sha256 });
      expect(firstContent.text + secondContent.text).toBe(
        [exact("CrowdSourcedAndClinicalSignalAudit"), exact("ResearchOrchestrationAndModeSelectionGate")].join("\n\n")
      );
      for (const result of [first, second]) expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(60_000);
    } finally {
      await server.close();
    }
  });

  it.each([
    [{ protocol: "hrp", section: "NoSuchSection" }, "protocol_section_not_found"],
    [{ protocol: "hrp", section: "FoundationBeforeOptimization" }, "protocol_section_ambiguous"],
    [{ protocol: "hrp", section: "Purpose, NoSuchSection" }, "protocol_section_not_found"],
    [{ protocol: "hrp", section: "Purpose, FoundationBeforeOptimization" }, "protocol_section_ambiguous"],
    [{ protocol: "hrp", section: "index, core" }, "protocol_section_not_found"],
    [{ protocol: "hrp", section: " , " }, "protocol_request_invalid"],
    [{ protocol: "hrp", section: "core", page: 2 }, "protocol_page_out_of_range"],
    [{ protocol: "hrp", page: 999 }, "protocol_page_out_of_range"],
    [{ protocol: "hrp", page: 0 }, "protocol_page_out_of_range"],
    [{ protocol: "hrp", page: 1.5 }, "protocol_page_out_of_range"],
    [{ protocol: "hrp", section: "index", page: 2 }, "protocol_request_invalid"]
  ])("rejects an invalid protocol request %j with %s", async (args, code) => {
    const { client, server } = await createInMemoryClient();

    try {
      const result = await client.callTool({ name: "load_protocol", arguments: args });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: false, error: { code } });
    } finally {
      await server.close();
    }
  });

  it("surfaces integrity failures as explicit structured tool errors", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const result = await client.callTool({
        name: "verify_protocol_integrity",
        arguments: {
          protocol: "hrp",
          expected_sha256: "0".repeat(64)
        }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Protocol operation failed: Protocol SHA-256 mismatch"
        }
      ]);
      expect(result.structuredContent).toEqual({
        ok: false,
        protocol: "hrp",
        error: {
          code: "protocol_error",
          message: "Protocol SHA-256 mismatch"
        }
      });
    } finally {
      await server.close();
    }
  });
});

describe("AskRigor Streamable HTTP server", () => {
  it("returns the exact health payload", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/healthz", baseUrl));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        '{"status":"ok","service":"askrigor-research","version":"0.1.0"}'
      );
    });
  });

  it("tells which AskRigor is running at /version, without sign-in", async () => {
    const [hrp, universal] = await Promise.all([getProtocolManifest("hrp"), getProtocolManifest("universal")]);
    const expected = (build: string) => ({
      service: "askrigor-research",
      version: "0.1.0",
      build,
      protocols: {
        hrp: { version: hrp.version, revision_date: hrp.revisionDate, sha256: hrp.sha256 },
        universal: { version: universal.version, revision_date: universal.revisionDate, sha256: universal.sha256 },
      },
    });
    try {
      await withHttpServer(async (baseUrl) => {
        vi.stubEnv("ASKRIGOR_BUILD_COMMIT", "5640e6d2cfef");
        const response = await fetch(new URL("/version", baseUrl));
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual(expected("5640e6d2cfef"));

        // A value that is not a plain commit or tag name is never echoed.
        vi.stubEnv("ASKRIGOR_BUILD_COMMIT", "<script>");
        expect(await (await fetch(new URL("/version", baseUrl))).json()).toEqual(expected("unknown"));
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("shows running versions in the handshake and manifest result, with a fixed tool description", async () => {
    // Owner, 2026-10-03: "make sure the version number is in the plugin info panel so i don't have to ask it what
    // version it is". The build is read when the server starts, so it is set first.
    const [hrp, universal] = await Promise.all([getProtocolManifest("hrp"), getProtocolManifest("universal")]);
    const versions = `HRP ${hrp.version}, Universal ${universal.version}, build 5640e6d2cfef`;
    vi.stubEnv("ASKRIGOR_BUILD_COMMIT", "5640e6d2cfef");
    try {
      await withHttpServer(async (baseUrl) => {
        const client = new Client({ name: "askrigor-test", version: "0.1.0" });
        try {
          await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", baseUrl)));
          expect(client.getServerVersion()).toMatchObject({
            name: "askrigor-research",
            title: `AskRigor (${versions})`,
            version: `0.1.0+hrp.${hrp.version}.universal.${universal.version}.build.5640e6d2cfef`,
          });
          const { tools } = await client.listTools();
          expect(tools[0]?.name).toBe("get_protocol_manifest");
          expect(tools[0]?.description).toBe(
            "Lists canonical protocol identity, SHA-256 metadata, running versions and the finalize_research input contract version."
          );
          const result = await client.callTool({ name: "get_protocol_manifest", arguments: { protocol: "hrp" } });
          expect(result.structuredContent).toMatchObject({ running_versions: {
            hrp: hrp.version, universal: universal.version, build: "5640e6d2cfef",
          } });
          expect(JSON.stringify(result.content)).toContain(`Running versions: ${versions}`);
        } finally {
          await client.close();
        }
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("publishes a tool list version that a release changing no tool keeps, and compares the one sent back", async () => {
    // Owner request (2026-10-22): an app's user is told to refresh AskRigor only when its tools changed.
    const listed = async (build: string) => {
      vi.stubEnv("ASKRIGOR_BUILD_COMMIT", build);
      try {
        let seen: { description?: string; version?: string } = {};
        await withHttpServer(async (baseUrl) => {
          const client = new Client({ name: "askrigor-test", version: "0.1.0" });
          try {
            await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", baseUrl)));
            const { tools } = await client.listTools();
            const field = (name: string) => (tools.find((tool) => tool.name === name)?.inputSchema.properties
              ?.tool_list_version as { description?: string } | undefined)?.description ?? "";
            const version = /"([0-9a-f]{16})"/u.exec(field("get_protocol_manifest"))?.[1];
            expect(field("manage_research_access")).toContain(`"${version}"`);
            const manifest = async (toolListVersion: string) => (await client.callTool({
              name: "get_protocol_manifest", arguments: { protocol: "hrp", tool_list_version: toolListVersion },
            })).content as Array<{ text?: string }>;
            expect((await manifest(version!))[0]?.text).not.toContain(TOOL_LIST_REFRESH_SENTENCE);
            expect((await manifest("0123456789abcdef"))[0]?.text).toContain(TOOL_LIST_REFRESH_SENTENCE);
            seen = { description: tools[0]?.description, version };
          } finally {
            await client.close();
          }
        });
        return seen;
      } finally {
        vi.unstubAllEnvs();
      }
    };
    const before = await listed("5640e6d2cfef");
    const after = await listed("8c0ffee5a1b2");
    expect(before.version).toMatch(/^[0-9a-f]{16}$/u);
    // The build changed; the fixed tools and their version stay the same.
    expect(after.description).toBe(before.description);
    expect(after.version).toBe(before.version);
  });

  it("supports consecutive MCP requests through the real stateless SDK transport", async () => {
    await withHttpServer(async (baseUrl) => {
      const client = new Client({ name: "askrigor-test", version: "0.1.0" });

      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL("/mcp", baseUrl))
        );

        const tools = await client.listTools();
        const manifest = await client.callTool({
          name: "get_protocol_manifest",
          arguments: { protocol: "universal" }
        });

        expect(tools.tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
        expect(client.getServerVersion()?.name).toBe("askrigor-research");
        expect(manifest.isError).not.toBe(true);
        expect(manifest.structuredContent).toMatchObject({
          ok: true,
          protocol: "universal",
          manifest: {
            name: "AskRigor.com universal saved instructions",
            version: "20.5.46",
            revisionDate: "2026-10-21",
            sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e"
          }
        });
      } finally {
        await client.close();
      }
    });
  });

  it("advertises a compact Gemini-compatible catalog without changing handlers", async () => {
    await withHttpServer(async (baseUrl) => {
      const client = new Client({ name: "gemini-compat-test", version: "1.0.0" });

      try {
        await client.connect(
          new StreamableHTTPClientTransport(
            new URL(GEMINI_COMPATIBLE_MCP_PATH, baseUrl)
          )
        );

        const { tools } = await client.listTools();
        const manifest = await client.callTool({
          name: "get_protocol_manifest",
          arguments: { protocol: "universal" }
        });
        const invalidPmid = await client.callTool({
          name: "fetch_pubmed_record",
          arguments: { pmid: "not-a-pmid" }
        });

        expect(tools.map(({ name }) => name)).toEqual(GEMINI_TOOL_NAMES);
        expect(client.getServerVersion()?.name).toBe("askrigor_research");
        expect(tools.every((tool) => !("outputSchema" in tool))).toBe(true);
        expect(tools.every((tool) => !("execution" in tool))).toBe(true);
        expect(unsupportedGeminiSchemaKeys(tools)).toEqual([]);
        const catalogBytes = Buffer.byteLength(JSON.stringify({ tools }), "utf8");
        console.info(`Gemini compact catalog bytes: ${catalogBytes}`);
        expect(catalogBytes).toBeLessThan(25_000);
        const searchSchema = tools.find(({ name }) => name === "search_youtube")!.inputSchema;
        expect(searchSchema.properties).toHaveProperty("product_identity");
        const identity = searchSchema.properties!.product_identity as { properties: Record<string, { items?: { description?: string }; description?: string }> };
        expect(identity.properties.names.description).toContain("Items: 1–6.");
        expect(identity.properties.names.items!.description).toContain("Length: 1–500.");
        expect(identity.properties.maker_names.description).toContain("Default: []. Items: ≤6.");
        expect(identity.properties.other_variant_names.description).toContain("Default: []. Items: ≤12.");
        expect(manifest.isError).not.toBe(true);
        expect(invalidPmid.isError).toBe(true);
        expect(manifest.structuredContent).toMatchObject({
          ok: true,
          protocol: "universal",
          manifest: {
            version: "20.5.46",
            sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e"
          }
        });
      } finally {
        await client.close();
      }
    });
  });

  it("answers Gemini browser preflight with a bounded MCP CORS policy", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "OPTIONS",
        headers: {
          origin: "https://gemini.google.com",
          "access-control-request-method": "POST",
          "access-control-request-headers":
            "content-type,mcp-protocol-version,mcp-session-id"
        }
      });

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://gemini.google.com"
      );
      expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
      expect(response.headers.get("access-control-allow-headers")).toBe(
        "Accept, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id"
      );
      expect(response.headers.get("access-control-expose-headers")).toBe(
        "MCP-Session-Id"
      );
      expect(response.headers.get("access-control-max-age")).toBe("600");
      expect(response.headers.get("vary")).toBe(
        "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
      );
    });
  });

  it("allows Gemini's exact Origin on a standard MCP initialization", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          origin: "https://gemini.google.com"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "gemini-spark-test", version: "1.0.0" }
          }
        })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://gemini.google.com"
      );
      expect(response.headers.get("access-control-expose-headers")).toBe(
        "MCP-Session-Id"
      );
      expect(await response.text()).toContain('"protocolVersion":"2025-11-25"');
    });
  });

  it("keeps MCP handshake diagnostics disabled unless explicitly enabled", async () => {
    const records: unknown[] = [];

    await withHttpServer(
      async (baseUrl) => {
        const response = await fetch(
          new URL("/.well-known/oauth-protected-resource", baseUrl)
        );

        expect(response.status).toBe(404);
      },
      undefined,
      {
        mcpHandshakeDiagnosticLogger: (record) => records.push(record)
      }
    );

    expect(records).toEqual([]);
  });

  it("emits only coarse, non-sensitive MCP handshake diagnostics when enabled", async () => {
    const records: unknown[] = [];
    const secret = "Bearer private-token-that-must-never-be-logged";
    const privateArgument = "private-prompt-that-must-never-be-logged";

    await withHttpServer(
      async (baseUrl) => {
        const discovery = await fetch(
          new URL("/.well-known/oauth-protected-resource/mcp", baseUrl),
          { headers: { authorization: secret } }
        );
        const toolCall = await fetch(new URL("/mcp", baseUrl), {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            authorization: secret,
            "content-type": "application/json",
            origin: "https://gemini.google.com"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "private-request-id",
            method: "tools/call",
            params: {
              name: "private-tool-name",
              arguments: { prompt: privateArgument }
            }
          })
        });

        expect(discovery.status).toBe(404);
        expect(toolCall.status).toBe(200);
      },
      undefined,
      {
        mcpHandshakeDiagnosticsEnabled: true,
        mcpHandshakeDiagnosticLogger: (record) => records.push(record)
      }
    );

    expect(records).toEqual([
      {
        event: "askrigor_mcp_handshake",
        route: "oauth_protected_resource_mcp",
        method: "GET",
        origin: "absent",
        accept: "other",
        content_type: "absent",
        authorization_present: true,
        mcp_protocol_header: "absent",
        cors_request_headers: "not_preflight",
        rpc_method: "not_applicable",
        initialize_protocol_version: "not_applicable",
        outcome: "finished",
        status: 404,
        response_content_type: "absent"
      },
      {
        event: "askrigor_mcp_handshake",
        route: "mcp",
        method: "POST",
        origin: "gemini",
        accept: "json_and_sse",
        content_type: "json",
        authorization_present: true,
        mcp_protocol_header: "absent",
        cors_request_headers: "not_preflight",
        rpc_method: "tools/call",
        initialize_protocol_version: "not_applicable",
        outcome: "finished",
        status: 200,
        response_content_type: "sse"
      }
    ]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(privateArgument);
    expect(serialized).not.toContain("private-request-id");
    expect(serialized).not.toContain("private-tool-name");
  });

  it("classifies an arbitrary HTTP method without retaining its value", async () => {
    const records: unknown[] = [];
    const privateMethod = "PATCH";

    await withHttpServer(
      async (baseUrl) => {
        const response = await fetch(new URL("/mcp", baseUrl), {
          method: privateMethod
        });

        expect(response.status).toBe(405);
      },
      undefined,
      {
        mcpHandshakeDiagnosticsEnabled: true,
        mcpHandshakeDiagnosticLogger: (record) => records.push(record)
      }
    );

    expect(records).toMatchObject([
      {
        event: "askrigor_mcp_handshake",
        route: "mcp",
        method: "other",
        rpc_method: "not_applicable",
        status: 405
      }
    ]);
    expect(JSON.stringify(records)).not.toContain(privateMethod);
  });

  it("classifies Gemini preflight and initialization without retaining values", async () => {
    const records: unknown[] = [];

    await withHttpServer(
      async (baseUrl) => {
        const preflight = await fetch(new URL(GEMINI_COMPATIBLE_MCP_PATH, baseUrl), {
          method: "OPTIONS",
          headers: {
            origin: "https://gemini.google.com",
            "access-control-request-method": "POST",
            "access-control-request-headers":
              "content-type,mcp-protocol-version,x-goog-api-client"
          }
        });
        const initialize = await fetch(new URL(GEMINI_COMPATIBLE_MCP_PATH, baseUrl), {
          method: "POST",
          headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            origin: "https://gemini.google.com"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-11-25",
              capabilities: {},
              clientInfo: { name: "gemini-spark-test", version: "1.0.0" }
            }
          })
        });

        expect(preflight.status).toBe(204);
        expect(initialize.status).toBe(200);
      },
      undefined,
      {
        mcpHandshakeDiagnosticsEnabled: true,
        mcpHandshakeDiagnosticLogger: (record) => records.push(record)
      }
    );

    expect(records).toMatchObject([
      {
        route: "mcp_gemini",
        method: "OPTIONS",
        origin: "gemini",
        cors_request_headers: "includes_google_metadata",
        rpc_method: "not_applicable",
        status: 204
      },
      {
        route: "mcp_gemini",
        method: "POST",
        origin: "gemini",
        rpc_method: "initialize",
        initialize_protocol_version: "known",
        status: 200
      }
    ]);
  });

  it("rejects untrusted MCP browser origins before transport handling", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          origin: "https://attacker.example"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "untrusted-origin-test", version: "1.0.0" }
          }
        })
      });

      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        error: { code: -32000, message: "origin_not_allowed" },
        id: null
      });
    });
  });

  it("rejects an unfinished chunked MCP POST as soon as it exceeds 1 MiB", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await sendOpenChunkedPost(
        new URL("/mcp", baseUrl),
        1_048_577
      );

      expect(response.status).toBe(413);
      expect(response.body).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Request body exceeds 1 MiB limit"},"id":null}'
      );
    });
  });

  it("returns a sanitized parse error for malformed MCP JSON", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: '{"secret":"do-not-echo"'
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error: Invalid JSON"},"id":null}'
      );
    });
  });

  it("preserves SDK header validation before JSON parsing", async () => {
    await withHttpServer(async (baseUrl) => {
      const missingAccept = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"secret":"do-not-echo"'
      });
      const wrongContentType = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { accept: "application/json, text/event-stream" },
        body: '{"secret":"do-not-echo"'
      });

      expect(missingAccept.status).toBe(406);
      expect(await missingAccept.json()).toMatchObject({
        error: {
          message: "Not Acceptable: Client must accept both application/json and text/event-stream"
        }
      });
      expect(wrongContentType.status).toBe(415);
      expect(await wrongContentType.json()).toMatchObject({
        error: {
          message: "Unsupported Media Type: Content-Type must be application/json"
        }
      });
    });
  });

  it("stays healthy after a client aborts a valid MCP POST before EOF", async () => {
    await withHttpServer(
      async (baseUrl) => {
        await abortPartialMcpPost(new URL("/mcp", baseUrl));
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await fetch(new URL("/healthz", baseUrl));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          status: "ok",
          service: "askrigor-research",
          version: "0.1.0"
        });
      },
      (request) => {
        request.once("aborted", () => {
          const error = Object.assign(new Error("socket hang up"), {
            code: "ECONNRESET"
          });
          request.emit("error", error);
        });
      }
    );
  });

  it("delegates GET and DELETE semantics to the installed SDK transport", async () => {
    await withHttpServer(async (baseUrl) => {
      const getResponse = await fetch(new URL("/mcp", baseUrl));
      const deleteResponse = await fetch(new URL("/mcp", baseUrl), {
        method: "DELETE",
        headers: { "mcp-protocol-version": "2025-11-25" }
      });

      expect(getResponse.status).toBe(406);
      expect(await getResponse.json()).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Not Acceptable: Client must accept text/event-stream"
        },
        id: null
      });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.text()).toBe("");
    });
  });
});

async function createInMemoryClient(): Promise<{
  client: Client;
  server: ReturnType<typeof createAskRigorServer>;
}> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

function unsupportedGeminiSchemaKeys(
  tools: Array<{ inputSchema: Record<string, unknown> }>
): string[] {
  const supported = new Set([
    "type",
    "nullable",
    "required",
    "format",
    "description",
    "properties",
    "items",
    "enum",
    "anyOf",
    "$ref",
    "$defs"
  ]);
  const unsupported = new Set<string>();

  const visit = (schema: unknown) => {
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      return;
    }
    for (const [key, value] of Object.entries(schema)) {
      if (!supported.has(key)) {
        unsupported.add(key);
        continue;
      }
      if (key === "properties" || key === "$defs") {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          for (const child of Object.values(value)) {
            visit(child);
          }
        }
      } else if (key === "items" || key === "anyOf") {
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else {
          visit(value);
        }
      }
    }
  };

  tools.forEach(({ inputSchema }) => visit(inputSchema));
  return [...unsupported].sort();
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function withHttpServer(
  callback: (baseUrl: URL) => Promise<void>,
  observeRequest?: (request: IncomingMessage) => void,
  options: Parameters<typeof createAskRigorHttpServer>[0] = {}
): Promise<void> {
  const httpServer = createAskRigorHttpServer({
    publicServerEnabled: true,
    ...options
  });
  if (observeRequest !== undefined) {
    httpServer.on("request", observeRequest);
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const { port } = httpServer.address() as AddressInfo;

  try {
    await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function sendOpenChunkedPost(
  url: URL,
  byteLength: number
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      }
    });

    request.setTimeout(1_000, () => {
      request.destroy(new Error("Timed out waiting for early HTTP response"));
    });
    request.once("error", reject);
    request.once("response", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        request.destroy();
        resolve({ status: response.statusCode, body });
      });
    });

    request.write(Buffer.alloc(byteLength, 0x20));
  });
}

async function abortPartialMcpPost(url: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      }
    });
    const timeout = setTimeout(() => {
      request.destroy();
      reject(new Error("Timed out waiting for aborted client request to close"));
    }, 1_000);
    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    request.once("error", finish);
    request.once("close", finish);
    request.once("socket", (socket) => {
      const sendAndAbort = () => {
        request.write('{"jsonrpc":"2.0","id":1');
        setTimeout(() => request.destroy(), 25);
      };

      if (socket.connecting) {
        socket.once("connect", sendAndAbort);
      } else {
        sendAndAbort();
      }
    });
  });
}

async function mcpCompleteCommentResponse(url: URL): Promise<Response> {
  if (url.pathname.endsWith("/commentThreads")) {
    return new Response(await youtubeFixture(
      url.searchParams.get("pageToken") === "thread-page-2"
        ? "comment-threads-page-2.json"
        : "comment-threads-page-1.json"
    ), { status: 200 });
  }
  if (url.searchParams.get("parentId") === "UgxTop00000000000000002") {
    return new Response(await youtubeFixture("comments-top-2-page-1.json"), { status: 200 });
  }
  return new Response(await youtubeFixture(
    url.searchParams.get("pageToken") === "reply-top-1-page-2"
      ? "comments-top-1-page-2.json"
      : "comments-top-1-page-1.json"
  ), { status: 200 });
}

function mcpCommentIdResponse(url: URL): Response {
  const ids = url.searchParams.get("id")?.split(",") ?? [];
  return Response.json({
    pageInfo: { totalResults: ids.length, resultsPerPage: ids.length },
    items: ids.map((id) => {
      const parentId = id.includes("Reply0000000000000004")
        ? "UgxTop00000000000000002"
        : id.includes("Reply")
          ? "UgxTop00000000000000001"
          : undefined;
      return {
        id,
        snippet: {
          videoId: "XpZHKGGCK-o",
          ...(parentId === undefined ? {} : { parentId }),
          textDisplay: `Refetched ${id}`,
          authorDisplayName: `Author ${id}`,
          likeCount: 0,
          publishedAt: "2025-02-01T11:00:00Z",
          updatedAt: "2025-02-01T11:00:00Z"
        }
      };
    })
  });
}
