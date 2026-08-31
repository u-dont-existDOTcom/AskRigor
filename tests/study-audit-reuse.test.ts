import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { okEnvelope } from "@askrigor/contracts";
import {
  assertNoProhibitedPersistentKeys,
  sha256,
  type AnalysisReuseCandidate,
} from "@askrigor/evidence-repository";
import type { ProtocolManifest } from "@askrigor/protocol";
import type {
  AuditableDocumentIndex,
  OpenFullTextAcquisitionData,
} from "@askrigor/sources";
import { describe, expect, it, vi } from "vitest";

import {
  STUDY_METHOD_AUDIT_DOMAINS,
  createOpenFullTextActionRoutes,
  createValidatedStudyAuditContribution,
  resolveStudyAuditReuse,
  validateStudyMethodAudit,
  type StudyAuditReuseReader,
  type StudyMethodAuditSubmission,
} from "../apps/research-mcp/src/index.js";
import {
  prepareValidatedStudyAuditImport,
  validatedStudyAuditImportSchema,
} from "../apps/research-mcp/src/living-evidence-admin.js";

const DOI = "10.1234/reusable.study";
const PROTOCOLS: ProtocolManifest[] = [
  {
    name: "Universal",
    version: "20.5.15",
    revisionDate: "2026-08-24",
    sha256: "69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172",
  },
  {
    name: "HRP",
    version: "20.5.24",
    revisionDate: "2026-08-31",
    sha256: "dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1",
  },
];

describe("study audit repository reuse", () => {
  it("prepares a stdin-safe curated import using current canonical protocols", async () => {
    const index = documentIndex("Exact source text used only while preparing the import.");
    const auditReceipt = validateStudyMethodAudit(index, studyAudit(index));
    const contribution = await prepareValidatedStudyAuditImport({
      document_index: index,
      audit_receipt: auditReceipt,
      analysis_started_at: "2026-08-29T20:00:00.000Z",
      analysis_completed_at: "2026-08-29T20:01:00.000Z",
      freshness: {
        checked_at: "2026-08-29T20:01:00.000Z",
        next_due_at: "2026-09-28T20:01:00.000Z",
        receipt_sha256: sha256("bounded current-source checks"),
      },
    });

    expect(() => assertNoProhibitedPersistentKeys(contribution)).not.toThrow();
    expect(contribution.source?.rawContentPersisted).toBe(false);
    expect(contribution.analysis.sections.map(({ content }) => content).join(""))
      .not.toContain("Exact source text used only while preparing the import.");
    expect(contribution.run.protocolManifests.map(({ name }) => name))
      .toEqual(["AskRigor.com universal saved instructions", "HRP"]);
    expect(validatedStudyAuditImportSchema.safeParse({}).success).toBe(false);
  });

  it("builds a lossless source-free contribution and resolves its exact current audit", async () => {
    const index = documentIndex("Complete methods and results text.");
    const candidate = reusableCandidate(index);

    expect(() => assertNoProhibitedPersistentKeys(candidate.payload)).not.toThrow();
    expect(candidate.payload.analysis.captureStatus).toBe("complete_performed_analysis");
    expect(candidate.payload.source?.rawContentPersisted).toBe(false);
    expect(candidate.payload.analysis.sections.map(({ content }) => content).join(""))
      .not.toContain("Complete methods and results text.");

    const resolved = await resolveStudyAuditReuse({
      reader: reader([candidate]),
      index,
      requestedDoi: DOI,
      protocolManifests: PROTOCOLS,
    });

    expect(resolved.projection).toMatchObject({
      status: "reusable",
      repository_analysis_version_id: candidate.analysisVersionId,
      source_content_sha256: index.source.content_sha256,
      freshness_state: "current",
      current_source_revalidation_required: true,
    });
    expect(resolved.audit).toEqual(studyAudit(index));
  });

  it.each([
    ["source metadata", (candidate: AnalysisReuseCandidate) => {
      candidate.sourceContentSha256 = "0".repeat(64);
    }, "source_incompatible"],
    ["identifier membership", (candidate: AnalysisReuseCandidate) => {
      candidate.sourceIdentifiers = [];
    }, "source_incompatible"],
    ["current lineage", (candidate: AnalysisReuseCandidate) => {
      candidate.analysisUsable = false;
    }, "analysis_not_current"],
    ["complete capture", (candidate: AnalysisReuseCandidate) => {
      candidate.captureStatus = "partial_historical_capture";
    }, "analysis_not_current"],
    ["complete access", (candidate: AnalysisReuseCandidate) => {
      candidate.sourceAccessStatus = "partial";
    }, "source_access_not_complete"],
    ["freshness", (candidate: AnalysisReuseCandidate) => {
      candidate.freshnessState = "due";
    }, "freshness_not_current"],
    ["impact completion", (candidate: AnalysisReuseCandidate) => {
      candidate.pendingImpactJobs = 1;
    }, "impact_not_complete"],
    ["missing completed impact receipt", (candidate: AnalysisReuseCandidate) => {
      candidate.completedImpactJobs = 0;
    }, "impact_not_complete"],
    ["protocol identity", (candidate: AnalysisReuseCandidate) => {
      candidate.protocolManifestSha256s = ["1".repeat(64)];
    }, "protocol_incompatible"],
    ["stored receipt", (candidate: AnalysisReuseCandidate) => {
      candidate.payload.receipts[0]!.receiptSha256 = "2".repeat(64);
    }, "record_invalid"],
  ])("requires a fresh audit when %s is incompatible", async (_label, mutate, reason) => {
    const index = documentIndex("Exact source text.");
    const candidate = structuredClone(reusableCandidate(index));
    mutate(candidate);

    const resolved = await resolveStudyAuditReuse({
      reader: reader([candidate]),
      index,
      requestedDoi: DOI,
      protocolManifests: PROTOCOLS,
    });

    expect(resolved).toEqual({
      projection: {
        status: "fresh_audit_required",
        reason,
        current_source_revalidation_required: true,
      },
    });
  });

  it("fails closed on ambiguous candidates and repository errors", async () => {
    const index = documentIndex("Exact source text.");
    const candidate = reusableCandidate(index);
    const ambiguous = structuredClone(candidate);
    ambiguous.analysisVersionId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    ambiguous.payload.analysis.versionId = ambiguous.analysisVersionId;
    expect((await resolveStudyAuditReuse({
      reader: reader([candidate, ambiguous]),
      index,
      requestedDoi: DOI,
      protocolManifests: PROTOCOLS,
    })).projection).toMatchObject({ status: "fresh_audit_required", reason: "candidate_ambiguous" });

    const unavailable: StudyAuditReuseReader = {
      async findAnalysisReuseCandidates() {
        throw new Error("private diagnostic that must not escape");
      },
    };
    expect((await resolveStudyAuditReuse({
      reader: unavailable,
      index,
      requestedDoi: DOI,
      protocolManifests: PROTOCOLS,
    })).projection).toEqual({
      status: "fresh_audit_required",
      reason: "repository_unavailable",
      current_source_revalidation_required: true,
    });
  });

  it("revalidates an advertised candidate on the same exhausted handle", async () => {
    const index = documentIndex("One-page exact source text.");
    const candidate = reusableCandidate(index);
    const lookup = vi.fn(async () => [candidate]);
    const routes = createOpenFullTextActionRoutes({
      acquire: async () => acquisition(index),
      unpaywallConfig: { email: "research@example.org" },
      studyAuditReuse: {
        reader: { findAnalysisReuseCandidates: lookup },
        currentProtocolManifests: async () => PROTOCOLS,
      },
    });

    const acquired = await action(routes, "acquire_open_full_text", { doi: DOI });
    expect(acquired).toMatchObject({
      status: 200,
      body: {
        coverage_receipt: { exhausted: true },
        repository_study_audit: {
          status: "reusable",
          repository_analysis_version_id: candidate.analysisVersionId,
        },
      },
    });
    const handle = (acquired.body as {
      coverage_receipt: { document_handle: string };
    }).coverage_receipt.document_handle;

    const reused = await action(routes, "validate_study_method_audit", {
      document_handle: handle,
      repository_analysis_version_id: candidate.analysisVersionId,
    });
    expect(reused).toMatchObject({
      status: 200,
      body: {
        status: "source_linked_study_audit_validated",
        audit_receipt: {
          source_content_sha256: index.source.content_sha256,
          audit_sha256: validateStudyMethodAudit(index, studyAudit(index)).audit_sha256,
        },
        coverage_receipt: {
          document_handle: handle,
          full_text_read_to_exhaustion: true,
          audit_validated: true,
        },
        repository_reuse_receipt: {
          repository_analysis_version_id: candidate.analysisVersionId,
          compatibility_revalidated: true,
          semantic_truth_not_certified: true,
        },
      },
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("rejects a repository version that was not advertised on this handle", async () => {
    const index = documentIndex("One-page exact source text.");
    const candidate = reusableCandidate(index);
    const routes = createOpenFullTextActionRoutes({
      acquire: async () => acquisition(index),
      unpaywallConfig: { email: "research@example.org" },
      studyAuditReuse: {
        reader: reader([candidate]),
        currentProtocolManifests: async () => PROTOCOLS,
      },
    });
    const acquired = await action(routes, "acquire_open_full_text", { doi: DOI });
    const handle = (acquired.body as {
      coverage_receipt: { document_handle: string };
    }).coverage_receipt.document_handle;

    const boundary = await action(routes, "validate_study_method_audit", {
      document_handle: handle,
      repository_analysis_version_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    });
    expect(boundary).toMatchObject({
      status: 200,
      body: {
        status: "fresh_study_audit_required",
        reason: "candidate_missing",
        coverage_receipt: { audit_validated: false },
      },
    });
  });

  it("does not repeat repository lookups on continuation pages", async () => {
    const index = documentIndex("x".repeat(50_000));
    const candidate = reusableCandidate(index);
    const lookup = vi.fn(async () => [candidate]);
    const routes = createOpenFullTextActionRoutes({
      acquire: async () => acquisition(index),
      unpaywallConfig: { email: "research@example.org" },
      studyAuditReuse: {
        reader: { findAnalysisReuseCandidates: lookup },
        currentProtocolManifests: async () => PROTOCOLS,
      },
    });

    const acquired = await action(routes, "acquire_open_full_text", { doi: DOI });
    const handle = (acquired.body as {
      coverage_receipt: { document_handle: string };
    }).coverage_receipt.document_handle;
    expect(lookup).toHaveBeenCalledTimes(1);

    const continued = await action(routes, "continue_open_full_text", {
      document_handle: handle,
    });
    expect(continued).toMatchObject({
      status: 200,
      body: { coverage_receipt: { exhausted: true } },
    });
    expect((continued.body as { repository_study_audit?: unknown }).repository_study_audit)
      .toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("turns a post-advertisement freshness change into an executable fresh-audit boundary", async () => {
    const index = documentIndex("One-page exact source text.");
    const candidate = reusableCandidate(index);
    let calls = 0;
    const routes = createOpenFullTextActionRoutes({
      acquire: async () => acquisition(index),
      unpaywallConfig: { email: "research@example.org" },
      studyAuditReuse: {
        reader: {
          async findAnalysisReuseCandidates() {
            calls += 1;
            if (calls === 1) return [candidate];
            const stale = structuredClone(candidate);
            stale.freshnessState = "stale";
            return [stale];
          },
        },
        currentProtocolManifests: async () => PROTOCOLS,
      },
    });

    const acquired = await action(routes, "acquire_open_full_text", { doi: DOI });
    const handle = (acquired.body as {
      coverage_receipt: { document_handle: string };
    }).coverage_receipt.document_handle;
    const boundary = await action(routes, "validate_study_method_audit", {
      document_handle: handle,
      repository_analysis_version_id: candidate.analysisVersionId,
    });
    expect(boundary).toEqual({
      status: 200,
      body: {
        status: "fresh_study_audit_required",
        reason: "freshness_not_current",
        next_capability: "validate_study_method_audit_with_fresh_audit",
        coverage_receipt: {
          document_handle: handle,
          full_text_read_to_exhaustion: true,
          source_content_sha256: index.source.content_sha256,
          audit_validated: false,
          synthesis_use: "fresh_study_audit_required",
        },
      },
    });

    const fresh = await action(routes, "validate_study_method_audit", {
      document_handle: handle,
      audit: studyAudit(index),
    });
    expect(fresh).toMatchObject({
      status: 200,
      body: {
        status: "source_linked_study_audit_validated",
        coverage_receipt: { audit_validated: true },
      },
    });
  });
});

function reusableCandidate(index: AuditableDocumentIndex): AnalysisReuseCandidate {
  const receipt = validateStudyMethodAudit(index, studyAudit(index));
  const contribution = createValidatedStudyAuditContribution({
    index,
    auditReceipt: receipt,
    protocolManifests: PROTOCOLS,
    startedAt: "2026-08-29T20:00:00.000Z",
    completedAt: "2026-08-29T20:01:00.000Z",
    freshness: {
      checkedAt: "2026-08-29T20:00:00.000Z",
      nextDueAt: "2026-09-28T20:00:00.000Z",
      receiptSha256: sha256("current source and integrity checks"),
    },
  });
  return {
    analysisId: contribution.analysis.analysisId,
    analysisVersionId: contribution.analysis.versionId,
    analysisKind: contribution.analysis.analysisKind,
    captureStatus: contribution.analysis.captureStatus,
    relationship: contribution.analysis.relationship,
    authoredAt: contribution.analysis.authoredAt,
    analysisUsable: true,
    sourceFamilyId: contribution.source!.familyId,
    sourceVersionId: contribution.source!.versionId,
    sourceContentSha256: contribution.source!.sourceContentSha256,
    sourceAccessStatus: contribution.source!.accessStatus,
    sourceIdentifiers: contribution.source!.identifiers.map(({ scheme, value }) => ({ scheme, value })),
    protocolManifestSha256s: PROTOCOLS.map(({ sha256: digest }) => digest),
    freshnessState: "current",
    freshnessCheckedAt: "2026-08-29T20:00:00.000Z",
    completedImpactJobs: 1,
    pendingImpactJobs: 0,
    payload: contribution,
  };
}

function reader(candidates: AnalysisReuseCandidate[]): StudyAuditReuseReader {
  return { async findAnalysisReuseCandidates() { return candidates; } };
}

function documentIndex(text: string): AuditableDocumentIndex {
  const textHash = createHash("sha256").update(text, "utf8").digest("hex");
  const contentHash = createHash("sha256").update(`pdf:${text}`, "utf8").digest("hex");
  return {
    source: {
      provider: "unpaywall_open_location",
      primary_identifier: DOI,
      canonical_url: "https://repository.example.org/reusable-study.pdf",
      doi: DOI,
      title: "Reusable open study",
      version: "acceptedVersion",
      format: "pdf_text",
      content_sha256: contentHash,
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

function studyAudit(index: AuditableDocumentIndex): StudyMethodAuditSubmission {
  const blockId = index.blocks[0]!.block_id;
  return {
    source_primary_identifier: DOI,
    source_content_sha256: index.source.content_sha256,
    design_label: "parallel group comparison",
    design_capability_statement: "The design label does not establish reliability; implementation and analysis remain separately audited.",
    population_and_stage: "The exact enrolled population and baseline stage described in the full text.",
    intervention_program: {
      name: "specified intervention program",
      components: ["component described in the source"],
      dose_or_intensity: "described in the source",
      frequency: "described in the source",
      duration: "described in the source",
      supervision: "described in the source",
      adherence: "measured as described in the source",
      co_interventions: [],
      care_stage: "nonsurgical",
    },
    comparator_program: {
      name: "specified comparator program",
      components: ["comparator described in the source"],
      dose_or_intensity: "described in the source",
      frequency: "described in the source",
      duration: "described in the source",
      supervision: "described in the source",
      adherence: "measured as described in the source",
      co_interventions: [],
      care_stage: "nonsurgical",
    },
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
        capability: "can_support",
        reason: "The source-linked method block defines that bounded contrast.",
        evidence_block_ids: [blockId],
      },
      {
        claim: "The study proves every treatment in the umbrella category works.",
        capability: "cannot_support",
        reason: "Only the exact source programs and population were audited.",
        evidence_block_ids: [],
      },
    ],
  };
}

function acquisition(index: AuditableDocumentIndex) {
  return okEnvelope({
    provider: "open_full_text",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: DOI,
    sourceIdentity: { canonical_url: index.source.canonical_url },
    pagination: { exhausted: true },
    returned: 1,
    accessStatus: "complete",
    limitations: ["Method audit required."],
    data: {
      requested_doi: DOI,
      outcome: "full_text_indexed",
      discovery_attempts: [{ route: "unpaywall", result: "indexed", identifier: DOI }],
      document_index: index,
    } satisfies OpenFullTextAcquisitionData,
  });
}

async function action(
  routes: ReturnType<typeof createOpenFullTextActionRoutes>,
  operationId: string,
  body: unknown,
) {
  const route = routes.find((candidate) => candidate.operationId === operationId);
  if (route === undefined) throw new Error(`missing ${operationId}`);
  return route.handle({
    request: {} as IncomingMessage,
    clientIp: "127.0.0.1",
    body,
  });
}
