import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { contactPatternKind } from "@askrigor/evidence-repository";
import { z } from "zod";

/**
 * Shared questions and answers (owner answer 200a, 2026-10-30): "we aren't logging every question/answer but just the
 * ones users send for improvement". An answer ends with the owner's offer; on the person's yes the AI writes a
 * de-identified copy, shows it, and sends it only once they confirm. The copy is kept apart from their account,
 * encrypted, never public, for SHARED_ANSWER_RETENTION_DAYS, and a code shown once deletes it sooner.
 */

/** The owner's sentence, word for word: the last line of an answer when sharing is on. */
export const SHARE_OFFER_LINE = "Send this de-identified question & answer to AskRigor for improvements? If yes, " +
  "optionally specify what should be improved.";

/** The lesson queue's deletion window. */
export const SHARED_ANSWER_RETENTION_DAYS = 90;
/** Shares per account per UTC day, counted in memory only. */
export const SHARED_ANSWER_DAILY_LIMIT = 20;
export const SHARED_ANSWER_LIMITS = { question: 4_000, answer: 30_000, improve: 1_000 } as const;
const DEFAULT_MAX_RECORDS = 5_000;
const MAX_ENVELOPE_BYTES = 512 * 1_024;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DAY_MS = 86_400_000;
const ENVELOPE_VERSION = "askrigor_shared_answer_v1";

/** What the person is told before they confirm, and again in the result. */
export const SHARED_ANSWER_KEPT = `AskRigor keeps this copy apart from your account, never public, only to make test ` +
  `cases and fixes, for ${SHARED_ANSWER_RETENTION_DAYS} days; the code it gives you deletes it sooner.`;

/** The final check's offer (runtime only; the published tool list stays fixed, owner answer 189a). */
export const SHARE_OFFER = Object.freeze({
  line: SHARE_OFFER_LINE,
  on_yes: "End the answer you deliver with line, as its last line, after check_line or unchecked_line. If the person " +
    "says yes: write a de-identified copy of their question, with the earlier messages it needs, and of your answer. " +
    "Leave out names, contact details, exact dates, places smaller than a country, and anything else that could " +
    "identify them or anyone they mention; give an age or another personal detail only as a range, and only when it " +
    "matters. Keep the sources and their links. Show the copy and what they want improved, tell them: " +
    `"${SHARED_ANSWER_KEPT}", and ask them to confirm. Send nothing before they confirm. Then call ` +
    "manage_research_access with action share_answer and later_inputs.sharedAnswer: {question, answer, improve " +
    "(only if they said what to improve), confirmed: true}, and give them the code the result returns.",
});

export const sharedAnswerInputSchema = z.object({
  question: z.string().trim().min(1).max(SHARED_ANSWER_LIMITS.question)
    .describe("The de-identified copy of the person's question, with the earlier messages it needs."),
  answer: z.string().trim().min(1).max(SHARED_ANSWER_LIMITS.answer)
    .describe("The de-identified copy of the answer, with its sources and links."),
  improve: z.string().trim().min(1).max(SHARED_ANSWER_LIMITS.improve).optional()
    .describe("What the person wants improved, only if they said."),
  confirmed: z.literal(true)
    .describe("true: the person saw this exact copy and confirmed sending it."),
}).strict();
export type SharedAnswerInput = z.infer<typeof sharedAnswerInputSchema>;

/** A deletion code: "sa1-" and 16 random bytes in base64url. */
export const shareCodeSchema = z.string().regex(/^sa1-[A-Za-z0-9_-]{22}$/u)
  .describe("The code share_answer returned, to delete that shared answer.");
/** A shared answer's ID in the owner's review: a keyed hash of its code, which names nothing else. */
export const sharedAnswerIdSchema = z.string().regex(/^[a-f0-9]{32}$/u)
  .describe("A shared answer's ID, from list_shared_answers.");

/** The versions a shared answer was given under, for the owner's regression cases. */
export interface SharedAnswerVersions { build?: string; hrp?: string; universal?: string }

export interface SharedAnswerSummary {
  id: string;
  sharedAt: string;
  expiresAt: string;
  build?: string;
  hrp?: string;
  universal?: string;
  characters: { question: number; answer: number; improve: number };
}

export interface SharedAnswerRecord extends SharedAnswerSummary {
  question: string;
  answer: string;
  improve?: string;
}

const versionSchema = z.string().regex(/^[A-Za-z0-9._+-]{1,64}$/u);
const timestampSchema = z.string().datetime({ offset: true });
const envelopeMetadataSchema = z.object({
  envelope_version: z.literal(ENVELOPE_VERSION),
  id: sharedAnswerIdSchema,
  shared_at: timestampSchema,
  expires_at: timestampSchema,
  build: versionSchema.optional(),
  hrp: versionSchema.optional(),
  universal: versionSchema.optional(),
  characters: z.object({
    question: z.number().int().min(1),
    answer: z.number().int().min(1),
    improve: z.number().int().min(0),
  }).strict(),
  algorithm: z.literal("AES-256-GCM"),
}).strict();
const envelopeSchema = envelopeMetadataSchema.extend({
  nonce: z.string().regex(/^[A-Za-z0-9_-]+$/u),
  ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/u),
  auth_tag: z.string().regex(/^[A-Za-z0-9_-]+$/u),
}).strict();
type EnvelopeMetadata = z.infer<typeof envelopeMetadataSchema>;
const plaintextSchema = z.object({
  question: z.string(),
  answer: z.string(),
  improve: z.string().optional(),
}).strict();

export class SharedAnswersFullError extends Error {
  constructor() {
    super("Shared answers are at their limit");
    this.name = "SharedAnswersFullError";
  }
}

export class SharedAnswerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedAnswerIntegrityError";
  }
}

/**
 * The contact screen's exact patterns (an e-mail address, a phone number, a credential or token, a street address),
 * over every text of the copy: each match is a problem naming the field and the pattern's kind, never the text.
 * Whether the copy is de-identified is a judgment of meaning, which stays with the AI and the person who confirms it.
 */
export function sharedAnswerProblems(input: SharedAnswerInput): string[] {
  return (["question", "answer", "improve"] as const).flatMap((field) => {
    const text = input[field];
    const kind = text === undefined ? undefined : contactPatternKind(text);
    return kind === undefined ? [] : [`sharedAnswer.${field} holds what looks like ${kind}: take it out of the copy, ` +
      "show the person the corrected copy, and send it only once they confirm it."];
  });
}

export interface SharedAnswerVaultOptions {
  /** An absolute, owner-private directory; created with mode 0700 when missing. */
  directory: string;
  /** 32 random bytes. The encryption key and the ID key are derived from it. */
  key: Buffer;
  now?: () => Date;
  maxRecords?: number;
}

/**
 * One AES-256-GCM envelope per shared answer, named by a keyed hash of its deletion code. Nothing in it names an
 * account; its metadata (times, versions and sizes) is authenticated with the text. Expired envelopes are deleted by
 * sweep, which every operation runs first and the server runs at start-up and every hour.
 */
export class SharedAnswerVault {
  private readonly root: string;
  private readonly encryptionKey: Buffer;
  private readonly idKey: Buffer;
  private readonly now: () => Date;
  private readonly maxRecords: number;

  constructor(options: SharedAnswerVaultOptions) {
    if (options.key.byteLength !== 32) throw new Error("The shared-answers key must be 32 bytes");
    this.root = prepareOwnedRoot(options.directory);
    this.encryptionKey = Buffer.from(hkdfSync("sha256", options.key, Buffer.alloc(0),
      "askrigor shared answers: encryption v1", 32));
    this.idKey = Buffer.from(hkdfSync("sha256", options.key, Buffer.alloc(0), "askrigor shared answers: id v1", 32));
    this.now = options.now ?? (() => new Date());
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  /** Keeps the copy; returns its deletion code, shown once, and when it expires. */
  share(input: SharedAnswerInput, versions: SharedAnswerVersions = {}): { code: string; expiresAt: string } {
    this.sweep();
    if (this.ids().length >= this.maxRecords) throw new SharedAnswersFullError();
    const code = `sa1-${randomBytes(16).toString("base64url")}`;
    const id = this.idForCode(code);
    const sharedAt = this.now();
    const metadata: EnvelopeMetadata = envelopeMetadataSchema.parse({
      envelope_version: ENVELOPE_VERSION,
      id,
      shared_at: sharedAt.toISOString(),
      expires_at: new Date(sharedAt.getTime() + SHARED_ANSWER_RETENTION_DAYS * DAY_MS).toISOString(),
      ...cleanVersions(versions),
      characters: { question: input.question.length, answer: input.answer.length, improve: input.improve?.length ?? 0 },
      algorithm: "AES-256-GCM",
    });
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
    cipher.setAAD(metadataBytes(metadata));
    const plaintext = Buffer.from(JSON.stringify({
      question: input.question, answer: input.answer, ...(input.improve === undefined ? {} : { improve: input.improve }),
    }), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const bytes = Buffer.from(`${JSON.stringify({
      ...metadata,
      nonce: nonce.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      auth_tag: cipher.getAuthTag().toString("base64url"),
    })}\n`, "utf8");
    if (bytes.byteLength > MAX_ENVELOPE_BYTES) throw new SharedAnswerIntegrityError("A shared answer is too large");
    writeCreateOnly(this.root, this.path(id), bytes);
    return { code, expiresAt: metadata.expires_at };
  }

  /** Deletes the shared answer this code was given for; false when there is none (deleted, expired or never kept). */
  deleteByCode(code: string): boolean {
    this.sweep();
    return this.remove(this.idForCode(shareCodeSchema.parse(code)));
  }

  /** The owner's review: deletes one shared answer by its ID. */
  deleteById(id: string): boolean {
    this.sweep();
    return this.remove(sharedAnswerIdSchema.parse(id));
  }

  /** The owner's review: every kept shared answer's times, versions and sizes, newest first, without its text. */
  list(): SharedAnswerSummary[] {
    this.sweep();
    return this.ids().flatMap((id) => {
      const envelope = this.envelope(id);
      return envelope === undefined ? [] : [summaryOf(envelope)];
    }).sort((a, b) => b.sharedAt.localeCompare(a.sharedAt) || a.id.localeCompare(b.id));
  }

  /** The owner's review: one shared answer with its text; undefined when it is not kept. */
  read(id: string): SharedAnswerRecord | undefined {
    this.sweep();
    const envelope = this.envelope(sharedAnswerIdSchema.parse(id));
    if (envelope === undefined) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, strictBase64Url(envelope.nonce, NONCE_BYTES));
    decipher.setAAD(metadataBytes(envelope));
    decipher.setAuthTag(strictBase64Url(envelope.auth_tag, AUTH_TAG_BYTES));
    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([decipher.update(strictBase64Url(envelope.ciphertext)), decipher.final()]);
    } catch {
      throw new SharedAnswerIntegrityError("A shared answer did not authenticate");
    }
    const text = plaintextSchema.parse(JSON.parse(plaintext.toString("utf8")));
    return { ...summaryOf(envelope), ...text };
  }

  /** Deletes every expired shared answer, and returns how many. Files it cannot read are left alone. */
  sweep(): number {
    const now = this.now().getTime();
    let removed = 0;
    for (const id of this.ids()) {
      const envelope = this.envelope(id);
      if (envelope !== undefined && Date.parse(envelope.expires_at) <= now && this.remove(id)) removed += 1;
    }
    return removed;
  }

  private idForCode(code: string): string {
    return createHmac("sha256", this.idKey).update(code, "utf8").digest("hex").slice(0, 32);
  }

  private path(id: string): string {
    return join(this.root, `${sharedAnswerIdSchema.parse(id)}.json`);
  }

  private ids(): string[] {
    return readdirSync(this.root).flatMap((name) => /^[a-f0-9]{32}\.json$/u.test(name) ? [name.slice(0, 32)] : []);
  }

  private envelope(id: string): z.infer<typeof envelopeSchema> | undefined {
    let bytes: Buffer;
    try {
      bytes = readBoundedRegularFile(this.path(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const parsed = envelopeSchema.safeParse(safeJson(bytes.toString("utf8")));
    if (!parsed.success || parsed.data.id !== id) return undefined;
    return parsed.data;
  }

  private remove(id: string): boolean {
    try {
      unlinkSync(this.path(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    syncDirectory(this.root);
    return true;
  }
}

/**
 * The vault the server's settings ask for: ASKRIGOR_SHARED_ANSWERS_DIRECTORY (absolute) and
 * ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL (32 random bytes, canonical unpadded base64url). Sharing is off, and no answer
 * offers it, unless both are set; one without the other, a malformed key or an unusable directory throws.
 */
export function sharedAnswerVaultFromEnv(env: NodeJS.ProcessEnv = process.env): SharedAnswerVault | undefined {
  const directory = env.ASKRIGOR_SHARED_ANSWERS_DIRECTORY?.trim();
  const encoded = env.ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL?.trim();
  if (!directory && !encoded) return undefined;
  if (!directory || !encoded) {
    throw new Error("ASKRIGOR_SHARED_ANSWERS_DIRECTORY and ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL go together");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("ASKRIGOR_SHARED_ANSWERS_KEY_BASE64URL must be 32 bytes in canonical unpadded base64url");
  }
  return new SharedAnswerVault({ directory, key });
}

/**
 * Counts each account's shares in the current UTC day, in memory only: nothing about who shared is kept, and a
 * restart starts the count again. Returns whether this share is within the limit.
 */
export function createShareLimiter(limit = SHARED_ANSWER_DAILY_LIMIT, now: () => Date = () => new Date()) {
  const counts = new Map<string, { day: string; count: number }>();
  return (accountKey: string): boolean => {
    const day = now().toISOString().slice(0, 10);
    const key = createHash("sha256").update(accountKey, "utf8").digest("hex");
    if (counts.size > 10_000) {
      for (const [stored, value] of counts) if (value.day !== day) counts.delete(stored);
    }
    const entry = counts.get(key);
    const count = entry?.day === day ? entry.count : 0;
    if (count >= limit) return false;
    counts.set(key, { day, count: count + 1 });
    return true;
  };
}

function cleanVersions(versions: SharedAnswerVersions): Partial<Record<"build" | "hrp" | "universal", string>> {
  return Object.fromEntries((["build", "hrp", "universal"] as const).flatMap((name) => {
    const value = versions[name];
    return value !== undefined && versionSchema.safeParse(value).success ? [[name, value]] : [];
  }));
}

function summaryOf(envelope: EnvelopeMetadata): SharedAnswerSummary {
  return {
    id: envelope.id,
    sharedAt: envelope.shared_at,
    expiresAt: envelope.expires_at,
    ...(envelope.build === undefined ? {} : { build: envelope.build }),
    ...(envelope.hrp === undefined ? {} : { hrp: envelope.hrp }),
    ...(envelope.universal === undefined ? {} : { universal: envelope.universal }),
    characters: { ...envelope.characters },
  };
}

function metadataBytes(envelope: EnvelopeMetadata): Buffer {
  const { envelope_version, id, shared_at, expires_at, build, hrp, universal, characters, algorithm } = envelope;
  return Buffer.from(JSON.stringify({ envelope_version, id, shared_at, expires_at, build, hrp, universal,
    characters: { question: characters.question, answer: characters.answer, improve: characters.improve }, algorithm }),
  "utf8");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function prepareOwnedRoot(rawRoot: string): string {
  if (!isAbsolute(rawRoot)) throw new Error("The shared-answers directory must be absolute");
  const normalized = resolve(rawRoot);
  if (normalized === "/") throw new Error("The shared-answers directory cannot be the filesystem root");
  mkdirSync(normalized, { recursive: true, mode: 0o700 });
  const metadata = lstatSync(normalized);
  const expectedUid = process.getuid?.();
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    (Number.isSafeInteger(expectedUid) && expectedUid! >= 0 && metadata.uid !== expectedUid) ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error("The shared-answers directory must be owner-private");
  }
  return realpathSync(normalized);
}

function readBoundedRegularFile(path: string): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_ENVELOPE_BYTES) {
      throw new SharedAnswerIntegrityError("A shared-answer file is invalid or oversized");
    }
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/** Writes a new file in full (mode 0600), then links it into place; an existing file is never replaced. */
function writeCreateOnly(root: string, destination: string, bytes: Buffer): void {
  const temporary = join(root, `.${randomUUID()}.tmp`);
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
    constants.O_NOFOLLOW, 0o600);
  try {
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    linkSync(temporary, destination);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // Best-effort cleanup only; dot-prefixed staging files are never listed.
    }
  }
  syncDirectory(root);
  const finalMetadata = statSync(destination);
  if (!finalMetadata.isFile() || (finalMetadata.mode & 0o077) !== 0) {
    throw new SharedAnswerIntegrityError("A shared-answer file's permissions are too broad");
  }
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function strictBase64Url(value: string, expectedBytes?: number): Buffer {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value || (expectedBytes !== undefined && decoded.byteLength !== expectedBytes)) {
    throw new SharedAnswerIntegrityError("A shared answer's envelope is invalid");
  }
  return decoded;
}

/** The server's sharing: its vault and its in-memory daily limit. */
export interface SharedAnswers {
  vault: SharedAnswerVault;
  allow: (accountKey: string) => boolean;
}

let fromEnvironment: SharedAnswers | null | undefined;

/**
 * The server's sharing, made once from its settings (undefined when off), with the expiry sweep at start-up and every
 * hour while the server runs. Settings it cannot use turn sharing off with one log line, which names no value, so
 * research goes on without the offer.
 */
export function sharedAnswersFromEnv(env: NodeJS.ProcessEnv = process.env): SharedAnswers | undefined {
  if (fromEnvironment === undefined) {
    let vault: SharedAnswerVault | undefined;
    try {
      vault = sharedAnswerVaultFromEnv(env);
    } catch (error) {
      console.error(`AskRigor shared answers are off: ${error instanceof Error ? error.message : "unusable settings"}`);
    }
    fromEnvironment = vault === undefined ? null : { vault, allow: createShareLimiter() };
    if (vault !== undefined) {
      vault.sweep();
      setInterval(() => {
        try {
          vault.sweep();
        } catch {
          // The next sweep, and every operation's own, tries again.
        }
      }, 3_600_000).unref();
    }
  }
  return fromEnvironment ?? undefined;
}
