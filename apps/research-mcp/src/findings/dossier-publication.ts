import { createHash } from "node:crypto";

import {
  publicDossierNoticeCovered,
  stableJson,
  type ResearchDossierAutoHoldReason,
  type ResearchDossierPublisher,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { rowPassesPageGuard } from "../atlas/page-guard.js";

/**
 * AskRigor#477, stage 2 (owner answers 331a, 332a and 333a, 16 November 2026): a saved research dossier on the public
 * Atlas. Behind ASKRIGOR_PUBLIC_DOSSIERS=enabled, off by default, and only for an account whose accepted notice covers
 * public dossiers (none until notice v7 is released on the owner's yes).
 *
 * What goes public is the dossier's public part, which the server makes from the stored dossier field by field: never
 * the private ARD number, the card number, the exact time, the build, where the research ran or the AI's declarations
 * about named people. The researching AI's own judgement decides (332a): a dossier it is highly confident in, that
 * names no living person and conflicts with no shown dossier on an important finding, is shown at once, marked
 * "Not checked by supervisors yet"; otherwise it is held for AskRigor's check. Every comparison it shows carries its
 * group sizes (the owner's standing rule for anything public), or it is not published. What was checked and how deeply
 * goes with it, from the server's own stamp.
 *
 * The conflict check is exact and reads only what the AIs declared: two dossiers on one topic conflict when a finding of
 * each, for the same declared form, says the opposite of the other (helps against measured no difference, or harms
 * against measured no difference). It is deliberately broad, since it cannot read which outcome or people a finding is
 * about; a conflict holds the new dossier only when either finding is decision-changing or important (the owner's
 * refinement of 332a: "if it's important or confidence not strong, re-checked by our system"). Stage 3, where the
 * researching AI reads earlier dossiers, replaces it with that AI's own declared check.
 */

export const PUBLIC_DOSSIER_SCHEMA = "askrigor.public-dossier.v1" as const;

export const dossierPagePath = (publicNumber: string) => `/atlas/dossiers/${publicNumber}`;

export interface PublicDossierIdentifier { scheme: string; value: string }

export interface PublicDossierStudy {
  id: string;
  identifiers: PublicDossierIdentifier[];
  kind: string;
  form?: string;
  dose?: string;
  route?: string;
  population?: string;
  comparator?: string;
  design?: string;
  participants?: number;
  /** How AskRigor read it, from its own receipts (dossier.ts DossierReading). */
  read: string;
  decision: "used" | "set_aside";
  decision_reason?: string;
}

export type PublicDossierFigure =
  | { kind: "counts"; option_events: number; option_total: number; comparator_events: number; comparator_total: number;
    nnt?: number; nnh?: number }
  | { kind: "value"; value: number; unit: string; measure?: string };

export interface PublicDossierResult {
  id: string;
  study: string;
  outcome: string;
  comparator?: string;
  follow_up?: string;
  direction: string;
  certainty: string;
  figure?: PublicDossierFigure;
  provenance?: string;
  calculation?: { operation: string; from: [number, number] };
  group_sizes?: { option: number; comparator?: number };
}

export interface PublicDossierFinding {
  id: string;
  claim: string;
  certainty: string;
  kind: string;
  applies_to: string;
  form?: string;
  rests_on: string[];
  what_would_change_it: string;
  importance: "decision_changing" | "important" | "context";
  /** One of the findings the AI named as saving the most work against an ordinary answer (value.adds): hard to find. */
  hard_to_find: boolean;
}

export interface PublicDossier {
  schema: typeof PUBLIC_DOSSIER_SCHEMA;
  question: string;
  topic: { key: string; name: string; other_names: string[]; related: string[] };
  forms: string[];
  searches: Array<{ id: string; database: string; query: string; date_range?: { start: string; end: string };
    records_found: number | null }>;
  studies: PublicDossierStudy[];
  results: PublicDossierResult[];
  findings: PublicDossierFinding[];
  coverage: Record<string, { status: string; search?: string; reason?: string }>;
  community?: { communities: string[]; threads_read: number;
    people: { better: number; no_change: number; worse: number; mixed: number };
    report_quality: { detailed: number; measured: number; bare: number } };
  open_trails: string[];
  value: { quick_answer?: string; reason?: string; confidence?: "high" | "moderate" | "low"; judged_by: "researching_ai" };
  /** What was checked and how deeply, from the server's stamp. */
  checked: { on: string; askrigor_version: string; hrp?: string; receipts_checked: number; checks: string[];
    not_checked: string[]; privacy_reading: boolean };
}

type Stored = Record<string, any>;
const pick = <T extends object>(source: Record<string, unknown>, keys: readonly string[]): T =>
  Object.fromEntries(keys.flatMap((key) => source[key] === undefined ? [] : [[key, structuredClone(source[key])]])) as T;
const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{0,199}$/u;

/**
 * The public part of a stored dossier, field by field: whatever the stored dossier holds besides these fields never
 * reaches a page. Whether a semantic privacy reading passed it is read from the saved record's own stamp, never from
 * anything said beside it (Codex's review of stage 2, finding 1).
 */
export function publicDossierOf(stored: Stored): PublicDossier {
  const adds = new Set<string>(Array.isArray(stored.value?.adds) ? stored.value.adds : []);
  const topicKey: string = stored.topic.key;
  const related = [...new Set<string>((stored.topic.related ?? []) as string[])]
    .filter((key) => key !== topicKey && TOPIC_KEY.test(key)).slice(0, 10);
  const stamp: Stored = stored.stamp ?? {};
  return {
    schema: PUBLIC_DOSSIER_SCHEMA,
    question: stored.question,
    topic: { key: topicKey, name: stored.topic.name, other_names: [...(stored.topic.other_names ?? [])], related },
    forms: [...(stored.forms ?? [])],
    searches: (stored.searches ?? []).map((search: Stored) =>
      pick(search, ["id", "database", "query", "date_range", "records_found"])),
    studies: (stored.studies ?? []).map((study: Stored) => pick(study, ["id", "identifiers", "kind", "form", "dose",
      "route", "population", "comparator", "design", "participants", "read", "decision", "decision_reason"])),
    results: (stored.results ?? []).map((result: Stored) => pick(result, ["id", "study", "outcome", "comparator",
      "follow_up", "direction", "certainty", "figure", "provenance", "calculation", "group_sizes"])),
    findings: (stored.findings ?? []).map((finding: Stored) => ({
      ...pick<Omit<PublicDossierFinding, "hard_to_find">>(finding, ["id", "claim", "certainty", "kind", "applies_to",
        "form", "rests_on", "what_would_change_it", "importance"]),
      hard_to_find: adds.has(finding.id),
    })),
    coverage: Object.fromEntries(Object.entries(stored.coverage ?? {}).map(([area, entry]) =>
      [area, pick(entry as Stored, ["status", "search", "reason"])])),
    ...(stored.community === undefined ? {} : {
      community: pick(stored.community, ["communities", "threads_read", "people", "report_quality"]),
    }),
    open_trails: [...(stored.open_trails ?? [])],
    value: {
      ...pick<{ quick_answer?: string; reason?: string; confidence?: "high" | "moderate" | "low" }>(stored.value ?? {},
        ["quick_answer", "reason", "confidence"]),
      judged_by: "researching_ai",
    },
    checked: {
      on: String(stamp.saved_at ?? "").slice(0, 10),
      askrigor_version: String(stamp.askrigor_version ?? ""),
      ...(typeof stamp.hrp === "string" ? { hrp: stamp.hrp } : {}),
      receipts_checked: Number(stamp.receipts_checked ?? 0),
      checks: [...(stamp.checks ?? [])],
      not_checked: [...(stamp.not_checked ?? [])],
      privacy_reading: stamp.privacy_reading === "pass",
    },
  };
}

export function publicDossierDigest(dossier: PublicDossier): string {
  return createHash("sha256").update(stableJson(dossier), "utf8").digest("hex");
}

/** The public dossier as a page reads it back: the shape publicDossierOf writes, checked, or undefined. */
export function readPublicDossier(payload: unknown): PublicDossier | undefined {
  const parsed = publicDossierSchema.safeParse(payload);
  return parsed.success ? parsed.data as PublicDossier : undefined;
}

const str = z.string();
const num = z.number();
const publicDossierSchema = z.object({
  schema: z.literal(PUBLIC_DOSSIER_SCHEMA),
  question: str,
  topic: z.object({ key: str.regex(TOPIC_KEY), name: str, other_names: z.array(str), related: z.array(str.regex(TOPIC_KEY)) }),
  forms: z.array(str),
  searches: z.array(z.object({ id: str, database: str, query: str,
    date_range: z.object({ start: str, end: str }).optional(), records_found: num.nullable() })),
  studies: z.array(z.object({ id: str, identifiers: z.array(z.object({ scheme: str, value: str })), kind: str,
    form: str.optional(), dose: str.optional(), route: str.optional(), population: str.optional(),
    comparator: str.optional(), design: str.optional(), participants: num.optional(), read: str,
    decision: z.enum(["used", "set_aside"]), decision_reason: str.optional() })),
  results: z.array(z.object({ id: str, study: str, outcome: str, comparator: str.optional(), follow_up: str.optional(),
    direction: str, certainty: str, figure: z.union([
      z.object({ kind: z.literal("counts"), option_events: num, option_total: num, comparator_events: num,
        comparator_total: num, nnt: num.optional(), nnh: num.optional() }),
      z.object({ kind: z.literal("value"), value: num, unit: str, measure: str.optional() }),
    ]).optional(), provenance: str.optional(),
    calculation: z.object({ operation: str, from: z.tuple([num, num]) }).optional(),
    group_sizes: z.object({ option: num, comparator: num.optional() }).optional() })),
  findings: z.array(z.object({ id: str, claim: str, certainty: str, kind: str, applies_to: str, form: str.optional(),
    rests_on: z.array(str), what_would_change_it: str, importance: z.enum(["decision_changing", "important", "context"]),
    hard_to_find: z.boolean() })),
  coverage: z.record(str, z.object({ status: str, search: str.optional(), reason: str.optional() })),
  community: z.object({ communities: z.array(str), threads_read: num,
    people: z.object({ better: num, no_change: num, worse: num, mixed: num }),
    report_quality: z.object({ detailed: num, measured: num, bare: num }) }).optional(),
  open_trails: z.array(str),
  value: z.object({ quick_answer: str.optional(), reason: str.optional(),
    confidence: z.enum(["high", "moderate", "low"]).optional(), judged_by: z.literal("researching_ai") }),
  checked: z.object({ on: str, askrigor_version: str, hrp: str.optional(), receipts_checked: num,
    checks: z.array(str), not_checked: z.array(str), privacy_reading: z.boolean() }),
});

// Sizes ------------------------------------------------------------------------------------------------------------

/** The kinds of finding that compare an option with something, and so show the sizes behind them. */
const COMPARING_FINDINGS: ReadonlySet<string> = new Set(["helps", "harms", "no_difference", "mixed"]);

/** Whether a result compares groups: a two-group count, or a comparator of its own. */
export const resultCompares = (result: PublicDossierResult) =>
  result.figure?.kind === "counts" || result.comparator !== undefined;

/** A result's group sizes: a two-group count's totals, else its declared group sizes. */
export function resultSizes(result: PublicDossierResult): { option: number; comparator?: number } | undefined {
  if (result.figure?.kind === "counts") {
    return { option: result.figure.option_total, comparator: result.figure.comparator_total };
  }
  return result.group_sizes;
}

export interface PublicationProblem { path: string; rule: string }

/**
 * The owner's standing rule for anything public, "sizes go with every comparison": every result that compares groups
 * gives each group's size, and every finding that says something helps, harms, makes no measured difference or is
 * mixed rests on at least one result or study with its size, or on people's reports with their counts.
 */
export function publicSizeProblems(dossier: PublicDossier): PublicationProblem[] {
  const problems: PublicationProblem[] = [];
  const studies = new Map(dossier.studies.map((study) => [study.id, study]));
  const results = new Map(dossier.results.map((result) => [result.id, result]));
  dossier.results.forEach((result, index) => {
    if (!resultCompares(result)) return;
    const sizes = resultSizes(result);
    if (sizes === undefined || sizes.comparator === undefined) {
      problems.push({ path: `results[${index}].group_sizes`, rule: "comparison_sizes_missing" });
    }
  });
  dossier.findings.forEach((finding, index) => {
    if (!COMPARING_FINDINGS.has(finding.kind)) return;
    const sized = finding.rests_on.some((reference) => {
      if (reference === "community") return dossier.community !== undefined;
      const result = results.get(reference);
      if (result !== undefined) return resultSizes(result) !== undefined || studies.get(result.study)?.participants !== undefined;
      return studies.get(reference)?.participants !== undefined;
    });
    if (!sized) problems.push({ path: `findings[${index}].rests_on`, rule: "finding_sizes_missing" });
  });
  return problems;
}

export const PUBLICATION_PROBLEMS: Readonly<Record<string, string>> = {
  comparison_sizes_missing: "a result that compares groups (a comparator, or counts) gives group_sizes: {option, " +
    "comparator}, the people in each group; counts give them already",
  finding_sizes_missing: "a finding that says something helps, harms, makes no measured difference or is mixed rests " +
    "on a result with its group sizes, a study with its participants, or community",
  page_guard: "a text would stop an Atlas page from being served (a script, a card reference or a YouTube link)",
};

// Conflicts --------------------------------------------------------------------------------------------------------

const OPPOSED: ReadonlyArray<readonly [string, string]> = [["helps", "no_difference"], ["harms", "no_difference"]];
const opposed = (left: string, right: string) =>
  OPPOSED.some(([a, b]) => (left === a && right === b) || (left === b && right === a));
const formKey = (form: string | undefined) => form?.trim().toLocaleLowerCase("en");

export interface DossierDisagreement {
  form: string;
  /** The finding of the first dossier, and of the second. */
  mine: string;
  theirs: string;
  /** Either finding is decision-changing or important. */
  important: boolean;
}

/** Where two dossiers' findings for the same declared form say opposite things (see the module's note). */
export function dossierDisagreements(
  mine: Pick<PublicDossier, "findings">,
  theirs: Pick<PublicDossier, "findings">,
): DossierDisagreement[] {
  const found: DossierDisagreement[] = [];
  for (const left of mine.findings) {
    const form = formKey(left.form);
    if (form === undefined || form === "") continue;
    for (const right of theirs.findings) {
      if (formKey(right.form) !== form || !opposed(left.kind, right.kind)) continue;
      found.push({ form: left.form!, mine: left.id, theirs: right.id,
        important: left.importance !== "context" || right.importance !== "context" });
    }
  }
  return found;
}

// Publication ------------------------------------------------------------------------------------------------------

export const DOSSIER_PUBLICATION_STATUSES = ["shown", "held", "not_published", "unconfirmed"] as const;

export const dossierPublicationSchema = z.object({
  status: z.enum(DOSSIER_PUBLICATION_STATUSES),
  public_id: z.string().regex(/^D-[1-9][0-9]{3,}$/u).optional(),
  page: z.string().optional(),
  reason: z.string().optional(),
  hold_reasons: z.array(z.string()).max(5).optional(),
  conflicts_with: z.array(z.string()).max(50).optional(),
  problems: z.array(z.object({ path: z.string(), rule: z.string() }).strict()).max(50).optional(),
}).strict().describe("AskRigor#477 stage 2: the dossier on the public Atlas: shown (written without the person, " +
  "marked not checked by supervisors yet), held for AskRigor's check with its reasons, not_published with why, or " +
  "unconfirmed.");

export type DossierPublication = z.output<typeof dossierPublicationSchema>;

export interface DossierPublicationRequest {
  publisher: ResearchDossierPublisher;
  accountKey: string;
  noticeVersion: string | null;
  /** The notices that cover public dossiers; PUBLIC_DOSSIER_NOTICE_VERSIONS (none until v7) unless a test gives others. */
  noticeCovering?: readonly string[];
  versionId: string;
  dossierNumber: string;
  /** The stored dossier (storedResearchDossier), as read back. */
  stored: Record<string, unknown>;
  /** The AI's declarations the stored dossier keeps for this decision. */
  namesLivingPeople: boolean | undefined;
  origin: Record<string, unknown>;
  at: Date;
}

/** Publishes a saved dossier's public part, shown or held, or says why not; it never throws. */
export async function publishResearchDossier(request: DossierPublicationRequest): Promise<DossierPublication> {
  if (!publicDossierNoticeCovered(request.noticeVersion, request.noticeCovering)) {
    return { status: "not_published", reason: "notice_not_covering" };
  }
  let dossier: PublicDossier;
  try {
    dossier = publicDossierOf(request.stored);
  } catch {
    return { status: "not_published", reason: "not_publishable" };
  }
  if (readPublicDossier(dossier) === undefined) return { status: "not_published", reason: "not_publishable" };
  const sizes = publicSizeProblems(dossier);
  if (sizes.length > 0) return { status: "not_published", reason: "sizes_missing", problems: sizes.slice(0, 50) };
  if (!rowPassesPageGuard(dossier)) {
    return { status: "not_published", reason: "page_guard", problems: [{ path: "research_dossier", rule: "page_guard" }] };
  }
  let others: Awaited<ReturnType<ResearchDossierPublisher["topicCopies"]>>;
  try {
    others = await request.publisher.topicCopies(dossier.topic.key);
  } catch {
    return { status: "unconfirmed", reason: "store_unavailable" };
  }
  const conflicts = new Set<string>();
  let importantConflict = false;
  for (const other of others) {
    if (other.dossierNumber === request.dossierNumber) continue;
    const theirs = readPublicDossier(other.payload);
    if (theirs === undefined) continue;
    const found = dossierDisagreements(dossier, theirs);
    if (found.length === 0) continue;
    conflicts.add(other.publicNumber);
    if (found.some(({ important }) => important)) importantConflict = true;
  }
  const privacyRead = dossier.checked.privacy_reading;
  const reasons: ResearchDossierAutoHoldReason[] = [
    // Nothing shows before a semantic privacy reading passed exactly what was saved (Codex's review, finding 1).
    ...(privacyRead ? [] : ["privacy_reading_pending" as const]),
    ...(dossier.value.confidence === "high" ? [] : ["not_high_confidence" as const]),
    ...(request.namesLivingPeople === true ? ["names_living_people" as const]
      : request.namesLivingPeople === undefined ? ["living_people_undeclared" as const] : []),
    ...(importantConflict ? ["important_conflict" as const] : []),
  ];
  const conflictsWith = [...conflicts].sort().slice(0, 50);
  let published: Awaited<ReturnType<ResearchDossierPublisher["publish"]>>;
  try {
    published = await request.publisher.publish({
      accountKey: request.accountKey,
      versionId: request.versionId,
      topicKey: dossier.topic.key,
      relatedTopicKeys: dossier.topic.related,
      payload: dossier as unknown as Record<string, unknown>,
      payloadSha256: publicDossierDigest(dossier),
      state: reasons.length === 0 ? "shown" : "held",
      holdReasons: reasons,
      conflictsWith,
      origin: request.origin,
      privacyRead,
      at: request.at,
    });
  } catch {
    return { status: "unconfirmed", reason: "write_not_confirmed" };
  }
  if (published.outcome === "account_refused") return { status: "not_published", reason: "account_not_eligible" };
  if (published.outcome === "version_refused") return { status: "not_published", reason: "version_not_publishable" };
  const page = dossierPagePath(published.publicNumber);
  if (published.state === "shown") {
    return { status: "shown", public_id: published.publicNumber, page,
      ...(conflictsWith.length === 0 ? {} : { conflicts_with: conflictsWith }) };
  }
  if (published.state === "held") {
    return { status: "held", public_id: published.publicNumber, hold_reasons: reasons.length > 0 ? reasons : ["owner_hold"],
      ...(conflictsWith.length === 0 ? {} : { conflicts_with: conflictsWith }) };
  }
  // A retry of a copy the review has since taken down or superseded: it is not on the pages.
  return { status: "not_published", public_id: published.publicNumber, reason: `copy_${published.state}` };
}

/** Each hold reason in plain words, for the AI's note and the owner's review. */
export const HOLD_REASON_WORDS: Readonly<Record<string, string>> = {
  privacy_reading_pending: "waiting for the privacy reading",
  not_high_confidence: "the researching AI was not highly confident in it",
  names_living_people: "a claim names a living person",
  living_people_undeclared: "it did not say whether a claim names a living person",
  important_conflict: "it conflicts with a shown dossier on an important finding",
  owner_hold: "held back by the owner's review",
};

export const holdReasonWords = (reasons: readonly string[]) =>
  reasons.map((reason) => HOLD_REASON_WORDS[reason] ?? reason.replaceAll("_", " ")).join("; ");

/** What the AI is told of the publication, among the result's notes; undefined when there is nothing to act on. */
export function dossierPublicationNote(publication: DossierPublication): string | undefined {
  if (publication.status === "not_published" && publication.reason === "sizes_missing") {
    const rules = [...new Set((publication.problems ?? []).map(({ rule }) => rule))];
    return "Research dossier: saved privately, and not shown on the public Atlas: every comparison it shows must " +
      `carry its group sizes. ${rules.map((rule) => `${rule} at ${(publication.problems ?? [])
        .filter((problem) => problem.rule === rule).map(({ path }) => path).join(", ")}: ${PUBLICATION_PROBLEMS[rule]}.`)
        .join(" ")} Give them in a dossier sent with a final check already needed for this research; do not make ` +
      "another check solely for it.";
  }
  if (publication.status === "held" && publication.hold_reasons?.includes("privacy_reading_pending") === true) {
    return "Research dossier: saved, and its public copy is held " +
      `(${holdReasonWords(publication.hold_reasons)}): nothing appears on the public Atlas before AskRigor's privacy ` +
      "reading has passed it. Do not change or resend it to get past the check.";
  }
  if (publication.status === "held") {
    return "Research dossier: saved, and held for AskRigor's check before it can appear on the public Atlas " +
      `(${holdReasonWords(publication.hold_reasons ?? [])}). Do not change or resend it to get past the check.`;
  }
  return undefined;
}

/** The sentence the answer's dossier line ends with, for a publication that shows or waits. */
export function dossierPublicationSentence(publication: DossierPublication | undefined): string | undefined {
  if (publication?.status === "shown") {
    return `It is also shown on AskRigor's public Atlas as ${publication.public_id}, written without you and marked ` +
      "\"Not checked by supervisors yet\".";
  }
  if (publication?.status === "held" && publication.hold_reasons?.includes("privacy_reading_pending") === true) {
    return "It is not on AskRigor's public Atlas: a copy written without you is held, since nothing appears there " +
      "before AskRigor's privacy reading has passed it.";
  }
  if (publication?.status === "held") {
    return "It waits for AskRigor's check before it can appear on AskRigor's public Atlas, written without you.";
  }
  return undefined;
}
