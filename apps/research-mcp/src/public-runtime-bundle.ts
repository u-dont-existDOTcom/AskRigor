import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { readFile } from "node:fs/promises";

import { z } from "zod";

export const PUBLIC_RUNTIME_FORMAT_VERSION =
  "askrigor_public_runtime_bundle_v1" as const;
export const PUBLIC_RUNTIME_RESPONSE_MAX_BYTES = 32 * 1_024;

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_MS = 3_600_000;
const MIN_SECRET_BYTES = 32;
const MAX_TOKEN_CHARACTERS = 4_096;
const DEFAULT_MAXIMUM_BUNDLES = 4;
const DEFAULT_MAXIMUM_CHAINS = 128;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const ROOT = new URL("../../../", import.meta.url);
const SOURCE_MANIFEST_PATH =
  "skills/askrigor/public-runtime-source-manifest.json";

export const publicRuntimeProfileSchema = z.enum([
  "legacy",
  "standard-v2",
  "gemini"
]);
export type PublicRuntimeProfile = z.output<typeof publicRuntimeProfileSchema>;

export const loadResearchRuntimeInputSchema = z.object({
  profile: publicRuntimeProfileSchema.optional(),
  continuation_handle: z.string().min(1).max(MAX_TOKEN_CHARACTERS).optional()
}).strict().superRefine((input, context) => {
  if ((input.profile === undefined) === (input.continuation_handle === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Select exactly one profile initially or provide one continuation handle"
    });
  }
});

export const publicRuntimeDocumentHashSchema = z.object({
  document_id: z.string().min(1),
  sha256: z.string().regex(SHA256_PATTERN)
}).strict();

export const loadResearchRuntimeOutputSchema = z.object({
  ok: z.literal(true),
  format_version: z.literal(PUBLIC_RUNTIME_FORMAT_VERSION),
  profile: publicRuntimeProfileSchema,
  release_manifest_sha256: z.string().regex(SHA256_PATTERN),
  bundle_sha256: z.string().regex(SHA256_PATTERN),
  document_order_sha256: z.string().regex(SHA256_PATTERN),
  document_hashes: z.array(publicRuntimeDocumentHashSchema).min(1),
  chunk_index: z.number().int().nonnegative(),
  chunk_count: z.number().int().positive(),
  byte_start: z.number().int().nonnegative(),
  byte_end_exclusive: z.number().int().positive(),
  total_bytes: z.number().int().positive(),
  chunk_sha256: z.string().regex(SHA256_PATTERN),
  text: z.string(),
  next_handle: z.string().min(1).max(MAX_TOKEN_CHARACTERS).optional(),
  complete: z.boolean()
}).strict();

export interface PublicRuntimeBundle {
  readonly format_version: typeof PUBLIC_RUNTIME_FORMAT_VERSION;
  readonly profile: PublicRuntimeProfile;
  readonly release_manifest_sha256: string;
  readonly bundle_sha256: string;
  readonly document_hashes: readonly z.output<
    typeof publicRuntimeDocumentHashSchema
  >[];
  readonly bytes: Uint8Array;
}

export interface PublicRuntimeBundleStore {
  loadCurrent(profile: PublicRuntimeProfile): Promise<PublicRuntimeBundle>;
  read(bundleSha256: string): PublicRuntimeBundle | undefined;
  createChain(input: {
    bundleSha256: string;
    expiresAtMs: number;
  }): string;
  consumeChain(input: {
    chainId: string;
    bundleSha256: string;
    chunkIndex: number;
    complete: boolean;
  }): void;
}

export interface CreatePublicRuntimeBundleStoreOptions {
  loadCurrentBundle?: (
    profile: PublicRuntimeProfile
  ) => Promise<PublicRuntimeBundle>;
  maximumEntries?: number;
  maximumChains?: number;
  random?: (size: number) => Uint8Array;
}

export interface CreatePublicRuntimeChunkDependencies {
  continuationSecret: string;
  store?: PublicRuntimeBundleStore;
  now?: () => number;
}

export class PublicRuntimeContinuationError extends Error {
  constructor(
    public readonly code:
      | "public_runtime_continuation_invalid"
      | "public_runtime_continuation_expired"
      | "public_runtime_source_changed_or_unavailable",
    message: string
  ) {
    super(message);
    this.name = "PublicRuntimeContinuationError";
  }
}

interface RuntimeCursorState {
  version: typeof TOKEN_VERSION;
  kind: "askrigor_public_runtime";
  format_version: typeof PUBLIC_RUNTIME_FORMAT_VERSION;
  profile: PublicRuntimeProfile;
  bundle_sha256: string;
  document_order_sha256: string;
  chain_id: string;
  next_byte_offset: number;
  chunk_index: number;
  expires_at_ms: number;
}

interface RuntimeChain {
  bundleSha256: string;
  expiresAtMs: number;
  expectedChunkIndex: number;
}

interface PublicRuntimeSourceManifest {
  schema_version: 1;
  bundle_format_version: typeof PUBLIC_RUNTIME_FORMAT_VERSION;
  sources: Array<{
    document_id: string;
    path: string;
    utf8_bytes: number;
    sha256: string;
    runtime_document: boolean;
  }>;
  artifacts: Array<{
    document_id: string;
    path: string;
    utf8_bytes: number;
    sha256: string;
    runtime_document: boolean;
  }>;
  profiles: Record<PublicRuntimeProfile, {
    operation_ids: string[];
  }>;
}

const cursorStateSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  kind: z.literal("askrigor_public_runtime"),
  format_version: z.literal(PUBLIC_RUNTIME_FORMAT_VERSION),
  profile: publicRuntimeProfileSchema,
  bundle_sha256: z.string().regex(SHA256_PATTERN),
  document_order_sha256: z.string().regex(SHA256_PATTERN),
  chain_id: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
  next_byte_offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  chunk_index: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  expires_at_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
}).strict();

let defaultStore: PublicRuntimeBundleStore | undefined;

export function createPublicRuntimeBundleStore(
  options: CreatePublicRuntimeBundleStoreOptions = {}
): PublicRuntimeBundleStore {
  const loader = options.loadCurrentBundle ?? loadPackagedPublicRuntimeBundle;
  const maximumEntries = positiveInteger(
    options.maximumEntries ?? DEFAULT_MAXIMUM_BUNDLES,
    "bundle limit"
  );
  const maximumChains = positiveInteger(
    options.maximumChains ?? DEFAULT_MAXIMUM_CHAINS,
    "chain limit"
  );
  const createRandom = options.random ?? randomBytes;
  const bundles = new Map<string, PublicRuntimeBundle>();
  const chains = new Map<string, RuntimeChain>();

  const store: PublicRuntimeBundleStore = {
    async loadCurrent(profile) {
      const raw = await loader(profile);
      const bundle = validateBundle(raw, profile);
      if (!bundles.has(bundle.bundle_sha256)) {
        while (bundles.size >= maximumEntries) {
          const oldest = bundles.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          bundles.delete(oldest);
          for (const [chainId, chain] of chains) {
            if (chain.bundleSha256 === oldest) chains.delete(chainId);
          }
        }
        bundles.set(bundle.bundle_sha256, bundle);
      }
      return bundle;
    },
    read(bundleSha256) {
      return bundles.get(bundleSha256);
    },
    createChain({ bundleSha256, expiresAtMs }) {
      while (chains.size >= maximumChains) {
        const oldest = chains.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        chains.delete(oldest);
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const bytes = Buffer.from(createRandom(24));
        if (bytes.length !== 24) {
          throw new Error("Public runtime random source returned invalid bytes");
        }
        const chainId = bytes.toString("base64url");
        if (chains.has(chainId)) continue;
        chains.set(chainId, {
          bundleSha256,
          expiresAtMs,
          expectedChunkIndex: 1
        });
        return chainId;
      }
      throw new Error("Public runtime chain identifier collision limit exceeded");
    },
    consumeChain({ chainId, bundleSha256, chunkIndex, complete }) {
      const chain = chains.get(chainId);
      if (
        chain === undefined ||
        chain.bundleSha256 !== bundleSha256 ||
        chain.expectedChunkIndex !== chunkIndex
      ) {
        throw invalidContinuation(
          "Public runtime continuation is out of order or was replayed"
        );
      }
      if (complete) {
        chains.delete(chainId);
      } else {
        chain.expectedChunkIndex += 1;
        chains.delete(chainId);
        chains.set(chainId, chain);
      }
    }
  };
  return Object.freeze(store);
}

export async function createPublicRuntimeChunk(
  rawInput: {
    profile?: PublicRuntimeProfile;
    continuation_handle?: string;
  },
  dependencies: CreatePublicRuntimeChunkDependencies
): Promise<z.output<typeof loadResearchRuntimeOutputSchema>> {
  const input = loadResearchRuntimeInputSchema.parse(rawInput);
  validateSecret(dependencies.continuationSecret);
  const nowMs = readNow(dependencies.now);
  const store = dependencies.store ?? (defaultStore ??=
    createPublicRuntimeBundleStore());

  let bundle: PublicRuntimeBundle;
  let profile: PublicRuntimeProfile;
  let byteStart = 0;
  let chunkIndex = 0;
  let expiresAtMs = nowMs + TOKEN_LIFETIME_MS;
  let chainId: string | undefined;
  let expectedOrderDigest: string | undefined;

  if (input.continuation_handle === undefined) {
    profile = input.profile!;
    bundle = await store.loadCurrent(profile);
  } else {
    const state = decodeCursor(
      input.continuation_handle,
      dependencies.continuationSecret,
      nowMs
    );
    profile = state.profile;
    bundle = store.read(state.bundle_sha256) ?? unavailableContinuation();
    byteStart = state.next_byte_offset;
    chunkIndex = state.chunk_index;
    expiresAtMs = state.expires_at_ms;
    chainId = state.chain_id;
    expectedOrderDigest = state.document_order_sha256;
  }

  const bytes = Buffer.from(bundle.bytes);
  if (bytes.length === 0) {
    throw new Error("Public runtime bundle must not be empty");
  }
  const documentOrderSha256 = digest(Buffer.from(
    bundle.document_hashes.map(({ document_id, sha256 }) =>
      `${document_id}\0${sha256}\n`
    ).join(""),
    "utf8"
  ));
  if (
    bundle.bundle_sha256 !== digest(bytes) ||
    (expectedOrderDigest !== undefined && expectedOrderDigest !== documentOrderSha256)
  ) {
    throw unavailableContinuation();
  }

  if (chainId === undefined) {
    chainId = store.createChain({
      bundleSha256: bundle.bundle_sha256,
      expiresAtMs
    });
  }
  const boundaries = runtimeChunkBoundaries({
    bundle,
    documentOrderSha256,
    chainId,
    expiresAtMs,
    secret: dependencies.continuationSecret
  });
  if (
    boundaries[chunkIndex] !== byteStart ||
    chunkIndex >= boundaries.length - 1
  ) {
    throw invalidContinuation("Public runtime continuation has an invalid offset");
  }
  const byteEnd = boundaries[chunkIndex + 1]!;
  const complete = byteEnd === bytes.length;
  const nextHandle = complete
    ? undefined
    : encodeCursor({
        version: TOKEN_VERSION,
        kind: "askrigor_public_runtime",
        format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
        profile,
        bundle_sha256: bundle.bundle_sha256,
        document_order_sha256: documentOrderSha256,
        chain_id: chainId,
        next_byte_offset: byteEnd,
        chunk_index: chunkIndex + 1,
        expires_at_ms: expiresAtMs
      }, dependencies.continuationSecret);
  const chunkBytes = bytes.subarray(byteStart, byteEnd);
  const output = loadResearchRuntimeOutputSchema.parse({
    ok: true,
    format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
    profile,
    release_manifest_sha256: bundle.release_manifest_sha256,
    bundle_sha256: bundle.bundle_sha256,
    document_order_sha256: documentOrderSha256,
    document_hashes: bundle.document_hashes,
    chunk_index: chunkIndex,
    chunk_count: boundaries.length - 1,
    byte_start: byteStart,
    byte_end_exclusive: byteEnd,
    total_bytes: bytes.length,
    chunk_sha256: digest(chunkBytes),
    text: chunkBytes.toString("utf8"),
    ...(nextHandle === undefined ? {} : { next_handle: nextHandle }),
    complete
  });
  if (serializedBytes(output) > PUBLIC_RUNTIME_RESPONSE_MAX_BYTES) {
    throw new Error("Public runtime response exceeded its serialized byte ceiling");
  }
  if (chunkIndex > 0) {
    store.consumeChain({
      chainId,
      bundleSha256: bundle.bundle_sha256,
      chunkIndex,
      complete
    });
  } else if (complete) {
    store.consumeChain({
      chainId,
      bundleSha256: bundle.bundle_sha256,
      chunkIndex: 1,
      complete: true
    });
  }
  return output;
}

export async function loadPackagedPublicRuntimeBundle(
  profile: PublicRuntimeProfile
): Promise<PublicRuntimeBundle> {
  const manifestBytes = await readFile(new URL(SOURCE_MANIFEST_PATH, ROOT));
  const manifest = validateSourceManifest(JSON.parse(manifestBytes.toString("utf8")));
  const entries = [...manifest.sources, ...manifest.artifacts]
    .filter(({ runtime_document }) => runtime_document);
  const documents = [];
  for (const entry of entries) {
    const bytes = await readFile(new URL(entry.path, ROOT));
    if (bytes.byteLength !== entry.utf8_bytes || digest(bytes) !== entry.sha256) {
      throw new Error(`Public runtime release manifest mismatch: ${entry.path}`);
    }
    documents.push({
      document_id: entry.document_id,
      path: entry.path,
      utf8_bytes: bytes.byteLength,
      sha256: entry.sha256,
      text: decodeUtf8(bytes)
    });
  }
  documents.push({
    document_id: "public_runtime_source_manifest",
    path: SOURCE_MANIFEST_PATH,
    utf8_bytes: manifestBytes.byteLength,
    sha256: digest(manifestBytes),
    text: decodeUtf8(manifestBytes)
  });
  const payload = {
    format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
    profile,
    operation_ids: manifest.profiles[profile].operation_ids,
    documents
  };
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`, "utf8");
  return Object.freeze({
    format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
    profile,
    release_manifest_sha256: digest(manifestBytes),
    bundle_sha256: digest(bytes),
    document_hashes: Object.freeze(documents.map(({ document_id, sha256 }) =>
      Object.freeze({ document_id, sha256 })
    )),
    bytes
  });
}

function runtimeChunkBoundaries(input: {
  bundle: PublicRuntimeBundle;
  documentOrderSha256: string;
  chainId: string;
  expiresAtMs: number;
  secret: string;
}): number[] {
  const bytes = Buffer.from(input.bundle.bytes);
  const boundaries = [0];
  while (boundaries.at(-1)! < bytes.length) {
    const start = boundaries.at(-1)!;
    const chunkIndex = boundaries.length - 1;
    let low = start + 1;
    let high = bytes.length;
    let accepted = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      let end = utf8BoundaryAtOrBefore(bytes, middle);
      if (end <= start) end = utf8BoundaryAfter(bytes, start);
      const complete = end === bytes.length;
      const nextHandle = complete ? undefined : encodeCursor({
        version: TOKEN_VERSION,
        kind: "askrigor_public_runtime",
        format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
        profile: input.bundle.profile,
        bundle_sha256: input.bundle.bundle_sha256,
        document_order_sha256: input.documentOrderSha256,
        chain_id: input.chainId,
        next_byte_offset: end,
        chunk_index: chunkIndex + 1,
        expires_at_ms: input.expiresAtMs
      }, input.secret);
      const candidate = {
        ok: true,
        format_version: PUBLIC_RUNTIME_FORMAT_VERSION,
        profile: input.bundle.profile,
        release_manifest_sha256: input.bundle.release_manifest_sha256,
        bundle_sha256: input.bundle.bundle_sha256,
        document_order_sha256: input.documentOrderSha256,
        document_hashes: input.bundle.document_hashes,
        chunk_index: Number.MAX_SAFE_INTEGER,
        chunk_count: Number.MAX_SAFE_INTEGER,
        byte_start: start,
        byte_end_exclusive: end,
        total_bytes: bytes.length,
        chunk_sha256: digest(bytes.subarray(start, end)),
        text: bytes.subarray(start, end).toString("utf8"),
        ...(nextHandle === undefined ? {} : { next_handle: nextHandle }),
        complete
      };
      if (serializedBytes(candidate) <= PUBLIC_RUNTIME_RESPONSE_MAX_BYTES) {
        accepted = end;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (accepted <= start) {
      throw new Error("Public runtime serialized response ceiling is too small");
    }
    boundaries.push(accepted);
  }
  return boundaries;
}

function validateBundle(
  bundle: PublicRuntimeBundle,
  expectedProfile: PublicRuntimeProfile
): PublicRuntimeBundle {
  if (
    bundle.format_version !== PUBLIC_RUNTIME_FORMAT_VERSION ||
    bundle.profile !== expectedProfile ||
    !SHA256_PATTERN.test(bundle.release_manifest_sha256) ||
    !SHA256_PATTERN.test(bundle.bundle_sha256) ||
    bundle.document_hashes.length === 0 ||
    !(bundle.bytes instanceof Uint8Array) ||
    digest(bundle.bytes) !== bundle.bundle_sha256
  ) {
    throw new Error("Public runtime bundle identity is invalid");
  }
  for (const identity of bundle.document_hashes) {
    publicRuntimeDocumentHashSchema.parse(identity);
  }
  if (new Set(bundle.document_hashes.map(({ document_id }) => document_id)).size !==
      bundle.document_hashes.length) {
    throw new Error("Public runtime bundle contains duplicate documents");
  }
  return Object.freeze({
    ...bundle,
    document_hashes: Object.freeze(bundle.document_hashes.map((entry) =>
      Object.freeze({ ...entry })
    )),
    bytes: Buffer.from(bundle.bytes)
  });
}

function validateSourceManifest(value: unknown): PublicRuntimeSourceManifest {
  const manifest = value as PublicRuntimeSourceManifest;
  if (
    typeof manifest !== "object" || manifest === null ||
    manifest.schema_version !== 1 ||
    manifest.bundle_format_version !== PUBLIC_RUNTIME_FORMAT_VERSION ||
    !Array.isArray(manifest.sources) ||
    !Array.isArray(manifest.artifacts) ||
    typeof manifest.profiles !== "object" || manifest.profiles === null
  ) {
    throw new Error("Public runtime source manifest is invalid");
  }
  for (const profile of publicRuntimeProfileSchema.options) {
    const operations = manifest.profiles[profile]?.operation_ids;
    if (!Array.isArray(operations) || operations.some((name) =>
      typeof name !== "string" || name.length === 0
    )) {
      throw new Error(`Public runtime profile is invalid: ${profile}`);
    }
  }
  const entries = [...manifest.sources, ...manifest.artifacts];
  if (new Set(entries.map(({ document_id }) => document_id)).size !== entries.length) {
    throw new Error("Public runtime manifest has duplicate document identifiers");
  }
  for (const entry of entries) {
    if (
      typeof entry.path !== "string" || entry.path.startsWith("/") ||
      entry.path.includes("..") ||
      !Number.isSafeInteger(entry.utf8_bytes) || entry.utf8_bytes < 0 ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw new Error("Public runtime manifest entry is invalid");
    }
  }
  return manifest;
}

function encodeCursor(state: RuntimeCursorState, secret: string): string {
  const parsed = cursorStateSchema.parse(state);
  const payload = Buffer.from(JSON.stringify(parsed), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest("base64url");
  const token = `${payload}.${signature}`;
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw new Error("Public runtime continuation handle is too large");
  }
  return token;
}

function decodeCursor(token: string, secret: string, nowMs: number): RuntimeCursorState {
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw invalidContinuation("Public runtime continuation handle is too large");
  }
  const parts = token.split(".");
  if (
    parts.length !== 2 || parts[0] === undefined || parts[1] === undefined ||
    !BASE64URL_PATTERN.test(parts[0]) || !BASE64URL_PATTERN.test(parts[1])
  ) {
    throw invalidContinuation("Invalid public runtime continuation handle");
  }
  const [payload, suppliedSignature] = parts;
  const expectedSignature = createHmac("sha256", signingKey(secret))
    .update(payload)
    .digest();
  const suppliedBytes = Buffer.from(suppliedSignature, "base64url");
  if (
    suppliedBytes.toString("base64url") !== suppliedSignature ||
    suppliedBytes.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedBytes, expectedSignature)
  ) {
    throw invalidContinuation("Invalid public runtime continuation signature");
  }
  let parsedJson: unknown;
  try {
    const payloadBytes = Buffer.from(payload, "base64url");
    if (payloadBytes.toString("base64url") !== payload) throw new Error("encoding");
    parsedJson = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw invalidContinuation("Invalid public runtime continuation payload");
  }
  const parsed = cursorStateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw invalidContinuation("Invalid public runtime continuation state");
  }
  if (nowMs >= parsed.data.expires_at_ms) {
    throw new PublicRuntimeContinuationError(
      "public_runtime_continuation_expired",
      "Public runtime continuation expired"
    );
  }
  return parsed.data;
}

function utf8BoundaryAtOrBefore(bytes: Buffer, requested: number): number {
  let end = Math.min(Math.max(requested, 0), bytes.length);
  while (end < bytes.length && end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return end;
}

function utf8BoundaryAfter(bytes: Buffer, start: number): number {
  let end = Math.min(start + 1, bytes.length);
  while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end += 1;
  return end;
}

function unavailableContinuation(): never {
  throw new PublicRuntimeContinuationError(
    "public_runtime_source_changed_or_unavailable",
    "Public runtime source changed or its retained immutable bundle is unavailable"
  );
}

function invalidContinuation(message: string): PublicRuntimeContinuationError {
  return new PublicRuntimeContinuationError(
    "public_runtime_continuation_invalid",
    message
  );
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("Public runtime continuation secret must be at least 32 bytes");
  }
}

function signingKey(secret: string): Buffer {
  return createHash("sha256")
    .update("askrigor-public-runtime-continuation-v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

function readNow(now: (() => number) | undefined): number {
  const value = (now ?? Date.now)();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Public runtime clock is invalid");
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Public runtime ${label} must be a positive safe integer`);
  }
  return value;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
