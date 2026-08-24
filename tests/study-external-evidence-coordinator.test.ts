import { createHash } from "node:crypto";

import {
  errorEnvelope,
  externalStudyRelationshipSchema,
  okEnvelope,
  publicationIntegrityEventSchema,
  type ExternalStudyRelationship,
  type ProvenanceEnvelope,
} from "@askrigor/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryEvidenceArtifactStore,
  createStudyExternalEvidenceCoordinator,
  StudyExternalEvidenceIdentityError,
  StudyExternalEvidenceReceiptError,
  studyExternalEvidenceAuditOutputSchema,
  studyExternalEvidenceAuditInputSchema,
  verifyStudyExternalEvidenceReceipt,
  type StudyExternalEvidenceAuditOutput,
  type StudyExternalEvidenceCoordinatorOptions,
} from "../apps/research-mcp/src/index.js";
import type {
  CrossrefPublicationIntegrityData,
  ForrtReplicationLookupData,
} from "../packages/sources/src/index.js";

const DOI = "10.5555/coordinator.study";
const SESSION_ID = `ars1_${"A".repeat(32)}`;
const NOW = new Date("2026-08-24T01:30:00.000Z");
const SECRET = "external-evidence-receipt-secret-32-bytes";
const PROTOCOLS = {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function identity(doi: string) {
  const core = {
    doi,
    title: `Study ${doi}`,
    identity_status: "provider_reported" as const,
    identity_basis: ["provider_reported_doi" as const],
  };
  return { ...core, identity_hash: hash(JSON.stringify(core)) };
}

function relationship(outcome = "failed"): ExternalStudyRelationship {
  const core = {
    relationship_kind: "replication" as const,
    relation_direction: "original_to_repetition" as const,
    original_identity: identity(DOI),
    repetition_identity: identity("10.5555/coordinator.replication"),
    provider: "forrt" as const,
    provider_record_id: "forrt-1",
    provider_reported_outcome: outcome === "failed" ? "failed" as const : "not_reported" as const,
    raw_provider_outcome: outcome,
    implementation_match_audit_status: "not_started" as const,
    linked_source_audit_status: "not_started" as const,
    limitations: ["Provider-reported only."],
  };
  return externalStudyRelationshipSchema.parse({
    ...core,
    relationship_hash: hash(JSON.stringify(core)),
  });
}

function event(
  kind: "retraction" | "withdrawal" | "expression_of_concern" | "correction" | "reinstatement",
  sequence: number,
  date: string,
) {
  const assertionCore = {
    provider: "crossref" as const,
    assertion_source: "publisher" as const,
    raw_source: "publisher",
    relation_direction: "inbound" as const,
    provider_record_id: `record-${sequence}`,
    raw_relation_type: "updated-by",
    raw_type: kind,
    raw_label: kind,
    asserted_at: `${date}T00:00:00.000Z`,
  };
  return publicationIntegrityEventSchema.parse({
    sequence,
    event_kind: kind,
    event_date: date,
    original_doi: DOI,
    notice_doi: `10.5555/notice.${sequence}`,
    reasons: [],
    assertions: [{
      ...assertionCore,
      assertion_hash: hash(JSON.stringify(assertionCore)),
    }],
    event_hash: hash(`${kind}:${sequence}:${date}`),
  });
}

function crossrefEnvelope(input: {
  state?: CrossrefPublicationIntegrityData["record_state"];
  events?: CrossrefPublicationIntegrityData["events"];
} = {}): ProvenanceEnvelope<CrossrefPublicationIntegrityData> {
  return okEnvelope({
    provider: "crossref",
    recordType: "publication_integrity",
    primaryIdentifier: DOI,
    retrievedAt: "2026-08-24T01:20:00.000Z",
    sourceIdentity: {
      canonical_url: `https://doi.org/${DOI}`,
      title: "Coordinator study",
      authors_or_channel: ["Example"],
    },
    accessStatus: "metadata_only",
    pagination: { exhausted: true },
    returned: 1,
    limitations: [],
    data: {
      doi: DOI,
      record_state: input.state ?? "no_update_marker_found",
      events: input.events ?? [],
      sources_checked: ["crossref"],
    },
  });
}

function forrtEnvelope(input: {
  relationships?: ExternalStudyRelationship[];
  status?: "records_available" | "no_match_in_provider";
} = {}): ProvenanceEnvelope<ForrtReplicationLookupData> {
  const relationships = input.relationships ?? [];
  return okEnvelope({
    provider: "forrt",
    recordType: "replication_relationships",
    primaryIdentifier: DOI,
    retrievedAt: "2026-08-24T01:21:00.000Z",
    sourceIdentity: { canonical_url: `https://doi.org/${DOI}` },
    accessStatus: "metadata_only",
    pagination: { exhausted: true },
    returned: relationships.length === 0 ? 0 : 1,
    limitations: relationships.length === 0
      ? ["Successful provider-scoped no match."]
      : ["Provider-reported relationships require linked-source audit."],
    data: {
      doi: DOI,
      lookup_status: input.status ?? (relationships.length === 0
        ? "no_match_in_provider"
        : "records_available"),
      relationships,
      rejected_relationship_rows: 0,
      coverage_statement: "Provider-scoped FORRT coverage only.",
    },
  });
}

function options(
  overrides: Partial<StudyExternalEvidenceCoordinatorOptions> = {},
): StudyExternalEvidenceCoordinatorOptions {
  return {
    protocolManifests: PROTOCOLS,
    crossrefConfig: { mailto: "maintainer@example.test" },
    receiptSecret: SECRET,
    receiptKeyId: "external-evidence-v1",
    artifactStore: createInMemoryEvidenceArtifactStore({ now: () => NOW }),
    now: () => NOW,
    providers: {
      crossref: vi.fn(async () => crossrefEnvelope()),
      forrt: vi.fn(async () => forrtEnvelope()),
    },
    ...overrides,
  };
}

function expectedReceiptContext(output: StudyExternalEvidenceAuditOutput) {
  return {
    sessionId: SESSION_ID,
    studyIdentityHash: output.study_identity.identity_hash,
    protocolIdentities: output.receipt.protocol_identities,
    providerAttempts: output.bundle.provider_attempts,
    providerArtifacts: output.provider_artifacts,
    bundleHash: output.bundle.bundle_hash,
  };
}

describe("server-owned external study-evidence coordinator", () => {
  it("calls the fixed Crossref and FORRT adapters itself and issues a structurally bounded receipt", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (rawInput: URL | RequestInfo) => {
      const url = new URL(String(rawInput));
      requests.push(url);
      if (url.hostname === "api.crossref.org") {
        return new Response(JSON.stringify({
          status: "ok",
          "message-type": "work",
          message: {
            DOI,
            title: ["Coordinator study"],
            author: [{ family: "Example" }],
            "updated-by": [
              { DOI: "10.5555/notice.0", type: "retraction", label: "Retraction", source: "publisher", updated: { "date-parts": [[2023, 1, 2]] } },
              { DOI: "10.5555/notice.1", type: "correction", label: "Correction", source: "publisher", updated: { "date-parts": [[2024, 2, 3]] } },
              { DOI: "10.5555/notice.2", type: "reinstatement", label: "Reinstatement", source: "publisher", updated: { "date-parts": [[2025, 3, 4]] } },
            ],
          },
        }), { status: 200 });
      }
      if (url.hostname === "rep-api.forrt.org") {
        return new Response(JSON.stringify({
          results: {
            [DOI]: {
              doi: DOI,
              title: "Coordinator study",
              authors: [{ family: "Example" }],
              year: 2020,
              record: {
                replications: [{
                  doi: "10.5555/coordinator.replication",
                  doi_hash: "forrt-1",
                  title: "Coordinator replication",
                  authors: [{ family: "Replicator" }],
                  year: 2024,
                  outcome: "failed",
                }],
                reproductions: [],
                originals: [],
              },
            },
          },
        }), { status: 200 });
      }
      throw new Error("Unexpected provider host");
    }));
    const coordinator = createStudyExternalEvidenceCoordinator({
      ...options(),
      providers: undefined,
    });

    const output = await coordinator.audit({ session_id: SESSION_ID, doi: `DOI:${DOI.toUpperCase()}` });

    expect(requests.map(({ hostname }) => hostname)).toEqual([
      "api.crossref.org",
      "rep-api.forrt.org",
    ]);
    expect(output).toMatchObject({
      status: "complete",
      study_identity: {
        doi: DOI,
        identity_status: "verified",
        identity_basis: ["crossref_exact_doi"],
      },
      receipt: {
        receipt_name: "askrigor_study_external_evidence",
        domain: "askrigor.research.study-external-evidence",
        session_id: SESSION_ID,
        audit_status: "complete",
        key_id: "external-evidence-v1",
      },
    });
    expect(output.bundle.provider_attempts).toHaveLength(6);
    expect(output.bundle.provider_attempts.filter(({ provider_outcome }) =>
      provider_outcome === "not_configured"
    ).map(({ provider }) => provider).sort()).toEqual([
      "epistemonikos", "pubpeer", "retraction_watch", "scite",
    ]);
    expect(output.provider_artifacts).toHaveLength(2);
    expect(output.bundle.replication_relationships[0]).toMatchObject({
      provider_reported_outcome: "failed",
      implementation_match_audit_status: "not_started",
      linked_source_audit_status: "not_started",
    });
    expect(output.bundle.controller_directives.map(({ directive }) => directive))
      .toContain("require_linked_replication_acquisition");
    expect(output.bundle.controller_directives.map(({ directive }) => directive))
      .not.toContain("exclude_source_from_effect_claims");
    expect(JSON.stringify(output.receipt)).not.toContain("receiptSecret");
    expect(JSON.stringify(output.receipt)).not.toContain("quality_score");
    expect(JSON.stringify(output.receipt)).not.toContain("replication_verified");
    expect(output.receipt.limitations.join(" ")).toContain(
      "does not prove that provider assertions or AskRigor interpretations are scientifically true"
    );
    expect(verifyStudyExternalEvidenceReceipt(
      output.receipt,
      expectedReceiptContext(output),
      SECRET,
    )).toEqual(output.receipt);
  });

  it("rejects caller-authored completion, provider, and hash fields before provider work", async () => {
    const crossref = vi.fn(async () => crossrefEnvelope());
    const forrt = vi.fn(async () => forrtEnvelope());
    const coordinator = createStudyExternalEvidenceCoordinator(options({
      providers: { crossref, forrt },
    }));
    expect(studyExternalEvidenceAuditInputSchema.safeParse({
      session_id: SESSION_ID,
      doi: DOI,
      complete: true,
      provider_count: 99,
      bundle_hash: "a".repeat(64),
    }).success).toBe(false);
    await expect(coordinator.audit({
      session_id: SESSION_ID,
      doi: DOI,
      complete: true,
    } as never)).rejects.toThrow();
    expect(crossref).not.toHaveBeenCalled();
    expect(forrt).not.toHaveBeenCalled();
  });

  it("stops before FORRT and issues no output when Crossref cannot verify identity", async () => {
    const forrt = vi.fn(async () => forrtEnvelope());
    const crossrefFailure = errorEnvelope<CrossrefPublicationIntegrityData>({
      provider: "crossref",
      recordType: "publication_integrity",
      primaryIdentifier: DOI,
      retrievedAt: "2026-08-24T01:20:00.000Z",
      accessStatus: "rate_limited",
      code: "crossref_rate_limited",
      message: "Crossref rate limit reached",
      retryable: true,
      data: {
        doi: DOI,
        record_state: "state_uncertain",
        events: [],
        sources_checked: ["crossref"],
      },
    }) as ProvenanceEnvelope<CrossrefPublicationIntegrityData>;
    const coordinator = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefFailure),
        forrt,
      },
    }));

    await expect(coordinator.audit({ session_id: SESSION_ID, doi: DOI }))
      .rejects.toMatchObject({
        name: "StudyExternalEvidenceIdentityError",
        retryable: true,
      } satisfies Partial<StudyExternalEvidenceIdentityError>);
    expect(forrt).not.toHaveBeenCalled();
  });

  it("preserves retryable FORRT failure in a signed blocked receipt instead of a no-match", async () => {
    const failure = errorEnvelope<ForrtReplicationLookupData>({
      provider: "forrt",
      recordType: "replication_relationships",
      primaryIdentifier: DOI,
      retrievedAt: "2026-08-24T01:21:00.000Z",
      accessStatus: "rate_limited",
      limitations: ["Relationship coverage remains unresolved."],
      code: "forrt_rate_limited",
      message: "FORRT rate limit reached",
      httpStatus: 429,
      retryable: true,
      data: {
        doi: DOI,
        lookup_status: "unknown",
        relationships: [],
        rejected_relationship_rows: 0,
        coverage_statement: "Provider-scoped FORRT coverage only.",
      },
    }) as ProvenanceEnvelope<ForrtReplicationLookupData>;
    const coordinator = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => failure),
      },
    }));

    const output = await coordinator.audit({ session_id: SESSION_ID, doi: DOI });

    expect(output.status).toBe("blocked_retryable");
    expect(output.bundle.provider_attempts.find(({ provider }) => provider === "forrt"))
      .toMatchObject({
        provider_outcome: "rate_limited",
        access_status: "rate_limited",
        error: { retryable: true, http_status: 429 },
      });
    expect(output.bundle.replication_relationships).toEqual([]);
    expect(JSON.stringify(output)).not.toContain("no_match_in_provider");
    expect(() => verifyStudyExternalEvidenceReceipt(
      output.receipt,
      expectedReceiptContext(output),
      SECRET,
    )).not.toThrow();
  });

  it.each([
    {
      name: "provider-scoped no match",
      envelope: forrtEnvelope(),
      status: "complete",
      providerOutcome: "no_match_in_provider",
      accessStatus: "metadata_only",
    },
    {
      name: "partial response",
      envelope: okEnvelope<ForrtReplicationLookupData>({
        provider: "forrt",
        recordType: "replication_relationships",
        primaryIdentifier: DOI,
        retrievedAt: "2026-08-24T01:21:00.000Z",
        sourceIdentity: { canonical_url: `https://doi.org/${DOI}` },
        accessStatus: "partial",
        pagination: { exhausted: false },
        returned: 0,
        limitations: ["Provider response was incomplete."],
        data: {
          doi: DOI,
          lookup_status: "unknown",
          relationships: [],
          rejected_relationship_rows: 0,
          coverage_statement: "Provider-scoped partial FORRT coverage only.",
        },
      }),
      status: "partial",
      providerOutcome: "partial",
      accessStatus: "partial",
    },
    {
      name: "nonretryable inaccessible provider",
      envelope: errorEnvelope<ForrtReplicationLookupData>({
        provider: "forrt",
        recordType: "replication_relationships",
        primaryIdentifier: DOI,
        retrievedAt: "2026-08-24T01:21:00.000Z",
        accessStatus: "inaccessible",
        limitations: ["Provider access is unavailable."],
        code: "forrt_access_unavailable",
        message: "FORRT access is unavailable",
        retryable: false,
        data: {
          doi: DOI,
          lookup_status: "unknown",
          relationships: [],
          rejected_relationship_rows: 0,
          coverage_statement: "Provider-scoped FORRT coverage only.",
        },
      }),
      status: "bounded_nonretryable",
      providerOutcome: "inaccessible",
      accessStatus: "inaccessible",
    },
  ])("keeps $name distinct in status and provider evidence", async ({
    envelope,
    status,
    providerOutcome,
    accessStatus,
  }) => {
    const output = await createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => envelope),
      },
    })).audit({ session_id: SESSION_ID, doi: DOI });

    expect(output.status).toBe(status);
    expect(output.bundle.provider_attempts.find(({ provider }) => provider === "forrt"))
      .toMatchObject({
        provider_outcome: providerOutcome,
        access_status: accessStatus,
      });
  });

  it("fails closed on malformed provider output and inconsistent output projections", async () => {
    const malformed = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => ({ provider: "forrt" }) as never),
      },
    }));
    await expect(malformed.audit({ session_id: SESSION_ID, doi: DOI }))
      .rejects.toThrow();

    const output = await createStudyExternalEvidenceCoordinator(options())
      .audit({ session_id: SESSION_ID, doi: DOI });
    expect(studyExternalEvidenceAuditOutputSchema.safeParse({
      ...output,
      status: "partial",
    }).success).toBe(false);
    expect(studyExternalEvidenceAuditOutputSchema.safeParse({
      ...output,
      study_identity: { ...output.study_identity, identity_hash: "f".repeat(64) },
    }).success).toBe(false);
    expect(studyExternalEvidenceAuditOutputSchema.safeParse({
      ...output,
      study_identity: { ...output.study_identity, title: "Changed projection" },
    }).success).toBe(false);
  });

  it("derives current publication directives without treating historical retraction as still active", async () => {
    const history = [
      event("retraction", 0, "2023-01-02"),
      event("correction", 1, "2024-02-03"),
      event("reinstatement", 2, "2025-03-04"),
    ];
    const coordinator = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope({
          state: "reinstatement_recorded",
          events: history,
        })),
        forrt: vi.fn(async () => forrtEnvelope({ relationships: [relationship()] })),
      },
    }));
    const output = await coordinator.audit({ session_id: SESSION_ID, doi: DOI });
    const directives = output.bundle.controller_directives.map(({ directive }) => directive);
    expect(directives).toContain("require_update_notice_audit");
    expect(directives).toContain("invalidate_prior_source_audit");
    expect(directives).toContain("require_linked_replication_acquisition");
    expect(directives).not.toContain("exclude_source_from_effect_claims");

    const active = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope({
          state: "active_retraction_or_withdrawal",
          events: [event("retraction", 0, "2025-03-04")],
        })),
        forrt: vi.fn(async () => forrtEnvelope()),
      },
    }));
    const activeOutput = await active.audit({ session_id: SESSION_ID, doi: DOI });
    expect(activeOutput.bundle.controller_directives.map(({ directive }) => directive))
      .toContain("exclude_source_from_effect_claims");
    expect(activeOutput.bundle.claim_local_limitations.map(({ limitation }) => limitation))
      .toContain("This source is excluded from ordinary effect claims while the retraction or withdrawal remains active and unresolved.");

    const expression = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope({
          state: "expression_of_concern_recorded",
          events: [event("expression_of_concern", 0, "2025-03-04")],
        })),
        forrt: vi.fn(async () => forrtEnvelope()),
      },
    }));
    const expressionOutput = await expression.audit({ session_id: SESSION_ID, doi: DOI });
    expect(expressionOutput.bundle.claim_local_limitations.map(({ limitation }) => limitation))
      .toContain("This source cannot be the sole or decisive support for a claim until the expression-of-concern notice and affected content are audited.");

    const withdrawn = createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope({
          state: "active_retraction_or_withdrawal",
          events: [event("withdrawal", 0, "2025-03-04")],
        })),
        forrt: vi.fn(async () => forrtEnvelope()),
      },
    }));
    const withdrawnOutput = await withdrawn.audit({ session_id: SESSION_ID, doi: DOI });
    expect(withdrawnOutput.bundle.controller_directives.map(({ directive }) => directive))
      .toContain("exclude_source_from_effect_claims");
  });

  it("hashes normalized evidence deterministically and changes the hash for material provider evidence", async () => {
    const first = await createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => forrtEnvelope({ relationships: [relationship("failed")] })),
      },
    })).audit({ session_id: SESSION_ID, doi: DOI });
    const second = await createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => forrtEnvelope({ relationships: [relationship("failed")] })),
      },
    })).audit({ session_id: SESSION_ID, doi: DOI });
    const changed = await createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => forrtEnvelope({ relationships: [relationship("unexpected")] })),
      },
    })).audit({ session_id: SESSION_ID, doi: DOI });

    expect(second.bundle.bundle_hash).toBe(first.bundle.bundle_hash);
    expect(second.receipt.receipt_payload_sha256).toBe(first.receipt.receipt_payload_sha256);
    expect(changed.bundle.bundle_hash).not.toBe(first.bundle.bundle_hash);
  });

  it("rejects tampered, cross-session, cross-study, cross-protocol, cross-bundle, cross-artifact, and wrong-secret receipts", async () => {
    const output = await createStudyExternalEvidenceCoordinator(options({
      providers: {
        crossref: vi.fn(async () => crossrefEnvelope()),
        forrt: vi.fn(async () => forrtEnvelope({ relationships: [relationship()] })),
      },
    })).audit({ session_id: SESSION_ID, doi: DOI });
    const context = expectedReceiptContext(output);
    const tampered = { ...output.receipt, audit_status: "partial" as const };
    expect(() => verifyStudyExternalEvidenceReceipt(tampered, context, SECRET))
      .toThrow(StudyExternalEvidenceReceiptError);
    expect(() => verifyStudyExternalEvidenceReceipt(output.receipt, {
      ...context,
      sessionId: `ars1_${"B".repeat(32)}`,
    }, SECRET)).toThrow(StudyExternalEvidenceReceiptError);
    expect(() => verifyStudyExternalEvidenceReceipt(output.receipt, {
      ...context,
      studyIdentityHash: "1".repeat(64),
    }, SECRET)).toThrow(StudyExternalEvidenceReceiptError);
    expect(() => verifyStudyExternalEvidenceReceipt(output.receipt, {
      ...context,
      protocolIdentities: [
        { ...context.protocolIdentities[0], sha256: "2".repeat(64) },
        context.protocolIdentities[1],
      ],
    }, SECRET)).toThrow(StudyExternalEvidenceReceiptError);
    expect(() => verifyStudyExternalEvidenceReceipt(output.receipt, {
      ...context,
      bundleHash: "3".repeat(64),
    }, SECRET)).toThrow(StudyExternalEvidenceReceiptError);
    expect(() => verifyStudyExternalEvidenceReceipt(output.receipt, {
      ...context,
      providerArtifacts: context.providerArtifacts.map((artifact, index) =>
        index === 0 ? { ...artifact, content_sha256: "4".repeat(64) } : artifact
      ),
    }, SECRET)).toThrow(StudyExternalEvidenceReceiptError);
    expect(() => verifyStudyExternalEvidenceReceipt(
      output.receipt,
      context,
      "different-external-evidence-secret-32-bytes",
    )).toThrow(StudyExternalEvidenceReceiptError);
  });
});
