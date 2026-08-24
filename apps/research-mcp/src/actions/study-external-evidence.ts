import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  canonicalStudyIdentitySchema,
  externalEvidenceDirectiveSchema,
  externalEvidenceProviderSchema,
  externalProviderAttemptSchema,
  studyExternalEvidenceBundleSchema,
  type CanonicalStudyIdentity,
  type ClaimLocalExternalEvidenceLimitation,
  type ExternalEvidenceDirective,
  type ExternalEvidenceProvider,
  type ExternalProviderAttempt,
  type ExternalStudyRelationship,
  type ProvenanceEnvelope,
  type PublicationIntegrityEvent,
  type StudyExternalEvidenceBundle,
  type UnresolvedExternalEvidenceItem,
} from "@askrigor/contracts";
import type { ProtocolManifest } from "@askrigor/protocol";
import {
  checkCrossrefPublicationIntegrity,
  lookupForrtReplicationRelationships,
  normalizeDoiIdentifier,
  type CrossrefConfig,
  type CrossrefPublicationIntegrityData,
  type ForrtReplicationLookupData,
} from "@askrigor/sources";
import { z } from "zod";

import {
  createInMemoryEvidenceArtifactStore,
  evidenceArtifactDescriptorSchema,
  type EvidenceArtifactDescriptor,
  type EvidenceArtifactStore,
} from "./evidence-artifact-store.js";

const RECEIPT_DOMAIN = "askrigor.research.study-external-evidence";
const RECEIPT_KEY_DOMAIN = "askrigor:study-external-evidence-receipt:v1";
const MIN_SECRET_BYTES = 32;
const RECEIPT_LIMITATION =
  "This receipt proves server-owned provider execution, source identity, normalized structure, and integrity binding; it does not prove that provider assertions or AskRigor interpretations are scientifically true.";
const PROVIDER_SCOPE_LIMITATION =
  "Provider coverage is source-specific; no marker or no match is not proof that no concern, update, replication, reproduction, review, or contradiction exists elsewhere.";

const sessionIdSchema = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const doiInputSchema = z.string().trim().min(1).max(2_048);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const base64urlSha256Schema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const studyExternalEvidenceAuditInputSchema = z
  .object({
    session_id: sessionIdSchema,
    doi: doiInputSchema,
  })
  .strict();

const protocolReceiptIdentitySchema = z
  .object({
    protocol: z.enum(["universal", "hrp"]),
    name: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(100),
    revision_date: z.string().trim().min(1).max(100),
    sha256: sha256Schema,
  })
  .strict();

export const studyExternalEvidenceProtocolTupleSchema = z.tuple([
  protocolReceiptIdentitySchema.extend({ protocol: z.literal("universal") }).strict(),
  protocolReceiptIdentitySchema.extend({ protocol: z.literal("hrp") }).strict(),
]);

export const studyExternalEvidenceArtifactReferenceSchema = z
  .object({
    provider: externalEvidenceProviderSchema,
    artifact_id: evidenceArtifactDescriptorSchema.shape.artifact_id,
    artifact_kind: evidenceArtifactDescriptorSchema.shape.artifact_kind,
    content_sha256: sha256Schema,
    content_bytes: z.number().int().nonnegative().max(10 * 1_024 * 1_024),
  })
  .strict();

export const studyExternalEvidenceReceiptSchema = z
  .object({
    receipt_name: z.literal("askrigor_study_external_evidence"),
    receipt_version: z.literal("1.0"),
    domain: z.literal(RECEIPT_DOMAIN),
    audit_status: z.enum([
      "complete",
      "partial",
      "blocked_retryable",
      "bounded_nonretryable",
    ]),
    session_id: sessionIdSchema,
    study_identity_hash: sha256Schema,
    protocol_identities: studyExternalEvidenceProtocolTupleSchema,
    provider_attempts: z.array(externalProviderAttemptSchema).min(2).max(32),
    provider_artifacts: z
      .array(studyExternalEvidenceArtifactReferenceSchema)
      .min(2)
      .max(32),
    bundle_hash: sha256Schema,
    issued_at: z.string().datetime({ offset: true }),
    key_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u),
    receipt_payload_sha256: sha256Schema,
    signature: base64urlSha256Schema,
    limitations: z.tuple([z.literal(RECEIPT_LIMITATION), z.literal(PROVIDER_SCOPE_LIMITATION)]),
  })
  .strict();

export const studyExternalEvidenceAuditOutputSchema = z
  .object({
    status: studyExternalEvidenceReceiptSchema.shape.audit_status,
    study_identity: canonicalStudyIdentitySchema,
    bundle: studyExternalEvidenceBundleSchema,
    provider_artifacts: z
      .array(studyExternalEvidenceArtifactReferenceSchema)
      .min(2)
      .max(32),
    receipt: studyExternalEvidenceReceiptSchema,
  })
  .strict()
  .superRefine((output, context) => {
    const mismatches: Array<[string, boolean]> = [
      ["status", output.status !== output.receipt.audit_status],
      [
        "study_identity",
        canonicalJson(output.study_identity) !==
          canonicalJson(output.bundle.study_identity) ||
          output.study_identity.identity_hash !== output.receipt.study_identity_hash,
      ],
      ["bundle", output.bundle.bundle_hash !== output.receipt.bundle_hash],
      [
        "provider_artifacts",
        canonicalJson(output.provider_artifacts) !==
          canonicalJson(output.receipt.provider_artifacts),
      ],
      [
        "provider_attempts",
        canonicalJson(output.bundle.provider_attempts) !==
          canonicalJson(output.receipt.provider_attempts),
      ],
    ];
    for (const [path, mismatched] of mismatches) {
      if (!mismatched) continue;
      context.addIssue({
        code: "custom",
        path: [path],
        message: "external evidence output is internally inconsistent",
      });
    }
  });

export type StudyExternalEvidenceAuditInput = z.output<
  typeof studyExternalEvidenceAuditInputSchema
>;
export type StudyExternalEvidenceReceipt = z.output<
  typeof studyExternalEvidenceReceiptSchema
>;
export type StudyExternalEvidenceAuditOutput = z.output<
  typeof studyExternalEvidenceAuditOutputSchema
>;
export type StudyExternalEvidenceProtocolTuple = z.output<
  typeof studyExternalEvidenceProtocolTupleSchema
>;

interface ProviderExecutors {
  crossref(
    doi: string,
    config: CrossrefConfig,
  ): Promise<ProvenanceEnvelope<CrossrefPublicationIntegrityData>>;
  forrt(doi: string): Promise<ProvenanceEnvelope<ForrtReplicationLookupData>>;
}

export interface StudyExternalEvidenceCoordinatorOptions {
  protocolManifests: {
    universal: ProtocolManifest;
    hrp: ProtocolManifest;
  };
  crossrefConfig: CrossrefConfig;
  receiptSecret: string;
  receiptKeyId: string;
  artifactStore?: EvidenceArtifactStore;
  now?: () => Date;
  providers?: Partial<ProviderExecutors>;
}

export interface StudyExternalEvidenceCoordinator {
  audit(input: StudyExternalEvidenceAuditInput): Promise<StudyExternalEvidenceAuditOutput>;
}

export class StudyExternalEvidenceIdentityError extends Error {
  constructor(
    public readonly retryable: boolean,
    message = "Crossref did not verify the exact study DOI; external evidence audit cannot continue",
  ) {
    super(message);
    this.name = "StudyExternalEvidenceIdentityError";
  }
}

export class StudyExternalEvidenceReceiptError extends Error {
  constructor(message = "Study external-evidence receipt is invalid or mismatched") {
    super(message);
    this.name = "StudyExternalEvidenceReceiptError";
  }
}

export function createStudyExternalEvidenceCoordinator(
  options: StudyExternalEvidenceCoordinatorOptions,
): StudyExternalEvidenceCoordinator {
  validateReceiptSecret(options.receiptSecret);
  const keyId = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u).parse(options.receiptKeyId);
  const protocolIdentities = protocolTuple(options.protocolManifests);
  const artifactStore = options.artifactStore ?? createInMemoryEvidenceArtifactStore();
  const now = options.now ?? (() => new Date());
  const providers: ProviderExecutors = {
    crossref: options.providers?.crossref ?? checkCrossrefPublicationIntegrity,
    forrt: options.providers?.forrt ?? lookupForrtReplicationRelationships,
  };

  return Object.freeze({
    async audit(rawInput: StudyExternalEvidenceAuditInput) {
      const input = studyExternalEvidenceAuditInputSchema.parse(rawInput);
      const doi = normalizeDoiIdentifier(input.doi);
      if (doi === undefined) throw new StudyExternalEvidenceIdentityError(false);

      const crossref = await providers.crossref(doi, options.crossrefConfig);
      const identity = verifiedIdentity(crossref, doi);
      const forrt = await providers.forrt(doi);
      const issuedAt = validDate(now).toISOString();
      const crossrefArtifact = storeProviderEnvelope(
        artifactStore,
        "crossref",
        doi,
        crossref,
      );
      const forrtArtifact = storeProviderEnvelope(
        artifactStore,
        "forrt",
        doi,
        forrt,
      );
      const providerArtifacts = [crossrefArtifact, forrtArtifact]
        .map(artifactReference)
        .sort(compareArtifactReferences);
      const providerAttempts = [
        crossrefAttempt(crossref, doi, crossrefArtifact.content_sha256),
        forrtAttempt(forrt, doi, forrtArtifact.content_sha256),
        ...unconfiguredProviderAttempts(doi, issuedAt),
      ].sort(compareProviderAttempts);
      const status = deriveAuditStatus(forrt);
      const derived = deriveExternalEvidenceState(
        crossref,
        forrt,
        providerAttempts,
      );
      const bundle = createStudyExternalEvidenceBundle({
        studyIdentity: identity,
        providerAttempts,
        publicationRecordState: crossref.data.record_state,
        publicationEvents: crossref.data.events,
        publicationLimitations: crossref.limitations,
        relationships: forrt.data.relationships,
        directives: derived.directives,
        unresolvedItems: derived.unresolvedItems,
        claimLocalLimitations: derived.claimLocalLimitations,
      });
      const receipt = issueStudyExternalEvidenceReceipt({
        auditStatus: status,
        sessionId: input.session_id,
        studyIdentityHash: identity.identity_hash,
        protocolIdentities,
        providerAttempts,
        providerArtifacts,
        bundleHash: bundle.bundle_hash,
        issuedAt,
        keyId,
        secret: options.receiptSecret,
      });
      return studyExternalEvidenceAuditOutputSchema.parse({
        status,
        study_identity: identity,
        bundle,
        provider_artifacts: providerArtifacts,
        receipt,
      });
    },
  });
}

export function computeStudyExternalEvidenceBundleHash(
  bundle: Omit<StudyExternalEvidenceBundle, "bundle_hash">,
): string {
  return sha256(canonicalJson(bundle));
}

export function verifyStudyExternalEvidenceReceipt(
  rawReceipt: StudyExternalEvidenceReceipt,
  expected: {
    sessionId: string;
    studyIdentityHash: string;
    protocolIdentities: StudyExternalEvidenceProtocolTuple;
    providerAttempts: ExternalProviderAttempt[];
    providerArtifacts: z.output<typeof studyExternalEvidenceArtifactReferenceSchema>[];
    bundleHash: string;
  },
  secret: string,
): StudyExternalEvidenceReceipt {
  validateReceiptSecret(secret);
  const parsed = studyExternalEvidenceReceiptSchema.safeParse(rawReceipt);
  if (!parsed.success) throw new StudyExternalEvidenceReceiptError();
  const receipt = parsed.data;
  const expectedProtocols = studyExternalEvidenceProtocolTupleSchema.parse(
    expected.protocolIdentities,
  );
  const expectedAttempts = z.array(externalProviderAttemptSchema).parse(
    expected.providerAttempts,
  );
  const expectedArtifacts = z
    .array(studyExternalEvidenceArtifactReferenceSchema)
    .parse(expected.providerArtifacts);
  const expectedContext = {
    session_id: sessionIdSchema.parse(expected.sessionId),
    study_identity_hash: sha256Schema.parse(expected.studyIdentityHash),
    protocol_identities: expectedProtocols,
    provider_attempts: expectedAttempts,
    provider_artifacts: expectedArtifacts,
    bundle_hash: sha256Schema.parse(expected.bundleHash),
  };
  if (
    canonicalJson({
      session_id: receipt.session_id,
      study_identity_hash: receipt.study_identity_hash,
      protocol_identities: receipt.protocol_identities,
      provider_attempts: receipt.provider_attempts,
      provider_artifacts: receipt.provider_artifacts,
      bundle_hash: receipt.bundle_hash,
    }) !== canonicalJson(expectedContext)
  ) {
    throw new StudyExternalEvidenceReceiptError();
  }
  const unsigned = unsignedReceipt(receipt);
  const payload = canonicalJson(unsigned);
  if (receipt.receipt_payload_sha256 !== sha256(payload)) {
    throw new StudyExternalEvidenceReceiptError();
  }
  const expectedSignature = createHmac("sha256", receiptSigningKey(secret))
    .update(payload)
    .digest();
  const suppliedSignature = Buffer.from(receipt.signature, "base64url");
  if (
    suppliedSignature.toString("base64url") !== receipt.signature ||
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new StudyExternalEvidenceReceiptError();
  }
  return receipt;
}

function verifiedIdentity(
  envelope: ProvenanceEnvelope<CrossrefPublicationIntegrityData>,
  doi: string,
): CanonicalStudyIdentity {
  const expectedUrl = `https://doi.org/${doi}`;
  if (
    envelope.provider !== "crossref" ||
    envelope.record_type !== "publication_integrity" ||
    envelope.primary_identifier !== doi ||
    envelope.data.doi !== doi ||
    envelope.error !== undefined ||
    envelope.access_status !== "metadata_only" ||
    envelope.source_identity.canonical_url !== expectedUrl
  ) {
    throw new StudyExternalEvidenceIdentityError(envelope.error?.retryable === true);
  }
  const core = {
    doi,
    ...(envelope.source_identity.title === undefined
      ? {}
      : { title: envelope.source_identity.title }),
    ...(envelope.source_identity.authors_or_channel?.[0] === undefined
      ? {}
      : { first_author: envelope.source_identity.authors_or_channel[0] }),
    identity_status: "verified" as const,
    identity_basis: ["crossref_exact_doi" as const],
  };
  return canonicalStudyIdentitySchema.parse({
    ...core,
    identity_hash: sha256(canonicalJson(core)),
  });
}

function createStudyExternalEvidenceBundle(input: {
  studyIdentity: CanonicalStudyIdentity;
  providerAttempts: ExternalProviderAttempt[];
  publicationRecordState: StudyExternalEvidenceBundle["publication_integrity"]["record_state"];
  publicationEvents: PublicationIntegrityEvent[];
  publicationLimitations: string[];
  relationships: ExternalStudyRelationship[];
  directives: ExternalEvidenceDirective[];
  unresolvedItems: UnresolvedExternalEvidenceItem[];
  claimLocalLimitations: ClaimLocalExternalEvidenceLimitation[];
}): StudyExternalEvidenceBundle {
  const core = {
    packet_name: "study_external_evidence_bundle" as const,
    packet_version: "1.0" as const,
    study_identity: input.studyIdentity,
    provider_attempts: input.providerAttempts,
    publication_integrity: {
      record_state: input.publicationRecordState,
      events: input.publicationEvents,
      limitations: input.publicationLimitations,
    },
    replication_relationships: input.relationships,
    postpublication_threads: [],
    citation_contexts: [],
    review_ancestry: [],
    imported_risk_of_bias: [],
    controller_directives: input.directives,
    unresolved_items: input.unresolvedItems,
    claim_local_limitations: input.claimLocalLimitations,
  };
  return studyExternalEvidenceBundleSchema.parse({
    ...core,
    bundle_hash: computeStudyExternalEvidenceBundleHash(core),
  });
}

function deriveExternalEvidenceState(
  crossref: ProvenanceEnvelope<CrossrefPublicationIntegrityData>,
  forrt: ProvenanceEnvelope<ForrtReplicationLookupData>,
  providerAttempts: ExternalProviderAttempt[],
): {
  directives: ExternalEvidenceDirective[];
  unresolvedItems: UnresolvedExternalEvidenceItem[];
  claimLocalLimitations: ClaimLocalExternalEvidenceLimitation[];
} {
  const directives: ExternalEvidenceDirective[] = [];
  const unresolvedItems: UnresolvedExternalEvidenceItem[] = [];
  const claimLocalLimitations: ClaimLocalExternalEvidenceLimitation[] = [];

  for (const event of crossref.data.events) {
    const impact = eventImpact(event.event_kind);
    unresolvedItems.push({
      item_id: `publication_event:${event.event_hash}`,
      source_item_hash: event.event_hash,
      possible_decision_impact: impact,
      reason: `The ${event.event_kind.replaceAll("_", " ")} notice and affected study content have not yet been compared.`,
      retryable: true,
    });
    directives.push(directive(
      "require_update_notice_audit",
      event.event_hash,
      `Inspect the ${event.event_kind.replaceAll("_", " ")} notice and affected source version before ordinary evidential use.`,
    ));
    if (
      crossref.data.record_state === "active_retraction_or_withdrawal" &&
      (event.event_kind === "retraction" || event.event_kind === "withdrawal")
    ) {
      directives.push(directive(
        "exclude_source_from_effect_claims",
        event.event_hash,
        "An active retraction or withdrawal assertion prevents ordinary effect-claim use until the exact history is resolved.",
      ));
      claimLocalLimitations.push({
        claim_id: `publication_event:${event.event_hash}`,
        limitation: "This source is excluded from ordinary effect claims while the retraction or withdrawal remains active and unresolved.",
        source_item_hashes: [event.event_hash],
      });
    }
    if (event.event_kind === "expression_of_concern") {
      claimLocalLimitations.push({
        claim_id: `publication_event:${event.event_hash}`,
        limitation: "This source cannot be the sole or decisive support for a claim until the expression-of-concern notice and affected content are audited.",
        source_item_hashes: [event.event_hash],
      });
    }
    if (event.event_kind === "correction" || event.event_kind === "update") {
      directives.push(directive(
        "invalidate_prior_source_audit",
        event.event_hash,
        "A correction or update requires the prior content-bound audit to be revalidated against the current source version.",
      ));
      claimLocalLimitations.push({
        claim_id: `publication_event:${event.event_hash}`,
        limitation: "Any prior content-bound claim capability remains invalid until the correction or update is compared with the audited source version.",
        source_item_hashes: [event.event_hash],
      });
    }
    if (event.event_kind === "reinstatement") {
      claimLocalLimitations.push({
        claim_id: `publication_event:${event.event_hash}`,
        limitation: "Normal claim capability is not restored solely by the reinstatement marker; the reinstatement notice and affected source history require audit.",
        source_item_hashes: [event.event_hash],
      });
    }
  }

  for (const relationship of forrt.data.relationships) {
    directives.push(directive(
      "require_linked_replication_acquisition",
      relationship.relationship_hash,
      "Acquire and audit the linked repetition before treating the provider-reported outcome as evidence.",
    ));
    unresolvedItems.push({
      item_id: `linked_repetition:${relationship.relationship_hash}`,
      source_item_hash: relationship.relationship_hash,
      possible_decision_impact: "confidence_changing",
      reason: "The repetition's implementation match, methods, result, and source have not been audited.",
      retryable: true,
    });
    claimLocalLimitations.push({
      claim_id: `replication_relationship:${relationship.relationship_hash}`,
      limitation: "The relationship and outcome are provider-reported leads, not an audited replication or reproduction conclusion.",
      source_item_hashes: [relationship.relationship_hash],
    });
  }

  for (const attempt of providerAttempts.filter(
    ({ provider_outcome }) => provider_outcome === "not_configured",
  )) {
    const attemptHash = sha256(canonicalJson(attempt));
    directives.push(directive(
      "disclose_provider_coverage_gap",
      attemptHash,
      `${attempt.provider} was not configured and its coverage must remain an explicit limitation.`,
    ));
    claimLocalLimitations.push({
      claim_id: `provider_coverage:${attempt.provider}`,
      limitation: attempt.limitations[0]!,
      source_item_hashes: [attemptHash],
    });
  }

  for (const [claimId, limitations, sourceHashes] of [
    ["crossref_publication_integrity", crossref.limitations, crossref.data.events.map(({ event_hash }) => event_hash)],
    ["forrt_relationship_coverage", [...forrt.limitations, forrt.data.coverage_statement], forrt.data.relationships.map(({ relationship_hash }) => relationship_hash)],
  ] as const) {
    if (limitations.length === 0) continue;
    claimLocalLimitations.push({
      claim_id: claimId,
      limitation: [...new Set(limitations)].join(" ").slice(0, 4_000),
      source_item_hashes: sourceHashes.slice(0, 100),
    });
  }

  return {
    directives: uniqueByHash(directives, (item) => `${item.directive}:${item.source_item_hash}`)
      .sort((left, right) => `${left.source_item_hash}:${left.directive}`.localeCompare(`${right.source_item_hash}:${right.directive}`)),
    unresolvedItems: uniqueByHash(unresolvedItems, ({ item_id }) => item_id)
      .sort((left, right) => left.item_id.localeCompare(right.item_id)),
    claimLocalLimitations: uniqueByHash(claimLocalLimitations, ({ claim_id }) => claim_id)
      .sort((left, right) => left.claim_id.localeCompare(right.claim_id)),
  };
}

function directive(
  value: ExternalEvidenceDirective["directive"],
  sourceItemHash: string,
  reason: string,
): ExternalEvidenceDirective {
  return externalEvidenceDirectiveSchema.parse({
    directive: value,
    source_item_hash: sourceItemHash,
    reason,
  });
}

function eventImpact(
  kind: PublicationIntegrityEvent["event_kind"],
): UnresolvedExternalEvidenceItem["possible_decision_impact"] {
  if (["retraction", "withdrawal", "expression_of_concern", "reinstatement"].includes(kind)) {
    return "potentially_conclusion_changing";
  }
  if (kind === "correction" || kind === "update") return "confidence_changing";
  return "unknown";
}

function crossrefAttempt(
  envelope: ProvenanceEnvelope<CrossrefPublicationIntegrityData>,
  doi: string,
  responseHash: string,
): ExternalProviderAttempt {
  return externalProviderAttemptSchema.parse({
    provider: "crossref",
    checked_at: envelope.retrieved_at,
    access_status: envelope.access_status,
    provider_outcome: envelope.error === undefined ? "records_available" : providerOutcome(envelope),
    query_identifier: doi,
    provider_response_hash: responseHash,
    coverage_statement: "Crossref publication-integrity metadata for this exact DOI was checked; it is provider-scoped metadata, not a study-quality verdict.",
    limitations: envelope.limitations,
    ...(envelope.error === undefined ? {} : { error: normalizedError(envelope.error) }),
  });
}

function forrtAttempt(
  envelope: ProvenanceEnvelope<ForrtReplicationLookupData>,
  doi: string,
  responseHash: string,
): ExternalProviderAttempt {
  const outcome = envelope.error !== undefined
    ? providerOutcome(envelope)
    : envelope.access_status === "partial"
      ? "partial"
      : envelope.data.lookup_status;
  return externalProviderAttemptSchema.parse({
    provider: "forrt",
    checked_at: envelope.retrieved_at,
    access_status: envelope.access_status,
    provider_outcome: outcome,
    query_identifier: doi,
    provider_response_hash: responseHash,
    coverage_statement: envelope.data.coverage_statement,
    limitations: envelope.limitations,
    ...(envelope.error === undefined ? {} : { error: normalizedError(envelope.error) }),
  });
}

function unconfiguredProviderAttempts(
  doi: string,
  checkedAt: string,
): ExternalProviderAttempt[] {
  return ([
    "retraction_watch",
    "pubpeer",
    "epistemonikos",
    "scite",
  ] as const).map((provider) => externalProviderAttemptSchema.parse({
    provider,
    checked_at: checkedAt,
    access_status: "inaccessible",
    provider_outcome: "not_configured",
    query_identifier: doi,
    coverage_statement: `${provider} is an optional external-evidence source that is not configured in this release.`,
    limitations: [`${provider} was not queried because its authorized integration is not configured; no favorable or unfavorable inference is permitted.`],
  }));
}

function providerOutcome(
  envelope: ProvenanceEnvelope<unknown>,
): ExternalProviderAttempt["provider_outcome"] {
  if (envelope.access_status === "rate_limited") return "rate_limited";
  if (envelope.access_status === "inaccessible") return "inaccessible";
  if (envelope.access_status === "not_found") return "not_found";
  if (envelope.access_status === "partial") return "partial";
  return "error";
}

function normalizedError(error: NonNullable<ProvenanceEnvelope<unknown>["error"]>) {
  return {
    code: error.code.slice(0, 200),
    message: error.message.slice(0, 500),
    retryable: error.retryable === true,
    ...(error.http_status === undefined ? {} : { http_status: error.http_status }),
  };
}

function deriveAuditStatus(
  forrt: ProvenanceEnvelope<ForrtReplicationLookupData>,
): StudyExternalEvidenceReceipt["audit_status"] {
  if (forrt.error?.retryable === true) return "blocked_retryable";
  if (forrt.error !== undefined) return "bounded_nonretryable";
  if (forrt.access_status === "partial") return "partial";
  return "complete";
}

function storeProviderEnvelope(
  store: EvidenceArtifactStore,
  provider: "crossref" | "forrt",
  doi: string,
  envelope: ProvenanceEnvelope<unknown>,
): EvidenceArtifactDescriptor {
  return store.put({
    artifactKind: "normalized_provider_envelope",
    provider,
    sourceIdentifier: doi,
    mediaType: "application/json",
    content: Buffer.from(canonicalJson(envelope), "utf8"),
  });
}

function artifactReference(
  artifact: EvidenceArtifactDescriptor,
): z.output<typeof studyExternalEvidenceArtifactReferenceSchema> {
  return studyExternalEvidenceArtifactReferenceSchema.parse({
    provider: artifact.provider,
    artifact_id: artifact.artifact_id,
    artifact_kind: artifact.artifact_kind,
    content_sha256: artifact.content_sha256,
    content_bytes: artifact.content_bytes,
  });
}

function issueStudyExternalEvidenceReceipt(input: {
  auditStatus: StudyExternalEvidenceReceipt["audit_status"];
  sessionId: string;
  studyIdentityHash: string;
  protocolIdentities: StudyExternalEvidenceProtocolTuple;
  providerAttempts: ExternalProviderAttempt[];
  providerArtifacts: z.output<typeof studyExternalEvidenceArtifactReferenceSchema>[];
  bundleHash: string;
  issuedAt: string;
  keyId: string;
  secret: string;
}): StudyExternalEvidenceReceipt {
  const unsigned = {
    receipt_name: "askrigor_study_external_evidence" as const,
    receipt_version: "1.0" as const,
    domain: RECEIPT_DOMAIN,
    audit_status: input.auditStatus,
    session_id: input.sessionId,
    study_identity_hash: input.studyIdentityHash,
    protocol_identities: input.protocolIdentities,
    provider_attempts: input.providerAttempts,
    provider_artifacts: input.providerArtifacts,
    bundle_hash: input.bundleHash,
    issued_at: input.issuedAt,
    key_id: input.keyId,
    limitations: [RECEIPT_LIMITATION, PROVIDER_SCOPE_LIMITATION] as const,
  };
  const payload = canonicalJson(unsigned);
  return studyExternalEvidenceReceiptSchema.parse({
    ...unsigned,
    receipt_payload_sha256: sha256(payload),
    signature: createHmac("sha256", receiptSigningKey(input.secret))
      .update(payload)
      .digest("base64url"),
  });
}

function unsignedReceipt(receipt: StudyExternalEvidenceReceipt) {
  const {
    receipt_payload_sha256: _payloadHash,
    signature: _signature,
    ...unsigned
  } = receipt;
  return unsigned;
}

function protocolTuple(input: {
  universal: ProtocolManifest;
  hrp: ProtocolManifest;
}): StudyExternalEvidenceProtocolTuple {
  return studyExternalEvidenceProtocolTupleSchema.parse([
    {
      protocol: "universal",
      name: input.universal.name,
      version: input.universal.version,
      revision_date: input.universal.revisionDate,
      sha256: input.universal.sha256,
    },
    {
      protocol: "hrp",
      name: input.hrp.name,
      version: input.hrp.version,
      revision_date: input.hrp.revisionDate,
      sha256: input.hrp.sha256,
    },
  ]);
}

function compareProviderAttempts(
  left: ExternalProviderAttempt,
  right: ExternalProviderAttempt,
): number {
  return left.provider.localeCompare(right.provider);
}

function compareArtifactReferences(
  left: z.output<typeof studyExternalEvidenceArtifactReferenceSchema>,
  right: z.output<typeof studyExternalEvidenceArtifactReferenceSchema>,
): number {
  return `${left.provider}:${left.artifact_id}`.localeCompare(
    `${right.provider}:${right.artifact_id}`,
  );
}

function uniqueByHash<T>(values: T[], key: (value: T) => string): T[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function receiptSigningKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(RECEIPT_KEY_DOMAIN).digest();
}

function validateReceiptSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("Study external-evidence receipt secret must contain at least 32 UTF-8 bytes");
  }
}

function validDate(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Invalid study external-evidence clock");
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
