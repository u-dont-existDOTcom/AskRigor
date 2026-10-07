import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

// The same package specifier as the code under test, so its error class matches.
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchAccessError,
  ResearchContributorAccessService,
  prepareResearchContributionProposal,
  sha256,
  stableJson,
  type ResearchContributionProposalRecord,
} from "@askrigor/evidence-repository";
import {
  indexJatsStudyDocument,
  toAuditableDocumentIndex,
  type AuditableDocumentIndex,
  type EuropePmcFullTextArticle,
} from "../packages/sources/src/index.js";

const acquire = vi.hoisted(() => vi.fn());
const integrity = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(),
  acquireOpenFullText: acquire,
  checkRetractionStatus: integrity,
}));

const {
  AnalysisStaging,
  buildStagedAnalysis,
  saveStagedAnalyses,
} = await import("../apps/research-mcp/src/analysis-staging.js");
const { createValidatedReviewAuditContribution } = await import(
  "../apps/research-mcp/src/actions/review-audit-contribution.js"
);
const {
  REVIEW_METHOD_AUDIT_DOMAINS,
  STUDY_METHOD_AUDIT_DOMAINS,
  validateReviewMethodAudit,
  validateStudyMethodAudit,
} = await import("../apps/research-mcp/src/index.js");
const { registerTools } = await import("../apps/research-mcp/src/register-tools.js");
const { finalizeResearchInputSchema } = await import("../apps/research-mcp/src/research-finalization-gate.js");

const DOI = "10.1002/art.41142";
const NOW = new Date("2026-10-03T12:00:00.000Z");
const PROTOCOLS = [
  { name: "Universal", version: "20.5.33", revisionDate: "2026-09-30", sha256: "a".repeat(64) },
  { name: "HRP", version: "20.6.8", revisionDate: "2026-09-30", sha256: "b".repeat(64) },
];
const NO_RECORD = {
  provider: "crossref",
  access_status: "metadata_only",
  data: { doi: DOI, status: "no_retraction_record_found", evidence: [], sources_checked: ["crossref"] },
};
const SECRET = "analysis-staging-test-secret-0123456789abcdef";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes");

afterEach(() => {
  acquire.mockReset();
  integrity.mockReset();
  delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
});

function studyIndex(text = "Complete methods and results text."): AuditableDocumentIndex {
  const textHash = createHash("sha256").update(text, "utf8").digest("hex");
  return {
    source: {
      provider: "unpaywall_open_location",
      primary_identifier: DOI,
      canonical_url: "https://repository.example.org/open-study.pdf",
      doi: DOI,
      title: "Open study",
      version: "acceptedVersion",
      format: "pdf_text",
      content_sha256: createHash("sha256").update(`pdf:${text}`, "utf8").digest("hex"),
      document_completeness: "full_text_with_body",
      identity_verification: "doi_exact",
    },
    section_paths: [["Page 1"]],
    blocks: [{
      block_id: `pdf_000001_${textHash.slice(0, 12)}`,
      kind: "page_text",
      section_path: ["Page 1"],
      page_number: 1,
      text,
      text_sha256: textHash,
    }],
  };
}

function studyAudit(index: AuditableDocumentIndex) {
  const blockId = index.blocks[0]!.block_id;
  const program = (name: string) => ({
    name,
    components: ["component described in the source"],
    dose_or_intensity: "described in the source",
    frequency: "described in the source",
    duration: "described in the source",
    supervision: "described in the source",
    adherence: "measured as described in the source",
    co_interventions: [],
    care_stage: "nonsurgical" as const,
  });
  return {
    source_primary_identifier: index.source.primary_identifier,
    source_content_sha256: index.source.content_sha256,
    design_label: "parallel group comparison",
    design_capability_statement: "The design label does not establish reliability; implementation and analysis remain separately audited.",
    population_and_stage: "The exact enrolled population and baseline stage described in the full text.",
    intervention_program: program("specified intervention program"),
    comparator_program: program("specified comparator program"),
    outcome_and_horizon: "The exact outcome and horizon described in the source.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and retains a bounded limitation.`,
      evidence_block_ids: [blockId],
      unresolved_fields: [],
    })),
    claim_capabilities: [
      {
        claim: "The exact compared programs can be described for the recorded outcome horizon.",
        capability: "can_support" as const,
        reason: "The indexed source states them.",
        evidence_block_ids: [blockId],
      },
      {
        claim: "The trial shows the program works for everyone.",
        capability: "cannot_support" as const,
        reason: "One trial's population and horizon bound it.",
        evidence_block_ids: [],
      },
    ],
  };
}

async function reviewIndexAndAudit() {
  const xml = await readFile(new URL("fixtures/europe-pmc/full-text.xml", import.meta.url), "utf8");
  const article: EuropePmcFullTextArticle = {
    pmcid: "PMC1234567",
    pmid: "40123456",
    doi: "10.1234/recorded.example",
    title: "Recorded full-text review",
    format: "jats_xml",
    document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"),
    xml,
  };
  const index = toAuditableDocumentIndex(indexJatsStudyDocument(article));
  const methods = index.blocks.find(({ section_path }) => section_path.includes("Methods"))!.block_id;
  const results = index.blocks.find(({ section_path }) => section_path.includes("Results"))!.block_id;
  const audit = {
    source_primary_identifier: index.source.primary_identifier,
    source_content_sha256: index.source.content_sha256,
    review_type: "systematic_review" as const,
    search_end_date: "2026-01-31",
    included_source_families: ["randomized trials"],
    program_fingerprints: [{
      label: "supervised progressive resistance program",
      components: ["progressive lower-body resistance exercises"],
      dose_or_intensity: "as reported by each included source",
      frequency: "as reported by each included source",
      duration: "as reported by each included source",
      supervision: "mixed supervision",
      co_interventions: [],
      population_or_stage: "adults meeting each included source's criteria",
      outcome_and_horizon: "function at the reported follow-up horizons",
    }],
    domain_findings: REVIEW_METHOD_AUDIT_DOMAINS.map((domain, position) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and retains a stated limitation.`,
      evidence_block_ids: [position % 2 === 0 ? methods : results],
      unresolved_fields: [],
    })),
    claim_capabilities: [
      {
        claim: "The review can describe the exact programs and outcomes it actually included.",
        capability: "can_support" as const,
        reason: "The indexed methods and results identify those bounded inputs.",
        evidence_block_ids: [methods, results],
      },
      {
        claim: "The review proves that every treatment bearing the same umbrella label works.",
        capability: "cannot_support" as const,
        reason: "Program, population, outcome, and horizon heterogeneity limit that inference.",
        evidence_block_ids: [],
      },
    ],
  };
  return { index, receipt: validateReviewMethodAudit(index, audit) };
}

describe("held analyses", () => {
  it("turns a validated review audit into a contribution the shared intake accepts, without the review's text", async () => {
    const { index, receipt } = await reviewIndexAndAudit();
    const contribution = createValidatedReviewAuditContribution({
      index,
      auditReceipt: receipt,
      protocolManifests: PROTOCOLS,
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
      freshness: { checkedAt: NOW.toISOString(), nextDueAt: "2026-11-02T12:00:00.000Z", receiptSha256: sha256("checked") },
    });
    expect(contribution.source).toMatchObject({ sourceKind: "review", rawContentPersisted: false });
    expect(contribution.analysis).toMatchObject({ analysisKind: "review_method_audit", captureStatus: "complete_performed_analysis" });
    expect(new Set(contribution.analysis.domains.map(({ rubric }) => rubric))).toEqual(new Set(["review_method_v1"]));
    const sections = contribution.analysis.sections.map(({ content }) => content).join("");
    for (const block of index.blocks) expect(sections).not.toContain(block.text);
    expect(() => prepareResearchContributionProposal("SOURCE_ANALYSIS", contribution)).not.toThrow();
  });

  it("holds a study analysis only after a clean integrity check, and says why it holds none", async () => {
    const index = studyIndex();
    const auditReceipt = validateStudyMethodAudit(index, studyAudit(index));
    const base = { kind: "study" as const, index, auditReceipt, crossref: { mailto: "" }, now: () => NOW, protocolManifests: async () => PROTOCOLS };

    const held = await buildStagedAnalysis({ ...base, checkIntegrity: async () => NO_RECORD as never });
    expect(held.ready).toBe(true);
    if (!held.ready) throw new Error("not held");
    expect(held.contribution.knowledge.freshnessChecks[0]).toMatchObject({
      checkedAt: NOW.toISOString(),
      nextDueAt: "2026-11-02T12:00:00.000Z",
      receiptSha256: sha256(stableJson(NO_RECORD.data)),
    });
    expect(() => prepareResearchContributionProposal("SOURCE_ANALYSIS", held.contribution)).not.toThrow();

    for (const [status, reason] of [
      ["retracted", "integrity_not_current"],
      ["expression_of_concern", "integrity_not_current"],
      ["corrected_or_updated", "integrity_not_current"],
      ["unknown", "integrity_not_current"],
    ] as const) {
      expect(await buildStagedAnalysis({
        ...base,
        checkIntegrity: async () => ({ ...NO_RECORD, data: { ...NO_RECORD.data, status } }) as never,
      })).toEqual({ ready: false, reason });
    }
    expect(await buildStagedAnalysis({
      ...base,
      checkIntegrity: async () => ({ ...NO_RECORD, error: { code: "crossref_request_failed" } }) as never,
    })).toEqual({ ready: false, reason: "integrity_check_unavailable" });
    expect(await buildStagedAnalysis({
      ...base,
      checkIntegrity: async () => { throw new Error("network"); },
    })).toEqual({ ready: false, reason: "contribution_invalid" });
    const { doi: _doi, ...withoutDoi } = index.source;
    expect(await buildStagedAnalysis({
      ...base,
      index: { ...index, source: withoutDoi },
      checkIntegrity: async () => NO_RECORD as never,
    })).toEqual({ ready: false, reason: "no_doi" });
  });

  it("holds analyses per account for 24 hours, replaces a rechecked audit, and drops the oldest past capacity", async () => {
    let clock = 0;
    const staging = new AnalysisStaging(() => clock, 24 * 60 * 60 * 1000, 3);
    const outcome = (reason: "no_doi") => Promise.resolve({ ready: false as const, reason });
    staging.stage("account-a", "study:1", outcome("no_doi"));
    staging.stage("account-a", "study:1", outcome("no_doi"));
    staging.stage("account-b", "study:2", outcome("no_doi"));
    expect(staging.take("account-a")).toHaveLength(1);
    expect(staging.take("account-a")).toHaveLength(0);
    clock = 24 * 60 * 60 * 1000 + 1;
    expect(staging.take("account-b")).toHaveLength(0);
    for (const key of ["1", "2", "3", "4"]) staging.stage("account-c", key, outcome("no_doi"));
    expect(staging.take("account-c")).toHaveLength(3);
  });

  it("counts what was saved, what was already there, what is still sending, and why the rest was not", async () => {
    const index = studyIndex();
    const auditReceipt = validateStudyMethodAudit(index, studyAudit(index));
    const ready = await buildStagedAnalysis({
      kind: "study", index, auditReceipt, crossref: { mailto: "" }, now: () => NOW,
      protocolManifests: async () => PROTOCOLS, checkIntegrity: async () => NO_RECORD as never,
    });
    const replies = [
      async () => "inserted" as const,
      async () => "idempotent_replay" as const,
      async () => { throw new ResearchAccessError("CONTRIBUTION_PRIVACY_REJECTED", "rejected"); },
      async () => { throw new Error("database down"); },
      () => new Promise<never>(() => undefined),
    ];
    let call = 0;
    const saved = await saveStagedAnalyses(
      [...replies.map(() => Promise.resolve(ready)), Promise.resolve({ ready: false as const, reason: "no_doi" as const })],
      () => replies[call++]!(),
      50,
    );
    expect(saved).toEqual({
      saved: 1,
      already_saved: 1,
      unconfirmed: 1,
      not_saved: [
        { reason: "rejected_by_privacy_check", count: 1 },
        { reason: "review_inbox_unavailable", count: 1 },
        { reason: "no_doi", count: 1 },
      ],
    });
  });
});

describe("the server sends a free contributor's validated analyses when the final check passes", () => {
  class RecordingStore extends InMemoryResearchContributorAccessStore {
    readonly inserted: ResearchContributionProposalRecord[] = [];
    override async insertProposal(record: ResearchContributionProposalRecord) {
      const result = await super.insertProposal(record);
      if (result.status === "inserted") this.inserted.push(record);
      return result;
    }
  }

  async function accessService() {
    const store = new RecordingStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|free", {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
    return { store, service };
  }

  function tools(service: ResearchContributorAccessService) {
    const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
    registerTools({
      registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) => Promise<CallToolResult>) => {
        handlers.set(name, execute);
      },
    } as unknown as McpServer, {
      researchAccessRequired: true,
      researchContributorAccessService: service,
      findingsLibrary: false,
      mcpSurface: "/mcp/claude",
    });
    return (name: string, input: Record<string, unknown>, subject: string) => handlers.get(name)!(input, {
      authInfo: {
        token: "synthetic-token",
        clientId: "synthetic-client",
        scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        extra: { subject },
      },
    });
  }

  it("holds the analysis at the method check and files it, once, at a passing final check", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const index = studyIndex("A full text read to the end for this test.");
    acquire.mockResolvedValue({
      access_status: "complete",
      data: { requested_doi: DOI, discovery_attempts: [], document_index: index },
    });
    integrity.mockResolvedValue(NO_RECORD);
    const { store, service } = await accessService();
    const call = tools(service);

    const acquired = await call("acquire_open_full_text", { doi: DOI }, "auth0|free");
    const handle = (acquired.structuredContent as { coverage_receipt: { document_handle: string } })
      .coverage_receipt.document_handle;
    const validated = await call("validate_study_method_audit", { document_handle: handle, audit: studyAudit(index) }, "auth0|free");
    expect(validated.isError).not.toBe(true);
    // The check's own result is unchanged, and nothing is filed before the final check.
    expect(validated.structuredContent).toMatchObject({ status: "source_linked_study_audit_validated" });
    expect(store.inserted).toHaveLength(0);

    const finalize = (receipts: string[]) => call("finalize_research", finalizeResearchInputSchema.parse({
      receipts,
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: "How the body clears a drug in adults",
      research_depth: "deep",
      key_sources: [{ id: DOI, status: "validated" }],
      answer_draft: "The liver clears this drug within a few hours.",
      absence_claims: [], scale_results: [],
    }), "auth0|free");
    const receipt = (validated.structuredContent as { research_receipt: string }).research_receipt;
    const done = await finalize([receipt]);
    expect(done.structuredContent).toMatchObject({
      status: "ready",
      analyses_saved: { saved: 1, already_saved: 0, unconfirmed: 0, not_saved: [] },
    });
    expect(JSON.stringify(done.content)).toContain("Study and review analyses sent to the review inbox: 1.");
    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0]).toMatchObject({
      proposalKind: "SOURCE_ANALYSIS",
      accountKey: service.accountKeyForSubject("auth0|free"),
      status: "PENDING_REVIEW",
    });
    expect(JSON.stringify(store.inserted[0]!.payload)).not.toContain("A full text read to the end for this test.");

    // Sent analyses are no longer held: a second final check files nothing.
    const again = await finalize([receipt]);
    expect((again.structuredContent as { analyses_saved?: unknown }).analyses_saved).toBeUndefined();
    expect(store.inserted).toHaveLength(1);
  });

  it("holds nothing for a paid private account, and makes no integrity check for it", async () => {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const index = studyIndex("Another full text read to the end.");
    acquire.mockResolvedValue({
      access_status: "complete",
      data: { requested_doi: DOI, discovery_attempts: [], document_index: index },
    });
    integrity.mockResolvedValue(NO_RECORD);
    const { store, service } = await accessService();
    store.grantPrivateEntitlement({
      entitlementId: "88888888-8888-4888-a888-888888888888",
      accountKey: service.accountKeyForSubject("auth0|paid"),
      status: "ACTIVE",
      source: "OWNER_GRANTED",
      externalReferenceSha256: null,
      grantedAt: "2026-09-01T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    });
    await service.activatePaidPrivate("auth0|paid");
    const call = tools(service);

    const acquired = await call("acquire_open_full_text", { doi: DOI }, "auth0|paid");
    const handle = (acquired.structuredContent as { coverage_receipt: { document_handle: string } })
      .coverage_receipt.document_handle;
    const validated = await call("validate_study_method_audit", { document_handle: handle, audit: studyAudit(index) }, "auth0|paid");
    expect(validated.isError).not.toBe(true);
    expect(integrity).not.toHaveBeenCalled();
    // An account without a mode is refused by the research-access guard before any check runs.
    expect((await call("acquire_open_full_text", { doi: DOI }, "auth0|unregistered")).isError).toBe(true);
    expect(store.inserted).toHaveLength(0);
  });
});
