import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { CUSTOM_GPT_INSTALLATION_BUNDLE } from
  "./generated/custom-gpt-bundle.js";
export const CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID =
  "askrigor-controlled-research-acceptance-v1" as const;
export const CUSTOM_GPT_ACCEPTANCE_RESEARCH_TARGET =
  "Fixed synthetic acceptance: for adults with radiographically confirmed end-stage hip osteoarthritis, severely limited walking, and an existing surgical indication, compare total hip replacement with materially distinct nonoperative programs. Search specific implementations rather than pooling exercise or conservative care: progressive resistance training, aquatic exercise, mobility or range-of-motion work, gait or movement retraining, cycling or other low-impact conditioning, multimodal rehabilitation, injections, nutrition or supplements, and watchful waiting. Distinguish program components and dose, disease stage, benefit, no effect, worsening, complications, eventual surgery, durability, study methods, and plain-language limitations." as const;
const ACCEPTANCE_RECEIPT_LIFETIME_MS = 3_600_000;

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const protocolIdentitySchema = z.object({
  protocol: z.enum(["universal", "hrp"]),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
  revision_date: z.string().min(1).max(100),
  sha256: digest
}).strict();

export const customGptAcceptanceTransitionSchema = z.object({
  sequence: z.number().int().nonnegative(),
  capability: z.string().regex(/^[a-z][a-z0-9_]{2,99}$/u),
  result: z.enum([
    "complete",
    "progress_recorded",
    "blocked_retryable",
    "blocked_terminal",
    "semantic_work_recorded",
    "protocol_drift"
  ]),
  before_state_digest: digest,
  after_state_digest: digest
}).strict();

const unsignedReceiptSchema = z.object({
  receipt_version: z.literal("askrigor_custom_gpt_acceptance_receipt_v1"),
  domain: z.literal("askrigor.custom-gpt.product-acceptance"),
  challenge_id: z.literal(CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID),
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  installation_bundle: z.object({
    instructions_sha256: digest,
    action_schema_sha256: digest,
    bundle_sha256: digest
  }).strict(),
  protocol_identities: z.tuple([
    protocolIdentitySchema.extend({ protocol: z.literal("universal") }).strict(),
    protocolIdentitySchema.extend({ protocol: z.literal("hrp") }).strict()
  ]),
  transition_trace: z.array(customGptAcceptanceTransitionSchema).min(1).max(512),
  final_boundary: z.enum(["BOUNDED_NONRANKING_ONLY", "FINALIZATION_ALLOWED"]),
  permit_payload_sha256: digest,
  report_digest: digest,
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime(),
  key_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u)
}).strict();

export const customGptAcceptanceReceiptSchema = unsignedReceiptSchema.extend({
  receipt_payload_sha256: digest,
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/u)
}).strict();

export type CustomGptAcceptanceTransition = z.output<
  typeof customGptAcceptanceTransitionSchema
>;
export type CustomGptAcceptanceReceipt = z.output<
  typeof customGptAcceptanceReceiptSchema
>;

export function issueCustomGptAcceptanceReceipt(input: {
  challengeId: typeof CUSTOM_GPT_ACCEPTANCE_CHALLENGE_ID;
  sessionId: string;
  protocolIdentities: z.output<typeof unsignedReceiptSchema>["protocol_identities"];
  transitionTrace: readonly CustomGptAcceptanceTransition[];
  finalBoundary: "BOUNDED_NONRANKING_ONLY" | "FINALIZATION_ALLOWED";
  permitPayloadSha256: string;
  reportDigest: string;
  signingSecret: string;
  keyId: string;
  now?: () => Date;
}): CustomGptAcceptanceReceipt {
  validateSecret(input.signingSecret);
  const issued = (input.now ?? (() => new Date()))();
  if (!(issued instanceof Date) || !Number.isFinite(issued.getTime())) {
    throw new Error("Product acceptance receipt clock is invalid");
  }
  const expires = new Date(issued.getTime() + ACCEPTANCE_RECEIPT_LIFETIME_MS);
  const unsigned = unsignedReceiptSchema.parse({
    receipt_version: "askrigor_custom_gpt_acceptance_receipt_v1",
    domain: "askrigor.custom-gpt.product-acceptance",
    challenge_id: input.challengeId,
    session_id: input.sessionId,
    installation_bundle: CUSTOM_GPT_INSTALLATION_BUNDLE,
    protocol_identities: input.protocolIdentities,
    transition_trace: input.transitionTrace,
    final_boundary: input.finalBoundary,
    permit_payload_sha256: input.permitPayloadSha256,
    report_digest: input.reportDigest,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
    key_id: input.keyId
  });
  const payload = canonicalJson(unsigned);
  return customGptAcceptanceReceiptSchema.parse({
    ...unsigned,
    receipt_payload_sha256: sha256(payload),
    signature: createHmac("sha256", signingKey(input.signingSecret))
      .update(payload)
      .digest("base64url")
  });
}

export function verifyCustomGptAcceptanceReceipt(input: {
  receipt: unknown;
  signingSecret: string;
  expectedKeyId: string;
  now?: () => Date;
}): CustomGptAcceptanceReceipt {
  validateSecret(input.signingSecret);
  const receipt = customGptAcceptanceReceiptSchema.parse(input.receipt);
  if (
    receipt.key_id !== input.expectedKeyId ||
    canonicalJson(receipt.installation_bundle) !==
      canonicalJson(CUSTOM_GPT_INSTALLATION_BUNDLE)
  ) throw new Error("Product acceptance receipt identity mismatch");
  const { receipt_payload_sha256, signature, ...unsigned } = receipt;
  const payload = canonicalJson(unsigned);
  if (receipt_payload_sha256 !== sha256(payload)) {
    throw new Error("Product acceptance receipt payload mismatch");
  }
  const expected = createHmac("sha256", signingKey(input.signingSecret))
    .update(payload)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (
    actual.toString("base64url") !== signature ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) throw new Error("Product acceptance receipt signature mismatch");
  const now = (input.now ?? (() => new Date()))();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Product acceptance receipt clock is invalid");
  }
  const issuedAt = Date.parse(receipt.issued_at);
  const expiresAt = Date.parse(receipt.expires_at);
  if (
    expiresAt - issuedAt !== ACCEPTANCE_RECEIPT_LIFETIME_MS ||
    now.getTime() < issuedAt ||
    now.getTime() >= expiresAt
  ) throw new Error("Product acceptance receipt expired");
  return receipt;
}

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("askrigor.custom-gpt.product-acceptance.v1")
    .digest();
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Product acceptance signing secret must contain at least 32 UTF-8 bytes");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sort(child)]));
}
