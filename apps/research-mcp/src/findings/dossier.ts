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
import { discoveryQueryDigest, verifyResearchReceipt } from "../research-receipts.js";
import { FINDING_CERTAINTIES, holdsYouTubeReference, screenFindingsText } from "./card.js";
import type { ResearchDossierDisposition } from "./dossier-disposition.js";
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
 * here) before results or conclusions rest on it; each search matches its own receipt; counts, numbers needed to treat
 * or harm, and calculated figures add up; every reference points at an entry; every area of coverage is answered; each
 * conclusion keeps its form; each text passes the findings card's privacy screen. Whether a paper says what a figure or
 * a conclusion claims is the AI's reading, and the stored dossier says so. Never a blocking step of the final check.
 * The hard limits are starting values to revisit as topics need (the owner's note on 329a).
 */

export const RESEARCH_DOSSIER_SCHEMA = "askrigor.research-dossier.v1" as const;

export const RESEARCH_DOSSIER_LIMITS = Object.freeze({
  question: 300, topicName: 200, otherNames: 10, otherName: 80, forms: 12, form: 80, searches: 40, query: 300,
  studies: 40, identifiers: 4, identifier: 300, studyField: 120, design: 200, reason: 200, results: 60, outcome: 200,
  unit: 40, findings: 30, claim: 500, appliesTo: 300, change: 300, restsOn: 20, trails: 10, trail: 200,
  quickAnswer: 400, valueReason: 400, adds: 8, communities: 10, community: 80,
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
}).strict();

const coverageEntrySchema = z.object({
  status: z.enum(["entries", "none_found", "not_researched"]),
  search: localId.optional(),
  reason: text(L.reason).optional(),
}).strict();

const communitySchema = z.object({
  communities: z.array(text(L.community)).min(1).max(L.communities),
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
  "context)}]; coverage: {benefits, harms, null_results, conflicts, mainstream_options, people_reports: each {status: " +
  "entries, none_found with search, or not_researched with reason}}; community: {communities, people: {better, " +
  "no_change, worse, mixed}, report_quality: {detailed, measured, bare}}, never from YouTube comments; open_trails}. " +
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

interface CheckedStudy {
  identifiers: Array<{ scheme: ResearchDossierIdentifierScheme; value: string }>;
  read: DossierReading;
}

export interface CheckedDossier {
  input: ResearchDossierInput;
  studies: Map<string, CheckedStudy>;
  searches: Map<string, { recordsFound: number | null }>;
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
  context: { receipts: readonly DossierReceipt[]; atlasSources: ReadonlySet<string> },
): { problems: DossierProblem[]; checked?: CheckedDossier } {
  const problems: DossierProblem[] = [];
  const problem = (path: string, rule: string) => problems.push({ path, rule });

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

  // Studies: how each was read, from this call's receipts; a PubMed record's other identifiers join the study.
  const readReceipts = context.receipts.flatMap((receipt) => {
    const reading = readingOf(receipt);
    if (reading === undefined) return [];
    const named = ["id", "doi", "pmid", "pmcid"].flatMap((key) => list(receipt.claims[key]))
      .flatMap((value) => identifiersOf(value) ?? []);
    return named.length === 0 ? [] : [{ reading, identifiers: named }];
  });
  const found = new Set(searchReceipts.flatMap(({ claims }) => list(claims.ids))
    .flatMap((value) => { const identifier = identifiersOf(value); return identifier === undefined ? [] : [identifierKey(identifier)]; }));
  const forms = new Set(input.forms.map((form) => form.toLowerCase()));
  const studies = new Map<string, CheckedStudy>();
  input.studies.forEach((study, index) => {
    const own = study.identifiers.map((value, at) => {
      const identifier = identifiersOf(value);
      if (identifier === undefined) problem(`studies[${index}].identifiers[${at}]`, "identifier_not_recognized");
      return identifier;
    }).flatMap((identifier) => identifier ?? []);
    if (study.decision === "set_aside" && study.decision_reason === undefined) {
      problem(`studies[${index}].decision_reason`, "set_aside_reason_missing");
    }
    if (study.form !== undefined && forms.size > 0 && !forms.has(study.form.toLowerCase())) {
      problem(`studies[${index}].form`, "form_not_listed");
    }
    const keys = new Set(own.map(identifierKey));
    const all = new Map(own.map((identifier) => [identifierKey(identifier), identifier]));
    let read: DossierReading | undefined;
    for (const receipt of readReceipts) {
      if (!receipt.identifiers.some((identifier) => keys.has(identifierKey(identifier)))) continue;
      for (const identifier of receipt.identifiers) all.set(identifierKey(identifier), identifier);
      if (read === undefined || READING_ORDER.indexOf(receipt.reading) < READING_ORDER.indexOf(read)) read = receipt.reading;
    }
    if (read === undefined) {
      read = own.some((identifier) => context.atlasSources.has(atlasSourceDigest(identifier))) ? "from_atlas"
        : own.some((identifier) => found.has(identifierKey(identifier))) ? "found_in_search" : "not_in_receipts";
    }
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

  // Conclusions: what each rests on exists and backs it; its form is listed and is the form of its studies.
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
      const studyId = kind === "study" ? reference
        : kind === "result" ? input.results.find(({ id }) => id === reference)?.study : undefined;
      if (kind === "search") backing ||= searches.has(reference);
      else if (studyId !== undefined && backed(studyId)) backing = true;
      const form = studyId === undefined ? undefined : studyForm(studyId);
      if (finding.form !== undefined && form !== undefined && form !== finding.form.toLowerCase()) {
        problem(path, "form_mismatch");
      }
    });
    if (!backing) problem(at, "finding_without_backing");
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

  // Every text through the findings card's privacy screen, and no YouTube address anywhere.
  for (const [path, value] of dossierTexts(input)) {
    if (screenFindingsText(value) !== undefined) problem(path, "privacy_screen");
    else if (holdsYouTubeReference(value)) problem(path, "youtube_reference");
  }
  return problems.length > 0 ? { problems } : { problems, checked: { input, studies, searches } };
}

// The free texts the screen reads: everything but ids, references, enumerations, the topic key and identifiers.
const NOT_TEXT_KEYS: ReadonlySet<string> = new Set([
  "id", "study", "rests_on", "adds", "search", "identifiers", "key", "scope", "saves_work", "database", "kind",
  "decision", "direction", "certainty", "provenance", "operation", "status", "importance", "start", "end",
]);

function dossierTexts(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => dossierTexts(item, `${path}[${index}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) =>
    NOT_TEXT_KEYS.has(key) ? [] : dossierTexts(item, path === "" ? key : `${path}.${key}`));
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
    findings: input.findings,
    coverage: input.coverage,
    ...(input.community === undefined ? {} : { community: input.community }),
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
  secret: string | undefined;
  versions: { askrigor: string; build: string; hrp?: string; universal?: string };
  now?: () => Date;
  newVersionId?: () => string;
}

export interface ResearchDossierSaveOutcome {
  disposition: ResearchDossierDisposition;
  /** What the AI is told about it, among the result's notes. */
  note?: string;
}

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
  if (request.finalizationReceipt === undefined) {
    return quiet({ status: "insufficient", reason: "final_check_not_passed" });
  }
  if (request.secret === undefined) return quiet({ status: "unavailable", reason: "receipts_unavailable" });
  const now = request.now ?? (() => new Date());
  const receipt = verifyResearchReceipt(request.finalizationReceipt, { secret: request.secret, now });
  if (!receipt.ok || receipt.kind !== "finalization") {
    return quiet({ status: "insufficient", reason: "final_check_not_passed" });
  }
  if (request.callSavingOff || receipt.claims.fs === "off") return quiet({ status: "consent_blocked", reason: "call_saving_off" });
  const account = request.account;
  if (account === undefined) return quiet({ status: "private", reason: "no_research_account" });
  if (account.mode !== "FREE_CONTRIBUTOR") return quiet({ status: "consent_blocked", reason: "paid_private" });
  if (!researchUseNoticeCovered(account.noticeVersion)) return quiet({ status: "consent_blocked", reason: "notice_not_current" });
  if (!account.findingsSave) return quiet({ status: "consent_blocked", reason: "saving_off" });
  if (!request.dossier.given) {
    return !request.shortLookup && request.validatedSources > 0
      ? {
          disposition: { status: "not_sent" },
          note: "Research dossier: this research did work a quick answer cannot do, and no research dossier came with " +
            "this check, so none was saved. When a research run would save a later reader substantial work compared " +
            "with one ordinary AI answer, send its dossier with that run's final check; it is saved privately for " +
            `AskRigor's owner to review, under the free contributor agreement. ${RESEARCH_DOSSIER_SHAPE}`,
        }
      : undefined;
  }

  const insufficient = (problems: DossierProblem[], reason = "checks_failed"): ResearchDossierSaveOutcome => ({
    disposition: { status: "insufficient", reason, problems: problems.slice(0, PROBLEMS_SHOWN) },
    note: reason === "value_not_substantial"
      ? "Research dossier not saved: its value statement does not say it saves a reader substantial work."
      : "Research dossier not saved, nothing of it was stored: " +
        problems.slice(0, PROBLEMS_SHOWN).map(({ path, rule }) => `${path} (${rule})`).join("; ") +
        ". Correct them and send it again with a later final check of this research.",
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
  const { problems, checked } = checkResearchDossier(parsed.data, { receipts, atlasSources });
  if (checked === undefined) return insufficient(problems);

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
    checks: ["receipts", "searches", "arithmetic", "references", "coverage", "forms", "privacy_screen"],
    not_checked: ["papers_support_claims", "figures_match_papers", "value_judgement"],
    ...(cardNumber === null || !Number.isSafeInteger(cardNumber) ? {} : { card_number: cardNumber }),
    ...(receipt.claims.ar === "caller" ? { ai_readings: "caller" } : {}),
  });
  const payloadSha256 = researchDossierDigest(payload);
  const inputSha256 = researchDossierDigest(checked.input);
  const dossierKey = researchDossierKey(request.secret, account.accountKey, target, checked.input.question);
  const identifiers = [...new Map([...checked.studies.values()].flatMap(({ identifiers: own }) => own)
    .map((identifier) => [identifierKey(identifier), identifier])).values()];
  const latest = await store.latestVersion(account.accountKey, dossierKey);
  const appended = await store.append({
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
  if (appended.outcome === "account_refused") return { disposition: { status: "consent_blocked", reason: "account_not_eligible" } };
  // Exactly the version written (or replayed), read back and digested again.
  const read = await store.readVersion(account.accountKey, appended.versionId);
  if (read === null || read.payload === null || read.payloadSha256 !== appended.payloadSha256 ||
    researchDossierDigest(read.payload) !== appended.payloadSha256 || read.dossierNumber !== appended.dossierNumber ||
    read.versionNumber !== appended.versionNumber) {
    return { disposition: { status: "unconfirmed", reason: "readback_mismatch" } };
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

/** The line the answer ends with, before the check line; none where there is nothing for the person to know. */
export function researchDossierLine(disposition: ResearchDossierDisposition): string | undefined {
  switch (disposition.status) {
    case "saved":
      return `Research dossier ${disposition.dossier_id} was saved privately for AskRigor's owner to review ` +
        `(version ${disposition.version}); it is not public.`;
    case "duplicate":
      return `Research dossier ${disposition.dossier_id} was already saved privately for AskRigor's owner to review ` +
        `(version ${disposition.version}).`;
    case "insufficient":
      return disposition.reason === "final_check_not_passed" ? undefined
        : disposition.reason === "value_not_substantial"
          ? "No research dossier was saved: this research was judged not to save a reader substantial work."
          : "No research dossier was saved: it did not pass AskRigor's checks.";
    case "not_sent":
      return "No research dossier was saved: none was sent.";
    case "unconfirmed":
      return "The research dossier's save was not confirmed, so it may not have been saved.";
    default:
      return undefined;
  }
}
