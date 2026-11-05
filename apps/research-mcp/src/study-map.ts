import type { ClinicalTrial } from "@askrigor/sources";
import { z } from "zod";

import { figureText } from "./binary-results.js";
import {
  lookUpQuotes, quoteCache, SOURCE_LINE_OUTCOMES, SOURCE_LINE_TEXTS,
  type QuoteCache, type QuotesLookup, type QuoteSource, type SourceLineDocument, type SourceLineTexts
} from "./source-lines.js";

/**
 * The study map (owner answer 249a, 5 November 2026; UDA item 2026-10-31-study-map-for-decision-claims): errors that
 * sit between studies, which a one-paper audit can't see. Two reports of one group of people counted as two (Tramèr
 * 1997: covert duplicates inflated the ondansetron effect by 23%), a review restating a trial counted as a second
 * source, and a trial registered after it started.
 *
 * The AI declares the studies a conclusion combines, the links between them and, for each claim, how many independent
 * groups of people it counts. What is exact is checked here: a study is tied to a research receipt; each passage is in
 * its own study's text, compared as a source line's quotes are, in any language; each claim is in the answer with a
 * passage from each study it rests on; a registry number is in its study's text, or its ClinicalTrials.gov record lists
 * the study's paper; studies AskRigor can tell share people (a declared link, the same group, the same registry number,
 * one record listing both, identical figures) are counted once; and a ClinicalTrials.gov record first submitted after
 * its trial started is said to be. Whether two groups overlap otherwise, and whether a passage supports a claim, stay
 * the AI's judgment. Only over-counting is flagged.
 *
 * Every finding is a note after a passing check and consumes no round, as the six blocking checks (owner answers 193a,
 * 195a and 217b) don't name it. Nothing here is stored. The outcome comparison (registered against reported outcomes)
 * waits for this first version to be measured.
 */

export const STUDY_MAP_LIMITS = {
  studies: 8, fewestStudies: 2, links: 12, claims: 4, passages: 8, registry: 3,
  id: 40, source: 300, label: 160, registryNumber: 40, passage: 600, quote: 1_000,
  // The ClinicalTrials.gov records one check reads.
  records: 8
} as const;

export const STUDY_LINK_KINDS = ["same_cohort", "reanalysis_of", "extension_of", "abstract_of", "cites_as_evidence"] as const;
export const REGISTRY_TIES = ["in_text", "in_record", "not_found", "not_checked"] as const;
export const REGISTRATION_TIMES = ["by_start", "after_start"] as const;
type Outcome = typeof SOURCE_LINE_OUTCOMES[number];
type RegistryTie = typeof REGISTRY_TIES[number];

// A DOI, PMID, PMCID or web address, as the final check's identifiers are written.
const STUDY_SOURCE = /^(?:(?:doi:\s*)?10\.\d{4,9}\/\S+|(?:pmid:?\s*)?\d{1,9}|(?:pmcid:?\s*)?pmc\d+|https?:\/\/\S+)$/iu;
const studyId = z.string().trim().min(1).max(STUDY_MAP_LIMITS.id);
const passage = z.string().trim().min(1).max(STUDY_MAP_LIMITS.passage);
const label = z.string().trim().min(1).max(STUDY_MAP_LIMITS.label);

export const studyMapSchema = z.object({
  studies: z.array(z.object({
    id: studyId.describe("A short name for the study, which links and claims use."),
    source: z.string().trim().min(1).max(STUDY_MAP_LIMITS.source)
      .refine((source) => STUDY_SOURCE.test(source), "give the study's DOI, PMID, PMCID or web address")
      .describe("Its DOI, PMID, PMCID or web address, as AskRigor's tools returned it."),
    group: label.describe("One label for the group of people behind it, the same for two studies of the same people " +
      "and never for different people."),
    registry: z.array(z.string().trim().min(1).max(STUDY_MAP_LIMITS.registryNumber)).max(STUDY_MAP_LIMITS.registry)
      .optional().describe("Its trial registry numbers, such as NCT01234567."),
    sites: label.optional().describe("Where its people were recruited."),
    recruited: label.optional().describe("When its people were recruited."),
    run_by: label.optional().describe("Who ran or paid for it."),
    people: z.number().int().positive().optional().describe("How many people it studied.")
  }).strict()).min(STUDY_MAP_LIMITS.fewestStudies).max(STUDY_MAP_LIMITS.studies),
  links: z.array(z.object({
    from: studyId,
    kind: z.enum(STUDY_LINK_KINDS),
    to: studyId,
    passage: passage.describe("The sentence, in either study's text, that shows the link, copied whole and exactly.")
  }).strict()).max(STUDY_MAP_LIMITS.links).optional(),
  claims: z.array(z.object({
    quote: z.string().trim().min(1).max(STUDY_MAP_LIMITS.quote).describe("The claim's sentence, copied from answer_draft."),
    studies: z.array(studyId).min(1).max(STUDY_MAP_LIMITS.studies).describe("The ids of the studies it rests on."),
    groups: z.number().int().positive().describe("How many independent groups of people the claim counts."),
    passages: z.array(z.object({ study: studyId, passage }).strict()).max(STUDY_MAP_LIMITS.passages).optional()
      .describe("For each study it rests on, the sentence it rests on, copied whole and exactly.")
  }).strict()).min(1).max(STUDY_MAP_LIMITS.claims)
}).strict();
export type StudyMap = z.output<typeof studyMapSchema>;
type MapStudy = StudyMap["studies"][number];

/** The map as it is checked: its items with their places in the map as given, any that name no study left out. */
export interface CheckedStudyMap {
  studies: MapStudy[];
  links: Array<NonNullable<StudyMap["links"]>[number] & { place: number }>;
  claims: Array<{ place: number; quote: string; studies: string[]; groups: number;
    passages: Array<{ study: string; passage: string }> }>;
}

const names = (ids: readonly string[]): string =>
  ids.length === 1 ? ids[0]! : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;

/**
 * Checks what the map's items name. One item naming a study the map doesn't have is left out, with a note, never the
 * whole map, as zod checks only the shape.
 */
export function cleanStudyMap(map: StudyMap): { map: CheckedStudyMap; notes: string[] } {
  const notes: string[] = [];
  const first = new Map<string, number>();
  const studies = map.studies.filter(({ id }, index) => {
    const earlier = first.get(id);
    if (earlier === undefined) {
      first.set(id, index);
      return true;
    }
    notes.push(`study_map.studies[${index}] has the id ${id} of study_map.studies[${earlier}], so it was left out: ` +
      "give each study its own id.");
    return false;
  });
  const unknown = (ids: readonly string[]): string[] => [...new Set(ids.filter((id) => !first.has(id)))];
  const notAStudy = (ids: readonly string[]): string =>
    `names ${names(ids)}, which ${ids.length === 1 ? "isn't a study" : "aren't studies"} in study_map.studies, so it ` +
      "was left out: name each study by its id.";
  const links = (map.links ?? []).flatMap((link, place) => {
    const missing = unknown([link.from, link.to]);
    if (missing.length > 0) notes.push(`study_map.links[${place}] ${notAStudy(missing)}`);
    else if (link.from === link.to) notes.push(`study_map.links[${place}] links ${link.from} to itself, so it was left out.`);
    else return [{ ...link, place }];
    return [];
  });
  const claims = map.claims.flatMap((claim, place) => {
    const missing = unknown(claim.studies);
    if (missing.length > 0) {
      notes.push(`study_map.claims[${place}] ${notAStudy(missing)}`);
      return [];
    }
    const own = [...new Set(claim.studies)];
    const passages = (claim.passages ?? []).filter(({ study }, at) => {
      if (own.includes(study)) return true;
      notes.push(`study_map.claims[${place}].passages[${at}] is from ${study}, which the claim doesn't rest on, so it ` +
        "was left out: give passages only from the studies in its studies.");
      return false;
    });
    return [{ place, quote: claim.quote, studies: own, groups: claim.groups, passages }];
  });
  return { map: { studies, links, claims }, notes };
}

/** Where one study's text may be, from its source's verified receipts, found as a source line's is (owner answer 237a). */
export interface StudyMapRequest extends QuoteSource {
  /** Whether a verified research receipt names the study's source. */
  tied: boolean;
  /** Every identifier and page AskRigor's receipts tie to its source: two studies sharing one are the same paper. */
  ids: readonly string[];
}

/** What a passing check asks to have looked up: the map as checked, and where each study's text may be. */
export interface StudyMapRequests {
  map: CheckedStudyMap;
  requests: readonly StudyMapRequest[];
}

/** A ClinicalTrials.gov record, as the map reads it. */
export interface RegistryRecord {
  nct: string;
  start?: string;
  /** Its start date is the one expected, not the one the trial started on. */
  startEstimated?: boolean;
  firstSubmitted?: string;
  /** The papers it lists as its results (RESULT and DERIVED references), not its background reading. */
  pmids: readonly string[];
  secondaryIds: readonly string[];
}

export interface StudyMapTexts extends SourceLineTexts {
  /** One ClinicalTrials.gov record: undefined when there is none, null when it couldn't be read. */
  registry(nct: string): Promise<RegistryRecord | undefined | null>;
}

/** A record fetched again at check time: what the map reads of fetchClinicalTrial's data. */
export function registryRecordOf(trial: ClinicalTrial): RegistryRecord {
  const registration = trial.registration;
  return {
    nct: trial.nct_id,
    ...(trial.start_date === undefined ? {} : { start: trial.start_date }),
    ...(registration?.start_date_type === "ESTIMATED" ? { startEstimated: true } : {}),
    ...(registration?.first_submitted === undefined ? {} : { firstSubmitted: registration.first_submitted }),
    pmids: [...new Set((trial.references ?? []).flatMap(({ pmid, type }) =>
      pmid !== undefined && (type === "RESULT" || type === "DERIVED") ? [pmid.trim()] : []))],
    secondaryIds: (registration?.secondary_ids ?? []).map(({ id }) => id)
  };
}

export interface StudyTextLookup {
  /** The text looked in, as a source line names it. */
  text?: typeof SOURCE_LINE_TEXTS[number];
  /** Why its passages weren't all looked up, as a source line's reasons. */
  reason?: "no_text" | "text_expired" | "text_unavailable";
  /** Each of its registry numbers, in their order: in its text, not in it, or not looked for. */
  registry: Outcome[];
  /** The ClinicalTrials.gov numbers its abstract names. */
  abstractNumbers: string[];
}

export type RecordLookup =
  | { nct: string; status: "found"; record: RegistryRecord }
  | { nct: string; status: "not_found" | "unavailable" | "not_read" };

/** What looking the map up found, after a check's first pass. */
export interface StudyMapLookup {
  /** False when the lookup didn't finish in time or failed, so nothing was looked up. */
  done: boolean;
  studies: StudyTextLookup[];
  /** Each link's passage: found in the text of either study it links. */
  links: Outcome[];
  /** Each claim's passages, in their order. */
  claims: Outcome[][];
  records: RecordLookup[];
}

/** A registry number as it is compared: Unicode form, case, spaces, dashes and dots set aside. */
function registryKey(number: string): string {
  const compact = figureText(number).replace(/[\s\-_./]/gu, "").toUpperCase();
  // A number given with its registry's name ("ClinicalTrials.gov NCT01234567") is its NCT number.
  return /NCT\d{8}(?!\d)/u.exec(compact)?.[0] ?? compact;
}

const isNct = (key: string): boolean => /^NCT\d{8}$/u.test(key);
// A number this short says too little to tie studies by.
const usableKey = (key: string): boolean => key.replace(/[^\p{L}\p{N}]/gu, "").length >= 4;
const escaped = (character: string): string => character.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");

/** Whether a text names a registry number, with or without spaces, dashes or dots inside it. */
function namesNumber(text: string, key: string): boolean {
  if (!usableKey(key)) return false;
  const inside = [...key.toLowerCase()].map(escaped).join("[\\s\\-_./]?");
  return new RegExp(`(?<![\\p{L}\\p{N}])${inside}(?![\\p{L}\\p{N}])`, "u").test(text);
}

// A ClinicalTrials.gov number, in figureText's form.
const NCT_NUMBER = /(?<![\p{L}\p{N}])nct[\s-]?(\d{8})(?![\p{L}\p{N}])/gu;

/** The ClinicalTrials.gov numbers an abstract names: the whole of a PubMed abstract, or a full text's abstract blocks. */
function abstractNumbers(document: SourceLineDocument): string[] {
  const blocks = document.kind === "abstract" ? document.blocks : document.blocks.filter(({ abstract }) => abstract === true);
  return [...new Set(blocks.flatMap(({ text }) => [...figureText(text).matchAll(NCT_NUMBER)].map(([, digits]) => `NCT${digits}`)))];
}

// How long one ClinicalTrials.gov record may take, inside the check's deadline for the whole lookup.
export const STUDY_MAP_REGISTRY_DEADLINE_MILLISECONDS = 5_000;

async function readRecord(nct: string, texts: StudyMapTexts, milliseconds: number): Promise<RecordLookup> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<RecordLookup>((resolve) => {
    timer = setTimeout(() => resolve({ nct, status: "unavailable" }), milliseconds);
    timer.unref?.();
  });
  const read = (async (): Promise<RecordLookup> => {
    const record = await texts.registry(nct);
    if (record === undefined) return { nct, status: "not_found" };
    return record === null || record.nct !== nct ? { nct, status: "unavailable" } : { nct, status: "found", record };
  })().catch((): RecordLookup => ({ nct, status: "unavailable" }));
  try {
    return await Promise.race([read, late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks the map up: each study's passages in its own text (a link's in either study's), its registry numbers in its
 * text, the ClinicalTrials.gov numbers its abstract names, and the records of those numbers and of the declared ones.
 */
export async function lookUpStudyMap(
  map: CheckedStudyMap,
  requests: readonly StudyMapRequest[],
  texts: StudyMapTexts,
  cache: QuoteCache = quoteCache(),
  registryMilliseconds: number = STUDY_MAP_REGISTRY_DEADLINE_MILLISECONDS
): Promise<StudyMapLookup> {
  const place = new Map(map.studies.map(({ id }, index) => [id, index]));
  const quotes = map.studies.map((): string[] => []);
  const slot = (id: string, quote: string): [number, number] => {
    const study = place.get(id)!;
    return [study, quotes[study]!.push(quote) - 1];
  };
  const claimSlots = map.claims.map(({ passages }) => passages.map(({ study, passage: quote }) => slot(study, quote)));
  const linkSlots = map.links.map(({ from, to, passage: quote }) => [slot(from, quote), slot(to, quote)]);
  const found: Array<QuotesLookup | undefined> = await Promise.all(map.studies.map((_, index) => {
    const request = requests[index];
    // A study no receipt ties has no text AskRigor can find, so its passages aren't looked up.
    return request === undefined || !request.tied ? undefined : lookUpQuotes(request, quotes[index]!, texts, cache);
  }));
  const outcome = ([study, at]: [number, number]): Outcome => found[study]?.quotes[at]?.outcome ?? "not_checked";
  const studies = map.studies.map((study, index): StudyTextLookup => {
    const lookup = found[index];
    const document = lookup?.document;
    const text = document === undefined || (study.registry ?? []).length === 0 ? ""
      : figureText(document.blocks.map(({ text: block }) => block).join(" "));
    return {
      ...(document === undefined ? {} : { text: document.kind }),
      ...(lookup?.reason === undefined ? {} : { reason: lookup.reason }),
      registry: (study.registry ?? []).map((number): Outcome => document === undefined ? "not_checked"
        : namesNumber(text, registryKey(number)) ? "found" : lookup?.reason === "text_expired" ? "not_checked" : "not_found"),
      abstractNumbers: document === undefined ? [] : abstractNumbers(document)
    };
  });
  const declared = map.studies.flatMap(({ registry }) => (registry ?? []).map(registryKey).filter(isNct));
  const numbers = [...new Set([...declared, ...studies.flatMap(({ abstractNumbers: named }) => named)])];
  const records = await Promise.all(numbers.map((nct, index) => index < STUDY_MAP_LIMITS.records
    ? readRecord(nct, texts, registryMilliseconds) : Promise.resolve<RecordLookup>({ nct, status: "not_read" })));
  return {
    done: true,
    studies,
    links: linkSlots.map((slots): Outcome => {
      const outcomes = slots.map(outcome);
      return outcomes.includes("found") ? "found" : outcomes.every((each) => each === "not_found") ? "not_found" : "not_checked";
    }),
    claims: claimSlots.map((slots) => slots.map(outcome)),
    records
  };
}

/** A lookup that didn't finish: nothing looked up, what the map declares still checked. */
export function lateStudyMapLookup(map: CheckedStudyMap): StudyMapLookup {
  return {
    done: false,
    studies: map.studies.map(({ registry }) => ({ registry: (registry ?? []).map(() => "not_checked" as const), abstractNumbers: [] })),
    links: map.links.map(() => "not_checked" as const),
    claims: map.claims.map(({ passages }) => passages.map(() => "not_checked" as const)),
    records: []
  };
}

/** Runtime only (owner answer 189a): what the check of the map found. */
export const studyMapCheckSchema = z.object({
  looked_up: z.boolean()
    .describe("Whether its texts and registry records were looked up in time; what the map declares is checked either way."),
  groups: z.number().int().nonnegative().describe("How many groups of people AskRigor tells apart among its studies."),
  studies: z.array(z.object({
    id: z.string(),
    tied: z.boolean().describe("Whether a verified research receipt names its source."),
    text: z.enum(SOURCE_LINE_TEXTS).optional().describe("The text its passages were looked up in."),
    group: z.number().int().positive().describe("Its group of people, 1 for the first."),
    registry: z.array(z.object({
      number: z.string(),
      tie: z.enum(REGISTRY_TIES)
        .describe("in_text: its text names it; in_record: its ClinicalTrials.gov record lists the study's paper."),
      registered: z.enum(REGISTRATION_TIMES).optional()
        .describe("For a ClinicalTrials.gov number: whether the record was first submitted by the trial's start.")
    }).strict()).optional()
  }).strict()),
  links: z.array(z.object({ link: z.number().int().nonnegative(), passage: z.enum(SOURCE_LINE_OUTCOMES) }).strict()),
  claims: z.array(z.object({
    claim: z.number().int().nonnegative(),
    shown: z.boolean().describe("Whether the answer shows its quote."),
    groups: z.number().int().positive().describe("The groups of people it counts, as given."),
    counted: z.number().int().nonnegative().describe("The groups of people AskRigor counts among its studies."),
    passages: z.array(z.enum(SOURCE_LINE_OUTCOMES))
  }).strict())
}).strict();
export type StudyMapCheck = z.output<typeof studyMapCheckSchema>;

/** What the gate knows of the check that the map is compared with. */
export interface StudyMapContext {
  requests: readonly StudyMapRequest[];
  /** Each study's headline figures, as its audit recomputed them: two sharing two or more report identical results. */
  figures: ReadonlyArray<readonly number[]>;
  /** Whether the answer shows a quote, as the gate compares one. */
  shown: (quote: string) => boolean;
  /** The absence claims resting on two or more studies. */
  absenceClaims: ReadonlyArray<{ index: number; quote: string; studies: number }>;
  /** Whether two declared quotes are one, as the gate compares them. */
  sameQuote: (left: string, right: string) => boolean;
}

const TEXT_NAMES: Readonly<Record<typeof SOURCE_LINE_TEXTS[number], string>> = {
  full_text: "the full text",
  abstract: "the abstract",
  search_copy: "the copy the AI supplied"
};

// Days since 1970 that a registry date can mean: one day, a whole month or a whole year.
function days(date: string | undefined): [number, number] | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(date?.trim() ?? "");
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), match[2] === undefined ? undefined : Number(match[2]),
    match[3] === undefined ? undefined : Number(match[3])];
  if (month !== undefined && (month < 1 || month > 12)) return undefined;
  const first = Date.UTC(year, (month ?? 1) - 1, day ?? 1);
  const last = day !== undefined ? first : month !== undefined ? Date.UTC(year, month, 0) : Date.UTC(year, 11, 31);
  return [first, last];
}

/**
 * Whether a record was first submitted after its trial started: true or false only when the dates leave no doubt, so a
 * month-only date compares only with a date outside its month. An expected start date is not compared.
 */
function registeredAfterStart(record: RegistryRecord): boolean | undefined {
  if (record.startEstimated === true) return undefined;
  const [submitted, start] = [days(record.firstSubmitted), days(record.start)];
  if (submitted === undefined || start === undefined) return undefined;
  if (submitted[0] > start[1]) return true;
  return submitted[1] <= start[0] ? false : undefined;
}

/** The groups of people, as AskRigor can tell them apart: each join keeps the reason it was made. */
class Groups {
  private readonly parent: number[];
  readonly joins: Array<{ a: number; b: number; why: string }> = [];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, index) => index); }
  root(at: number): number {
    while (this.parent[at] !== at) at = this.parent[at] = this.parent[this.parent[at]!]!;
    return at;
  }
  join(a: number, b: number, why: string): void {
    const [left, right] = [this.root(a), this.root(b)];
    if (left === right) return;
    this.parent[right] = left;
    this.joins.push({ a, b, why });
  }
  /** The reasons that put these studies in one group: the joins on the paths between them. */
  reasons(studies: readonly number[]): string[] {
    const path = (from: number, to: number): number[] => {
      const seen = new Map<number, number[]>([[from, []]]);
      const queue = [from];
      while (queue.length > 0) {
        const at = queue.shift()!;
        if (at === to) return seen.get(at)!;
        this.joins.forEach(({ a, b }, join) => {
          const next = a === at ? b : b === at ? a : undefined;
          if (next !== undefined && !seen.has(next)) {
            seen.set(next, [...seen.get(at)!, join]);
            queue.push(next);
          }
        });
      }
      return [];
    };
    const used = new Set<number>();
    for (const [index, study] of studies.entries()) {
      const first = studies.slice(0, index).find((other) => this.root(other) === this.root(study));
      if (first !== undefined) for (const join of path(first, study)) used.add(join);
    }
    return [...used].sort((left, right) => left - right).map((join) => this.joins[join]!.why);
  }
}

// How a study belongs to a ClinicalTrials.gov record: it names its number, the record lists its paper, or the record
// lists the study's registry number among its secondary IDs.
interface Attachment { index: number; how: "number" | "paper" | "secondary"; what: string }

const people = (count: number): string => `${count} independent group${count === 1 ? "" : "s"} of people`;

/**
 * The map's checks, once the check passes: notes for the AI, none of which holds the answer back, and the runtime
 * study_map result.
 */
export function checkStudyMap(
  map: CheckedStudyMap,
  lookup: StudyMapLookup,
  context: StudyMapContext
): { check: StudyMapCheck; notes: string[] } {
  const notes: string[] = [];
  const ids = map.studies.map(({ id }) => id);
  const at = new Map(ids.map((id, index) => [id, index]));
  const requests = map.studies.map((_, index) => context.requests[index] ?? { tied: false, ids: [], handles: [], pmids: [] });
  const looked = lookup.done;
  const records = new Map(lookup.records.map((record) => [record.nct, record]));
  const recordOf = (key: string) => records.get(key);

  // 1 and 2: a study tied to a receipt, and its text read, or what the map gives from it isn't looked up.
  const unchecked = map.studies.map(({ id }, index) => [
    ...(lookup.studies[index]?.registry ?? []),
    ...map.links.flatMap(({ from, to }, link) => from === id || to === id ? [lookup.links[link] ?? "not_checked"] : []),
    ...map.claims.flatMap(({ passages }, claim) => passages.flatMap(({ study }, passage) =>
      study === id ? [lookup.claims[claim]?.[passage] ?? "not_checked"] : []))
  ].includes("not_checked"));
  for (const [index, study] of map.studies.entries()) {
    if (!unchecked[index]) continue;
    if (!requests[index]!.tied) {
      notes.push(`study_map: study ${study.id} (${study.source}) isn't tied to any research receipt passed here, so its ` +
        "text wasn't looked in: give its source as AskRigor's tools returned it, and pass the research_receipt of the " +
        "search, record, reading or audit that found it.");
      continue;
    }
    const text = lookup.studies[index];
    if (!looked || text === undefined) continue;
    const again = "Reading it again with acquire_open_full_text and passing the new research_receipt lets it be looked in.";
    if (text.text === undefined) {
      notes.push(text.reason === "text_expired"
        ? `study_map: AskRigor no longer holds the full text of study ${study.id}, so what the map gives from it wasn't ` +
          `looked up. ${again}`
        : text.reason === "text_unavailable"
          ? `study_map: AskRigor couldn't read the abstract of study ${study.id} just now, so what the map gives from it ` +
            "wasn't looked up."
          : `study_map: AskRigor fetched no text of study ${study.id}, so what the map gives from it wasn't looked up, ` +
            "and the answer can't say it was found there.");
    } else if (text.reason === "text_expired") {
      notes.push(`study_map: AskRigor no longer holds the full text of study ${study.id}, only its abstract, so what the ` +
        `abstract doesn't have wasn't looked up. ${again}`);
    }
  }
  if (!looked) {
    notes.push("study_map: AskRigor couldn't look the studies' texts and registry records up in time, so the passages " +
      "and registry numbers weren't checked; what the map declares was.");
  }
  const textName = (index: number): string => {
    const kind = lookup.studies[index]?.text;
    return kind === undefined ? "the text" : TEXT_NAMES[kind];
  };
  const exactly = "Copy each whole and exactly, with no ellipsis, in the paper's language, or take it out of the map, " +
    "and check the answer again.";
  const unfoundLinks = map.links.filter((_, index) => lookup.links[index] === "not_found");
  if (unfoundLinks.length > 0) {
    notes.push(`The ${unfoundLinks.length === 1 ? "passage" : "passages"} given for ` +
      `${names(unfoundLinks.map(({ place }) => `study_map.links[${place}]`))} ${unfoundLinks.length === 1 ? "isn't" : "aren't"} ` +
      `in the text of either study AskRigor looked in. ${exactly}`);
  }

  // 3: each claim is in the answer, rests on a passage from each of its studies, and an absence claim on two or more
  // studies is among them.
  for (const [index, claim] of map.claims.entries()) {
    const name = `study_map.claims[${claim.place}]`;
    if (!context.shown(claim.quote)) {
      notes.push(`${name}.quote isn't in the answer: copy the claim's sentence exactly from answer_draft.`);
    }
    const bare = claim.studies.filter((study) => !claim.passages.some((given) => given.study === study));
    if (bare.length > 0) {
      notes.push(`${name} rests on ${names(bare)} but gives no passage from ${bare.length === 1 ? "it" : "them"}: give, ` +
        "in passages, each study's sentence the claim rests on, copied whole and exactly.");
    }
    const unfound = claim.passages.flatMap(({ study }, passage) =>
      lookup.claims[index]?.[passage] === "not_found" ? [`${study} (${textName(ids.indexOf(study))})`] : []);
    if (unfound.length > 0) {
      notes.push(`${name} gives ${unfound.length === 1 ? "a passage" : "passages"} that ${unfound.length === 1 ? "isn't" : "aren't"} ` +
        `in the text AskRigor looked in: from ${names([...new Set(unfound)])}. ${exactly}`);
    }
  }
  for (const { index, quote, studies } of context.absenceClaims) {
    if (map.claims.some((claim) => context.sameQuote(claim.quote, quote))) continue;
    notes.push(`absence_claims[${index}] rests on ${studies} studies, but study_map.claims doesn't give it: add it there, ` +
      "with the same quote, the studies it rests on, how many independent groups of people they are and each one's " +
      "passage.");
  }

  // 4: a registry number is in its study's text, or its ClinicalTrials.gov record lists the study's paper.
  const registry = map.studies.map((study, index) => (study.registry ?? []).map((number, place) => {
    const key = registryKey(number);
    const record = isNct(key) ? recordOf(key) : undefined;
    const listed = record?.status === "found" && requests[index]!.pmids.some((pmid) => record.record.pmids.includes(pmid));
    const inText = lookup.studies[index]?.registry[place];
    const tie: RegistryTie = inText === "found" ? "in_text" : listed ? "in_record"
      : record?.status === "not_found" ? "not_found"
        : inText === "not_found" && (record === undefined || record.status === "found") ? "not_found" : "not_checked";
    if (record?.status === "not_found") {
      notes.push(`study_map: ClinicalTrials.gov has no record of ${key}, which study ${study.id} gives as its registry ` +
        "number: check the number, or take it out of the map.");
    } else if (tie === "not_found") {
      notes.push(`study_map: study ${study.id} gives the registry number ${number}, but ${textName(index)} AskRigor ` +
        `looked in doesn't name it${record?.status === "found" && requests[index]!.pmids.length > 0
          ? " and its ClinicalTrials.gov record doesn't list the study's paper" : ""}: check the number, or take it ` +
        "out of the map.");
    }
    // 6: a record first submitted after its trial started, said only of a number nothing shows is another trial's.
    const late = record?.status === "found" ? registeredAfterStart(record.record) : undefined;
    if (late === true && record?.status === "found" && tie !== "not_found") {
      notes.push(`study_map: study ${study.id}'s trial registration, ${key}, was first submitted to ClinicalTrials.gov on ` +
        `${record.record.firstSubmitted}, after the trial started on ${record.record.start}: say so in the answer, ` +
        "beside that study's result.");
    }
    return { number, tie, ...(late === undefined ? {} : { registered: late ? "after_start" as const : "by_start" as const }) };
  }));
  const unread = lookup.records.filter(({ status }) => status === "unavailable").map(({ nct }) => nct);
  if (unread.length > 0) {
    notes.push(`study_map: AskRigor couldn't read the ClinicalTrials.gov ${unread.length === 1 ? "record" : "records"} of ` +
      `${names(unread)} just now, so what ${unread.length === 1 ? "it lists" : "they list"} and when ` +
      `${unread.length === 1 ? "it was" : "they were"} registered weren't checked; the rest of the map was.`);
  }
  const unasked = lookup.records.filter(({ status }) => status === "not_read").map(({ nct }) => nct);
  if (unasked.length > 0) {
    notes.push(`study_map: AskRigor reads at most ${STUDY_MAP_LIMITS.records} ClinicalTrials.gov records in one check, ` +
      `so ${names(unasked)} ${unasked.length === 1 ? "wasn't" : "weren't"} read.`);
  }

  // 5: groups of people counted once. Studies AskRigor can tell share people are one group: the same paper, a declared
  // link, the same registry number, one record listing both, the same group or identical figures.
  const groups = new Groups(map.studies.length);
  for (const [a, first] of requests.entries()) {
    for (const [b, second] of requests.entries()) {
      if (b > a && first.ids.some((id) => second.ids.includes(id))) groups.join(a, b, `${ids[a]} and ${ids[b]} are the same paper`);
    }
  }
  for (const { from, kind, to, place } of map.links) {
    groups.join(at.get(from)!, at.get(to)!, `the map links ${from} to ${to} (study_map.links[${place}], ${kind})`);
  }
  const numbers = map.studies.map((study, index) => {
    const declared = (study.registry ?? []).map(registryKey).filter(usableKey);
    return [...declared.map((key) => ({ key, named: "" })), ...(looked ? lookup.studies[index]?.abstractNumbers ?? [] : [])
      .filter((key) => !declared.includes(key)).map((key) => ({ key, named: ` (in ${study.id}'s abstract)` }))];
  });
  for (const [a, mine] of numbers.entries()) {
    for (const [b, theirs] of numbers.entries()) {
      if (b <= a) continue;
      const shared = mine.find(({ key }) => theirs.some((other) => other.key === key));
      if (shared === undefined) continue;
      const named = [shared.named, theirs.find(({ key }) => key === shared.key)!.named].filter((text) => text !== "");
      groups.join(a, b, `${ids[a]} and ${ids[b]} name the same registry number, ${shared.key}${named.join("")}`);
    }
  }
  for (const record of lookup.records) {
    if (record.status !== "found") continue;
    const secondary = record.record.secondaryIds.map(registryKey);
    const attached = map.studies.flatMap((_, index): Attachment[] => {
      if (numbers[index]!.some(({ key }) => key === record.nct)) return [{ index, how: "number", what: record.nct }];
      const pmid = requests[index]!.pmids.find((candidate) => record.record.pmids.includes(candidate));
      if (pmid !== undefined) return [{ index, how: "paper", what: pmid }];
      const other = numbers[index]!.find(({ key }) => secondary.includes(key));
      return other === undefined ? [] : [{ index, how: "secondary", what: other.key }];
    });
    const anchor = attached.find(({ how }) => how === "number") ?? attached[0];
    for (const other of attached) {
      // Two studies naming the record's number are already one group, by that number.
      if (anchor === undefined || other.index === anchor.index || other.how === "number") continue;
      const listed = other.how === "paper" ? `${ids[other.index]}'s paper (PMID ${other.what})`
        : `${ids[other.index]}'s registry number ${other.what} among its secondary IDs`;
      groups.join(anchor.index, other.index, anchor.how === "number"
        ? `${ids[anchor.index]}'s registration ${record.nct} lists ${listed}`
        : `the ClinicalTrials.gov record ${record.nct} lists ${ids[anchor.index]}'s ${anchor.how === "paper"
          ? `paper (PMID ${anchor.what})` : `registry number ${anchor.what} among its secondary IDs`} and ${listed}`);
    }
  }
  const labels = map.studies.map(({ group }) => figureText(group));
  for (const [a, mine] of labels.entries()) {
    const b = labels.findIndex((theirs, index) => index > a && theirs === mine);
    if (b > a) groups.join(a, b, `${ids[a]} and ${ids[b]} name the same group of people, "${map.studies[a]!.group}"`);
  }
  for (const [a, mine] of context.figures.entries()) {
    for (const [b, theirs] of context.figures.entries()) {
      if (b <= a || a >= ids.length || b >= ids.length) continue;
      if (new Set(mine.filter((value) => theirs.includes(value))).size >= 2) {
        groups.join(a, b, `${ids[a]} and ${ids[b]} report identical results`);
      }
    }
  }
  const claims = map.claims.map((claim, index) => {
    const studies = claim.studies.map((id) => at.get(id)!);
    const counted = new Set(studies.map((study) => groups.root(study))).size;
    if (claim.groups > counted) {
      notes.push(`study_map.claims[${claim.place}] counts ${people(claim.groups)}, but ${groups.reasons(studies).join("; ") ||
        `it rests on ${studies.length === 1 ? "one study" : `${studies.length} studies`}`}, so AskRigor counts ` +
        `${counted}: count them once, or show in the map that they are different people, and check the answer again.`);
    }
    return { claim: claim.place, shown: context.shown(claim.quote), groups: claim.groups, counted,
      passages: lookup.claims[index] ?? claim.passages.map(() => "not_checked" as const) };
  });
  const numbering = new Map<number, number>();
  for (const index of map.studies.keys()) {
    const root = groups.root(index);
    if (!numbering.has(root)) numbering.set(root, numbering.size + 1);
  }
  return {
    check: {
      looked_up: looked,
      groups: numbering.size,
      studies: map.studies.map((study, index) => ({
        id: study.id,
        tied: requests[index]!.tied,
        ...(lookup.studies[index]?.text === undefined ? {} : { text: lookup.studies[index]!.text! }),
        group: numbering.get(groups.root(index))!,
        ...(registry[index]!.length === 0 ? {} : { registry: registry[index]! })
      })),
      links: map.links.map(({ place }, index) => ({ link: place, passage: lookup.links[index] ?? "not_checked" })),
      claims
    },
    notes
  };
}

/** The result text's description of the map, given only when an answer rests on two or more key sources. */
export const STUDY_MAP_GUIDANCE = "This answer rests on two or more key sources, so it can carry a study map, which " +
  "counts groups of people, not papers; it is optional, and what it finds are notes: later_inputs.study_map " +
  JSON.stringify({
    studies: [{ id: "A", source: "10.1000/a", group: "…", registry: ["NCT…"] }, { id: "B", source: "…", group: "…" }],
    links: [{ from: "B", kind: "reanalysis_of", to: "A", passage: "…" }],
    claims: [{ quote: "…", studies: ["A", "B"], groups: 1, passages: [{ study: "A", passage: "…" }, { study: "B", passage: "…" }] }]
  }) + `. studies (${STUDY_MAP_LIMITS.fewestStudies} to ${STUDY_MAP_LIMITS.studies}): source, a DOI, PMID, PMCID or ` +
  "web address; group, one label for the people behind it, the same for two studies of the same people; and when " +
  `known registry (up to ${STUDY_MAP_LIMITS.registry} trial registry numbers), sites, recruited, run_by and people. ` +
  `links (up to ${STUDY_MAP_LIMITS.links}): kind, ${STUDY_LINK_KINDS.join(", ")}, with the sentence of either study ` +
  `that shows it. claims (1 to ${STUDY_MAP_LIMITS.claims}): quote, copied from answer_draft; the studies it rests on; ` +
  "groups, how many independent groups of people it counts; and each study's sentence it rests on. Copy each passage " +
  "whole and exactly: AskRigor looks it up in its own study's text, counts once the studies it can tell share people, " +
  "and checks registry numbers with ClinicalTrials.gov.";
