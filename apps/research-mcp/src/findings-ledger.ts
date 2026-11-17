import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { z } from "zod";

import { maskedRule, type CheckRule } from "./check-rules.js";
import { NEXT_STEP_KINDS, type NextStepKind } from "./next-step-kinds.js";

/**
 * The findings ledger, stage 1 of enforcing HRP (design-v2 of 17 Nov 2026, after Codex's red team; owner answers 338a and
 * 339a). Every problem the final check reports, one of the six stops or a note, becomes a record with an id, carried
 * through the draft's edits, and a disposition: open, unresolved, fixed, withdrawn, disputed or not rechecked. "The
 * writer replied" is not "the problem was fixed": a fix or a withdrawal counts only when the next check no longer finds
 * it, and a dispute is shown to the reader with the writer's reason.
 *
 * The ledger travels with the AI as a signed token (later_inputs.findings_ledger), domain-separated from research
 * receipts, carried state and round tokens, and bound to the account, the research target, the checked draft and the
 * running versions. It holds no words of the answer: digests, ids, dispositions and the writer's dispute reasons. The
 * server keeps, per process and for two hours, the last ledger it issued for an account and research target, digests
 * only, so a call that leaves the ledger out, or passes an older one, is detected; across processes or restarts the
 * signed token alone carries it.
 *
 * Off unless ASKRIGOR_FINDINGS_LEDGER is "on". It adds a record of what the check found and never changes what the check
 * finds or stops: the six stops stay six. Holding a claim (owner answer 338a) waits for the owner's answer on how it fits
 * with the six stops, and is not built here.
 */

export const FINDINGS_LEDGER_RULES_VERSION = "2026-11-17.1";
export const FINDINGS_LEDGER_MAX_CHARACTERS = 24_000;
/** How long the server remembers the last ledger it issued for an account and research target. */
export const FINDINGS_LEDGER_MEMORY_MS = 2 * 60 * 60 * 1000;
const FINDINGS_LEDGER_MEMORY_ENTRIES = 2_000;
const MAX_ENTRIES = 60;
const MAX_RESPONSES = 30;
const SKETCH_SIZE = 16;
/** A finding of the same rule whose inserted words overlap an earlier one's at least this much is the same finding. */
export const FINDINGS_SAME_AFTER_EDIT = 0.5;

export function findingsLedgerEnabledFromEnv(value = process.env.ASKRIGOR_FINDINGS_LEDGER): boolean {
  return value?.trim() === "on";
}

export const FINDING_DISPOSITIONS = ["open", "unresolved", "fixed", "withdrawn", "disputed", "not_rechecked"] as const;
export type FindingDisposition = (typeof FINDING_DISPOSITIONS)[number];
export const FINDINGS_LEDGER_STATES = ["new", "continued", "omitted", "replayed", "rejected", "versions_changed"] as const;
export type FindingsLedgerState = (typeof FINDINGS_LEDGER_STATES)[number];
export const FINDING_RESPONSES = ["fixed", "withdrawn", "disputed"] as const;
/** Kinds about the call itself (its inputs, receipts, carried state or tool list), never shown to the reader. */
const CALL_KINDS: ReadonlySet<NextStepKind> = new Set(["input_invalid", "receipt_rejected", "carried_state", "tool_list"]);
/** Kinds whose findings only a check that read a draft can find again. */
const DRAFT_KINDS: ReadonlySet<NextStepKind> = new Set(["answer_draft", "second_reading"]);
/**
 * Which part of the check found a finding (Codex's review of 17 Nov 2026, finding 1): an earlier finding no longer found
 * counts as fixed only when the part that found it ran in full in this call. rules: the check's rules, which run at
 * every call; passing: what the check reads only of a passing answer; source_lines, backing_lines and study_map: the
 * look-ups of a passing answer's quotes, a checked card's backing lines and the study map; meaning_judge, second_reading
 * and review: the AI readings; call: what is said of the call itself.
 */
export const FINDING_CHECKERS = ["rules", "passing", "source_lines", "backing_lines", "study_map", "meaning_judge",
  "second_reading", "review", "call"] as const;
export type FindingChecker = (typeof FINDING_CHECKERS)[number];
/** What ran in full when nothing else is said: the rules and what is said of the call. */
const ALWAYS_RUN: readonly FindingChecker[] = ["rules", "call"];
const CHECKER_NAMES: Record<FindingChecker, string> = {
  rules: "the check's rules", passing: "the checks of a passing answer", source_lines: "the look-up of source_lines' quotes",
  backing_lines: "the look-up of the findings card's backing lines", study_map: "the look-up of the study map",
  meaning_judge: "the meaning judge", second_reading: "the second reading", review: "AskRigor's review of the draft",
  call: "the check of the call"
};

/** What a check found, as its single admission point and its notes give it. */
export interface ObservedFinding {
  kind?: NextStepKind;
  /** The blocking rule, for one of the six stops; absent for a note. */
  stop?: string;
  text: string;
  rule?: CheckRule;
  /** A finding about the call itself rather than the answer (never shown to the reader). */
  call?: boolean;
  /** A finding the writer dismissed through an older input (reader_dismissed), with its reason: disputed, not fixed. */
  disputed?: string;
  /** The part of the check that found it; by default the second reading for its kind, else the rules. */
  checker?: FindingChecker;
}
function checkerOf({ checker, kind }: { checker?: FindingChecker | undefined; kind?: NextStepKind | undefined }):
  FindingChecker {
  return checker ?? (kind === "second_reading" ? "second_reading" : "rules");
}

const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`, "u"));
const entrySchema = z.object({
  id: z.string().regex(/^F-[0-9a-f]{10}$/u),
  r: hex(12),
  f: hex(16),
  h: z.array(hex(6)).max(SKETCH_SIZE),
  d: z.enum(FINDING_DISPOSITIONS),
  n: z.number().int().min(1).max(10_000),
  l: z.number().int().min(1).max(10_000),
  k: z.enum(NEXT_STEP_KINDS).optional(),
  s: z.string().regex(/^[a-z_]{1,40}$/u).optional(),
  c: z.literal(true).optional(),
  w: z.string().trim().min(1).max(300).optional(),
  i: z.array(hex(12)).max(6).optional(),
  x: z.enum(FINDING_CHECKERS).optional()
}).strict();
type LedgerEntry = z.output<typeof entrySchema>;
const payloadSchema = z.object({
  v: z.literal(1),
  a: hex(16),
  t: hex(16),
  ver: hex(16),
  seq: z.number().int().min(1).max(100_000),
  rev: z.number().int().min(1).max(10_000),
  d: z.union([hex(16), z.literal("")]),
  at: z.iso.datetime(),
  e: z.array(entrySchema).max(MAX_ENTRIES)
}).strict()
  // Codex's review of 17 Nov 2026, finding 4: one id names one finding, so a response addresses exactly one.
  .refine(({ e }) => new Set(e.map(({ id }) => id)).size === e.length, { message: "Two findings have one id." });
export type FindingsLedgerPayload = z.output<typeof payloadSchema>;

export const checkFindingSchema = z.object({
  id: z.string(),
  kind: z.enum(NEXT_STEP_KINDS).optional(),
  stop: z.string().optional().describe("The blocking check, for one of the six stops; absent for a note."),
  text: z.string().optional().describe("The check's own words, absent for a finding no longer found."),
  disposition: z.enum(FINDING_DISPOSITIONS),
  reason: z.string().optional().describe("For a disputed finding: the writer's reason, which the reader sees."),
  reader: z.boolean().describe("Whether the panel may list it to the reader under a passing check."),
  first_revision: z.number().int().positive(),
  last_revision: z.number().int().positive()
}).strict();
export const checkFindingsSchema = z.object({
  ledger: z.enum(FINDINGS_LEDGER_STATES),
  revision: z.number().int().positive(),
  findings: z.array(checkFindingSchema)
}).strict();
export type CheckFindings = z.output<typeof checkFindingsSchema>;

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("askrigor findings ledger v1").digest();
}
function digest(secret: string, purpose: string, value: string, length: number): string {
  return createHmac("sha256", key(secret)).update(`${purpose}\u0000${value}`).digest("hex").slice(0, length);
}

export function findingsLedgerAccountDigest(secret: string, account: string | undefined): string {
  return digest(secret, "account", account ?? "", 16);
}
export function findingsLedgerTargetDigest(secret: string, target: string): string {
  return digest(secret, "target", normalized(target), 16);
}
/** The server memory's key for an account and research target. */
export function findingsLedgerMemoryKey(secret: string, account: string | undefined, target: string): string {
  return `${findingsLedgerAccountDigest(secret, account)}${findingsLedgerTargetDigest(secret, target)}`;
}
function versionsDigest(secret: string, versions: { hrp: string; universal: string; build: string } | undefined): string {
  return digest(secret, "versions", [versions?.hrp ?? "unknown", versions?.universal ?? "unknown",
    versions?.build ?? "unknown", FINDINGS_LEDGER_RULES_VERSION].join("|"), 16);
}

function normalized(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
    .replace(/\s+/gu, " ").trim();
}

function mac(body: string, secret: string): Buffer {
  return createHmac("sha256", key(secret)).update(`token\u0000${body}`).digest().subarray(0, 16);
}

export function issueFindingsLedger(payload: FindingsLedgerPayload, secret: string): string | undefined {
  const checked = payloadSchema.parse(payload);
  const entries = [...checked.e];
  for (;;) {
    const body = `fl1~${deflateRawSync(Buffer.from(JSON.stringify({ ...checked, e: entries }))).toString("base64url")}`;
    const token = `${body}~${mac(body, secret).toString("base64url")}`;
    if (token.length <= FINDINGS_LEDGER_MAX_CHARACTERS) return token;
    if (entries.length === 0) return undefined;
    // The oldest settled finding goes first (settled ones come last, oldest at the end), then the last of any.
    let settled = -1;
    entries.forEach(({ d }, index) => { if (d === "fixed" || d === "withdrawn") settled = index; });
    entries.splice(settled >= 0 ? settled : entries.length - 1, 1);
  }
}

export type FindingsLedgerVerification =
  | { ok: true; payload: FindingsLedgerPayload }
  | { ok: false; reason: "malformed" | "bad_signature" };

export function verifyFindingsLedger(token: unknown, secret: string): FindingsLedgerVerification {
  if (typeof token !== "string" || token.length > FINDINGS_LEDGER_MAX_CHARACTERS) return { ok: false, reason: "malformed" };
  const parts = token.split("~");
  if (parts.length !== 3 || parts[0] !== "fl1" || !/^[A-Za-z0-9_-]+$/u.test(parts[1]!) ||
      !/^[A-Za-z0-9_-]{22}$/u.test(parts[2]!)) return { ok: false, reason: "malformed" };
  const body = `${parts[0]}~${parts[1]}`;
  const signature = Buffer.from(parts[2]!, "base64url");
  if (signature.length !== 16 || signature.toString("base64url") !== parts[2] ||
      !timingSafeEqual(mac(body, secret), signature)) return { ok: false, reason: "bad_signature" };
  try {
    const raw: unknown = JSON.parse(inflateRawSync(Buffer.from(parts[1]!, "base64url"), { maxOutputLength: 256 * 1024 })
      .toString("utf8"));
    const parsed = payloadSchema.safeParse(raw);
    return parsed.success ? { ok: true, payload: parsed.data } : { ok: false, reason: "malformed" };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/** The last ledger the server issued for an account and research target: digests only. */
export interface RememberedLedger {
  payload: FindingsLedgerPayload;
  /** The digest of that token, and of the token it was issued from (absent for a new ledger). */
  token: string;
  parent?: string;
  at: number;
}
export interface FindingsLedgerMemory {
  get(key: string, now?: number): RememberedLedger | undefined;
  remember(key: string, token: string, secret: string, parent: unknown, now?: number): void;
}

export function createFindingsLedgerMemory(): FindingsLedgerMemory {
  const kept = new Map<string, RememberedLedger>();
  return {
    get(memoryKey, now = Date.now()) {
      const found = kept.get(memoryKey);
      if (found === undefined) return undefined;
      if (now - found.at > FINDINGS_LEDGER_MEMORY_MS) { kept.delete(memoryKey); return undefined; }
      return found;
    },
    remember(memoryKey, token, secret, parent, now = Date.now()) {
      const verified = verifyFindingsLedger(token, secret);
      if (!verified.ok) return;
      kept.delete(memoryKey);
      if (kept.size >= FINDINGS_LEDGER_MEMORY_ENTRIES) kept.delete(kept.keys().next().value!);
      kept.set(memoryKey, { payload: verified.payload, token: tokenDigest(token),
        ...(typeof parent === "string" ? { parent: tokenDigest(parent) } : {}), at: now });
    }
  };
}
/** This process's memory, used by the MCP tool. */
export const findingsLedgerMemory = createFindingsLedgerMemory();

/** A later input, given in later_inputs (an object or its JSON text) or at the top level. */
export function laterInputValue(raw: unknown, name: string): unknown {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(raw)) return undefined;
  let later = raw.later_inputs;
  if (typeof later === "string") {
    try { later = JSON.parse(later); } catch { later = undefined; }
  }
  if (object(later) && Object.hasOwn(later, name)) return later[name];
  return Object.hasOwn(raw, name) ? raw[name] : undefined;
}

interface FindingResponse { id: string; response: (typeof FINDING_RESPONSES)[number]; reason?: string; passage?: string }
const responseSchema = z.object({
  id: z.string().trim().regex(/^F-[0-9a-f]{10}$/u),
  response: z.enum(FINDING_RESPONSES),
  reason: z.string().trim().min(1).max(300).optional(),
  passage: z.string().trim().min(1).max(600).optional()
}).strict();

function readResponses(raw: unknown, notes: string[]): Map<string, FindingResponse> {
  const responses = new Map<string, FindingResponse>();
  let value = laterInputValue(raw, "finding_responses");
  if (value === undefined || value === null) return responses;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { /* named below */ }
  }
  if (!Array.isArray(value)) {
    notes.push("later_inputs.finding_responses was not read: give a list of {id, response, reason}, response one of " +
      "fixed, withdrawn or disputed.");
    return responses;
  }
  value.slice(0, MAX_RESPONSES).forEach((entry, index) => {
    const parsed = responseSchema.safeParse(entry);
    if (!parsed.success) {
      notes.push(`later_inputs.finding_responses[${index}] was not read: give id (such as F-0123456789), response ` +
        "(fixed, withdrawn or disputed), a reason of at most 300 characters for disputed, and for withdrawn the passage " +
        "withdrawn if you can.");
      return;
    }
    if (parsed.data.response === "disputed" && parsed.data.reason === undefined) {
      notes.push(`later_inputs.finding_responses[${index}] disputes ${parsed.data.id} without a reason; a dispute counts ` +
        "only with a reason the reader can see.");
      return;
    }
    responses.set(parsed.data.id, parsed.data);
  });
  if (value.length > MAX_RESPONSES) notes.push(`Only the first ${MAX_RESPONSES} of later_inputs.finding_responses were read.`);
  return responses;
}

/** A plain string turned into a rule by ruleParts: its wording and its values can't be told apart. */
function opaque(rule: CheckRule | undefined): boolean {
  return rule === undefined || (rule.parts.length === 2 && rule.parts[0] === "" && rule.parts[1] === "" &&
    rule.values.length === 1 && typeof rule.values[0] === "string");
}
function leafValues(rule: CheckRule): string[] {
  return rule.values.flatMap((value) => {
    if (typeof value === "object" && value !== null && "parts" in value && "values" in value && "text" in value) {
      return leafValues(value as CheckRule);
    }
    return [String(value)];
  });
}
function template(finding: ObservedFinding): string {
  return opaque(finding.rule)
    ? finding.text.replace(/"[^"]*"|“[^”]*”/gu, "…").replace(/\p{Nd}+/gu, "#")
    : maskedRule(finding.rule, () => false);
}
function valuesText(finding: ObservedFinding): string {
  return normalized(opaque(finding.rule) ? finding.text : leafValues(finding.rule!).join("\u0001"));
}

const IDENTIFIER = /\b10\.\d{4,9}\/[^\s"'<>\]\)]+|\bpmid:?\s*\d{5,9}\b|\bpmc\d{4,9}\b|\bnct\d{8}\b/giu;
function identifiers(text: string): string[] {
  return [...new Set([...text.matchAll(IDENTIFIER)].map(([found]) =>
    found.toLowerCase().replace(/^pmid:?\s*/u, "pmid:").replace(/[.,;:]+$/u, "")))];
}

interface Fingerprinted extends ObservedFinding { r: string; f: string; h: string[]; ids: string[] }

function fingerprinted(secret: string, finding: ObservedFinding): Fingerprinted {
  const rule = digest(secret, "rule", `${finding.kind ?? ""}\u0000${finding.stop ?? ""}\u0000${template(finding)}`, 12);
  const values = valuesText(finding);
  const words = [...new Set(values.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3))];
  return {
    ...finding,
    r: rule,
    f: digest(secret, "finding", `${rule}\u0000${values}`, 16),
    h: [...new Set(words.map((word) => digest(secret, "word", word, 6)))].sort().slice(0, SKETCH_SIZE),
    ids: identifiers(values).slice(0, 6)
  };
}

/** How much two findings' inserted words overlap, from their sketches (the smallest word digests of each). */
export function sketchSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const union = [...new Set([...left, ...right])].sort().slice(0, SKETCH_SIZE);
  const both = union.filter((word) => left.includes(word) && right.includes(word)).length;
  return both / union.length;
}

const SETTLED: ReadonlySet<FindingDisposition> = new Set(["fixed", "withdrawn"]);

export const FINDINGS_LEDGER_NOTE = "Each problem this check found has an id in check_findings, with its disposition. " +
  "Pass findings_ledger back as later_inputs.findings_ledger in this research's next finalize_research call. For a " +
  "finding you won't fix, give later_inputs.finding_responses [{\"id\": \"F-...\", \"response\": \"disputed\", " +
  "\"reason\": \"...\"}], with a reason the reader will see; \"fixed\" and \"withdrawn\" (with the passage withdrawn) " +
  "count only when the next draft no longer gives the check that finding. Under a passing check, the panel lists the " +
  "open, unresolved and disputed findings to the reader.";

export interface FindingsLedgerParams {
  secret: string;
  account: string | undefined;
  target: string;
  versions?: { hrp: string; universal: string; build: string } | undefined;
  /** The call, read for later_inputs.findings_ledger and later_inputs.finding_responses. */
  raw: unknown;
  observed: readonly ObservedFinding[];
  draft: string | undefined;
  /**
   * The parts of the check that ran in full in this call (FINDING_CHECKERS); by default the rules and what is said of
   * the call. An earlier finding of a part that did not is not rechecked: neither fixed nor withdrawn.
   */
  coverage?: readonly FindingChecker[] | undefined;
  remembered?: RememberedLedger | undefined;
  now: Date;
}

export interface FindingsLedgerResult {
  checkFindings: CheckFindings;
  token: string | undefined;
  notes: string[];
}

/**
 * This check's findings, matched with the ledger the call passed back (or, when it left it out or passed an older one,
 * the one the server last issued), with their dispositions and a new signed ledger. Pure: the caller remembers the
 * ledger it returns, once per tool call.
 */
export function findingsLedger(params: FindingsLedgerParams): FindingsLedgerResult {
  const { secret, raw, draft, now } = params;
  const notes: string[] = [];
  const account = findingsLedgerAccountDigest(secret, params.account);
  const target = findingsLedgerTargetDigest(secret, params.target);
  const ver = versionsDigest(secret, params.versions);
  const remembered = params.remembered !== undefined && params.remembered.payload.a === account &&
    params.remembered.payload.t === target ? params.remembered : undefined;
  const given = laterInputValue(raw, "findings_ledger");
  const draftDigest = draft === undefined || draft === "" ? "" : digest(secret, "draft", draft, 16);

  let state: FindingsLedgerState = "new";
  let previous: FindingsLedgerPayload | undefined;
  if (given === undefined || given === null || given === "") {
    if (remembered !== undefined) {
      state = "omitted";
      previous = remembered.payload;
      notes.push(`This call left out later_inputs.findings_ledger, which the last check of this research returned ` +
        `(ledger ${remembered.payload.seq}); its findings were matched with the ledger AskRigor last issued. Pass the ` +
        "latest findings_ledger back in every call.");
    }
  } else {
    const verified = verifyFindingsLedger(given, secret);
    if (!verified.ok) {
      state = "rejected";
      previous = remembered?.payload;
      notes.push("later_inputs.findings_ledger did not verify (it was altered, cut or isn't one), so " +
        (remembered === undefined ? "this check's findings start a new ledger." : "the ledger AskRigor last issued for " +
          "this research was used."));
    } else if (verified.payload.a !== account || verified.payload.t !== target) {
      state = "rejected";
      previous = remembered?.payload;
      notes.push(`later_inputs.findings_ledger belongs to ${verified.payload.a !== account ? "another account"
        : "another research target"}, so it was not used; ` + (remembered === undefined
        ? "this check's findings start a new ledger." : "the ledger AskRigor last issued for this research was used."));
    } else {
      const givenDigest = tokenDigest(given as string);
      const retry = remembered !== undefined && remembered.parent === givenDigest &&
        remembered.payload.d === draftDigest;
      const older = remembered !== undefined && !retry && remembered.token !== givenDigest &&
        remembered.payload.seq >= verified.payload.seq;
      if (older) {
        state = "replayed";
        previous = remembered!.payload;
        notes.push(`later_inputs.findings_ledger is ledger ${verified.payload.seq}, not the latest (ledger ` +
          `${remembered!.payload.seq}) AskRigor issued for this research, so the latest was used. Pass the findings_ledger ` +
          "of the last result.");
      } else {
        state = "continued";
        previous = verified.payload;
      }
    }
  }
  if (previous !== undefined && previous.ver !== ver && state !== "rejected") {
    if (state === "continued") state = "versions_changed";
    notes.push("AskRigor's rules or versions changed since the findings ledger was issued, so its findings were matched " +
      "again under the current ones.");
  }

  const responses = readResponses(raw, notes);
  const previousRevision = previous?.rev ?? 0;
  const draftChanged = draftDigest !== "" && previous !== undefined && previous.d !== draftDigest;
  const revision = draftDigest !== "" && (previous === undefined || previous.d !== draftDigest)
    ? previousRevision + 1 : Math.max(previousRevision, 1);
  const prior = previous?.e ?? [];
  const used = new Set<string>();
  const covered = new Set<FindingChecker>(params.coverage ?? ALWAYS_RUN);

  // One record per finding: the same rule with the same inserted words, found twice in one call, is one finding.
  const observed: Fingerprinted[] = [];
  for (const finding of params.observed) {
    const entry = fingerprinted(secret, finding);
    if (!observed.some(({ f }) => f === entry.f)) observed.push(entry);
  }
  const matches = new Map<Fingerprinted, LedgerEntry>();
  for (const finding of observed) {
    const exact = prior.find((entry) => entry.f === finding.f && !used.has(entry.id));
    if (exact !== undefined) { matches.set(finding, exact); used.add(exact.id); }
  }
  // Carried through an edit: the same rule, a finding still open, and inserted words that overlap enough.
  for (const finding of observed) {
    if (matches.has(finding)) continue;
    let best: { entry: LedgerEntry; similarity: number } | undefined;
    for (const entry of prior) {
      if (used.has(entry.id) || entry.r !== finding.r || SETTLED.has(entry.d)) continue;
      const similarity = sketchSimilarity(entry.h, finding.h);
      if (similarity >= FINDINGS_SAME_AFTER_EDIT && (best === undefined || similarity > best.similarity)) {
        best = { entry, similarity };
      }
    }
    if (best !== undefined) { matches.set(finding, best.entry); used.add(best.entry.id); }
  }

  const findings: CheckFindings["findings"] = [];
  const entries: LedgerEntry[] = [];
  const answered = new Set<string>();
  // A new finding's id is made from what it first was; every id the ledger holds is taken, so one carried through an
  // edit keeps its id and the finding first made with it, seen again, gets another (Codex's review, finding 4).
  const taken = new Set(prior.map(({ id }) => id));
  const newId = (fingerprint: string): string => {
    for (let attempt = 0; ; attempt += 1) {
      const id = `F-${digest(secret, "id", `${account}\u0000${target}\u0000${fingerprint}` +
        (attempt === 0 ? "" : `\u0000${attempt}`), 10)}`;
      if (!taken.has(id)) { taken.add(id); return id; }
    }
  };
  for (const finding of observed) {
    const before = matches.get(finding);
    const id = before?.id ?? newId(finding.f);
    const response = responses.get(id);
    if (response !== undefined) answered.add(id);
    let disposition: FindingDisposition = "open";
    let reason: string | undefined;
    if (response?.response === "disputed") {
      disposition = "disputed";
      reason = response.reason;
    } else if (finding.disputed !== undefined && response === undefined) {
      disposition = "disputed";
      reason = finding.disputed.trim().slice(0, 300) || undefined;
    } else if ((before?.d === "disputed" || before?.d === "not_rechecked") && before.w !== undefined &&
        response === undefined) {
      disposition = "disputed";
      reason = before.w;
    } else if (response !== undefined) {
      disposition = "unresolved";
      notes.push(`${id} is still found by this check, though later_inputs.finding_responses calls it ${response.response}.`);
    } else if (before !== undefined && (draftChanged || before.d === "unresolved" || SETTLED.has(before.d))) {
      disposition = "unresolved";
    }
    const reader = finding.call !== true && (finding.kind === undefined || !CALL_KINDS.has(finding.kind));
    const first = before?.n ?? revision;
    const checker = checkerOf(finding);
    entries.push({
      id, r: finding.r, f: finding.f, h: finding.h, d: disposition, n: first, l: revision,
      ...(finding.kind === undefined ? {} : { k: finding.kind }),
      ...(checker === "rules" ? {} : { x: checker }),
      ...(finding.stop === undefined ? {} : { s: finding.stop }),
      ...(reader ? {} : { c: true as const }),
      ...(reason === undefined ? {} : { w: reason }),
      ...(finding.ids.length === 0 ? {} : { i: finding.ids.map((found) => digest(secret, "identifier", found, 12)) })
    });
    findings.push({
      id, ...(finding.kind === undefined ? {} : { kind: finding.kind }),
      ...(finding.stop === undefined ? {} : { stop: finding.stop }),
      text: finding.text, disposition, ...(reason === undefined ? {} : { reason }), reader,
      first_revision: first, last_revision: revision
    });
  }

  // Earlier findings this check no longer finds. One the part of the check that found it did not look for again, for
  // want of a draft or because that part did not run in full, is not rechecked: the ledger keeps it as it was.
  const draftIdentifiers = draft === undefined ? [] : identifiers(normalized(draft));
  const notRechecked = new Map<string, string[]>();
  for (const entry of prior) {
    if (used.has(entry.id)) continue;
    const response = responses.get(entry.id);
    if (response !== undefined) answered.add(entry.id);
    let disposition = entry.d;
    let shown: FindingDisposition | undefined;
    if (!SETTLED.has(entry.d)) {
      const needsDraft = entry.k === undefined || DRAFT_KINDS.has(entry.k);
      const checker = checkerOf({ checker: entry.x, kind: entry.k });
      if ((needsDraft && draftDigest === "") || !covered.has(checker)) {
        shown = "not_rechecked";
        const why = needsDraft && draftDigest === "" ? "this call gave no answer_draft"
          : `${CHECKER_NAMES[checker]} did not run in full in this call`;
        notRechecked.set(why, [...notRechecked.get(why) ?? [], entry.id]);
      } else if (response?.response === "withdrawn") {
        const still = response.passage !== undefined && draft !== undefined &&
          normalized(draft).includes(normalized(response.passage));
        if (still) {
          notes.push(`${entry.id}: the passage later_inputs.finding_responses withdraws still appears in the draft.`);
          disposition = entry.d === "open" && draftChanged ? "unresolved" : entry.d;
        } else {
          disposition = "withdrawn";
          // What rested on the withdrawn finding: a source it named that the draft still cites.
          const cited = draftIdentifiers.filter((found) =>
            (entry.i ?? []).includes(digest(secret, "identifier", found, 12)));
          if (cited.length > 0) {
            notes.push(`${entry.id} was withdrawn, but the draft still cites ${cited.join(", ")}; check that nothing ` +
              "else in it rests on what was withdrawn.");
          }
        }
      } else {
        disposition = "fixed";
      }
    }
    const changed = disposition !== entry.d;
    entries.push({ ...entry, d: disposition });
    if (changed || !SETTLED.has(disposition)) {
      findings.push({ id: entry.id, ...(entry.k === undefined ? {} : { kind: entry.k }),
        ...(entry.s === undefined ? {} : { stop: entry.s }), disposition: shown ?? disposition,
        ...(shown === undefined && disposition === "disputed" && entry.w !== undefined ? { reason: entry.w } : {}),
        reader: entry.c !== true, first_revision: entry.n, last_revision: entry.l });
    }
  }
  for (const [why, ids] of notRechecked) {
    notes.push(`${joinIds(ids)} ${ids.length === 1 ? "was" : "were"} not checked again: ${why}, so ` +
      `${ids.length === 1 ? "it is" : "they are"} neither fixed nor withdrawn until a check that looks for ` +
      `${ids.length === 1 ? "it" : "them"} again.`);
  }
  for (const id of responses.keys()) {
    if (!answered.has(id)) {
      notes.push(`later_inputs.finding_responses names ${id}, which is not a finding of this research's ledger.`);
    }
  }
  // The newest first, so a full ledger loses the oldest settled findings.
  const kept = [...entries.filter(({ d }) => !SETTLED.has(d)), ...entries.filter(({ d }) => SETTLED.has(d))]
    .slice(0, MAX_ENTRIES);
  const payload: FindingsLedgerPayload = {
    v: 1, a: account, t: target, ver, seq: Math.min((previous?.seq ?? 0) + 1, 100_000),
    rev: Math.min(revision, 10_000), d: draftDigest || previous?.d || "", at: now.toISOString(), e: kept
  };
  const token = issueFindingsLedger(payload, secret);
  if (observed.length > 0 || responses.size > 0) notes.push(FINDINGS_LEDGER_NOTE);
  return {
    checkFindings: { ledger: state, revision: payload.rev, findings: findings.slice(0, MAX_ENTRIES) },
    token,
    notes
  };
}

function joinIds(ids: readonly string[]): string {
  return ids.length <= 1 ? ids.join("") : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;
}

/** The ids and dispositions, in the result's text for an app that hands its model only that. */
export function findingsLedgerGuidance(checkFindings: CheckFindings | undefined, token: string | undefined): string {
  if (checkFindings === undefined) return "";
  const shown = checkFindings.findings.filter(({ text }) => text !== undefined).slice(0, 30);
  const lines = shown.map(({ id, stop, disposition, reason, text }) =>
    `- ${id} (${stop === undefined ? "note" : `stop: ${stop}`}; ${disposition}${reason === undefined ? "" : `: ${reason}`}): ` +
    `${text!.length > 200 ? `${text!.slice(0, 199).trimEnd()}…` : text}`);
  const settled = checkFindings.findings.filter(({ text, disposition }) =>
    text === undefined && disposition !== "not_rechecked").map(({ id, disposition }) => `${id} ${disposition}`);
  const unchecked = checkFindings.findings.filter(({ text, disposition }) =>
    text === undefined && disposition === "not_rechecked").map(({ id }) => id);
  return (lines.length === 0 ? "" : `\nFindings of this check (ledger ${checkFindings.ledger}, revision ` +
      `${checkFindings.revision}):\n${lines.join("\n")}`) +
    (settled.length === 0 ? "" : `\nNo longer found: ${settled.join("; ")}.`) +
    (unchecked.length === 0 ? "" : `\nNot checked again: ${unchecked.join(", ")} (see the notes).`) +
    (token === undefined ? "" : `\nPass this as later_inputs.findings_ledger in this research's next finalize_research ` +
      `call: ${token}`);
}

/**
 * What can stop an answer, told to the AI when it plans the research (the owner's note on question 338: "tell the AI
 * threads first 'these are the things which will block your answer' rather than telling them after they fail"). Only
 * the six whole-answer stops that exist today, in their actual scope. The five claim holds are left out until the owner
 * answers how they fit with these stops (owner question 1 of 17 Nov 2026; a question pauses the work that depends on it).
 */
export const WHAT_STOPS = Object.freeze([
  { rule: "source_provenance", scope: "a key source with no AskRigor receipt for this research, or a link that leads elsewhere" },
  { rule: "read_depth", scope: "a declared reading deeper than the receipts show, or a cited key source without the " +
    "answer's words on how it was read" },
  { rule: "numbers", scope: "a declared yes-or-no result whose arithmetic fails or whose sentence lacks both groups' figures" },
  { rule: "harm_screen", scope: "listed safety statements with no serious harm named as searched" },
  { rule: "retractions", scope: "a statement taken back that still appears anywhere in the answer" },
  { rule: "plain_answer_comparison", scope: "for an account that registered a plain answer, a claim of it left out of " +
    "the comparison, or a change not backed by the research" }
] as const);
export const WHAT_STOPS_TEXT = "What can stop this answer at finalize_research. Six checks stop the whole answer " +
  "until it is fixed, each only in its own scope: " +
  WHAT_STOPS.map(({ scope }, index) => `${index + 1}. ${scope}`).join("; ") + ". Nothing else stops it: everything " +
  "else the check finds is a note with an id. Fix it, or dispute it in later_inputs.finding_responses with a reason " +
  "the reader will see. Open and disputed findings are listed to the reader under the checked answer.";
export const whatStopsSchema = z.object({
  text: z.string(),
  stops: z.array(z.object({ rule: z.string(), scope: z.string() }).strict())
}).strict();
export function whatStops(): z.output<typeof whatStopsSchema> {
  return { text: WHAT_STOPS_TEXT, stops: WHAT_STOPS.map((stop) => ({ ...stop })) };
}

/** The panel's lead above the findings an answer leaves open. */
export const FINAL_CHECK_PANEL_FINDINGS_LEAD = "In the check's own words, written for the AI that wrote the answer. " +
  "None of them stopped the answer; the AI neither fixed them nor, where it says why, agreed with them.";
