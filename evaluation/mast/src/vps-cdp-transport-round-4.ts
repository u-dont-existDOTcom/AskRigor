import { z } from "zod";

import { ROUND_4_GENERATION_COUNT, ROUND_4_STUDY_ID } from "./fresh-validation-round-4.js";

const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const opaqueInputSchema = z.string().regex(/^run-[0-9a-f]{24}$/u);
const instantSchema = z.string().datetime({ offset: true });

export const VPS_DEVICE = "srv1894948" as const;
export const VPS_USER = "cloudbrowser" as const;
export const VPS_CDP_ENDPOINT = "http://127.0.0.1:9224" as const;
export const VPS_BROWSER = "Brave" as const;
export const VPS_PRIVATE_ROOT = "/home/cloudbrowser/.local/share/askrigor-mast-round4" as const;

export const vpsPacketTransferRecordSchema = z.object({
  sequence: z.number().int().min(1).max(ROUND_4_GENERATION_COUNT),
  opaqueInputId: opaqueInputSchema,
  sourceRelativePath: z.string().regex(/^generation\/inputs\/\d{3}-run-[0-9a-f]{24}\.txt$/u),
  destinationRelativePath: z.string().regex(/^packets\/\d{3}-run-[0-9a-f]{24}\.txt$/u),
  expectedSha256: digestSchema,
  sourceSha256: digestSchema,
  destinationSha256: digestSchema,
  sourceUtf8Bytes: z.number().int().positive(),
  destinationUtf8Bytes: z.number().int().positive(),
  eligible: z.literal(true),
}).strict().superRefine((record, context) => {
  if (record.expectedSha256 !== record.sourceSha256
    || record.expectedSha256 !== record.destinationSha256
    || record.sourceUtf8Bytes !== record.destinationUtf8Bytes) {
    context.addIssue({ code: "custom", message: "VPS_PACKET_TRANSFER_IDENTITY_MISMATCH" });
  }
  if (record.sourceRelativePath.split("/").at(-1) !== record.destinationRelativePath.split("/").at(-1)) {
    context.addIssue({ code: "custom", message: "VPS_PACKET_TRANSFER_FILENAME_MISMATCH" });
  }
});

export const vpsPacketTransferReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  device: z.literal(VPS_DEVICE),
  user: z.literal(VPS_USER),
  privateRoot: z.literal(VPS_PRIVATE_ROOT),
  transferredAt: instantSchema,
  records: z.array(vpsPacketTransferRecordSchema).length(ROUND_4_GENERATION_COUNT),
}).strict().superRefine((receipt, context) => {
  if (new Set(receipt.records.map(({ sequence }) => sequence)).size !== ROUND_4_GENERATION_COUNT
    || new Set(receipt.records.map(({ opaqueInputId }) => opaqueInputId)).size !== ROUND_4_GENERATION_COUNT
    || receipt.records.some((record, index) => record.sequence !== index + 1)) {
    context.addIssue({ code: "custom", message: "VPS_PACKET_TRANSFER_COVERAGE_INVALID" });
  }
});

export const vpsRuntimeAttestationSchema = z.object({
  schemaVersion: z.literal(1),
  studyId: z.literal(ROUND_4_STUDY_ID),
  device: z.literal(VPS_DEVICE),
  user: z.literal(VPS_USER),
  browser: z.literal(VPS_BROWSER),
  cdpEndpoint: z.literal(VPS_CDP_ENDPOINT),
  cdpAttached: z.literal(true),
  authenticated: z.literal(true),
  tabCount: z.number().int().min(1).max(2),
  observedAt: instantSchema,
}).strict();

export function assertVpsPacketTransferEligible(input: unknown) {
  return vpsPacketTransferReceiptSchema.parse(input);
}
