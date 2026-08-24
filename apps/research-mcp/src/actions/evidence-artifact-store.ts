import { createHash } from "node:crypto";

import {
  externalEvidenceProviderSchema,
  externalEvidenceSha256Schema,
  externalEvidenceTimestampSchema,
  type ExternalEvidenceProvider,
} from "@askrigor/contracts";
import { z } from "zod";

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_MAX_ARTIFACT_BYTES = 10 * 1_024 * 1_024;
const DEFAULT_MAX_TOTAL_BYTES = 32 * 1_024 * 1_024;

export const evidenceArtifactKindSchema = z.enum([
  "normalized_provider_envelope",
  "authorized_provider_response",
  "publication_notice",
  "postpublication_thread",
  "citation_context",
]);

export const evidenceArtifactDescriptorSchema = z
  .object({
    artifact_id: z.string().regex(/^aea1_[a-f0-9]{64}$/u),
    artifact_kind: evidenceArtifactKindSchema,
    provider: externalEvidenceProviderSchema,
    source_identifier: z.string().trim().min(1).max(4_000),
    media_type: z.enum(["application/json", "text/plain", "application/pdf"]),
    content_sha256: externalEvidenceSha256Schema,
    content_bytes: z.number().int().nonnegative().max(DEFAULT_MAX_ARTIFACT_BYTES),
    created_at: externalEvidenceTimestampSchema,
  })
  .strict();

export type EvidenceArtifactDescriptor = z.output<
  typeof evidenceArtifactDescriptorSchema
>;
export type EvidenceArtifactKind = z.output<typeof evidenceArtifactKindSchema>;

export interface EvidenceArtifactInput {
  artifactKind: EvidenceArtifactKind;
  provider: ExternalEvidenceProvider;
  sourceIdentifier: string;
  mediaType: EvidenceArtifactDescriptor["media_type"];
  content: Uint8Array;
}

export interface EvidenceArtifactRecord {
  descriptor: EvidenceArtifactDescriptor;
  content: Uint8Array;
}

export interface EvidenceArtifactStore {
  put(input: EvidenceArtifactInput): EvidenceArtifactDescriptor;
  read(artifactId: string): EvidenceArtifactRecord | undefined;
  has(artifactId: string): boolean;
  revoke(artifactId: string): void;
}

export interface InMemoryEvidenceArtifactStoreOptions {
  now?: () => Date;
  maxEntries?: number;
  maxArtifactBytes?: number;
  maxTotalBytes?: number;
}

const evidenceArtifactInputSchema = z
  .object({
    artifactKind: evidenceArtifactKindSchema,
    provider: externalEvidenceProviderSchema,
    sourceIdentifier: z.string().trim().min(1).max(4_000),
    mediaType: z.enum(["application/json", "text/plain", "application/pdf"]),
    content: z.instanceof(Uint8Array),
  })
  .strict();

interface StoredArtifact {
  descriptor: EvidenceArtifactDescriptor;
  content: Uint8Array;
}

export function createInMemoryEvidenceArtifactStore(
  options: InMemoryEvidenceArtifactStoreOptions = {},
): EvidenceArtifactStore {
  const now = options.now ?? (() => new Date());
  const maxEntries = positiveInteger(
    options.maxEntries ?? DEFAULT_MAX_ENTRIES,
    "artifact entry limit",
  );
  const maxArtifactBytes = positiveInteger(
    options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
    "artifact byte limit",
  );
  const maxTotalBytes = positiveInteger(
    options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES,
    "artifact total byte limit",
  );
  if (maxArtifactBytes > maxTotalBytes) {
    throw new Error("Artifact byte limit cannot exceed total byte limit");
  }
  if (maxArtifactBytes > DEFAULT_MAX_ARTIFACT_BYTES) {
    throw new Error("Artifact byte limit exceeds the descriptor contract");
  }
  const entries = new Map<string, StoredArtifact>();
  let totalBytes = 0;

  return Object.freeze({
    put(rawInput: EvidenceArtifactInput) {
      const input = parseInput(rawInput);
      const content = new Uint8Array(input.content);
      if (content.byteLength > maxArtifactBytes) {
        throw new Error("Evidence artifact exceeds the per-artifact byte limit");
      }
      const contentSha256 = sha256(content);
      const artifactId = artifactIdentifier({
        artifact_kind: input.artifactKind,
        provider: input.provider,
        source_identifier: input.sourceIdentifier,
        media_type: input.mediaType,
        content_sha256: contentSha256,
      });
      const existing = entries.get(artifactId);
      if (existing !== undefined) return structuredClone(existing.descriptor);
      if (entries.size >= maxEntries || totalBytes + content.byteLength > maxTotalBytes) {
        throw new Error("Evidence artifact store capacity exceeded");
      }
      const descriptor = evidenceArtifactDescriptorSchema.parse({
        artifact_id: artifactId,
        artifact_kind: input.artifactKind,
        provider: input.provider,
        source_identifier: input.sourceIdentifier,
        media_type: input.mediaType,
        content_sha256: contentSha256,
        content_bytes: content.byteLength,
        created_at: validDate(now).toISOString(),
      });
      entries.set(artifactId, { descriptor, content });
      totalBytes += content.byteLength;
      return structuredClone(descriptor);
    },
    read(artifactId: string) {
      if (!/^aea1_[a-f0-9]{64}$/u.test(artifactId)) return undefined;
      const entry = entries.get(artifactId);
      if (entry === undefined) return undefined;
      return {
        descriptor: structuredClone(entry.descriptor),
        content: new Uint8Array(entry.content),
      };
    },
    has(artifactId: string) {
      return /^aea1_[a-f0-9]{64}$/u.test(artifactId) && entries.has(artifactId);
    },
    revoke(artifactId: string) {
      const entry = entries.get(artifactId);
      if (entry === undefined) return;
      entries.delete(artifactId);
      totalBytes -= entry.content.byteLength;
    },
  });
}

function parseInput(input: EvidenceArtifactInput): {
  artifactKind: EvidenceArtifactKind;
  provider: ExternalEvidenceProvider;
  sourceIdentifier: string;
  mediaType: EvidenceArtifactDescriptor["media_type"];
  content: Uint8Array;
} {
  return evidenceArtifactInputSchema.parse(input);
}

function artifactIdentifier(input: {
  artifact_kind: EvidenceArtifactKind;
  provider: ExternalEvidenceProvider;
  source_identifier: string;
  media_type: EvidenceArtifactDescriptor["media_type"];
  content_sha256: string;
}): string {
  return `aea1_${sha256(Buffer.from(canonicalJson(input), "utf8"))}`;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${label}`);
  return value;
}

function validDate(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Invalid evidence artifact store clock");
  }
  return value;
}
