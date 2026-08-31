import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";

import { sha256 } from "./hash.js";

export const PUBLIC_PROLACTINOMA_GAP_SLUG =
  "prolactinoma-spontaneous-remission";

export const publicEvidenceGapDefinition = Object.freeze({
  slug: PUBLIC_PROLACTINOMA_GAP_SLUG,
  title: "What precedes spontaneous prolactinoma remission?",
  researchQuestion:
    "What health, hormonal, treatment, environmental, or life transitions precede reported treatment-free prolactinoma remission or regression, compared with similar people whose prolactinomas do not remit?",
  known:
    "Remission and regression are reported in several contexts, but submitted cases cannot establish frequency or causation on their own.",
  unresolved:
    "Timing, treatment context, documentation, and comparison-case coverage remain incomplete.",
  comparisonNeed:
    "A similar exposure without remission is just as valuable because it helps test whether the transition distinguishes outcomes.",
  targetPopulations: [
    "Untreated remission",
    "Untreated non-remission",
    "Pregnancy or postpartum remission",
    "Pregnancy or postpartum non-remission",
    "Menopause remission",
    "Menopause non-remission",
    "Dopamine-agonist withdrawal remission",
    "Dopamine-agonist withdrawal recurrence",
    "Possible apoplexy before regression",
    "Breast implant or explant with longitudinal follow-up",
  ],
});

export const publicGapProvenanceSchema = z.enum([
  "SELF",
  "DIRECT_OBSERVER",
  "SUBJECT_RELAYED",
  "HEARSAY",
]);

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().nullable();

export const publicGapDetailsSchema = z
  .object({
    outcome: z
      .enum([
        "REPORTED_REMISSION",
        "BIOCHEMICAL_REMISSION",
        "IMAGING_REGRESSION",
        "NO_VISIBLE_LESION_REPORTED",
        "STABLE",
        "PROGRESSION",
        "RECURRENCE",
        "UNCLEAR",
      ])
      .optional()
      .nullable(),
    exposure: z
      .enum([
        "PREGNANCY_POSTPARTUM",
        "MENOPAUSE",
        "POSSIBLE_APOPLEXY",
        "DOPAMINE_AGONIST_WITHDRAWAL",
        "BREAST_IMPLANT",
        "BREAST_EXPLANT",
        "MAJOR_ILLNESS",
        "MEDICATION_CHANGE",
        "STRESS_STATE_CHANGE",
        "OTHER_TRANSITION",
        "NO_SUSPECTED_TRANSITION",
        "UNKNOWN",
      ])
      .optional()
      .nullable(),
    treatmentContext: z
      .enum([
        "NO_PRIOR_DOPAMINE_AGONIST",
        "PREVIOUSLY_TREATED",
        "CURRENTLY_TREATED",
        "TREATMENT_WITHDRAWN",
        "SURGERY",
        "RADIATION",
        "UNKNOWN",
      ])
      .optional()
      .nullable(),
    diagnosisYear: z.number().int().min(1900).max(2100).optional().nullable(),
    transitionTiming: optionalText(240),
    prolactinBefore: optionalText(120),
    prolactinAfter: optionalText(120),
    tumorBefore: optionalText(160),
    tumorAfter: optionalText(160),
    otherChanges: optionalText(1_500),
    baselineDocumented: z.boolean().optional(),
    followupDocumented: z.boolean().optional(),
  })
  .strict();

export const publicGapConsentSchema = z
  .object({
    privateGptAnalysis: z.literal(true),
    deidentifiedAggregateUse: z.boolean(),
    futureFollowup: z.boolean(),
    noticeVersion: z.enum([
      "public-gap-intake-v1",
      "public-gap-intake-v2-2026-08-31",
    ]),
    observationalAcknowledgement: z.literal(true),
  })
  .strict();

export type PublicGapProvenance = z.infer<typeof publicGapProvenanceSchema>;
export type PublicGapDetails = z.infer<typeof publicGapDetailsSchema>;
export type PublicGapConsent = z.infer<typeof publicGapConsentSchema>;
export type PublicGapCompleteness = "DRAFT" | "PARTIAL" | "SUBSTANTIAL";
export type PublicGapSubmissionStatus = "DRAFT" | "SUBMITTED" | "WITHDRAWN";

export interface EncryptedNarrative {
  keyId: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
}

export interface PublicGapSubmissionRecord {
  submissionId: string;
  gapSlug: string;
  participantPseudonym: string;
  recoveryKeySha256: string;
  provenance: PublicGapProvenance;
  narrative: EncryptedNarrative | null;
  details: PublicGapDetails;
  consent: PublicGapConsent | null;
  status: PublicGapSubmissionStatus;
  completenessLabel: PublicGapCompleteness;
  missingFields: string[];
  createdAt: string;
  narrativeSavedAt: string | null;
  structuredSavedAt: string | null;
  submittedAt: string | null;
  withdrawnAt: string | null;
  updatedAt: string;
}

export interface PublicGapIntakeStore {
  create(record: PublicGapSubmissionRecord): Promise<void>;
  get(submissionId: string): Promise<PublicGapSubmissionRecord | null>;
  saveNarrative(input: {
    submissionId: string;
    recoveryKeySha256: string;
    narrative: EncryptedNarrative;
    at: string;
  }): Promise<PublicGapSubmissionRecord>;
  saveDetails(input: {
    submissionId: string;
    recoveryKeySha256: string;
    details: PublicGapDetails;
    completenessLabel: PublicGapCompleteness;
    missingFields: string[];
    at: string;
  }): Promise<PublicGapSubmissionRecord>;
  submit(input: {
    submissionId: string;
    recoveryKeySha256: string;
    consent: PublicGapConsent;
    at: string;
  }): Promise<PublicGapSubmissionRecord>;
  withdraw(input: {
    submissionId: string;
    recoveryKeySha256: string;
    at: string;
  }): Promise<PublicGapSubmissionRecord>;
  listSubmitted(gapSlug: string): Promise<PublicGapSubmissionRecord[]>;
}

export interface PublicGapParticipantView {
  submissionId: string;
  participantPseudonym: string;
  gapSlug: string;
  provenance: PublicGapProvenance;
  narrative: string | null;
  details: PublicGapDetails;
  consent: PublicGapConsent | null;
  status: PublicGapSubmissionStatus;
  completenessLabel: PublicGapCompleteness;
  partial: boolean;
  missingFields: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicGapReviewItem {
  submissionId: string;
  participantPseudonym: string;
  provenance: PublicGapProvenance;
  status: "SUBMITTED";
  evidenceLevel: "L1_STRUCTURED_CASE";
  verificationStatus: "PARTICIPANT_REPORTED_UNVERIFIED";
  completenessLabel: Exclude<PublicGapCompleteness, "DRAFT">;
  partial: boolean;
  missingFields: string[];
  structuredCase: PublicGapDetails;
  structuredContactPatternsRedacted: boolean;
  narrativeForPrivateGptReview: string;
  narrativePrivacyTransform:
    | "BASIC_CONTACT_REDACTION_APPLIED"
    | "NO_CONTACT_PATTERN_DETECTED";
  privacyLimitations: string[];
  submittedAt: string;
}

export interface PublicEvidenceGapIntakeOptions {
  store: PublicGapIntakeStore;
  encryptionKey: Uint8Array;
  encryptionKeyId: string;
  now?: () => string;
  random?: (size: number) => Uint8Array;
  randomUuid?: () => string;
}

export class PublicEvidenceGapIntakeService {
  private readonly encryptionKey: Buffer;
  private readonly keyId: string;
  private readonly now: () => string;
  private readonly createRandom: (size: number) => Uint8Array;
  private readonly createUuid: () => string;

  constructor(
    private readonly store: PublicGapIntakeStore,
    options: Omit<PublicEvidenceGapIntakeOptions, "store">,
  ) {
    this.encryptionKey = Buffer.from(options.encryptionKey);
    if (this.encryptionKey.byteLength !== 32) {
      throw new Error("PUBLIC_GAP_ENCRYPTION_KEY_INVALID");
    }
    this.keyId = z
      .string()
      .regex(/^[A-Za-z0-9._-]{1,100}$/u)
      .parse(options.encryptionKeyId);
    this.now = options.now ?? (() => new Date().toISOString());
    this.createRandom = options.random ?? randomBytes;
    this.createUuid = options.randomUuid ?? randomUUID;
  }

  async start(input: {
    gapSlug: unknown;
    provenance: unknown;
  }): Promise<{
    submissionId: string;
    participantPseudonym: string;
    recoveryKey: string;
    nextStep: "UNPROMPTED_ACCOUNT";
  }> {
    const gapSlug = validateGapSlug(input.gapSlug);
    const provenance = publicGapProvenanceSchema.parse(input.provenance);
    const submissionId = this.createUuid();
    const participantPseudonym = `ARCASE-${Buffer.from(
      this.createRandom(8),
    )
      .toString("hex")
      .slice(0, 12)
      .toUpperCase()}`;
    const recoveryKey = Buffer.from(this.createRandom(32)).toString("base64url");
    const at = this.now();
    await this.store.create({
      submissionId,
      gapSlug,
      participantPseudonym,
      recoveryKeySha256: sha256(recoveryKey),
      provenance,
      narrative: null,
      details: {},
      consent: null,
      status: "DRAFT",
      completenessLabel: "DRAFT",
      missingFields: [],
      createdAt: at,
      narrativeSavedAt: null,
      structuredSavedAt: null,
      submittedAt: null,
      withdrawnAt: null,
      updatedAt: at,
    });
    return {
      submissionId,
      participantPseudonym,
      recoveryKey,
      nextStep: "UNPROMPTED_ACCOUNT",
    };
  }

  async saveNarrative(
    submissionId: unknown,
    recoveryKey: unknown,
    narrativeInput: unknown,
  ): Promise<{ nextStep: "STRUCTURED_DETAILS" }> {
    const id = validateSubmissionId(submissionId);
    const key = validateRecoveryKey(recoveryKey);
    const narrative = z.string().trim().min(3).max(8_000).parse(narrativeInput);
    const record = await this.requireOwn(id, key);
    if (record.narrative !== null) {
      throw new Error("PUBLIC_GAP_NARRATIVE_ALREADY_SAVED");
    }
    const at = this.now();
    await this.store.saveNarrative({
      submissionId: id,
      recoveryKeySha256: sha256(key),
      narrative: encryptNarrative(
        narrative,
        this.encryptionKey,
        this.keyId,
        `${id}:${record.gapSlug}:narrative`,
        this.createRandom,
      ),
      at,
    });
    return { nextStep: "STRUCTURED_DETAILS" };
  }

  async saveDetails(
    submissionId: unknown,
    recoveryKey: unknown,
    detailsInput: unknown,
  ): Promise<{
    completenessLabel: Exclude<PublicGapCompleteness, "DRAFT">;
    partial: boolean;
    missingFields: string[];
    nextStep: "CONSENT_AND_SUBMIT";
  }> {
    const id = validateSubmissionId(submissionId);
    const key = validateRecoveryKey(recoveryKey);
    const details = publicGapDetailsSchema.parse(detailsInput);
    const record = await this.requireOwn(id, key);
    if (record.narrative === null) {
      throw new Error("PUBLIC_GAP_UNPROMPTED_ACCOUNT_REQUIRED_FIRST");
    }
    const missingFields = computeMissingFields(details);
    const completenessLabel = missingFields.length === 0 ? "SUBSTANTIAL" : "PARTIAL";
    await this.store.saveDetails({
      submissionId: id,
      recoveryKeySha256: sha256(key),
      details,
      completenessLabel,
      missingFields,
      at: this.now(),
    });
    return {
      completenessLabel,
      partial: completenessLabel === "PARTIAL",
      missingFields,
      nextStep: "CONSENT_AND_SUBMIT",
    };
  }

  async submit(
    submissionId: unknown,
    recoveryKey: unknown,
    consentInput: unknown,
  ): Promise<PublicGapParticipantView> {
    const id = validateSubmissionId(submissionId);
    const key = validateRecoveryKey(recoveryKey);
    const consent = publicGapConsentSchema.parse(consentInput);
    const record = await this.requireOwn(id, key);
    if (record.narrative === null) {
      throw new Error("PUBLIC_GAP_UNPROMPTED_ACCOUNT_REQUIRED_FIRST");
    }
    if (record.structuredSavedAt === null) {
      throw new Error("PUBLIC_GAP_STRUCTURED_STEP_REQUIRED");
    }
    const submitted = await this.store.submit({
      submissionId: id,
      recoveryKeySha256: sha256(key),
      consent,
      at: this.now(),
    });
    return this.participantView(submitted);
  }

  async inspect(
    submissionId: unknown,
    recoveryKey: unknown,
  ): Promise<PublicGapParticipantView> {
    return this.participantView(
      await this.requireOwn(
        validateSubmissionId(submissionId),
        validateRecoveryKey(recoveryKey),
      ),
    );
  }

  async withdraw(
    submissionId: unknown,
    recoveryKey: unknown,
  ): Promise<PublicGapParticipantView> {
    const id = validateSubmissionId(submissionId);
    const key = validateRecoveryKey(recoveryKey);
    await this.requireOwn(id, key);
    return this.participantView(
      await this.store.withdraw({
        submissionId: id,
        recoveryKeySha256: sha256(key),
        at: this.now(),
      }),
    );
  }

  async reviewQueue(gapSlugInput: unknown): Promise<{
    gap: typeof publicEvidenceGapDefinition;
    items: PublicGapReviewItem[];
    counts: {
      total: number;
      partial: number;
      remissionOrRegression: number;
      comparisonOrNonRemission: number;
    };
    causalAnalysisPermitted: false;
  }> {
    const gapSlug = validateGapSlug(gapSlugInput);
    const records = await this.store.listSubmitted(gapSlug);
    const items = records.map((record) => this.reviewItem(record));
    return {
      gap: publicEvidenceGapDefinition,
      items,
      counts: {
        total: items.length,
        partial: items.filter(({ partial }) => partial).length,
        remissionOrRegression: items.filter(({ structuredCase }) =>
          [
            "REPORTED_REMISSION",
            "BIOCHEMICAL_REMISSION",
            "IMAGING_REGRESSION",
            "NO_VISIBLE_LESION_REPORTED",
          ].includes(structuredCase.outcome ?? ""),
        ).length,
        comparisonOrNonRemission: items.filter(({ structuredCase }) =>
          ["STABLE", "PROGRESSION", "RECURRENCE"].includes(
            structuredCase.outcome ?? "",
          ),
        ).length,
      },
      causalAnalysisPermitted: false,
    };
  }

  private async requireOwn(
    submissionId: string,
    recoveryKey: string,
  ): Promise<PublicGapSubmissionRecord> {
    const record = await this.store.get(submissionId);
    if (
      record === null ||
      !constantTimeHexEqual(record.recoveryKeySha256, sha256(recoveryKey))
    ) {
      throw new Error("PUBLIC_GAP_SUBMISSION_ACCESS_DENIED");
    }
    return record;
  }

  private participantView(
    record: PublicGapSubmissionRecord,
  ): PublicGapParticipantView {
    const narrative =
      record.narrative === null
        ? null
        : decryptNarrative(
            record.narrative,
            this.encryptionKey,
            `${record.submissionId}:${record.gapSlug}:narrative`,
            this.keyId,
          );
    return {
      submissionId: record.submissionId,
      participantPseudonym: record.participantPseudonym,
      gapSlug: record.gapSlug,
      provenance: record.provenance,
      narrative,
      details: structuredClone(record.details),
      consent: record.consent === null ? null : structuredClone(record.consent),
      status: record.status,
      completenessLabel: record.completenessLabel,
      partial: record.completenessLabel === "PARTIAL",
      missingFields: [...record.missingFields],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private reviewItem(record: PublicGapSubmissionRecord): PublicGapReviewItem {
    if (
      record.status !== "SUBMITTED" ||
      record.narrative === null ||
      record.submittedAt === null ||
      record.completenessLabel === "DRAFT"
    ) {
      throw new Error("PUBLIC_GAP_REVIEW_RECORD_INVALID");
    }
    const narrative = decryptNarrative(
      record.narrative,
      this.encryptionKey,
      `${record.submissionId}:${record.gapSlug}:narrative`,
      this.keyId,
    );
    const transformed = redactBasicContactPatterns(narrative);
    const structured = redactStructuredContactPatterns(record.details);
    return {
      submissionId: record.submissionId,
      participantPseudonym: record.participantPseudonym,
      provenance: record.provenance,
      status: "SUBMITTED",
      evidenceLevel: "L1_STRUCTURED_CASE",
      verificationStatus: "PARTICIPANT_REPORTED_UNVERIFIED",
      completenessLabel: record.completenessLabel,
      partial: record.completenessLabel === "PARTIAL",
      missingFields: [...record.missingFields],
      structuredCase: structured.value,
      structuredContactPatternsRedacted: structured.changed,
      narrativeForPrivateGptReview: transformed.text,
      narrativePrivacyTransform: transformed.changed
        ? "BASIC_CONTACT_REDACTION_APPLIED"
        : "NO_CONTACT_PATTERN_DETECTED",
      privacyLimitations: [
        "Basic email, phone, and URL patterns are removed from narrative and structured free text before this private GPT review feed.",
        "This deterministic screen cannot guarantee that names, places, rare events, or other indirect identifiers were removed.",
        "The item is a participant-reported lead, not verified evidence or a causal claim.",
      ],
      submittedAt: record.submittedAt,
    };
  }
}

export class InMemoryPublicGapIntakeStore implements PublicGapIntakeStore {
  private readonly records = new Map<string, PublicGapSubmissionRecord>();

  async create(record: PublicGapSubmissionRecord): Promise<void> {
    if (this.records.has(record.submissionId)) {
      throw new Error("PUBLIC_GAP_SUBMISSION_ID_COLLISION");
    }
    this.records.set(record.submissionId, cloneRecord(record));
  }

  async get(submissionId: string): Promise<PublicGapSubmissionRecord | null> {
    const record = this.records.get(submissionId);
    return record === undefined ? null : cloneRecord(record);
  }

  async saveNarrative(input: {
    submissionId: string;
    recoveryKeySha256: string;
    narrative: EncryptedNarrative;
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.mutate(input.submissionId, input.recoveryKeySha256, (record) => {
      if (record.status !== "DRAFT" || record.narrative !== null) {
        throw new Error("PUBLIC_GAP_NARRATIVE_STATE_INVALID");
      }
      record.narrative = structuredClone(input.narrative);
      record.narrativeSavedAt = input.at;
      record.updatedAt = input.at;
    });
  }

  async saveDetails(input: {
    submissionId: string;
    recoveryKeySha256: string;
    details: PublicGapDetails;
    completenessLabel: PublicGapCompleteness;
    missingFields: string[];
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.mutate(input.submissionId, input.recoveryKeySha256, (record) => {
      if (record.status !== "DRAFT" || record.narrative === null) {
        throw new Error("PUBLIC_GAP_DETAILS_STATE_INVALID");
      }
      record.details = structuredClone(input.details);
      record.completenessLabel = input.completenessLabel;
      record.missingFields = [...input.missingFields];
      record.structuredSavedAt = input.at;
      record.updatedAt = input.at;
    });
  }

  async submit(input: {
    submissionId: string;
    recoveryKeySha256: string;
    consent: PublicGapConsent;
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.mutate(input.submissionId, input.recoveryKeySha256, (record) => {
      if (
        record.status !== "DRAFT" ||
        record.narrative === null ||
        record.structuredSavedAt === null
      ) {
        throw new Error("PUBLIC_GAP_SUBMIT_STATE_INVALID");
      }
      record.consent = structuredClone(input.consent);
      record.status = "SUBMITTED";
      record.submittedAt = input.at;
      record.updatedAt = input.at;
    });
  }

  async withdraw(input: {
    submissionId: string;
    recoveryKeySha256: string;
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.mutate(input.submissionId, input.recoveryKeySha256, (record) => {
      if (record.status === "WITHDRAWN") return;
      record.narrative = null;
      record.details = {};
      record.consent = null;
      record.status = "WITHDRAWN";
      record.completenessLabel = "DRAFT";
      record.missingFields = [];
      record.narrativeSavedAt = null;
      record.structuredSavedAt = null;
      record.submittedAt = null;
      record.withdrawnAt = input.at;
      record.updatedAt = input.at;
    });
  }

  async listSubmitted(gapSlug: string): Promise<PublicGapSubmissionRecord[]> {
    return [...this.records.values()]
      .filter(
        (record) => record.gapSlug === gapSlug && record.status === "SUBMITTED",
      )
      .sort((left, right) =>
        (left.submittedAt ?? "").localeCompare(right.submittedAt ?? ""),
      )
      .map(cloneRecord);
  }

  private async mutate(
    submissionId: string,
    recoveryKeySha256: string,
    mutation: (record: PublicGapSubmissionRecord) => void,
  ): Promise<PublicGapSubmissionRecord> {
    const record = this.records.get(submissionId);
    if (
      record === undefined ||
      !constantTimeHexEqual(record.recoveryKeySha256, recoveryKeySha256)
    ) {
      throw new Error("PUBLIC_GAP_SUBMISSION_ACCESS_DENIED");
    }
    mutation(record);
    return cloneRecord(record);
  }
}

export interface PostgresPublicGapIntakeStoreOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
}

export class PostgresPublicGapIntakeStore implements PublicGapIntakeStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresPublicGapIntakeStoreOptions) {
    this.schema = validateSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async create(record: PublicGapSubmissionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await setSearchPath(client, this.schema);
      await client.query(
        `INSERT INTO evidence_gap_submissions
          (submission_id, gap_slug, participant_pseudonym, recovery_key_sha256,
           provenance, structured_json, consent_json, status, completeness_label,
           missing_fields, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, '{}'::jsonb, 'DRAFT',
           'DRAFT', '[]'::jsonb, $6, $6)`,
        [
          record.submissionId,
          record.gapSlug,
          record.participantPseudonym,
          record.recoveryKeySha256,
          record.provenance,
          record.createdAt,
        ],
      );
    } finally {
      client.release();
    }
  }

  async get(submissionId: string): Promise<PublicGapSubmissionRecord | null> {
    const client = await this.pool.connect();
    try {
      await setSearchPath(client, this.schema);
      const result = await client.query<Record<string, unknown>>(
        "SELECT * FROM evidence_gap_submissions WHERE submission_id = $1",
        [submissionId],
      );
      return result.rows[0] === undefined ? null : rowToRecord(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async saveNarrative(input: {
    submissionId: string;
    recoveryKeySha256: string;
    narrative: EncryptedNarrative;
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.updateReturning(
      `UPDATE evidence_gap_submissions
       SET narrative_key_id = $3, narrative_nonce = $4, narrative_ciphertext = $5,
           narrative_auth_tag = $6, narrative_saved_at = $7, updated_at = $7
       WHERE submission_id = $1 AND recovery_key_sha256 = $2
         AND status = 'DRAFT' AND narrative_ciphertext IS NULL
       RETURNING *`,
      [
        input.submissionId,
        input.recoveryKeySha256,
        input.narrative.keyId,
        input.narrative.nonce,
        input.narrative.ciphertext,
        input.narrative.authTag,
        input.at,
      ],
      "PUBLIC_GAP_NARRATIVE_STATE_INVALID",
    );
  }

  async saveDetails(input: {
    submissionId: string;
    recoveryKeySha256: string;
    details: PublicGapDetails;
    completenessLabel: PublicGapCompleteness;
    missingFields: string[];
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.updateReturning(
      `UPDATE evidence_gap_submissions
       SET structured_json = $3::jsonb, completeness_label = $4,
           missing_fields = $5::jsonb, structured_saved_at = $6, updated_at = $6
       WHERE submission_id = $1 AND recovery_key_sha256 = $2
         AND status = 'DRAFT' AND narrative_ciphertext IS NOT NULL
       RETURNING *`,
      [
        input.submissionId,
        input.recoveryKeySha256,
        JSON.stringify(input.details),
        input.completenessLabel,
        JSON.stringify(input.missingFields),
        input.at,
      ],
      "PUBLIC_GAP_DETAILS_STATE_INVALID",
    );
  }

  async submit(input: {
    submissionId: string;
    recoveryKeySha256: string;
    consent: PublicGapConsent;
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.updateReturning(
      `UPDATE evidence_gap_submissions
       SET consent_json = $3::jsonb, status = 'SUBMITTED', submitted_at = $4,
           updated_at = $4
       WHERE submission_id = $1 AND recovery_key_sha256 = $2
         AND status = 'DRAFT' AND narrative_ciphertext IS NOT NULL
         AND structured_saved_at IS NOT NULL
       RETURNING *`,
      [
        input.submissionId,
        input.recoveryKeySha256,
        JSON.stringify(input.consent),
        input.at,
      ],
      "PUBLIC_GAP_SUBMIT_STATE_INVALID",
    );
  }

  async withdraw(input: {
    submissionId: string;
    recoveryKeySha256: string;
    at: string;
  }): Promise<PublicGapSubmissionRecord> {
    return this.updateReturning(
      `UPDATE evidence_gap_submissions
       SET narrative_key_id = NULL, narrative_nonce = NULL,
           narrative_ciphertext = NULL, narrative_auth_tag = NULL,
           structured_json = '{}'::jsonb, consent_json = '{}'::jsonb,
           status = 'WITHDRAWN', completeness_label = 'DRAFT',
           missing_fields = '[]'::jsonb, narrative_saved_at = NULL,
           structured_saved_at = NULL, submitted_at = NULL,
           withdrawn_at = COALESCE(withdrawn_at, $3), updated_at = $3
       WHERE submission_id = $1 AND recovery_key_sha256 = $2
       RETURNING *`,
      [input.submissionId, input.recoveryKeySha256, input.at],
      "PUBLIC_GAP_SUBMISSION_ACCESS_DENIED",
    );
  }

  async listSubmitted(gapSlug: string): Promise<PublicGapSubmissionRecord[]> {
    const client = await this.pool.connect();
    try {
      await setSearchPath(client, this.schema);
      const result = await client.query<Record<string, unknown>>(
        `SELECT * FROM evidence_gap_submissions
         WHERE gap_slug = $1 AND status = 'SUBMITTED'
         ORDER BY submitted_at, submission_id`,
        [gapSlug],
      );
      return result.rows.map(rowToRecord);
    } finally {
      client.release();
    }
  }

  private async updateReturning(
    sql: string,
    values: unknown[],
    errorCode: string,
  ): Promise<PublicGapSubmissionRecord> {
    const client = await this.pool.connect();
    try {
      await setSearchPath(client, this.schema);
      const result = await client.query<Record<string, unknown>>(sql, values);
      if (result.rows[0] === undefined) throw new Error(errorCode);
      return rowToRecord(result.rows[0]);
    } finally {
      client.release();
    }
  }
}

function validateGapSlug(value: unknown): string {
  const slug = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .parse(value);
  if (slug !== PUBLIC_PROLACTINOMA_GAP_SLUG) {
    throw new Error("PUBLIC_GAP_NOT_FOUND");
  }
  return slug;
}

function validateSubmissionId(value: unknown): string {
  return z.string().uuid().parse(value);
}

function validateRecoveryKey(value: unknown): string {
  return z.string().regex(/^[A-Za-z0-9_-]{43}$/u).parse(value);
}

function computeMissingFields(details: PublicGapDetails): string[] {
  const missing: string[] = [];
  if (details.outcome == null || details.outcome === "UNCLEAR") {
    missing.push("outcome classification");
  }
  if (details.exposure == null || details.exposure === "UNKNOWN") {
    missing.push("candidate transition or explicit no-transition report");
  }
  if (details.treatmentContext == null || details.treatmentContext === "UNKNOWN") {
    missing.push("treatment context");
  }
  if (details.transitionTiming == null || details.transitionTiming.length === 0) {
    missing.push("transition timing");
  }
  if (details.baselineDocumented !== true) {
    missing.push("baseline prolactin or MRI documentation");
  }
  if (details.followupDocumented !== true) {
    missing.push("follow-up prolactin or MRI documentation");
  }
  return missing;
}

function encryptNarrative(
  plaintext: string,
  encryptionKey: Buffer,
  keyId: string,
  aad: string,
  createRandom: (size: number) => Uint8Array,
): EncryptedNarrative {
  const nonce = Buffer.from(createRandom(12));
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    keyId,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptNarrative(
  envelope: EncryptedNarrative,
  encryptionKey: Buffer,
  aad: string,
  expectedKeyId: string,
): string {
  if (envelope.keyId !== expectedKeyId) {
    throw new Error("EVIDENCE_GAP_ENCRYPTION_KEY_UNAVAILABLE");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(envelope.nonce, "base64url"),
  );
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function redactBasicContactPatterns(value: string): {
  text: string;
  changed: boolean;
} {
  let text = value;
  text = text.replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
    "[email removed]",
  );
  text = text.replace(/\bhttps?:\/\/\S+\b/giu, "[link removed]");
  text = text.replace(
    /(?<!\d)(?:\+?\d[\s().-]?){7,15}(?!\d)/gu,
    "[phone removed]",
  );
  return { text, changed: text !== value };
}

function redactStructuredContactPatterns(details: PublicGapDetails): {
  value: PublicGapDetails;
  changed: boolean;
} {
  const value = structuredClone(details);
  let changed = false;
  for (const key of [
    "transitionTiming",
    "prolactinBefore",
    "prolactinAfter",
    "tumorBefore",
    "tumorAfter",
    "otherChanges",
  ] as const) {
    const prior = value[key];
    if (typeof prior !== "string") continue;
    const transformed = redactBasicContactPatterns(prior);
    value[key] = transformed.text;
    changed ||= transformed.changed;
  }
  return { value, changed };
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function cloneRecord(
  record: PublicGapSubmissionRecord,
): PublicGapSubmissionRecord {
  return structuredClone(record);
}

function validateSchema(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) {
    throw new Error("INVALID_POSTGRES_SCHEMA");
  }
  return value;
}

async function setSearchPath(client: PoolClient, schema: string): Promise<void> {
  await client.query(`SET search_path TO ${schema}, public`);
}

function rowToRecord(row: Record<string, unknown>): PublicGapSubmissionRecord {
  const narrative =
    row.narrative_ciphertext === null
      ? null
      : {
          keyId: String(row.narrative_key_id),
          nonce: String(row.narrative_nonce),
          ciphertext: String(row.narrative_ciphertext),
          authTag: String(row.narrative_auth_tag),
        };
  const consentObject = row.consent_json as Record<string, unknown>;
  return {
    submissionId: String(row.submission_id),
    gapSlug: String(row.gap_slug),
    participantPseudonym: String(row.participant_pseudonym),
    recoveryKeySha256: String(row.recovery_key_sha256),
    provenance: publicGapProvenanceSchema.parse(row.provenance),
    narrative,
    details: publicGapDetailsSchema.parse(row.structured_json),
    consent:
      Object.keys(consentObject).length === 0
        ? null
        : publicGapConsentSchema.parse(consentObject),
    status: z.enum(["DRAFT", "SUBMITTED", "WITHDRAWN"]).parse(row.status),
    completenessLabel: z
      .enum(["DRAFT", "PARTIAL", "SUBSTANTIAL"])
      .parse(row.completeness_label),
    missingFields: z.array(z.string()).parse(row.missing_fields),
    createdAt: asIso(row.created_at),
    narrativeSavedAt: asNullableIso(row.narrative_saved_at),
    structuredSavedAt: asNullableIso(row.structured_saved_at),
    submittedAt: asNullableIso(row.submitted_at),
    withdrawnAt: asNullableIso(row.withdrawn_at),
    updatedAt: asIso(row.updated_at),
  };
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return z.string().datetime({ offset: true }).parse(value);
}

function asNullableIso(value: unknown): string | null {
  return value === null ? null : asIso(value);
}
