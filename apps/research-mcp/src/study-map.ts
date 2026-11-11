import type { ClinicalTrial } from "@askrigor/sources";
import { z } from "zod";

import { figureText } from "./binary-results.js";
import { salvageFinalizeInput } from "./salvage-finalize-input.js";
import {
  lookUpQuotes, quoteCache, quoteTooShort, SOURCE_LINE_OUTCOMES, SOURCE_LINE_TEXTS,
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
 * passage from each study it rests on; a registry number is in its study's full text, or its ClinicalTrials.gov record
 * lists the study's paper; and a ClinicalTrials.gov record first submitted after its trial started is said to be.
 *
 * Groups of people come only from what the map declares: a link of shared people to one study, or the same group. A
 * claim counting more groups than its own declarations allow gets a note. Whether two studies share people is meaning,
 * so what AskRigor finds (the same registration given twice, a registry number in an abstract, a registration listing
 * another study's paper, identical figures) joins nothing: each is a hint, worded as a question for the AI. A study
 * holding several groups (a review citing trials, or a reanalysis or extension of two or more studies) joins none, and
 * a claim resting on one isn't counted, as it may bring trials the map doesn't list.
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
// The links that say two studies share their people; a review citing a trial holds that trial and others.
const SHARED_PEOPLE_LINKS: ReadonlySet<string> = new Set(["same_cohort", "reanalysis_of", "extension_of", "abstract_of"]);
export const REGISTRY_TIES = ["in_text", "in_record", "not_found", "not_checked"] as const;
export const REGISTRATION_TIMES = ["by_start", "after_start"] as const;
type Outcome = typeof SOURCE_LINE_OUTCOMES[number];
type RegistryTie = typeof REGISTRY_TIES[number];
type TextKind = typeof SOURCE_LINE_TEXTS[number];

// A DOI, PMID, PMCID or web address, as the final check's identifiers are written.
const STUDY_SOURCE = /^(?:(?:doi:\s*)?10\.\d{4,9}\/\S+|(?:pmid:?\s*)?\d{1,9}|(?:pmcid:?\s*)?pmc\d+|https?:\/\/\S+)$/iu;
const studyId = z.string().trim().min(1).max(STUDY_MAP_LIMITS.id);
const passage = z.string().trim().min(1).max(STUDY_MAP_LIMITS.passage);
const label = z.string().trim().min(1).max(STUDY_MAP_LIMITS.label);

const studySchema = z.object({
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
}).strict();
const linkSchema = z.object({
  from: studyId,
  kind: z.enum(STUDY_LINK_KINDS),
  to: studyId,
  passage: passage.describe("The sentence, in either study's text, that shows the link, copied whole and exactly.")
}).strict();
const passageSchema = z.object({ study: studyId, passage }).strict();
const claimSchema = z.object({
  quote: z.string().trim().min(1).max(STUDY_MAP_LIMITS.quote).describe("The claim's sentence, copied from answer_draft."),
  studies: z.array(studyId).min(1).max(STUDY_MAP_LIMITS.studies).describe("The ids of the studies it rests on."),
  groups: z.number().int().positive().describe("How many independent groups of people the claim counts."),
  passages: z.array(passageSchema).max(STUDY_MAP_LIMITS.passages).optional()
    .describe("For each study it rests on, the sentence it rests on, copied whole and exactly.")
}).strict();

export const studyMapSchema = z.object({
  studies: z.array(studySchema).min(STUDY_MAP_LIMITS.fewestStudies).max(STUDY_MAP_LIMITS.studies),
  links: z.array(linkSchema).max(STUDY_MAP_LIMITS.links).optional(),
  claims: z.array(claimSchema).min(1).max(STUDY_MAP_LIMITS.claims)
}).strict();
export type StudyMap = z.output<typeof studyMapSchema>;
type MapStudy = StudyMap["studies"][number];
type MapLink = NonNullable<StudyMap["links"]>[number];

/** A registry number, read by its registry's format: the registry, the number as that registry writes it, and the key it is compared by. */
export interface RegistryNumber {
  registry: string;
  core: string;
  key: string;
}

// The formats of the trial registries AskRigor knows: strict, fixed-digit forms, each with its prefix (an EudraCT or EU
// CT number with its label), in figureText's form (lower case, ASCII digits, dashes as "-"). A number is its core: a
// registry's name or a label around it is set aside, so "EudraCT 2010-012345-12" and "EudraCT number: 2010-012345-12"
// are one number.
const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;
type Format = readonly [registry: string, pattern: string, core: (parts: string[]) => string];
const SEARCHED_FORMATS: readonly Format[] = [
  ["NCT", String.raw`nct[\s-]?(\d{8})`, ([digits]) => `NCT${digits}`],
  ["ISRCTN", String.raw`isrctn[\s-]?(\d{8})`, ([digits]) => `ISRCTN${digits}`],
  ["EudraCT", String.raw`(?:eudract|ctis|eu[\s-]?ct|euctr)(?:[\s-]*(?:number|no\.?|nr\.?|id))?[\s:#-]*(\d{4}-\d{6}-\d{2})`,
    ([digits]) => digits!],
  ["ACTRN", String.raw`actrn[\s-]?(\d{14})`, ([digits]) => `ACTRN${digits}`],
  ["ChiCTR", String.raw`chictr-?(\d{10})`, ([digits]) => `ChiCTR${digits}`],
  ["ChiCTR", String.raw`chictr-([a-z]{3})-(\d{8})`, ([kind, digits]) => `ChiCTR-${kind!.toUpperCase()}-${digits}`],
  ["DRKS", String.raw`drks[\s-]?(\d{8})`, ([digits]) => `DRKS${digits}`],
  ["CTRI", String.raw`ctri/(\d{4})/(\d{2,3})/(\d{6})`, (parts) => `CTRI/${parts.join("/")}`],
  ["jRCT", String.raw`jrct(\d{10})`, ([digits]) => `jRCT${digits}`],
  ["UMIN", String.raw`umin[\s-]?(\d{9})`, ([digits]) => `UMIN${digits}`],
  ["PACTR", String.raw`pactr(\d{15})`, ([digits]) => `PACTR${digits}`],
  ["KCT", String.raw`kct(\d{7})`, ([digits]) => `KCT${digits}`],
  ["TCTR", String.raw`tctr(\d{11})`, ([digits]) => `TCTR${digits}`],
  ["RBR", String.raw`rbr-([0-9a-z]{6,8})`, ([code]) => `RBR-${code}`]
];
// Netherlands Trial Register numbers are accepted as the map declares them, and never looked for in a text: their
// short forms are also gene and product names (NTR1, a neurotensin receptor).
const DECLARED_ONLY_FORMATS: readonly Format[] = [
  ["NTR", String.raw`ntr[\s-]?(\d{4,})`, ([digits]) => `NTR${digits}`],
  ["NL", String.raw`nl[\s-]?(\d{4,})`, ([digits]) => `NL${digits}`]
];
const compiled = (formats: readonly Format[]) => formats.map(([registry, pattern, core]) =>
  ({ registry, pattern: new RegExp(`${START}${pattern}${END}`, "gu"), core }));
const SEARCHED = compiled(SEARCHED_FORMATS);
const DECLARED = [...SEARCHED, ...compiled(DECLARED_ONLY_FORMATS)];
const NEVER_SEARCHED: ReadonlySet<string> = new Set(DECLARED_ONLY_FORMATS.map(([registry]) => registry));

/**
 * The registry numbers a text names, in the order it names them, each once. A declared value may also be a Netherlands
 * Trial Register number; a text is never read for one.
 */
export function registryNumbers(text: string, declared = false): RegistryNumber[] {
  const form = figureText(text);
  const found = (declared ? DECLARED : SEARCHED).flatMap(({ registry, pattern, core }) =>
    [...form.matchAll(pattern)].map((match) => {
      const number = core(match.slice(1).map((part) => part ?? ""));
      return { at: match.index, registry, core: number, key: `${registry}:${number.replace(/[\s\-/]/gu, "").toUpperCase()}` };
    }));
  const seen = new Set<string>();
  return found.sort((left, right) => left.at - right.at).flatMap(({ registry, core, key }) => {
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ registry, core, key }];
  });
}

/** Whether a text, in figureText's form, names this number: its core, with or without spaces, dashes or slashes inside. */
function namesNumber(text: string, number: RegistryNumber): boolean {
  const runs = number.core.toLowerCase().match(/\p{L}+|\p{N}+/gu) ?? [];
  const body = runs.map((run) => run.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&")).join(String.raw`[\s\-/.:]?`);
  const first = /^\p{N}/u.test(number.core) ? String.raw`(?<!\p{N})` : START;
  const last = /\p{N}$/u.test(number.core) ? String.raw`(?!\p{N})` : END;
  return new RegExp(`${first}${body}${last}`, "u").test(text);
}

/** One study of the map as it is checked: its place as given, and its registry entries read. */
export interface CheckedStudy extends Omit<MapStudy, "registry"> {
  place: number;
  /** Each registry entry kept, with its place as given and the numbers it names. */
  registry: Array<{ place: number; given: string; numbers: RegistryNumber[] }>;
}

/** The map as it is checked: each item at its place as given, those it couldn't use left out. */
export interface CheckedStudyMap {
  studies: CheckedStudy[];
  links: Array<MapLink & { place: number }>;
  claims: Array<{ place: number; quote: string; studies: string[]; groups: number;
    passages: Array<{ place: number; study: string; passage: string }> }>;
}

/** A study's declared registry numbers, each once, with the place of the entry naming it. */
export function declaredNumbers(study: CheckedStudy): Array<{ entry: number; number: RegistryNumber }> {
  const seen = new Set<string>();
  return study.registry.flatMap(({ place, numbers }) => numbers.flatMap((number) => {
    if (seen.has(number.key)) return [];
    seen.add(number.key);
    return [{ entry: place, number }];
  }));
}

/** One item read on its own with the final check's salvage: its notes carry its place, as given. */
function readItem<T>(schema: z.ZodType<T>, raw: unknown, at: string, notes: string[]): T | undefined {
  const own: string[] = [];
  const read = salvageFinalizeInput(z.object({ item: schema }), { item: raw }, own) as { item: T } | undefined;
  notes.push(...own.map((note) => note.startsWith("item") ? `${at}${note.slice("item".length)}` : note));
  return read?.item;
}

/** A list read item by item, so one left out never moves the others' places; at most `most` usable items are kept. */
function readList<T>(raw: unknown, at: string, most: number, notes: string[],
  readOne: (item: unknown, at: string, place: number) => T | undefined): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    notes.push(`${at}: dropped: expected a list.`);
    return [];
  }
  const read = raw.flatMap((item, place) => {
    const one = readOne(item, `${at}[${place}]`, place);
    return one === undefined ? [] : [one];
  });
  if (read.length > most) notes.push(`${at}: kept at most ${most} items to stay within the list's size limit.`);
  return read.slice(0, most);
}

const names = (ids: readonly string[]): string =>
  ids.length === 1 ? ids[0]! : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`;

/**
 * Reads the map an item at a time, each at its place as given: one item that can't be used is left out with a note,
 * never the whole map. Zod checks each item's shape; what the items name, and whether a registry entry is a registry
 * number, is checked here. Returns the map as checked, and as accepted (for the call's study_map).
 */
export function readStudyMap(raw: unknown): { map?: CheckedStudyMap; given?: StudyMap; notes: string[] } {
  const notes: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { notes: ["study_map: dropped: expected an object."] };
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (key !== "studies" && key !== "links" && key !== "claims") notes.push(`study_map.${key}: dropped an unknown field.`);
  }
  const studyItem = studySchema.extend({ registry: z.array(z.unknown()).optional() });
  const studies = readList(value.studies, "study_map.studies", STUDY_MAP_LIMITS.studies, notes, (item, at, place) => {
    const study = readItem(studyItem, item, at, notes);
    if (study === undefined) return undefined;
    const registry = readList(study.registry, `${at}.registry`, STUDY_MAP_LIMITS.registry, notes, (entry, entryAt, entryPlace) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        notes.push(`${entryAt}: dropped: expected text.`);
        return undefined;
      }
      const given = entry.trim();
      if (given.length > STUDY_MAP_LIMITS.registryNumber) {
        notes.push(`${entryAt}: dropped: needs at most ${STUDY_MAP_LIMITS.registryNumber} characters.`);
        return undefined;
      }
      const numbers = registryNumbers(given, true);
      if (numbers.length === 0) {
        notes.push(`${entryAt} (${JSON.stringify(given)}) isn't a registry number, so it was left out: give trial ` +
          "registry numbers only, each with its registry's prefix, such as NCT01234567 or EudraCT 2010-012345-12, or " +
          "leave registry out.");
        return undefined;
      }
      return { place: entryPlace, given, numbers };
    });
    return { ...study, place, registry };
  });
  const links = readList(value.links, "study_map.links", STUDY_MAP_LIMITS.links, notes, (item, at, place) => {
    const link = readItem(linkSchema, item, at, notes);
    return link === undefined ? undefined : { ...link, place };
  });
  const claimItem = claimSchema.extend({ passages: z.array(z.unknown()).optional() });
  const claims = readList(value.claims, "study_map.claims", STUDY_MAP_LIMITS.claims, notes, (item, at, place) => {
    const claim = readItem(claimItem, item, at, notes);
    if (claim === undefined) return undefined;
    const passages = readList(claim.passages, `${at}.passages`, STUDY_MAP_LIMITS.passages, notes, (one, passageAt, passagePlace) => {
      const read = readItem(passageSchema, one, passageAt, notes);
      return read === undefined ? undefined : { ...read, place: passagePlace };
    });
    return { place, quote: claim.quote, studies: [...new Set(claim.studies)], groups: claim.groups, passages };
  });
  if (studies.length < STUDY_MAP_LIMITS.fewestStudies || claims.length === 0) {
    notes.push(`study_map: dropped as a whole, since it has ${studies.length < STUDY_MAP_LIMITS.fewestStudies
      ? `fewer than ${STUDY_MAP_LIMITS.fewestStudies} usable studies` : "no usable claim"}: send it again with ` +
      `${STUDY_MAP_LIMITS.fewestStudies} to ${STUDY_MAP_LIMITS.studies} studies and 1 to ${STUDY_MAP_LIMITS.claims} claims, or leave it out.`);
    return { notes };
  }
  const given: StudyMap = {
    studies: studies.map(({ place: _place, registry, ...study }) =>
      ({ ...study, ...(registry.length === 0 ? {} : { registry: registry.map(({ given: number }) => number) }) })),
    ...(value.links === undefined ? {} : { links: links.map(({ place: _place, ...link }) => link) }),
    claims: claims.map(({ place: _place, passages, ...claim }) =>
      ({ ...claim, ...(passages.length === 0 ? {} : { passages: passages.map(({ study, passage: text }) => ({ study, passage: text })) }) }))
  };

  // What the items name: a study left out with its id taken, a link or a claim naming a study the map doesn't have,
  // a passage from a study its claim doesn't rest on.
  const first = new Map<string, number>();
  const kept = studies.filter(({ id, place }) => {
    const earlier = first.get(id);
    if (earlier === undefined) {
      first.set(id, place);
      return true;
    }
    notes.push(`study_map.studies[${place}] has the id ${id} of study_map.studies[${earlier}], so it was left out: ` +
      "give each study its own id.");
    return false;
  });
  const unknown = (ids: readonly string[]): string[] => [...new Set(ids.filter((id) => !first.has(id)))];
  const notAStudy = (ids: readonly string[]): string =>
    `names ${names(ids)}, which ${ids.length === 1 ? "isn't a study" : "aren't studies"} in study_map.studies, so it ` +
      "was left out: name each study by its id.";
  const linked = links.filter((link) => {
    const missing = unknown([link.from, link.to]);
    if (missing.length > 0) notes.push(`study_map.links[${link.place}] ${notAStudy(missing)}`);
    else if (link.from === link.to) notes.push(`study_map.links[${link.place}] links ${link.from} to itself, so it was left out.`);
    else return true;
    return false;
  });
  const claimed = claims.flatMap((claim) => {
    const missing = unknown(claim.studies);
    if (missing.length > 0) {
      notes.push(`study_map.claims[${claim.place}] ${notAStudy(missing)}`);
      return [];
    }
    const passages = claim.passages.filter(({ study, place }) => {
      if (claim.studies.includes(study)) return true;
      notes.push(`study_map.claims[${claim.place}].passages[${place}] is from ${study}, which the claim doesn't rest on, ` +
        "so it was left out: give passages only from the studies in its studies.");
      return false;
    });
    return [{ ...claim, passages }];
  });
  return { map: { studies: kept, links: linked, claims: claimed }, given, notes };
}

/** Where one study's text may be, from its source's verified receipts, found as a source line's is (owner answer 237a). */
export interface StudyMapRequest extends QuoteSource {
  /** Whether a verified research receipt names the study's source. */
  tied: boolean;
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
  text?: TextKind;
  /** Why what the map gives from it wasn't all looked up: a source line's reasons, or late, its abstract not read in time. */
  reason?: "no_text" | "text_expired" | "text_unavailable" | "late";
  /** Each declared registry number (declaredNumbers): in its text, not in its full text, or not looked for. */
  registry: Outcome[];
  /** The registry numbers its abstract names. */
  abstractNumbers: RegistryNumber[];
}

export type RecordLookup =
  | { nct: string; status: "found"; record: RegistryRecord }
  | { nct: string; status: "not_found" | "unavailable" | "late" | "not_read" };

/** What looking the map up found, after a check's first pass. */
export interface StudyMapLookup {
  /** False when the lookup failed or never finished, so nothing was looked up. */
  done: boolean;
  studies: StudyTextLookup[];
  /** Each link's passage: found in the text of either study it links. */
  links: Outcome[];
  /** Each claim's passages, in their order. */
  claims: Outcome[][];
  records: RecordLookup[];
}

// How long a check may wait to look its map up: the source lines' time, which the map shares.
export const STUDY_MAP_DEADLINE_MILLISECONDS = 8_000;

/** One deadline for the whole lookup: what isn't read by then is late, and what was read is kept. */
function deadline(milliseconds: number) {
  let timer: NodeJS.Timeout | undefined;
  let passed = false;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      passed = true;
      resolve();
    }, milliseconds);
    timer.unref?.();
  });
  return { expired, passed: () => passed, clear: () => clearTimeout(timer) };
}
type Deadline = ReturnType<typeof deadline>;
const LATE = Symbol("late");

async function readRecord(nct: string, texts: StudyMapTexts, clock: Deadline): Promise<RecordLookup> {
  const read = (async (): Promise<RecordLookup> => {
    const record = await texts.registry(nct);
    if (record === undefined) return { nct, status: "not_found" };
    return record === null || record.nct !== nct ? { nct, status: "unavailable" } : { nct, status: "found", record };
  })().catch((): RecordLookup => ({ nct, status: "unavailable" }));
  return Promise.race([read, clock.expired.then((): RecordLookup => ({ nct, status: "late" }))]);
}

/** The registry numbers a study's abstract names: the whole of a PubMed abstract, or a full text's abstract blocks. */
function abstractNumbers(document: SourceLineDocument): RegistryNumber[] {
  const blocks = document.kind === "abstract" ? document.blocks : document.blocks.filter(({ abstract }) => abstract === true);
  return registryNumbers(blocks.map(({ text }) => text).join("\n"));
}

/**
 * Looks the map up within one deadline: each study's passages in its own text (a link's in either study's), its
 * registry numbers in its text, the registry numbers its abstract names, and the ClinicalTrials.gov records of its
 * declared NCT numbers. The records are read at once; PubMed abstracts wait for `after` (the source lines' lookup,
 * which comes first) and share its cache. What isn't read in time is late, and what was read is kept.
 */
export async function lookUpStudyMap(
  map: CheckedStudyMap,
  requests: readonly StudyMapRequest[],
  texts: StudyMapTexts,
  options: { cache?: QuoteCache; milliseconds?: number; after?: Promise<unknown> } = {}
): Promise<StudyMapLookup> {
  const cache = options.cache ?? quoteCache();
  const clock = deadline(options.milliseconds ?? STUDY_MAP_DEADLINE_MILLISECONDS);
  try {
    const records = new Map<string, Promise<RecordLookup>>();
    const read = (nct: string): void => {
      if (records.has(nct)) return;
      records.set(nct, records.size < STUDY_MAP_LIMITS.records
        ? readRecord(nct, texts, clock) : Promise.resolve({ nct, status: "not_read" }));
    };
    // ClinicalTrials.gov isn't PubMed, so the declared numbers' records are read at once.
    for (const study of map.studies) {
      for (const { number } of declaredNumbers(study)) if (number.registry === "NCT") read(number.core);
    }
    const after = (options.after ?? Promise.resolve()).then(() => undefined, () => undefined);
    const late = new Set<string>();
    const waiting: SourceLineTexts = {
      fullText: (handle) => texts.fullText(handle),
      async abstract(pmid) {
        await Promise.race([after, clock.expired]);
        if (clock.passed()) {
          late.add(pmid);
          return null;
        }
        return texts.abstract(pmid);
      }
    };
    const place = new Map(map.studies.map(({ id }, index) => [id, index]));
    const quotes = map.studies.map((): string[] => []);
    const slot = (id: string, quote: string): [number, number] => {
      const study = place.get(id)!;
      return [study, quotes[study]!.push(quote) - 1];
    };
    const claimSlots = map.claims.map(({ passages }) => passages.map(({ study, passage: quote }) => slot(study, quote)));
    const linkSlots = map.links.map(({ from, to, passage: quote }) => [slot(from, quote), slot(to, quote)]);
    const found = await Promise.all(map.studies.map(async (_, index): Promise<QuotesLookup | typeof LATE | undefined> => {
      const request = requests[index];
      // A study no receipt ties has no text AskRigor can find, so nothing is looked up in it.
      if (request === undefined || !request.tied) return undefined;
      const lookup = await Promise.race([lookUpQuotes(request, quotes[index]!, waiting, cache),
        clock.expired.then((): typeof LATE => LATE)]);
      return lookup !== LATE && lookup.document === undefined && request.pmids.some((pmid) => late.has(pmid)) ? LATE : lookup;
    }));
    const outcome = ([study, at]: [number, number]): Outcome => {
      const lookup = found[study];
      return lookup === undefined || lookup === LATE ? "not_checked" : lookup.quotes[at]?.outcome ?? "not_checked";
    };
    const studies = map.studies.map((study, index): StudyTextLookup => {
      const lookup = found[index];
      const declared = declaredNumbers(study);
      if (lookup === LATE) return { reason: "late", registry: declared.map(() => "not_checked"), abstractNumbers: [] };
      const document = lookup?.document;
      const whole = document === undefined || declared.length === 0 ? ""
        : figureText(document.blocks.map(({ text }) => text).join("\n"));
      // Only a full text still held can show a number isn't there: an abstract often leaves it out. A copy from the
      // owner's library is a full text too. A Netherlands Trial Register number is never looked for.
      const complete = (document?.kind === "full_text" || document?.kind === "library_copy") &&
        lookup?.reason !== "text_expired";
      return {
        ...(document === undefined ? {} : { text: document.kind }),
        ...(lookup?.reason === undefined ? {} : { reason: lookup.reason }),
        registry: declared.map(({ number }): Outcome => document === undefined || NEVER_SEARCHED.has(number.registry)
          ? "not_checked" : namesNumber(whole, number) ? "found" : complete ? "not_found" : "not_checked"),
        abstractNumbers: document === undefined ? [] : abstractNumbers(document)
      };
    });
    return {
      done: true,
      studies,
      links: linkSlots.map((slots): Outcome => {
        const outcomes = slots.map(outcome);
        return outcomes.includes("found") ? "found" : outcomes.every((each) => each === "not_found") ? "not_found" : "not_checked";
      }),
      claims: claimSlots.map((slots) => slots.map(outcome)),
      records: await Promise.all(records.values())
    };
  } finally {
    clock.clear();
  }
}

/** A lookup that failed or never finished: nothing looked up, what the map declares still checked. */
export function lateStudyMapLookup(map: CheckedStudyMap): StudyMapLookup {
  return {
    done: false,
    studies: map.studies.map((study) => ({ registry: declaredNumbers(study).map(() => "not_checked" as const), abstractNumbers: [] })),
    links: map.links.map(() => "not_checked" as const),
    claims: map.claims.map(({ passages }) => passages.map(() => "not_checked" as const)),
    records: []
  };
}

const placeField = z.number().int().nonnegative().describe("Its place in its list as given, 0 for the first.");
/** Runtime only (owner answer 189a): what the check of the map found, each item at its place as given. */
export const studyMapCheckSchema = z.object({
  looked_up: z.boolean()
    .describe("Whether its texts and registry records were looked up; what the map declares is checked either way."),
  groups: z.number().int().nonnegative()
    .describe("How many groups of people AskRigor tells apart among the studies that hold one group each."),
  studies: z.array(z.object({
    place: placeField,
    id: z.string(),
    tied: z.boolean().describe("Whether a verified research receipt names its source."),
    text: z.enum(SOURCE_LINE_TEXTS).optional().describe("The text its passages were looked up in."),
    group: z.number().int().positive().optional().describe("Its group of people, 1 for the first."),
    several_groups: z.boolean().optional()
      .describe("A study holding several groups of people: a review citing trials, or a reanalysis or extension of two " +
        "or more studies."),
    registry: z.array(z.object({
      place: placeField,
      number: z.string(),
      tie: z.enum(REGISTRY_TIES)
        .describe("in_text: its text names it; in_record: a ClinicalTrials.gov record ties it to the study."),
      registered: z.enum(REGISTRATION_TIMES).optional()
        .describe("For a ClinicalTrials.gov number: whether the record was first submitted by the trial's start.")
    }).strict()).optional()
  }).strict()),
  links: z.array(z.object({ place: placeField, outcome: z.enum(SOURCE_LINE_OUTCOMES) }).strict()),
  claims: z.array(z.object({
    place: placeField,
    shown: z.boolean().describe("Whether the answer shows its quote."),
    groups: z.number().int().positive().describe("The groups of people it counts, as given."),
    counted: z.number().int().nonnegative().optional()
      .describe("The groups of people AskRigor counts among its studies; none when one of them holds several."),
    passages: z.array(z.object({ place: placeField, outcome: z.enum(SOURCE_LINE_OUTCOMES) }).strict())
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

const TEXT_NAMES: Readonly<Record<TextKind, string>> = {
  full_text: "the full text",
  abstract: "the abstract",
  search_copy: "the copy the AI supplied",
  library_copy: "the copy from the owner's library"
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

/** Joins by key, each join keeping the reason it was made. */
class Joins<Key> {
  private readonly parent = new Map<Key, Key>();
  readonly made: Array<{ a: Key; b: Key; why: string }> = [];
  root(at: Key): Key {
    let root = at;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    return root;
  }
  join(a: Key, b: Key, why = ""): void {
    const [left, right] = [this.root(a), this.root(b)];
    if (left === right) return;
    this.parent.set(right, left);
    this.made.push({ a, b, why });
  }
  /** The reasons that put these in one group: the joins on the paths between them. */
  reasons(members: readonly Key[]): string[] {
    const path = (from: Key, to: Key): number[] => {
      const seen = new Map<Key, number[]>([[from, []]]);
      const queue = [from];
      while (queue.length > 0) {
        const at = queue.shift()!;
        if (at === to) return seen.get(at)!;
        this.made.forEach(({ a, b }, join) => {
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
    for (const [index, member] of members.entries()) {
      const first = members.slice(0, index).find((other) => this.root(other) === this.root(member));
      if (first !== undefined) for (const join of path(first, member)) used.add(join);
    }
    return [...used].sort((left, right) => left - right).map((join) => this.made[join]!.why);
  }
}

const people = (count: number): string => `${count} independent group${count === 1 ? "" : "s"} of people`;

/**
 * The map's checks, once the check passes: notes for the AI, none of which holds the answer back, and the runtime
 * study_map result. Items are named by their places as given.
 */
export function checkStudyMap(
  map: CheckedStudyMap,
  lookup: StudyMapLookup,
  context: StudyMapContext
): { check: StudyMapCheck; notes: string[] } {
  const notes: string[] = [];
  const ids = map.studies.map(({ id }) => id);
  const at = new Map(ids.map((id, index) => [id, index]));
  const requests = map.studies.map((_, index) => context.requests[index] ?? { tied: false, handles: [], pmids: [] });
  const looked = lookup.done;
  const records = new Map(lookup.records.map((record) => [record.nct, record]));
  const declared = map.studies.map(declaredNumbers);
  const textName = (index: number): string => {
    const kind = lookup.studies[index]?.text;
    return kind === undefined ? "the text" : TEXT_NAMES[kind];
  };
  const exactly = "Copy each whole and exactly, with no ellipsis, in the paper's language, or take it out of the map, " +
    "and check the answer again.";

  // A passage too short to mean much isn't looked up, as a source line's quote isn't.
  const short = new Set<string>();
  for (const claim of map.claims) {
    for (const { place, passage: text } of claim.passages) {
      if (quoteTooShort(text)) short.add(`study_map.claims[${claim.place}].passages[${place}]`);
    }
  }
  for (const link of map.links) if (quoteTooShort(link.passage)) short.add(`study_map.links[${link.place}]`);
  for (const where of short) notes.push(`A passage given in ${where} is too short to mean much: give the whole sentence.`);

  // 1 and 2: a study tied to a receipt, and its text read, or what the map gives from it isn't looked up.
  // A registry number an abstract doesn't name isn't asked about: abstracts often leave it out.
  const unchecked = map.studies.map(({ id }, index) => [
    ...(lookup.studies[index]?.text === undefined ? lookup.studies[index]?.registry ?? [] : []),
    ...map.links.flatMap(({ from, to, passage: text }, link) => (from === id || to === id) && !quoteTooShort(text)
      ? [lookup.links[link] ?? "not_checked"] : []),
    ...map.claims.flatMap(({ passages }, claim) => passages.flatMap(({ study, passage: text }, passage) =>
      study === id && !quoteTooShort(text) ? [lookup.claims[claim]?.[passage] ?? "not_checked"] : []))
  ].includes("not_checked"));
  const lateTexts: string[] = [];
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
    if (text.reason === "late") lateTexts.push(study.id);
    else if (text.text === undefined) {
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
  if (lateTexts.length > 0) {
    notes.push(`study_map: AskRigor couldn't read the ${lateTexts.length === 1 ? "abstract of study" : "abstracts of studies"} ` +
      `${names(lateTexts)} in time, so what the map gives from ${lateTexts.length === 1 ? "it" : "them"} wasn't looked up.`);
  }
  if (!looked) {
    notes.push("study_map: AskRigor couldn't look the studies' texts and registry records up in time, so the passages " +
      "and registry numbers weren't checked; what the map declares was.");
  }
  const unfoundLinks = map.links.filter((_, index) => lookup.links[index] === "not_found");
  if (unfoundLinks.length > 0) {
    notes.push(`The ${unfoundLinks.length === 1 ? "passage" : "passages"} given in ` +
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
    const unfound = claim.passages.flatMap(({ study, place }, passage) => lookup.claims[index]?.[passage] === "not_found"
      ? [`${name}.passages[${place}] (from ${study}, in ${textName(ids.indexOf(study))})`] : []);
    if (unfound.length > 0) {
      notes.push(`The ${unfound.length === 1 ? "passage" : "passages"} given in ${names(unfound)} ` +
        `${unfound.length === 1 ? "isn't" : "aren't"} in the text AskRigor looked in. ${exactly}`);
    }
  }
  for (const { index, quote, studies } of context.absenceClaims) {
    if (map.claims.some((claim) => context.sameQuote(claim.quote, quote))) continue;
    notes.push(`absence_claims[${index}] rests on ${studies} studies, but study_map.claims doesn't give it: add it there, ` +
      "with the same quote, the studies it rests on, how many independent groups of people they are and each one's " +
      "passage.");
  }

  // 4: a registry number is in its study's full text, or its ClinicalTrials.gov record lists the study's paper among
  // its results.
  const registry = map.studies.map((study, index) => declared[index]!.map(({ entry, number }, place) => {
    const inText = lookup.studies[index]?.registry[place];
    const record = number.registry === "NCT" ? records.get(number.core) : undefined;
    const tie: RegistryTie = inText === "found" ? "in_text"
      : record?.status === "found" && requests[index]!.pmids.some((pmid) => record.record.pmids.includes(pmid)) ? "in_record"
        : record?.status === "not_found" ? "not_found"
          : inText === "not_found" && (record === undefined || record.status === "found") ? "not_found" : "not_checked";
    const given = study.registry.find(({ place: entryPlace }) => entryPlace === entry)?.given ?? number.core;
    if (record?.status === "not_found") {
      notes.push(`study_map: ClinicalTrials.gov has no record of ${number.core}, which study ${study.id} gives as its ` +
        "registry number: check the number, or take it out of the map.");
    } else if (tie === "not_found") {
      notes.push(`study_map: study ${study.id} gives the registry number ${given}, but ${textName(index)} AskRigor ` +
        `looked in doesn't name it${record?.status === "found" && requests[index]!.pmids.length > 0
          ? " and its ClinicalTrials.gov record doesn't list the study's paper" : ""}: check the number, or take it ` +
        "out of the map.");
    }
    // 6: a record first submitted after its trial started, said only of a number nothing shows is another trial's.
    const after = record?.status === "found" ? registeredAfterStart(record.record) : undefined;
    if (after === true && record?.status === "found" && tie !== "not_found") {
      notes.push(`study_map: study ${study.id}'s trial registration, ${number.core}, was first submitted to ` +
        `ClinicalTrials.gov on ${record.record.firstSubmitted}, after the trial started on ${record.record.start}: say ` +
        "so in the answer, beside that study's result.");
    }
    return { place: entry, number: number.core, tie, ...(after === undefined ? {} : { registered: after ? "after_start" as const : "by_start" as const }) };
  }));
  const unread = (status: RecordLookup["status"]): string[] =>
    lookup.records.filter((record) => record.status === status).map(({ nct }) => nct);
  const failed = unread("unavailable");
  if (failed.length > 0) {
    notes.push(`study_map: AskRigor couldn't read the ClinicalTrials.gov ${failed.length === 1 ? "record" : "records"} of ` +
      `${names(failed)} just now, so what ${failed.length === 1 ? "it lists" : "they list"} and when ` +
      `${failed.length === 1 ? "it was" : "they were"} registered weren't checked; the rest of the map was.`);
  }
  const slow = unread("late");
  if (slow.length > 0) {
    notes.push(`study_map: the ${slow.length === 1 ? "registration" : "registrations"} of ${names(slow)} couldn't be read ` +
      `in time, so what ${slow.length === 1 ? "it lists" : "they list"} and when ${slow.length === 1 ? "it was" : "they were"} ` +
      "submitted weren't checked.");
  }
  const capped = unread("not_read");
  if (capped.length > 0) {
    notes.push(`study_map: AskRigor reads at most ${STUDY_MAP_LIMITS.records} ClinicalTrials.gov records in one check, ` +
      `so ${names(capped)} ${capped.length === 1 ? "wasn't" : "weren't"} read.`);
  }

  // 5: groups of people, from the map's own declarations only: a link of shared people to one study, or the same group.
  // Whether two studies share people is meaning, so nothing AskRigor finds in a text or a record joins them; each such
  // finding is a hint below, for the AI to judge. A study holding several groups (a review citing trials, or a
  // reanalysis or extension of two or more studies) joins none, and a claim resting on one isn't counted.
  const several = map.studies.map(({ id }) => map.links.some(({ from, kind }) => from === id && kind === "cites_as_evidence") ||
    new Set(map.links.filter(({ from, kind }) => from === id && (kind === "reanalysis_of" || kind === "extension_of"))
      .map(({ to }) => to)).size >= 2);
  const single = (index: number): boolean => !several[index];
  const groups = new Joins<number>();
  for (const { from, kind, to, place } of map.links) {
    const [a, b] = [at.get(from)!, at.get(to)!];
    if (SHARED_PEOPLE_LINKS.has(kind) && single(a) && single(b)) {
      groups.join(a, b, `the map links ${from} to ${to} (study_map.links[${place}], ${kind})`);
    }
  }
  const labels = map.studies.map(({ group }) => figureText(group));
  for (const [a, mine] of labels.entries()) {
    const b = labels.findIndex((theirs, index) => index > a && single(index) && theirs === mine);
    if (b > a && single(a)) groups.join(a, b, `${ids[a]} and ${ids[b]} name the same group of people, "${map.studies[a]!.group}"`);
  }
  const together = (a: number, b: number): boolean => single(a) && single(b) && groups.root(a) === groups.root(b);
  const linked = (a: number, b: number): boolean => map.links.some(({ from, to }) =>
    (from === ids[a] && to === ids[b]) || (from === ids[b] && to === ids[a]));

  // Hints, each a question for the AI: what AskRigor found that may mean two studies share people.
  const asked = new Set<string>();
  for (const claim of map.claims) {
    const studies = claim.studies.map((id) => at.get(id)!);
    for (const [index, a] of studies.entries()) {
      for (const b of studies.slice(index + 1)) {
        const shared = declared[a]!.find(({ number }) => declared[b]!.some((other) => other.number.key === number.key));
        const pair = [a, b].sort((left, right) => left - right).join(" ");
        if (shared === undefined || together(a, b) || linked(a, b) || asked.has(pair)) continue;
        asked.add(pair);
        notes.push(`study_map: ${ids[a]} and ${ids[b]} give the same registration, ${shared.number.core}: if they report ` +
          "the same people, give them one group or link them same_cohort; if one is a review or a pooled analysis, link " +
          "it cites_as_evidence to the other; if not, say how they differ.");
      }
    }
  }
  // A registry number an abstract names: one a study it links to gives is that study's, and asks nothing; one another
  // study gives asks how the two relate; the rest, which no study gives, are asked about in one note.
  const missing: Array<{ id: string; numbers: string[] }> = [];
  for (const [index, study] of map.studies.entries()) {
    const named = (looked ? lookup.studies[index]?.abstractNumbers ?? [] : [])
      .filter(({ key }) => !declared[index]!.some(({ number }) => number.key === key));
    const rest: string[] = [];
    for (const number of named) {
      const giving = map.studies.flatMap((_, other) =>
        other !== index && declared[other]!.some((given) => given.number.key === number.key) ? [other] : []);
      if (giving.length === 0) {
        rest.push(number.core);
        continue;
      }
      if (giving.some((other) => linked(index, other) || together(index, other))) continue;
      const them = names(giving.map((other) => ids[other]!));
      const one = giving.length === 1;
      notes.push(`study_map: ${study.id}'s abstract names ${number.core}, which ${them} ${one ? "gives as its" : "give as their"} ` +
        `registration: if ${study.id} reports ${one ? `${them}'s` : "their"} people, link them same_cohort; if it cites ` +
        `${one ? them : "them"}, link it cites_as_evidence.`);
    }
    if (rest.length > 0) missing.push({ id: study.id, numbers: rest });
  }
  if (missing.length > 0) {
    const listed = names(missing.map(({ id, numbers }) => `${id} (${numbers.join(", ")})`));
    const [only] = missing;
    notes.push(missing.length === 1
      ? `study_map: the abstract of ${listed} names ${only!.numbers.length === 1 ? "a registration" : "registrations"} the ` +
        `map doesn't give: if ${only!.numbers.length === 1 ? "it is" : "one is"} ${only!.id}'s, add it.`
      : `study_map: the abstracts of ${listed} name registrations the map doesn't give: if they are theirs, add them.`);
  }
  for (const record of lookup.records) {
    if (record.status !== "found") continue;
    const giving = map.studies.flatMap((_, index) =>
      declared[index]!.some(({ number }) => number.registry === "NCT" && number.core === record.nct) ? [index] : []);
    for (const [index, study] of map.studies.entries()) {
      if (giving.includes(index) || !requests[index]!.pmids.some((pmid) => record.record.pmids.includes(pmid))) continue;
      if (giving.some((other) => together(other, index) || linked(other, index))) continue;
      const them = names(giving.map((other) => ids[other]!));
      notes.push(`study_map: the record of ${record.nct} lists ${study.id} among its results: if ${study.id} reports the ` +
        `same trial's people, give it the same group as ${them} or link it same_cohort to ${them}; if it is a review or a ` +
        `pooled analysis, link it cites_as_evidence to ${them}.`);
    }
  }
  for (const [a, mine] of context.figures.entries()) {
    for (const [b, theirs] of context.figures.entries()) {
      if (b <= a || a >= ids.length || b >= ids.length || together(a, b)) continue;
      const shared = [...new Set(mine.filter((value) => theirs.includes(value)))];
      if (shared.length < 2) continue;
      notes.push(`study_map: ${ids[a]} and ${ids[b]} report identical figures (${shared.join(", ")}): HRP ` +
        "IdenticalResultsAcrossPublications treats them as possibly one dataset; count them once unless they're shown " +
        "to differ.");
    }
  }
  const claims = map.claims.map((claim, index) => {
    const studies = claim.studies.map((id) => at.get(id)!);
    // A study holding several groups may bring trials the map doesn't list, so such a claim isn't counted.
    const counted = studies.some((study) => several[study]) ? undefined
      : new Set(studies.map((study) => groups.root(study))).size;
    if (counted !== undefined && claim.groups > counted) {
      const reasons = groups.reasons(studies);
      notes.push(reasons.length === 0
        ? `study_map.claims[${claim.place}] counts ${people(claim.groups)} but rests on ${studies.length === 1 ? "one study"
          : `${studies.length} studies`}: give each study it rests on, or count only those it names, and check the answer again.`
        : `study_map.claims[${claim.place}] counts ${people(claim.groups)}, but ${reasons.join("; ")}, so AskRigor counts ` +
          `${counted}: count them once, or, if they are different people, give each its own group, and check the answer again.`);
    }
    return {
      place: claim.place,
      shown: context.shown(claim.quote),
      groups: claim.groups,
      ...(counted === undefined ? {} : { counted }),
      passages: claim.passages.map(({ place }, passage) => ({ place, outcome: lookup.claims[index]?.[passage] ?? "not_checked" as const }))
    };
  });
  const numbering = new Map<number, number>();
  for (const index of map.studies.keys()) {
    if (several[index]) continue;
    const root = groups.root(index);
    if (!numbering.has(root)) numbering.set(root, numbering.size + 1);
  }
  return {
    check: {
      looked_up: looked,
      groups: numbering.size,
      studies: map.studies.map((study, index) => ({
        place: study.place,
        id: study.id,
        tied: requests[index]!.tied,
        ...(lookup.studies[index]?.text === undefined ? {} : { text: lookup.studies[index]!.text! }),
        ...(several[index] ? { several_groups: true } : { group: numbering.get(groups.root(index))! }),
        ...(registry[index]!.length === 0 ? {} : { registry: registry[index]! })
      })),
      links: map.links.map(({ place }, index) => ({ place, outcome: lookup.links[index] ?? "not_checked" })),
      claims
    },
    notes
  };
}

/**
 * The map's exact shape, as one entry studyMapSchema takes (a test holds the two together). The timing runs of 10 Nov
 * 2026: the shape came only with a passing check, and 27 calls made after a pass followed it, so a method audit's result
 * gives it, before the first check.
 */
export const STUDY_MAP_EXAMPLE = '{"studies": [{"id": "s1", "source": "10.1000/a", "group": "…"}, {"id": "s2", ' +
  '"source": "10.1000/b", "group": "…"}], "links": [{"from": "s2", "kind": "extension_of", "to": "s1", "passage": ' +
  '"…"}], "claims": [{"quote": "…", "studies": ["s1", "s2"], "groups": 1, "passages": [{"study": "s1", "passage": ' +
  '"…"}, {"study": "s2", "passage": "…"}]}]}';
/** What a method audit's result adds, when it signed a receipt: the map's shape, for the first final check. */
export const STUDY_MAP_AT_AUDIT = "If the answer combines this study with others, give finalize_research's first call " +
  `later_inputs.study_map, exactly in this shape: ${STUDY_MAP_EXAMPLE}, with registry, a study's registration ` +
  "numbers, when known. AskRigor counts groups of people, not papers; its checks are notes.";

/** The result text's description of the map, given with a passing check of an answer on two or more key sources. */
export const STUDY_MAP_GUIDANCE ="This answer rests on 2+ key sources, so later_inputs.study_map can map them: studies " +
  "[{id, source, group, registry}], links [{from, kind (same_cohort, reanalysis_of, extension_of, abstract_of, " +
  "cites_as_evidence), to, passage}] and claims [{quote, studies, groups, passages [{study, passage}]}]. AskRigor " +
  "counts groups of people, not papers; its checks are notes.";
