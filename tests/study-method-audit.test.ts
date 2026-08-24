import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  externalStudyRelationshipSchema,
  okEnvelope,
} from "@askrigor/contracts";

import {
  STUDY_METHOD_AUDIT_DOMAINS,
  createInMemoryEvidenceArtifactStore,
  createStudyExternalEvidenceCoordinator,
  studyMethodAuditExternalSubmissionSchema,
  studyMethodAuditSubmissionSchema,
  validateStudyMethodAudit,
  validateStudyMethodAuditWithExternalEvidence,
  type StudyExternalEvidenceAuditOutput,
  type StudyMethodAuditExternalSubmission,
  type StudyMethodAuditSubmission
} from "../apps/research-mcp/src/index.js";
import {
  indexJatsStudyDocument,
  type CrossrefPublicationIntegrityData,
  type ForrtReplicationLookupData,
  type EuropePmcFullTextArticle
} from "../packages/sources/src/index.js";

const EXTERNAL_SESSION_ID = `ars1_${"E".repeat(32)}`;
const EXTERNAL_SECRET = "method-audit-external-receipt-secret-32-bytes";
const EXTERNAL_PROTOCOLS = {
  universal: {
    name: "AskRigor Universal",
    version: "20.5.14",
    revisionDate: "2026-08-18",
    sha256: "8".repeat(64),
  },
  hrp: {
    name: "AskRigor HRP",
    version: "20.5.22",
    revisionDate: "2026-08-23",
    sha256: "9".repeat(64),
  },
};

async function sourceIndex() {
  const xml = await readFile(
    new URL("fixtures/europe-pmc/full-text.xml", import.meta.url),
    "utf8"
  );
  const article: EuropePmcFullTextArticle = {
    pmcid: "PMC1234567",
    pmid: "40123456",
    doi: "10.1234/recorded.example",
    title: "Recorded full-text study",
    format: "jats_xml",
    document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"),
    xml
  };
  return indexJatsStudyDocument(article);
}

async function submission(): Promise<StudyMethodAuditSubmission> {
  const index = await sourceIndex();
  const methodsBlock = index.blocks.find(({ section_path }) =>
    section_path.includes("Methods")
  )!.block_id;
  const resultsBlock = index.blocks.find(({ section_path }) =>
    section_path.includes("Results")
  )!.block_id;
  return {
    source_primary_identifier: index.source.pmcid,
    source_content_sha256: index.source.content_sha256,
    design_label: "randomized parallel-group comparison",
    design_capability_statement: "Random assignment can support the assigned contrast if implementation, follow-up, analysis, and reporting are adequate; it is not a reliability verdict.",
    population_and_stage: "Adults meeting the study eligibility criteria; transport beyond that population remains limited.",
    intervention_program: {
      name: "supervised progressive resistance program",
      components: ["progressive lower-body resistance exercises", "supervised sessions"],
      dose_or_intensity: "program intensity recorded in the methods",
      frequency: "session frequency recorded in the methods",
      duration: "twelve weeks",
      supervision: "supervised",
      adherence: "attendance measured",
      co_interventions: [],
      care_stage: "nonsurgical"
    },
    comparator_program: {
      name: "specified comparator program",
      components: ["comparator components recorded in the methods"],
      dose_or_intensity: "recorded in the methods",
      frequency: "recorded in the methods",
      duration: "twelve weeks",
      supervision: "recorded in the methods",
      adherence: "recorded separately",
      co_interventions: [],
      care_stage: "nonsurgical"
    },
    outcome_and_horizon: "Function at twelve weeks; longer-term durability remains outside this fixture.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain, index) => ({
      domain,
      status: index === 12 ? "unclear" as const : "limitation_identified" as const,
      plain_language_finding: index === 12
        ? "Independent replication was not described in the indexed fixture."
        : `The ${domain.replaceAll("_", " ")} domain was inspected and retains a stated limitation.`,
      evidence_block_ids: index === 12 ? [] : [index % 2 === 0 ? methodsBlock : resultsBlock],
      unresolved_fields: index === 12 ? ["independent replication"] : []
    })),
    claim_capabilities: [
      {
        claim: "The exact assigned programs can be compared for the recorded functional outcome at twelve weeks.",
        capability: "can_support",
        reason: "The methods and results blocks record the assigned programs and outcome horizon.",
        evidence_block_ids: [methodsBlock, resultsBlock]
      },
      {
        claim: "Every form of exercise has been compared with every alternative treatment.",
        capability: "cannot_support",
        reason: "Only the exact programs and population in this study were inspected.",
        evidence_block_ids: []
      }
    ]
  };
}

async function externalAudit(): Promise<StudyExternalEvidenceAuditOutput> {
  const doi = "10.1234/recorded.example";
  const originalCore = {
    doi,
    title: "Recorded full-text study",
    identity_status: "provider_reported" as const,
    identity_basis: ["provider_reported_doi" as const],
  };
  const repetitionCore = {
    doi: "10.1234/recorded.replication",
    title: "Recorded replication",
    identity_status: "provider_reported" as const,
    identity_basis: ["provider_reported_doi" as const],
  };
  const relationshipCore = {
    relationship_kind: "replication" as const,
    relation_direction: "original_to_repetition" as const,
    original_identity: {
      ...originalCore,
      identity_hash: createHash("sha256").update(JSON.stringify(originalCore)).digest("hex"),
    },
    repetition_identity: {
      ...repetitionCore,
      identity_hash: createHash("sha256").update(JSON.stringify(repetitionCore)).digest("hex"),
    },
    provider: "forrt" as const,
    provider_record_id: "replication-1",
    provider_reported_outcome: "failed" as const,
    raw_provider_outcome: "failed",
    implementation_match_audit_status: "not_started" as const,
    linked_source_audit_status: "not_started" as const,
    limitations: ["Provider-reported only."],
  };
  const relationship = externalStudyRelationshipSchema.parse({
    ...relationshipCore,
    relationship_hash: createHash("sha256")
      .update(JSON.stringify(relationshipCore))
      .digest("hex"),
  });
  const crossref = okEnvelope<CrossrefPublicationIntegrityData>({
    provider: "crossref",
    recordType: "publication_integrity",
    primaryIdentifier: doi,
    retrievedAt: "2026-08-24T02:00:00.000Z",
    sourceIdentity: {
      canonical_url: `https://doi.org/${doi}`,
      title: "Recorded full-text study",
      authors_or_channel: ["Example"],
    },
    accessStatus: "metadata_only",
    pagination: { exhausted: true },
    returned: 1,
    data: {
      doi,
      record_state: "no_update_marker_found",
      events: [],
      sources_checked: ["crossref"],
    },
  });
  const forrt = okEnvelope<ForrtReplicationLookupData>({
    provider: "forrt",
    recordType: "replication_relationships",
    primaryIdentifier: doi,
    retrievedAt: "2026-08-24T02:01:00.000Z",
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    accessStatus: "metadata_only",
    pagination: { exhausted: true },
    returned: 1,
    limitations: ["Provider-reported relationship."],
    data: {
      doi,
      lookup_status: "records_available",
      relationships: [relationship],
      rejected_relationship_rows: 0,
      coverage_statement: "Provider-scoped FORRT coverage only.",
    },
  });
  return createStudyExternalEvidenceCoordinator({
    protocolManifests: EXTERNAL_PROTOCOLS,
    crossrefConfig: { mailto: "maintainer@example.test" },
    receiptSecret: EXTERNAL_SECRET,
    receiptKeyId: "external-evidence-v1",
    artifactStore: createInMemoryEvidenceArtifactStore({
      now: () => new Date("2026-08-24T02:02:00.000Z"),
    }),
    now: () => new Date("2026-08-24T02:02:00.000Z"),
    providers: {
      crossref: async () => crossref,
      forrt: async () => forrt,
    },
  }).audit({ session_id: EXTERNAL_SESSION_ID, doi });
}

async function externalSubmission(
  output: StudyExternalEvidenceAuditOutput,
): Promise<StudyMethodAuditExternalSubmission> {
  const base = await submission();
  const relationship = output.bundle.replication_relationships[0]!;
  return studyMethodAuditExternalSubmissionSchema.parse({
    ...base,
    domain_findings: base.domain_findings.map((finding) => ({
      ...finding,
      ...(finding.domain === "replication_contradiction_and_evidence_ancestry"
        ? {
            status: "limitation_identified",
            plain_language_finding: "FORRT reported a linked repetition, but its implementation and source result remain unaudited.",
            unresolved_fields: ["implementation match", "linked source audit"],
          }
        : {}),
      external_evidence_references:
        finding.domain === "replication_contradiction_and_evidence_ancestry"
          ? [{
              external_receipt_payload_sha256: output.receipt.receipt_payload_sha256,
              study_identity_hash: output.study_identity.identity_hash,
              provider: "forrt",
              item_kind: "replication_relationship",
              item_hash: relationship.relationship_hash,
            }]
          : [],
    })),
    external_evidence_binding: {
      external_receipt_payload_sha256: output.receipt.receipt_payload_sha256,
      study_identity_hash: output.study_identity.identity_hash,
      bundle_hash: output.bundle.bundle_hash,
    },
  });
}

describe("study-method audit receipts", () => {
  it("binds every audit domain and claim capability to one exact full-text index", async () => {
    const index = await sourceIndex();
    const audit = await submission();

    const receipt = validateStudyMethodAudit(index, audit);

    expect(receipt).toMatchObject({
      receipt_name: "askrigor_study_method_audit",
      receipt_version: "1.0",
      audit_status: "complete_with_unresolved_fields",
      source_primary_identifier: "PMC1234567",
      source_content_sha256: index.source.content_sha256,
      design_label_is_not_reliability_verdict: true,
      source_block_count: index.blocks.length,
      cited_source_block_count: 2
    });
    expect(receipt.domain_findings.map(({ domain }) => domain))
      .toEqual(STUDY_METHOD_AUDIT_DOMAINS);
    expect(receipt.claim_capabilities.map(({ capability }) => capability))
      .toEqual(["can_support", "cannot_support"]);
    expect(receipt.limitations.join(" ")).toContain(
      "not accepted as reliability verdicts"
    );
  });

  it("rejects missing or duplicated method domains", async () => {
    const audit = await submission();
    audit.domain_findings[12] = {
      ...audit.domain_findings[11]!,
      plain_language_finding: "Duplicate domain fixture."
    };

    expect(studyMethodAuditSubmissionSchema.safeParse(audit).success).toBe(false);
  });

  it("rejects source block identifiers not present in the acquired document", async () => {
    const index = await sourceIndex();
    const audit = await submission();
    audit.claim_capabilities[0]!.evidence_block_ids = [
      "jats_999999_aaaaaaaaaaaa"
    ];

    expect(() => validateStudyMethodAudit(index, audit)).toThrow(
      "Study audit cited an unknown source block"
    );
  });

  it("rejects an umbrella treatment label without an exact program", async () => {
    const audit = await submission();
    audit.intervention_program = {
      ...audit.intervention_program,
      name: "exercise",
      components: ["general movement"]
    };

    const parsed = studyMethodAuditSubmissionSchema.safeParse(audit);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        "generic program names require exact components or the literal program not described"
      );
    }
  });

  it("requires separate statements of what a study can and cannot support", async () => {
    const audit = await submission();
    audit.claim_capabilities = audit.claim_capabilities.filter(({ capability }) =>
      capability !== "cannot_support"
    );

    const parsed = studyMethodAuditSubmissionSchema.safeParse(audit);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        "must state at least one explicit non-capability"
      );
    }
  });

  it("binds the ancestry domain to a verified external relationship without inventing a document block", async () => {
    const index = await sourceIndex();
    const output = await externalAudit();
    const audit = await externalSubmission(output);

    const receipt = validateStudyMethodAuditWithExternalEvidence(
      index,
      audit,
      output,
      {
        sessionId: EXTERNAL_SESSION_ID,
        protocolIdentities: output.receipt.protocol_identities,
      },
      EXTERNAL_SECRET,
    );

    expect(receipt).toMatchObject({
      receipt_name: "askrigor_study_method_audit_external",
      external_audit_binding_validated: true,
      cited_external_reference_count: 1,
      cited_source_block_count: 2,
      external_evidence_binding: {
        external_receipt_payload_sha256: output.receipt.receipt_payload_sha256,
        study_identity_hash: output.study_identity.identity_hash,
        bundle_hash: output.bundle.bundle_hash,
      },
    });
    const ancestry = receipt.domain_findings.find(({ domain }) =>
      domain === "replication_contradiction_and_evidence_ancestry"
    )!;
    expect(ancestry.evidence_block_ids).toEqual([]);
    expect(ancestry.external_evidence_references).toHaveLength(1);
    expect(receipt.limitations.join(" ")).toContain("provider assertions remain");
  });

  it("keeps external references out of every non-ancestry domain and preserves public schema strictness", async () => {
    const output = await externalAudit();
    const audit = await externalSubmission(output);
    const reference = audit.domain_findings.at(-1)!.external_evidence_references[0]!;
    audit.domain_findings[0]!.external_evidence_references = [reference];

    expect(studyMethodAuditExternalSubmissionSchema.safeParse(audit).success).toBe(false);
    const base = await submission();
    expect(studyMethodAuditSubmissionSchema.safeParse({
      ...base,
      external_evidence_binding: audit.external_evidence_binding,
    }).success).toBe(false);
  });

  it("rejects unknown external items, fake document blocks, and changed bundle bindings", async () => {
    const index = await sourceIndex();
    const output = await externalAudit();
    const unknown = await externalSubmission(output);
    unknown.domain_findings.at(-1)!.external_evidence_references[0]!.item_hash =
      "f".repeat(64);
    expect(() => validateStudyMethodAuditWithExternalEvidence(
      index,
      unknown,
      output,
      { sessionId: EXTERNAL_SESSION_ID, protocolIdentities: output.receipt.protocol_identities },
      EXTERNAL_SECRET,
    )).toThrow("unknown or mismatched external evidence");

    const fakeBlock = await externalSubmission(output);
    fakeBlock.domain_findings.at(-1)!.evidence_block_ids = [
      "jats_999999_aaaaaaaaaaaa",
    ];
    expect(() => validateStudyMethodAuditWithExternalEvidence(
      index,
      fakeBlock,
      output,
      { sessionId: EXTERNAL_SESSION_ID, protocolIdentities: output.receipt.protocol_identities },
      EXTERNAL_SECRET,
    )).toThrow("unknown source block");

    const wrongBinding = await externalSubmission(output);
    wrongBinding.external_evidence_binding.bundle_hash = "e".repeat(64);
    expect(() => validateStudyMethodAuditWithExternalEvidence(
      index,
      wrongBinding,
      output,
      { sessionId: EXTERNAL_SESSION_ID, protocolIdentities: output.receipt.protocol_identities },
      EXTERNAL_SECRET,
    )).toThrow("binding mismatch");
  });
});
