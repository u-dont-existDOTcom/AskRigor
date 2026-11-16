import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  researchUseNoticeCovered,
  stableJson,
  type ResearchDossierIdentifierScheme,
  type ResearchDossierStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { atlasSourceDigest, checkedAtlasSources, type AtlasReuse } from "../atlas/reuse.js";
import { sourceIdentifierOf } from "../atlas/page-data.js";
import { forumThreadDigest, publishedThreadOf } from "../forum-thread-links.js";
import { discoveryQueryDigest, verifyResearchReceipt } from "../research-receipts.js";
import { FINDING_CERTAINTIES, heldFindingsFromReceipt, holdsYouTubeReference } from "./card.js";
import type { ResearchDossierDisposition } from "./dossier-disposition.js";
import { dossierPrivacyRule } from "./dossier-privacy.js";
import type { DossierPrivacyReader, DossierPrivacyReading, DossierText } from "./dossier-privacy-reading.js";
import { findingsQuestionKey, findingsThreadKey } from "./service.js";

/**
 * AskRigor#477, stage 1 (owner answer 329a, 16 November 2026): a research run's dossier, saved privately for the
 * owner's review under free contributor notice v6, which the owner decided covers exactly these twelve parts: the
 * question, the topic, the forms, the searches, the studies, the results, the conclusions (findings), what was covered,
 * people's reports as cards hold them (counts only here), open trails, the AI's value statement and the server's stamp.
 * Never the answer, the plain answer, the person's words, anything about the person, quotes from papers, or anything
 * from YouTube comments.
 *
 * The AI sends the dossier in finalize_research's later_inputs.research_dossier with a passing final check. The server
 * saves it whole or not at all, only when the AI declares that it saves a reader substantial work. What is exact is
 * checked here, with no model: each study is read by a receipt of this call (or held by a checked Atlas finding used
 * here) before results or conclusions rest on it, each study is one paper the receipts confirm, entered once; each
 * search matches its own receipt; counts, numbers needed to treat or harm, and calculated figures add up; every
 * reference points at an entry; every area of coverage is answered; each conclusion keeps its form; people's reports
 * come only from forum threads read here, and nothing from YouTube comments; every text passes the dossier's privacy
 * screen (dossier-privacy.ts). Whether a paper says what a figure or a conclusion claims is the AI's reading, and the
 * stored dossier says so. Never a blocking step of the final check. The hard limits are starting values to revisit as
 * topics need (the owner's note on 329a). Codex's review of 16 Nov 2026 set the paper, forum, YouTube and privacy rules.
 */

export const RESEARCH_DOSSIER_SCHEMA = "askrigor.research-dossier.v1" as const;

export const RESEARCH_DOSSIER_LIMITS = Object.freeze({
  question: 300, topicName: 200, otherNames: 10, otherName: 80, forms: 12, form: 80, searches: 40, query: 300,
  studies: 40, identifiers: 4, identifier: 300, studyField: 120, design: 200, reason: 200, results: 60, outcome: 200,
  unit: 40, findings: 30, claim: 500, appliesTo: 300, change: 300, restsOn: 20, trails: 10, trail: 200,
  quickAnswer: 400, valueReason: 400, adds: 8, threads: 20,
});

export const DOSSIER_STUDY_KINDS = ["human_trial", "human_observational", "case_report", "animal", "lab", "review"] as const;
export const DOSSIER_FINDING_KINDS = [
  "helps", "harms", "no_difference", "mixed", "not_known", "correction", "overlooked_option", "tested_vs_sold",
] as const;
export const DOSSIER_IMPORTANCE = ["decision_changing", "important", "context"] as const;
export const DOSSIER_COVERAGE_AREAS = [
  "benefits", "harms", "null_results", "conflicts", "mainstream_options", "people_reports",
] as const;

// Control characters, which neither a page nor the database's JSON can keep.
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const text = (max: number) => z.string().trim().min(1).max(max).refine((value) => !CONTROL.test(value));
const localId = z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/u);
const count = z.number().int().nonnegative().max(1_000_000_000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const finite = z.number().finite();
const L = RESEARCH_DOSSIER_LIMITS;

const valueSchema = z.object({
  saves_work: z.enum(["substantial", "some", "none"]),
  quick_answer: text(L.quickAnswer).optional(),
  adds: z.array(localId).max(L.adds).default([]),
  reason: text(L.valueReason).optional(),
}).strict();

const searchSchema = z.object({
  id: localId,
  database: z.enum(["pubmed", "europepmc", "openalex", "ctgov"]),
  query: text(L.query),
  date_range: z.object({ start: isoDate, end: isoDate }).strict().optional(),
}).strict();

const studySchema = z.object({
  id: localId,
  identifiers: z.array(text(L.identifier)).min(1).max(L.identifiers),
  kind: z.enum(DOSSIER_STUDY_KINDS),
  form: text(L.studyField).optional(),
  dose: text(L.studyField).optional(),
  route: text(L.studyField).optional(),
  population: text(L.studyField).optional(),
  comparator: text(L.studyField).optional(),
  design: text(L.design).optional(),
  decision: z.enum(["used", "set_aside"]),
  decision_reason: text(L.reason).optional(),
}).strict();

const countsFigureSchema = z.object({
  kind: z.literal("counts"),
  option_events: count,
  option_total: count.min(1),
  comparator_events: count,
  comparator_total: count.min(1),
  nnt: z.number().int().positive().optional(),
  nnh: z.number().int().positive().optional(),
}).strict();

const valueFigureSchema = z.object({
  kind: z.literal("value"),
  value: finite,
  unit: text(L.unit),
  measure: text(L.studyField).optional(),
}).strict();

const resultSchema = z.object({
  id: localId,
  study: localId,
  outcome: text(L.outcome),
  comparator: text(L.studyField).optional(),
  follow_up: text(L.studyField).optional(),
  direction: z.enum(["benefit", "harm", "no_difference", "mixed", "unclear"]),
  certainty: z.enum(FINDING_CERTAINTIES),
  figure: z.discriminatedUnion("kind", [countsFigureSchema, valueFigureSchema]).optional(),
  provenance: z.enum(["reported", "calculated", "from_table"]).optional(),
  calculation: z.object({
    operation: z.enum(["difference", "ratio", "percent_change"]),
    from: z.tuple([finite, finite]),
  }).strict().optional(),
}).strict();

const findingSchema = z.object({
  id: localId,
  claim: text(L.claim),
  certainty: z.enum(FINDING_CERTAINTIES),
  kind: z.enum(DOSSIER_FINDING_KINDS),
  applies_to: text(L.appliesTo),
  form: text(L.form).optional(),
  rests_on: z.array(localId).min(1).max(L.restsOn),
  what_would_change_it: text(L.change),
  importance: z.enum(DOSSIER_IMPORTANCE),
  // As the findings card's own (owner answer 219b): required once this research read YouTube comments, and a finding
  // that draws on them refuses the whole dossier, which has no holding place for it (Codex's review, finding 3).
  draws_on_youtube_comments: z.boolean().optional(),
  // Codex's final check: once the same check held card findings apart as drawn from YouTube comments, each conclusion
  // says which card finding it is, by its place on the card (1 for the first), or none; one that is a held finding
  // refuses the dossier. An explicit declaration bound to the receipt's signed places, never a comparison of words.
  card_finding: z.union([z.number().int().min(1).max(5), z.literal("none")]).optional(),
}).strict();

const coverageEntrySchema = z.object({
  status: z.enum(["entries", "none_found", "not_researched"]),
  search: localId.optional(),
  reason: text(L.reason).optional(),
}).strict();

// People's reports, only from forum threads AskRigor's reader read in this research: each thread is checked against its
// read's receipt and kept only as a count; the communities stored are those the receipts name (Codex's review, 3).
const communitySchema = z.object({
  threads: z.array(z.string().trim().url().max(2_048)).min(1).max(L.threads),
  people: z.object({ better: count, no_change: count, worse: count, mixed: count }).strict(),
  report_quality: z.object({ detailed: count, measured: count, bare: count }).strict(),
}).strict();

export const researchDossierInputSchema = z.object({
  scope: z.enum(["public", "personal_only"]),
  value: valueSchema,
  question: text(L.question),
  topic: z.object({
    key: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
    name: text(L.topicName),
    other_names: z.array(text(L.otherName)).max(L.otherNames).default([]),
  }).strict(),
  forms: z.array(text(L.form)).max(L.forms).default([]),
  searches: z.array(searchSchema).max(L.searches).default([]),
  studies: z.array(studySchema).min(1).max(L.studies),
  results: z.array(resultSchema).max(L.results).default([]),
  findings: z.array(findingSchema).min(1).max(L.findings),
  coverage: z.object(Object.fromEntries(DOSSIER_COVERAGE_AREAS.map((area) => [area, coverageEntrySchema])) as
    Record<typeof DOSSIER_COVERAGE_AREAS[number], typeof coverageEntrySchema>).strict(),
  community: communitySchema.optional(),
  open_trails: z.array(text(L.trail)).max(L.trails).default([]),
}).strict();

export type ResearchDossierInput = z.output<typeof researchDossierInputSchema>;

/** What the AI is told the dossier holds, in the result that asks for one. */
export const RESEARCH_DOSSIER_SHAPE = "later_inputs.research_dossier: {scope: public or personal_only; value: " +
  "{saves_work: substantial, some or none, compared with one ordinary AI answer; quick_answer, what that answer would " +
  "give; adds, up to 8 finding ids that save the most work; reason}; question, in general terms; topic: {key, name, " +
  "other_names}; forms, each form or formulation covered; searches: [{id, database (pubmed, europepmc, openalex or " +
  "ctgov), query exactly as searched in this research, date_range when it had one}]; studies: [{id, identifiers (DOI, " +
  "PMID, PMCID or NCT), kind (human_trial, human_observational, case_report, animal, lab or review), form, dose, " +
  "route, population, comparator, design, decision (used or set_aside), decision_reason}]; results: [{id, study, " +
  "outcome, comparator, follow_up, direction (benefit, harm, no_difference, mixed or unclear), certainty, figure " +
  "({kind: counts, option_events, option_total, comparator_events, comparator_total, nnt or nnh} or {kind: value, " +
  "value, unit, measure}), provenance (reported, calculated or from_table), calculation ({operation: difference, " +
  "ratio or percent_change, from: [a, b]}, with calculated)}]; findings: [{id, claim, certainty, kind (helps, harms, " +
  "no_difference, mixed, not_known, correction, overlooked_option or tested_vs_sold), applies_to, form, rests_on " +
  "(study, result or search ids, or community), what_would_change_it, importance (decision_changing, important or " +
  "context), draws_on_youtube_comments (required once this research read YouTube comments; true refuses the dossier), " +
  "card_finding (required when this check held card findings apart: the place on the card, 1 for the first, of the card " +
  "finding this conclusion is, or none; a held one refuses the dossier)}]; " +
  "coverage: {benefits, harms, null_results, conflicts, mainstream_options, people_reports: each {status: entries, " +
  "none_found with search, or not_researched with reason}}; community: {threads, the forum threads read here with " +
  "read_forum_thread, by their links; people: {better, no_change, worse, mixed}, report_quality: {detailed, measured, " +
  "bare}}, never from YouTube comments; open_trails}. " +
  "Everything in general terms: never the person, the chat, the answer, quotes from papers or YouTube comments.";

export interface DossierProblem {
  path: string;
  rule: string;
}

/** A receipt this call verified, as the dossier's checks read it. */
export interface DossierReceipt {
  kind: string;
  claims: Readonly<Record<string, string | string[]>>;
}

export type DossierReading =
  | "full_text_audited" | "search_copy_audited" | "full_text_read" | "search_copy_read" | "abstract" | "record_only"
  | "from_atlas" | "found_in_search" | "not_in_receipts";

// Deepest first; the first five and from_atlas back results and conclusions.
const READING_ORDER: readonly DossierReading[] = [
  "full_text_audited", "search_copy_audited", "full_text_read", "search_copy_read", "abstract", "record_only",
];
const BACKING_READINGS: ReadonlySet<DossierReading> = new Set([
  "full_text_audited", "search_copy_audited", "full_text_read", "search_copy_read", "abstract", "from_atlas",
]);

type DossierIdentifier = { scheme: ResearchDossierIdentifierScheme; value: string };

interface CheckedStudy {
  identifiers: DossierIdentifier[];
  read: DossierReading;
}

export interface CheckedDossier {
  input: ResearchDossierInput;
  studies: Map<string, CheckedStudy>;
  searches: Map<string, { recordsFound: number | null }>;
  /** The communities the forum reads' receipts name, as the Atlas would name them; none for a person's profile. */
  communities: string[];
  /** The forum threads read here that people's reports come from, each once. */
  threadsRead: number;
}

const identifierKey = ({ scheme, value }: { scheme: string; value: string }) => `${scheme}:${value}`;
const list = (value: string | string[] | undefined): string[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

function identifiersOf(value: string): { scheme: ResearchDossierIdentifierScheme; value: string } | undefined {
  const identifier = sourceIdentifierOf(value);
  return identifier === undefined ? undefined : { scheme: identifier.scheme as ResearchDossierIdentifierScheme, value: identifier.value };
}

function readingOf(receipt: DossierReceipt): DossierReading | undefined {
  const client = receipt.claims.retrieval_provider === "client_search_index";
  switch (receipt.kind) {
    case "study_audit":
    case "review_audit":
      return client ? "search_copy_audited" : "full_text_audited";
    case "full_text_read":
      return client ? "search_copy_read" : "full_text_read";
    case "pubmed_record":
      return receipt.claims.abs === "1" ? "abstract" : "record_only";
    default:
      return undefined;
  }
}

function decimalsOf(value: number): number {
  const [, fraction = ""] = String(value).split(".");
  return /e/iu.test(String(value)) ? 6 : fraction.length;
}

/** The exact checks; problems name a path and a rule, never a value. */
export function checkResearchDossier(
  input: ResearchDossierInput,
  context: {
    receipts: readonly DossierReceipt[];
    atlasSources: ReadonlySet<string>;
    /** Whether this research read YouTube comments, as the final check itself decides it (owner answer 219b). */
    commentsRead: boolean;
    /** The places on the card (1 for the first) the same check signed as held apart for YouTube comments (219b). */
    heldCardPlaces?: ReadonlySet<number>;
    /** How many findings the call's card has, when one came with it. */
    cardFindings?: number;
  },
): { problems: DossierProblem[]; checked?: CheckedDossier; final: boolean } {
  const problems: DossierProblem[] = [];
  const problem = (path: string, rule: string) => problems.push({ path, rule });
  // A problem of the privacy screen or of YouTube material: final for the research (RESEARCH_DOSSIER_GUARDS).
  let final = false;
  const refuse = (path: string, rule: string) => {
    final = true;
    problem(path, rule);
  };

  // Identities: one id per entry, across every list.
  const ids = new Map<string, "search" | "study" | "result" | "finding">();
  const claimId = (id: string, kind: "search" | "study" | "result" | "finding", path: string) => {
    if (id === "community") problem(path, "reserved_id");
    else if (ids.has(id)) problem(path, "duplicate_id");
    else ids.set(id, kind);
  };
  input.searches.forEach(({ id }, index) => claimId(id, "search", `searches[${index}].id`));
  input.studies.forEach(({ id }, index) => claimId(id, "study", `studies[${index}].id`));
  input.results.forEach(({ id }, index) => claimId(id, "result", `results[${index}].id`));
  input.findings.forEach(({ id }, index) => claimId(id, "finding", `findings[${index}].id`));

  // Searches: each one this call's literature-search receipt signed, by its database, query and date range.
  const searchReceipts = context.receipts.filter(({ kind }) => kind === "literature_search");
  const searches = new Map<string, { recordsFound: number | null }>();
  input.searches.forEach((search, index) => {
    const digest = discoveryQueryDigest([search.query]);
    const range = search.date_range === undefined ? undefined : `${search.date_range.start}/${search.date_range.end}`;
    const receipt = searchReceipts.find(({ claims }) => claims.src === search.database && claims.q === digest &&
      claims.dr === range);
    if (receipt === undefined) {
      problem(`searches[${index}]`, "search_not_in_receipts");
      return;
    }
    const total = Number(receipt.claims.n ?? receipt.claims.ret);
    searches.set(search.id, { recordsFound: Number.isSafeInteger(total) && total >= 0 ? total : null });
  });

  // Studies (Codex's review, finding 6, and its second pass): a study is a paper the receipts confirm. A reading
  // receipt names one paper by each identifier it signs, so identifiers that receipts link, directly or through one
  // another (a PMID and a DOI on one, the DOI and a PMCID on another), are one paper, read as deeply as its deepest
  // receipt. Every identifier a study gives must belong to one such paper; one no receipt links to it is another paper.
  // A study no receipt read gives one identifier. No paper is entered twice, under any of its identifiers.
  const papersRead = new Map<string, { identifiers: Map<string, DossierIdentifier>; readings: DossierReading[] }>();
  const paperOf = new Map<string, string>();
  const rootOf = (key: string): string => {
    let root = key;
    while (paperOf.get(root) !== root) root = paperOf.get(root)!;
    return root;
  };
  for (const receipt of context.receipts) {
    const reading = readingOf(receipt);
    if (reading === undefined) continue;
    const named = ["id", "doi", "pmid", "pmcid"].flatMap((key) => list(receipt.claims[key]))
      .flatMap((value) => identifiersOf(value) ?? []);
    if (named.length === 0) continue;
    for (const identifier of named) {
      const key = identifierKey(identifier);
      if (!paperOf.has(key)) {
        paperOf.set(key, key);
        papersRead.set(key, { identifiers: new Map([[key, identifier]]), readings: [] });
      }
    }
    const root = rootOf(identifierKey(named[0]!));
    for (const identifier of named.slice(1)) {
      const other = rootOf(identifierKey(identifier));
      if (other === root) continue;
      const joined = papersRead.get(other)!;
      const into = papersRead.get(root)!;
      for (const [key, alias] of joined.identifiers) into.identifiers.set(key, alias);
      into.readings.push(...joined.readings);
      papersRead.delete(other);
      paperOf.set(other, root);
    }
    papersRead.get(root)!.readings.push(reading);
  }
  const found = new Set(searchReceipts.flatMap(({ claims }) => list(claims.ids))
    .flatMap((value) => { const identifier = identifiersOf(value); return identifier === undefined ? [] : [identifierKey(identifier)]; }));
  const forms = new Set(input.forms.map((form) => form.toLowerCase()));
  const studies = new Map<string, CheckedStudy>();
  const papers = new Map<string, number>();
  input.studies.forEach((study, index) => {
    const own = study.identifiers.map((value, at) => {
      const identifier = identifiersOf(value);
      if (identifier === undefined) problem(`studies[${index}].identifiers[${at}]`, "identifier_not_recognized");
      else {
        // An identifier is stored as given when no receipt names it, so its words pass the privacy screen too; its
        // digits and separators are no words (a DOI's runs of digits would read as a phone number).
        const rule = dossierPrivacyRule(identifier.value.replace(/[0-9]+/gu, " ").replace(/[-_/()]+/gu, " "));
        if (rule !== undefined) refuse(`studies[${index}].identifiers[${at}]`, rule);
      }
      return identifier;
    }).flatMap((identifier) => identifier ?? []);
    if (study.decision === "set_aside" && study.decision_reason === undefined) {
      problem(`studies[${index}].decision_reason`, "set_aside_reason_missing");
    }
    if (study.form !== undefined && forms.size > 0 && !forms.has(study.form.toLowerCase())) {
      problem(`studies[${index}].form`, "form_not_listed");
    }
    const keys = [...new Set(own.map(identifierKey))];
    const paperRoots = new Set(keys.map((key) => paperOf.has(key) ? rootOf(key) : undefined));
    const paper = keys.length > 0 && paperRoots.size === 1 && !paperRoots.has(undefined)
      ? papersRead.get([...paperRoots][0]!) : undefined;
    const all = new Map(own.map((identifier) => [identifierKey(identifier), identifier]));
    let read: DossierReading;
    if (paper !== undefined) {
      for (const [key, identifier] of paper.identifiers) all.set(key, identifier);
      read = [...paper.readings].sort((left, right) => READING_ORDER.indexOf(left) - READING_ORDER.indexOf(right))[0]!;
    } else {
      if (keys.length > 1 || [...paperRoots].some((root) => root !== undefined)) {
        problem(`studies[${index}].identifiers`, "identifiers_not_one_paper");
      }
      read = own.some((identifier) => context.atlasSources.has(atlasSourceDigest(identifier))) ? "from_atlas"
        : own.some((identifier) => found.has(identifierKey(identifier))) ? "found_in_search" : "not_in_receipts";
    }
    const duplicate = [...all.keys()].map((key) => papers.get(key)).find((other) => other !== undefined);
    if (duplicate !== undefined) problem(`studies[${index}]`, "duplicate_paper");
    for (const key of all.keys()) if (!papers.has(key)) papers.set(key, index);
    studies.set(study.id, { identifiers: [...all.values()], read });
  });
  const backed = (studyId: string) => {
    const study = studies.get(studyId);
    return study !== undefined && BACKING_READINGS.has(study.read);
  };
  const studyForm = (studyId: string) => input.studies.find(({ id }) => id === studyId)?.form?.toLowerCase();

  // Results: a study read here, and figures that add up.
  input.results.forEach((result, index) => {
    const at = `results[${index}]`;
    if (ids.get(result.study) !== "study") problem(`${at}.study`, "unknown_reference");
    else if (!backed(result.study)) problem(`${at}.study`, "result_study_not_read");
    const figure = result.figure;
    if (figure !== undefined && result.provenance === undefined) problem(`${at}.provenance`, "provenance_missing");
    if (result.provenance === "calculated") {
      if (result.calculation === undefined || figure?.kind !== "value") problem(`${at}.calculation`, "calculation_missing");
      else {
        const [a, b] = result.calculation.from;
        const computed = result.calculation.operation === "difference" ? a - b
          : b === 0 ? Number.NaN
          : result.calculation.operation === "ratio" ? a / b : (a - b) / b * 100;
        const tolerance = 0.5 * 10 ** -decimalsOf(figure.value) + 1e-9;
        if (!Number.isFinite(computed) || Math.abs(computed - figure.value) > tolerance) {
          problem(`${at}.calculation`, "calculation_mismatch");
        }
      }
    } else if (result.calculation !== undefined) problem(`${at}.calculation`, "calculation_unexpected");
    if (figure?.kind === "counts") {
      if (figure.option_events > figure.option_total) problem(`${at}.figure.option_events`, "counts_exceed_total");
      if (figure.comparator_events > figure.comparator_total) problem(`${at}.figure.comparator_events`, "counts_exceed_total");
      if (figure.nnt !== undefined && figure.nnh !== undefined) problem(`${at}.figure`, "nnt_and_nnh");
      const difference = figure.option_events / figure.option_total - figure.comparator_events / figure.comparator_total;
      for (const field of ["nnt", "nnh"] as const) {
        const given = figure[field];
        if (given === undefined) continue;
        if (difference === 0) problem(`${at}.figure.${field}`, "no_difference_no_nnt");
        else if (given !== Math.ceil(1 / Math.abs(difference) - 1e-9)) problem(`${at}.figure.${field}`, `${field}_mismatch`);
      }
    }
  });

  // People's reports: every thread one AskRigor's reader read here; the communities are the receipts' own.
  const forumReads = context.receipts.filter(({ kind }) => kind === "forum_thread_read");
  const communities = new Set<string>();
  const threadsRead = new Set<string>();
  input.community?.threads.forEach((thread, index) => {
    if (holdsYouTubeReference(thread) || /youtu\.?be/iu.test(thread)) {
      refuse(`community.threads[${index}]`, "youtube_reference");
      return;
    }
    const digest = forumThreadDigest(thread);
    const read = forumReads.find(({ claims }) => claims.u === digest || claims.ur === digest);
    if (read === undefined || typeof read.claims.u !== "string") {
      problem(`community.threads[${index}]`, "community_thread_not_read");
      return;
    }
    threadsRead.add(read.claims.u);
    // Named as the Atlas names a thread read here: r/<subreddit> from the reader's signed subreddit, a forum's
    // registrable host, or "another website"; nothing for a post on a person's profile.
    const named = publishedThreadOf(thread, typeof read.claims.c === "string" ? read.claims.c : undefined)?.community;
    if (named !== undefined) communities.add(named);
  });
  // Once this research read YouTube comments, or its check held card findings apart as drawn from them, each conclusion
  // says whether it draws on them, and one that does refuses the dossier (Codex's second pass: bound to the dossier's
  // own conclusions, never every dossier of such a check). After a hold, each also says which card finding it is, or
  // none, and one that is a held finding is refused (Codex's final check: declared and bound, never matched by words).
  const heldPlaces = context.heldCardPlaces ?? new Set<number>();
  const declarationsDue = context.commentsRead || heldPlaces.size > 0;

  // Conclusions: what each rests on exists and was read; a positive or negative finding rests on a paper read here or on
  // people's reports, a search alone backing only what is not known; its form is listed and is its studies' form.
  input.findings.forEach((finding, index) => {
    const at = `findings[${index}]`;
    if (finding.form !== undefined && forms.size > 0 && !forms.has(finding.form.toLowerCase())) {
      problem(`${at}.form`, "form_not_listed");
    }
    let backing = false;
    finding.rests_on.forEach((reference, place) => {
      const path = `${at}.rests_on[${place}]`;
      if (reference === "community") {
        if (input.community === undefined) problem(path, "unknown_reference");
        else backing = true;
        return;
      }
      const kind = ids.get(reference);
      if (kind === undefined || kind === "finding") {
        problem(path, "unknown_reference");
        return;
      }
      if (kind === "search") {
        if (finding.kind === "not_known" && searches.has(reference)) backing = true;
        return;
      }
      const studyId = kind === "study" ? reference : input.results.find(({ id }) => id === reference)?.study;
      if (studyId === undefined) return;
      if (!backed(studyId)) {
        // A result's own study is checked with the result.
        if (kind === "study") problem(path, "finding_rests_on_unread_study");
      } else backing = true;
      const form = studyForm(studyId);
      if (finding.form !== undefined && form !== undefined && form !== finding.form.toLowerCase()) {
        problem(path, "form_mismatch");
      }
    });
    if (!backing) problem(at, "finding_without_backing");
    if (declarationsDue && finding.draws_on_youtube_comments === undefined) {
      problem(`${at}.draws_on_youtube_comments`, "youtube_origin_undeclared");
    } else if (finding.draws_on_youtube_comments === true) {
      refuse(`${at}.draws_on_youtube_comments`, "youtube_comment_material");
    }
    if (heldPlaces.size > 0) {
      const place = finding.card_finding;
      if (place === undefined) problem(`${at}.card_finding`, "card_finding_undeclared");
      else if (place !== "none" && heldPlaces.has(place)) refuse(`${at}.card_finding`, "held_card_finding");
      else if (place !== "none" && context.cardFindings !== undefined && place > context.cardFindings) {
        problem(`${at}.card_finding`, "unknown_reference");
      }
    }
  });

  // What was covered: entries, none found with the search that looked, or not researched with why.
  for (const area of DOSSIER_COVERAGE_AREAS) {
    const entry = input.coverage[area];
    const at = `coverage.${area}`;
    if (entry.status === "none_found" && (entry.search === undefined || ids.get(entry.search) !== "search")) {
      problem(`${at}.search`, "coverage_search_missing");
    }
    if (entry.status === "not_researched" && entry.reason === undefined) problem(`${at}.reason`, "coverage_reason_missing");
    if (area === "people_reports" && entry.status === "entries" && input.community === undefined) {
      problem(at, "coverage_community_missing");
    }
  }
  input.value.adds.forEach((id, index) => {
    if (ids.get(id) !== "finding") problem(`value.adds[${index}]`, "unknown_reference");
  });

  // Every supplied text, the topic key and the ids included, through the dossier's privacy screen; identifiers are
  // papers the receipts named, and thread links are checked against their reads and never stored.
  for (const [path, value] of dossierTexts(input)) {
    const rule = dossierPrivacyRule(value);
    if (rule !== undefined) refuse(path, rule);
  }
  return problems.length > 0 ? { problems, final }
    : { problems, final, checked: { input, studies, searches, communities: [...communities].sort(), threadsRead: threadsRead.size } };
}

// Every string a dossier holds is screened but its fixed values; a key or an id is read as words.
const NOT_TEXT_KEYS: ReadonlySet<string> = new Set([
  "identifiers", "threads", "scope", "saves_work", "database", "kind", "decision", "direction", "certainty",
  "provenance", "operation", "status", "importance", "start", "end",
]);
const SLUG_KEYS: ReadonlySet<string> = new Set(["id", "study", "rests_on", "adds", "search", "key"]);

function dossierTexts(value: unknown, path = "", slug = false, idsToo = true): Array<[string, string]> {
  if (typeof value === "string") return [[path, slug ? value.replace(/[-_.]+/gu, " ") : value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => dossierTexts(item, `${path}[${index}]`, slug, idsToo));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    NOT_TEXT_KEYS.has(key) || (!idsToo && SLUG_KEYS.has(key) && key !== "key") ? []
      : dossierTexts(item, path === "" ? key : `${path}.${key}`, SLUG_KEYS.has(key), idsToo));
}

/** The dossier's text fields as the privacy reading reads them: the screen's, its ids and references left out. */
export function dossierReadingTexts(input: ResearchDossierInput): DossierText[] {
  return dossierTexts(input, "", false, false).map(([path, text]) => ({ path, text }));
}

/** The dossier as stored: the checked input, what the server read of each study and search, and its stamp. */
export function storedResearchDossier(checked: CheckedDossier, stamp: Record<string, unknown>): Record<string, unknown> {
  const { input } = checked;
  return {
    schema: RESEARCH_DOSSIER_SCHEMA,
    question: input.question,
    topic: input.topic,
    forms: input.forms,
    searches: input.searches.map((search) => ({
      ...search,
      records_found: checked.searches.get(search.id)?.recordsFound ?? null,
    })),
    studies: input.studies.map((study) => {
      const read = checked.studies.get(study.id)!;
      const { identifiers: _given, ...rest } = study;
      return { ...rest, identifiers: read.identifiers, read: read.read };
    }),
    results: input.results,
    // A conclusion's YouTube-comments and card declarations decided only whether the dossier could be saved, so, as the
    // card's (card.ts, StoredFinding), they are not stored.
    findings: input.findings.map(({ draws_on_youtube_comments: _declared, card_finding: _place, ...finding }) => finding),
    coverage: input.coverage,
    // People's reports as counts, from the threads read here, by the communities their reads' receipts name: never a
    // thread's link, title or words.
    ...(input.community === undefined ? {} : {
      community: {
        communities: checked.communities,
        threads_read: checked.threadsRead,
        people: input.community.people,
        report_quality: input.community.report_quality,
      },
    }),
    open_trails: input.open_trails,
    value: { ...input.value, judged_by: "researching_ai" },
    stamp,
  };
}

export function researchDossierDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

/** One dossier per account, research target and question: an HMAC under the receipt secret, as the card's thread. */
export function researchDossierKey(secret: string, accountKey: string, targetDigest: string, question: string): string {
  return createHmac("sha256", secret)
    .update("askrigor:research-dossier:v1\0", "utf8")
    .update(accountKey, "utf8")
    .update("\0", "utf8")
    .update(targetDigest, "utf8")
    .update("\0", "utf8")
    .update(findingsQuestionKey(question), "utf8")
    .digest("hex");
}

/** A retry of the same save: the same dossier, for the same checked answer, of the same research. */
export function researchDossierRequestKey(dossierKey: string, answerDigest: string, inputSha256: string): string {
  return createHash("sha256")
    .update(`askrigor:research-dossier-request:v1\0${dossierKey}\0${answerDigest}\0${inputSha256}`, "utf8")
    .digest("hex");
}

/** The dossier a call sent, from later_inputs or the top level, read from the raw call as findings_save is. */
export function researchDossierFromCall(raw: unknown): { given: false } | { given: true; value: unknown } {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  if (!object(raw)) return { given: false };
  const later = raw.later_inputs;
  if (object(later) && Object.hasOwn(later, "research_dossier") && later.research_dossier !== undefined) {
    return { given: true, value: later.research_dossier };
  }
  return Object.hasOwn(raw, "research_dossier") && raw.research_dossier !== undefined
    ? { given: true, value: raw.research_dossier } : { given: false };
}

export interface ResearchDossierAccount {
  mode: "FREE_CONTRIBUTOR" | "PAID_PRIVATE";
  accountKey: string;
  findingsSave: boolean;
  noticeVersion: string | null;
}

/**
 * Whether a research dossier can be asked for and saved for this account and call (Codex's red team of the instruction
 * proposal, item 3: one rule for every ask): the dossiers' store is on, and the account is a free contributor whose yes
 * covers notice v6, with card saving on, in a call not marked findings_save off. A short look-up is the caller's to add.
 */
export function researchDossierAllowed(
  enabled: boolean,
  account: Pick<ResearchDossierAccount, "mode" | "findingsSave" | "noticeVersion"> | undefined,
  callSavingOff = false,
): boolean {
  return enabled && account !== undefined && account.mode === "FREE_CONTRIBUTOR" &&
    researchUseNoticeCovered(account.noticeVersion) && account.findingsSave && !callSavingOff;
}

export interface ResearchDossierSaveRequest {
  dossier: { given: false } | { given: true; value: unknown };
  account: ResearchDossierAccount | undefined;
  /** later_inputs.findings_save "off": a test run's call. */
  callSavingOff: boolean;
  /** The passing check's finalization receipt; undefined when the check did not pass. */
  finalizationReceipt: string | undefined;
  /** finalize_research's short look-up exemption (research-finalization-gate.ts). */
  shortLookup: boolean;
  /** How many sources this check validated. */
  validatedSources: number;
  receipts: readonly string[];
  /** The call's atlas_reuse declarations: a study held by a checked Atlas finding used here reads "from_atlas". */
  atlasReuse: readonly AtlasReuse[];
  /** The findings card saved in the same call, as ARF-####. */
  cardId: string | undefined;
  /** Whether this research read YouTube comments, as the final check decided it (its onCommentsRead). */
  commentsRead: boolean;
  /** How many findings the call's card has, when one came: the finalization receipt's held places refer to them. */
  cardFindings?: number;
  /**
   * AskRigor#477 stage 1, off by default: the meaning-based privacy reading (ASKRIGOR_DOSSIER_PRIVACY_READING=on),
   * made after the dossier's own checks pass and before anything is written; only a pass lets it be saved.
   */
  privacyReading?: DossierPrivacyReader;
  secret: string | undefined;
  versions: { askrigor: string; build: string; hrp?: string; universal?: string };
  now?: () => Date;
  newVersionId?: () => string;
}

export interface ResearchDossierSaveOutcome {
  /** Undefined when no dossier came and there is only a note: a check not ready yet, reminded of one. */
  disposition?: ResearchDossierDisposition;
  /** What the AI is told about it, among the result's notes. */
  note?: string;
}

/**
 * The instruction for the AI (Codex's red team of the instruction proposal, 16 Nov 2026, item 1), given with a research
 * plan that goes on, for an account a dossier can be saved for: when to send one, and what keeps it truthful.
 */
export const RESEARCH_DOSSIER_REQUEST = "For the AI: before the first final check, judge whether the completed research " +
  "would save a later reader substantial searching, checking or comparison beyond a good ordinary one-turn answer. If " +
  "yes, include its research dossier in later_inputs.research_dossier with that call, whether or not a findings card " +
  "qualifies; AskRigor saves it only if the check passes. Carry it forward with later checks already needed until one " +
  "passes. Include only work actually done. Do not add research or filler to fill the dossier, invent value, or lower " +
  "the comparison standard. It is saved privately for AskRigor's owner to review, never published by this save. Do not " +
  "ask the person for permission to save it. If this research is personal to the conversation, send no dossier. This " +
  "does not change any separate question AskRigor asks the person or delay urgent help.";

/** What follows the shape wherever the shape is given (the same red team, item 1). */
export const RESEARCH_DOSSIER_GUARDS = "Include all approved parts supplied by the AI; let AskRigor add its stamp. " +
  "Preserve material benefits, harms, measured null results, conflicts and limits; describe missing work honestly. " +
  "Include no person's details, even reworded in the third person. Describe the ordinary-answer baseline afresh; never " +
  "copy the registered plain answer or the person's answer. Include nothing drawn from YouTube comments, and no video " +
  "IDs or links. Declare origin truthfully. After a privacy or YouTube refusal, leave the dossier unsaved; do not " +
  "rewrite it to get past the screen.";

/** The reminder at a check that is not ready, and after a passing one without a dossier (the same red team, item 2). */
export const RESEARCH_DOSSIER_REMINDER = "At the next final check already needed for this research, include " +
  "later_inputs.research_dossier only if the completed research saves a later reader substantial work beyond a good " +
  "ordinary one-turn answer and saving remains allowed. A card need not qualify. A missing or rejected dossier does not " +
  `change the check's result. Do not make another check solely to add or repair it. ${RESEARCH_DOSSIER_SHAPE} ` +
  RESEARCH_DOSSIER_GUARDS;


const PROBLEMS_SHOWN = 50;

/**
 * The save, end to end: the account and the call first, then the dossier's own checks, then the store's append under
 * its account check, then the readback of exactly the version written. Undefined when there is nothing to say: no
 * dossier came, and none was due.
 */
export async function saveResearchDossier(
  store: ResearchDossierStore,
  request: ResearchDossierSaveRequest,
): Promise<ResearchDossierSaveOutcome | undefined> {
  const given = request.dossier.given;
  const quiet = (disposition: ResearchDossierDisposition) => given ? { disposition } : undefined;
  // Every ask and every save goes by the same account and call (Codex's red team, item 3): a free contributor whose yes
  // covers notice v6, with card saving on, in a call not marked findings_save off, after research that was not a short
  // look-up and validated a source.
  const account = request.account;
  const allowed = researchDossierAllowed(true, account, request.callSavingOff);
  const researched = !request.shortLookup && request.validatedSources > 0;
  if (request.finalizationReceipt === undefined) {
    // Not ready: a dossier waits for the check that passes, and the run is reminded of one, whether or not one came.
    const reminder = allowed && researched ? { note: `Research dossier: ${RESEARCH_DOSSIER_REMINDER}` } : undefined;
    return given ? { disposition: { status: "insufficient", reason: "final_check_not_passed" }, ...reminder } : reminder;
  }
  if (request.secret === undefined) return quiet({ status: "unavailable", reason: "receipts_unavailable" });
  const now = request.now ?? (() => new Date());
  const receipt = verifyResearchReceipt(request.finalizationReceipt, { secret: request.secret, now });
  if (!receipt.ok || receipt.kind !== "finalization") {
    return quiet({ status: "insufficient", reason: "final_check_not_passed" });
  }
  if (request.callSavingOff || receipt.claims.fs === "off") return quiet({ status: "consent_blocked", reason: "call_saving_off" });
  if (account === undefined) return quiet({ status: "private", reason: "no_research_account" });
  if (account.mode !== "FREE_CONTRIBUTOR") return quiet({ status: "consent_blocked", reason: "paid_private" });
  if (!researchUseNoticeCovered(account.noticeVersion)) return quiet({ status: "consent_blocked", reason: "notice_not_current" });
  if (!account.findingsSave) return quiet({ status: "consent_blocked", reason: "saving_off" });
  if (!request.dossier.given) {
    return researched
      ? {
          disposition: { status: "not_sent" },
          note: "Research dossier: No research dossier was sent, so none was saved. This does not establish whether " +
            `the research would save a later reader substantial work. ${RESEARCH_DOSSIER_REMINDER}`,
        }
      : undefined;
  }

  const insufficient = (problems: DossierProblem[], reason = "checks_failed", final = false): ResearchDossierSaveOutcome => ({
    disposition: { status: "insufficient", reason, problems: problems.slice(0, PROBLEMS_SHOWN) },
    note: reason === "value_not_substantial"
      ? "Research dossier not saved: its value statement does not say it saves a reader substantial work."
      : "Research dossier not saved, nothing of it was stored: " +
        problems.slice(0, PROBLEMS_SHOWN).map(({ path, rule }) => `${path} (${rule})`).join("; ") +
        (final
          ? ". A privacy or YouTube refusal is final for this research: leave the dossier unsaved, and do not rewrite " +
            "it to get past the screen."
          : ". Correct them and send it again only with a final check already needed for this research; do not make " +
            "another check solely to repair it."),
  });
  const declared = z.object({ scope: z.enum(["public", "personal_only"]), value: valueSchema }).safeParse(request.dossier.value);
  if (declared.success && declared.data.scope === "personal_only") return { disposition: { status: "private", reason: "personal_only" } };
  if (declared.success && declared.data.value.saves_work !== "substantial") {
    return insufficient([{ path: "value.saves_work", rule: "value_not_substantial" }], "value_not_substantial");
  }
  const parsed = researchDossierInputSchema.safeParse(request.dossier.value);
  if (!parsed.success) {
    return insufficient(parsed.error.issues.map((issue) => ({
      path: issue.path.map((part, index) => typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${String(part)}`)
        .join("") || "research_dossier",
      rule: "shape",
    })));
  }
  const target = receipt.claims.target;
  const answer = receipt.claims.answer;
  if (typeof target !== "string" || target === "" || typeof answer !== "string" || answer === "") {
    return { disposition: { status: "insufficient", reason: "final_check_not_passed" } };
  }
  const receipts = request.receipts.flatMap((token) => {
    const verified = verifyResearchReceipt(token, { secret: request.secret!, now });
    return verified.ok ? [{ kind: verified.kind, claims: verified.claims }] : [];
  });
  const atlasSources = checkedAtlasSources(receipts, target, request.atlasReuse);
  // The held places the receipt signs, 1 for the first, within the call's card (or a card's most, five, without one).
  const heldCardPlaces = new Set([...heldFindingsFromReceipt(receipt.claims.held, request.cardFindings ?? 5)]
    .map((index) => index + 1));
  const { problems, checked, final } = checkResearchDossier(parsed.data, {
    receipts, atlasSources, commentsRead: request.commentsRead, heldCardPlaces,
    ...(request.cardFindings === undefined ? {} : { cardFindings: request.cardFindings }),
  });
  if (checked === undefined) return insufficient(problems, "checks_failed", final);

  const cardNumber = request.cardId === undefined ? null : Number(/^ARF-0*([1-9][0-9]*)$/u.exec(request.cardId)?.[1]);
  const savedAt = now();
  const payload = storedResearchDossier(checked, {
    saved_at: savedAt.toISOString(),
    askrigor_version: request.versions.askrigor,
    askrigor_build: request.versions.build,
    ...(request.versions.hrp === undefined ? {} : { hrp: request.versions.hrp }),
    ...(request.versions.universal === undefined ? {} : { universal: request.versions.universal }),
    finalized_at: receipt.issued_at,
    receipts_checked: receipts.length,
    checks: ["receipts", "papers", "searches", "arithmetic", "references", "coverage", "forms", "forum_reads",
      "youtube_comments", "privacy_screen"],
    not_checked: ["papers_support_claims", "figures_match_papers", "value_judgement"],
    ...(cardNumber === null || !Number.isSafeInteger(cardNumber) ? {} : { card_number: cardNumber }),
    ...(receipt.claims.ar === "caller" ? { ai_readings: "caller" } : {}),
  });
  const payloadSha256 = researchDossierDigest(payload);
  const inputSha256 = researchDossierDigest(checked.input);
  const dossierKey = researchDossierKey(request.secret, account.accountKey, target, checked.input.question);
  const identifiers = [...new Map([...checked.studies.values()].flatMap(({ identifiers: own }) => own)
    .map((identifier) => [identifierKey(identifier), identifier])).values()];
  // With the privacy reading on, nothing is saved unread: a refusal is final for the research, as the screen's is, and a
  // reading that could not be made keeps the dossier unsaved with its reason (Codex's final check).
  if (request.privacyReading !== undefined) {
    let reading: DossierPrivacyReading;
    try {
      reading = await request.privacyReading(dossierReadingTexts(checked.input));
    } catch {
      reading = { status: "unavailable", reason: "error" };
    }
    if (reading.status === "refuse") {
      return {
        disposition: { status: "insufficient", reason: "privacy_reading",
          problems: [{ path: reading.path ?? "research_dossier", rule: `privacy_reading_${reading.reason}` }] },
        note: `Research dossier not saved, nothing of it was stored: AskRigor's privacy reading found ${
          reading.reason.replaceAll("_", " ")}${reading.path === undefined ? "" : ` in ${reading.path}`}. A privacy refusal ` +
          "is final for this research: leave the dossier unsaved, and do not rewrite it to get past the reading.",
      };
    }
    if (reading.status === "unavailable") {
      return {
        disposition: { status: "unavailable", reason: `privacy_reading_${reading.reason}` },
        note: "Research dossier not saved, nothing of it was stored: AskRigor reads every dossier for personal details " +
          `before it is stored, and that reading could not be made (${reading.reason.replaceAll("_", " ")}). Do not ` +
          "make another check solely for it.",
      };
    }
  }

  // Nothing is written before the append: a store that fails here leaves nothing behind. From the append on, a failure
  // may come after the write landed, so the save is unconfirmed, never unavailable (Codex's review, finding 10).
  let latest: Awaited<ReturnType<ResearchDossierStore["latestVersion"]>>;
  try {
    latest = await store.latestVersion(account.accountKey, dossierKey);
  } catch {
    return { disposition: { status: "unavailable", reason: "store_unavailable" } };
  }
  const unconfirmed = (reason: string): ResearchDossierSaveOutcome => ({
    disposition: { status: "unconfirmed", reason },
    note: "Research dossier: its save was not confirmed, so it may or may not have been saved. If a final check is " +
      "already needed for this research, send the same dossier with it: if this one was saved, its version is " +
      "returned. Do not make another check solely for it.",
  });
  let appended: Awaited<ReturnType<ResearchDossierStore["append"]>>;
  try {
    appended = await store.append({
      accountKey: account.accountKey,
      dossierKey,
      threadKey: findingsThreadKey(request.secret, account.accountKey, target),
      requestKey: researchDossierRequestKey(dossierKey, answer, inputSha256),
      inputSha256,
      payload,
      payloadSha256,
      cardNumber: cardNumber === null || !Number.isSafeInteger(cardNumber) ? null : cardNumber,
      identifiers,
      expectedPreviousVersionId: latest?.versionId ?? null,
      versionId: (request.newVersionId ?? randomUUID)(),
      at: savedAt,
    });
  } catch {
    return unconfirmed("write_not_confirmed");
  }
  if (appended.outcome === "account_refused") return { disposition: { status: "consent_blocked", reason: "account_not_eligible" } };
  // Exactly the version written (or replayed), read back and digested again.
  let read: Awaited<ReturnType<ResearchDossierStore["readVersion"]>>;
  try {
    read = await store.readVersion(account.accountKey, appended.versionId);
  } catch {
    return unconfirmed("readback_failed");
  }
  if (read === null || read.payload === null || read.payloadSha256 !== appended.payloadSha256 ||
    researchDossierDigest(read.payload) !== appended.payloadSha256 || read.dossierNumber !== appended.dossierNumber ||
    read.versionNumber !== appended.versionNumber) {
    return unconfirmed("readback_mismatch");
  }
  return {
    disposition: {
      status: appended.outcome === "inserted" ? "saved" : "duplicate",
      dossier_id: appended.dossierNumber,
      version: appended.versionNumber,
      visibility: "private_review",
      digest: appended.payloadSha256.slice(0, 16),
      ...(appended.writtenAlongside ? { written_alongside: true } : {}),
    },
  };
}

/**
 * The line the answer ends with, before the check line: one for every outcome of a dossier that was sent, and for a
 * dossier that was due and not sent (the design's 3.3; Codex's review, finding 10).
 */
export function researchDossierLine(disposition: ResearchDossierDisposition): string {
  switch (disposition.status) {
    case "saved":
      return `Research dossier ${disposition.dossier_id} was saved privately for AskRigor's owner to review ` +
        `(version ${disposition.version}); it is not public.`;
    case "duplicate":
      return `Research dossier ${disposition.dossier_id} was already saved privately for AskRigor's owner to review ` +
        `(version ${disposition.version}).`;
    case "insufficient":
      return disposition.reason === "final_check_not_passed"
        ? "No research dossier was saved: one is saved only with a final check that passed."
        : disposition.reason === "value_not_substantial"
          ? "No research dossier was saved: this research was judged not to save a reader substantial work."
          : "No research dossier was saved: it did not pass AskRigor's checks.";
    case "private":
      return disposition.reason === "personal_only"
        ? "No research dossier was saved: this research was declared personal to this conversation."
        : "No research dossier was saved: one is saved only for an account that contributes research to AskRigor.";
    case "consent_blocked":
      switch (disposition.reason) {
        case "paid_private":
          return "No research dossier was saved: this is a private paid account.";
        case "saving_off":
          return "No research dossier was saved: saving research is switched off for this account.";
        case "call_saving_off":
          return "No research dossier was saved: this check was marked not to save research.";
        case "notice_not_current":
          return "No research dossier was saved: this account's agreement with AskRigor does not cover it yet.";
        default:
          return "No research dossier was saved: this account no longer allows research to be saved.";
      }
    case "not_sent":
      return "No research dossier was saved: none was sent.";
    case "unconfirmed":
      return "The research dossier's save was not confirmed, so it may or may not have been saved.";
    case "unavailable":
      return "No research dossier was saved: AskRigor could not save it just now.";
  }
}
