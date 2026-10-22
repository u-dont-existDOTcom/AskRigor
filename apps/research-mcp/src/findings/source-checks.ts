import { createHash } from "node:crypto";

import type { ProvenanceEnvelope } from "@askrigor/contracts";
import {
  checkRetractionStatus,
  fetchClinicalTrial,
  fetchPubmedRecord,
  normalizeDoiIdentifier,
  resolveDoi,
  searchEuropePmc,
  type CrossrefConfig,
  type PubmedConfig,
  type PubmedRecord,
  type RetractionStatus
} from "@askrigor/sources";

import { canonicalJson } from "./card.js";

/**
 * The public-record and retraction checks on an Atlas finding's sources, before the owner accepts it (Atlas phase 2
 * design, section 2). Each source is looked up with the provider functions the connector's own tools call: a DOI's
 * Crossref work through resolveDoi; a PMID's PubMed record through fetchPubmedRecord; a PMCID through Europe PMC's
 * search for "PMCID:", which gives its PMID and DOI; an NCT number through fetchClinicalTrial. Every DOI, a PMID's or
 * PMCID's included, then has its Crossref update markers read through checkRetractionStatus, the
 * check_retraction_status tool's own call. All of it is exact: identifiers, provider states and the closed
 * vocabularies providers write.
 *
 * A source no provider has a record of is refused. A provider that cannot be reached, or answers in a way the checks
 * cannot read, gives "try again later" with nothing recorded and nothing kept for reuse. A complete check is kept in
 * this process for 10 minutes, so the accept that follows an inspect binds the results the owner saw.
 */

export const ATLAS_SOURCE_KINDS = ["doi", "pmid", "pmcid", "nct"] as const;
export type AtlasSourceKind = typeof ATLAS_SOURCE_KINDS[number];

/** A source identifier as the providers take it. */
export interface AtlasSourceIdentifier {
  kind: AtlasSourceKind;
  /** A DOI in lower case; a PMID's digits; PMC and digits; NCT and eight digits. */
  id: string;
}

const PMID_FORM = /^(?:pmid:?\s*)?([1-9]\d{0,8})$/iu;
const PMCID_FORM = /^(?:pmcid:?\s*)?pmc([1-9]\d{0,8})$/iu;
const NCT_FORM = /^nct(\d{8})$/iu;

/**
 * A card source as a study identifier: a DOI (bare, after doi: or as a doi.org link), a PMID, a PMCID or an NCT
 * number, in the forms a findings card accepts, in any case; undefined for anything else, such as a PMID with a
 * leading zero or a DOI the DOI tools cannot take.
 */
export function parseAtlasSource(source: string): AtlasSourceIdentifier | undefined {
  const text = source.trim();
  const pmid = PMID_FORM.exec(text);
  if (pmid !== null) return { kind: "pmid", id: pmid[1]! };
  const pmcid = PMCID_FORM.exec(text);
  if (pmcid !== null) return { kind: "pmcid", id: `PMC${pmcid[1]!}` };
  const nct = NCT_FORM.exec(text);
  if (nct !== null) return { kind: "nct", id: `NCT${nct[1]!}` };
  // The DOI tools take a doi.org link only over HTTPS; a card may give it over HTTP.
  const doi = normalizeDoiIdentifier(text.replace(/^http:\/\//iu, "https://"));
  return doi === undefined ? undefined : { kind: "doi", id: doi };
}

/** A source's retraction status, as atlas_source_checks stores it. */
export const ATLAS_RETRACTION_STATUSES = [
  "none_found",
  "corrected_or_updated",
  "expression_of_concern",
  "retracted",
  "not_applicable",
  "unknown"
] as const;
export type AtlasRetractionStatus = typeof ATLAS_RETRACTION_STATUSES[number];

/**
 * What each status asks of the owner, and how an accepted finding binds the source (design section 2): a retracted
 * source needs confirm and is then bound as context only, never as support; an expression of concern, a correction or
 * a status no provider could read needs confirm, and the owner's clearing is recorded; otherwise the source supports
 * the finding.
 */
export const ATLAS_RETRACTION_RULES = {
  none_found: { needsConfirmation: false, binding: "supports" },
  not_applicable: { needsConfirmation: false, binding: "supports" },
  corrected_or_updated: { needsConfirmation: true, binding: "supports" },
  expression_of_concern: { needsConfirmation: true, binding: "supports" },
  unknown: { needsConfirmation: true, binding: "supports" },
  retracted: { needsConfirmation: true, binding: "context_only" }
} as const satisfies Record<
  AtlasRetractionStatus,
  { needsConfirmation: boolean; binding: "supports" | "context_only" }
>;

/** A notice about the source itself, as Crossref's inbound update markers name it. */
export interface AtlasRetractionNotice {
  type: "retracted" | "expression_of_concern" | "corrected_or_updated";
  date: string | null;
  doi: string | null;
}

export type AtlasSourceProvider = "crossref" | "pubmed" | "europe_pmc" | "clinicaltrials_gov";

/** What the provider's record says, for the owner's review and for atlas_source_checks. */
export interface AtlasSourceRecord {
  title?: string;
  /** The publication year (Crossref, PubMed, Europe PMC); a trial registration has none here. */
  year?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  nctId?: string;
  /** PubMed's publication types. */
  publicationTypes?: string[];
}

export interface AtlasSourceRetraction {
  status: AtlasRetractionStatus;
  /**
   * What the status was read from: Crossref's update markers for a DOI, PubMed's "Retracted Publication" type, both
   * (the more serious one counts), or nothing, for a trial registration (not_applicable) or a source whose status no
   * provider could read (unknown).
   */
  via: Array<"crossref" | "pubmed_publication_type">;
  /** The DOI whose Crossref markers were read. */
  doi?: string;
  notices: AtlasRetractionNotice[];
}

/** A source whose public record and retraction status were both read. */
export interface AtlasCheckedSource {
  outcome: "checked";
  provider: AtlasSourceProvider;
  record: AtlasSourceRecord;
  retraction: AtlasSourceRetraction;
  needsConfirmation: boolean;
  binding: "supports" | "context_only";
  /** When the providers were asked; a reused check keeps its first time. */
  checkedAt: string;
  /** SHA-256 of the provider envelopes the check read, as canonical JSON, in the order they were read. */
  envelopeSha256: string;
}

export type AtlasSourceCheck =
  | { source: string; outcome: "invalid_identifier" }
  | ({ source: string; kind: AtlasSourceKind; identifier: string } & (
    | AtlasCheckedSource
    | { outcome: "not_found"; provider: AtlasSourceProvider }
    | { outcome: "unavailable"; provider: AtlasSourceProvider; errorCode: string }
  ));

export interface AtlasSourceChecks {
  /**
   * refused: a source is not a study identifier or no provider has a record of it; try_again_later: a provider could
   * not be reached, and nothing is recorded; needs_confirmation: a source's retraction status needs the owner's
   * confirm; passed otherwise.
   */
  status: "passed" | "needs_confirmation" | "refused" | "try_again_later";
  /** One check per source given, in the order given. */
  sources: AtlasSourceCheck[];
}

export interface AtlasSourceCheckOptions {
  crossref: CrossrefConfig;
  pubmed: PubmedConfig;
  now?: () => Date;
  /** The reuse between inspect and accept; the process's own by default. */
  cache?: AtlasSourceCheckCache;
}

/** How long a complete check is reused: from an inspect to the accept that follows it. */
export const ATLAS_SOURCE_CHECK_REUSE_MS = 10 * 60 * 1_000;
const ATLAS_SOURCE_CHECK_CACHE_ENTRIES = 1_000;

/** Complete source checks kept in this process for reuse, each for ATLAS_SOURCE_CHECK_REUSE_MS. */
export class AtlasSourceCheckCache {
  private readonly entries = new Map<string, { check: AtlasCheckedSource; storedAt: number }>();

  constructor(
    private readonly reuseMs = ATLAS_SOURCE_CHECK_REUSE_MS,
    private readonly maximumEntries = ATLAS_SOURCE_CHECK_CACHE_ENTRIES
  ) {}

  get(key: string, now: number): AtlasCheckedSource | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (now < entry.storedAt || now - entry.storedAt >= this.reuseMs) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.check);
  }

  set(key: string, check: AtlasCheckedSource, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { check: structuredClone(check), storedAt: now });
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.maximumEntries) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

const processCache = new AtlasSourceCheckCache();

/** Empties the process's reuse, for tests. */
export function resetAtlasSourceCheckCacheForTests(): void {
  processCache.clear();
}

/**
 * Checks each source of a finding the owner is about to accept: that it is a study identifier, that a provider has a
 * public record of it, and its retraction status, with what that status asks of the owner. No provider is asked about
 * a source a complete check of the last 10 minutes covers.
 */
export async function checkAtlasSources(
  sources: readonly string[],
  options: AtlasSourceCheckOptions
): Promise<AtlasSourceChecks> {
  const cache = options.cache ?? processCache;
  const now = (options.now ?? (() => new Date()))();
  const run: Run = {
    crossref: options.crossref,
    pubmed: options.pubmed,
    checkedAt: now.toISOString(),
    retractions: new Map(),
    pubmedRecords: new Map()
  };
  // One check per identifier, however many forms of it the sources give.
  const pending = new Map<string, Promise<SourceOutcome>>();
  const checks = await mapAtMost(SOURCES_CHECKED_AT_ONCE, sources, async (source): Promise<AtlasSourceCheck> => {
    const identifier = parseAtlasSource(source);
    if (identifier === undefined) return { source, outcome: "invalid_identifier" };
    const key = `${identifier.kind}:${identifier.id}`;
    let outcome = pending.get(key);
    if (outcome === undefined) {
      const reused = cache.get(key, now.getTime());
      outcome = reused === undefined
        ? checkSource(identifier, run).then((checked) => {
          if (checked.outcome === "checked") cache.set(key, checked, now.getTime());
          return checked;
        })
        : Promise.resolve(reused);
      pending.set(key, outcome);
    }
    return { source, kind: identifier.kind, identifier: identifier.id, ...structuredClone(await outcome) };
  });
  return { status: overallStatus(checks), sources: checks };
}

// Each source's calls run one after another, so this bounds the requests in flight: Crossref's polite pool, which
// every DOI's work and markers go to, admits only a few at once.
const SOURCES_CHECKED_AT_ONCE = 3;

/** The items mapped in order, with at most `limit` mappings running at once. */
async function mapAtMost<T, R>(limit: number, items: readonly T[], map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < items.length; index = next++) results[index] = await map(items[index]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function overallStatus(checks: readonly AtlasSourceCheck[]): AtlasSourceChecks["status"] {
  if (checks.some(({ outcome }) => outcome === "invalid_identifier" || outcome === "not_found")) return "refused";
  if (checks.some(({ outcome }) => outcome === "unavailable")) return "try_again_later";
  if (checks.some((check) => check.outcome === "checked" && check.needsConfirmation)) return "needs_confirmation";
  return "passed";
}

type SourceOutcome =
  | AtlasCheckedSource
  | { outcome: "not_found"; provider: AtlasSourceProvider }
  | { outcome: "unavailable"; provider: AtlasSourceProvider; errorCode: string };

interface Run {
  readonly crossref: CrossrefConfig;
  readonly pubmed: PubmedConfig;
  readonly checkedAt: string;
  /** Crossref's markers for each DOI, read once per call. */
  readonly retractions: Map<string, Promise<Lookup<CrossrefRetraction>>>;
  /** PubMed's record for each PMID, read once per call. */
  readonly pubmedRecords: Map<string, Promise<Lookup<AtlasSourceRecord>>>;
}

type Lookup<T> =
  | { kind: "found"; value: T; envelope: unknown }
  | { kind: "not_found"; envelope: unknown }
  | { kind: "unavailable"; errorCode: string };

interface CrossrefRetraction {
  status: AtlasRetractionStatus;
  notices: AtlasRetractionNotice[];
}

/** One status reading, from Crossref's markers or PubMed's publication types. */
type Reading = { via: "crossref"; status: AtlasRetractionStatus; doi: string; notices: AtlasRetractionNotice[] } |
  { via: "pubmed_publication_type"; status: AtlasRetractionStatus };

function checkSource(identifier: AtlasSourceIdentifier, run: Run): Promise<SourceOutcome> {
  switch (identifier.kind) {
    case "doi": return checkDoi(identifier.id, run);
    case "pmid": return checkPmid(identifier.id, run);
    case "pmcid": return checkPmcid(identifier.id, run);
    case "nct": return checkNct(identifier.id, run);
  }
}

/** A DOI: Crossref's work (title and year from resolveDoi), then its update markers. */
async function checkDoi(doi: string, run: Run): Promise<SourceOutcome> {
  const work = await lookup(() => resolveDoi(doi, run.crossref), (envelope) => {
    const candidate = envelope.data.resolved_doi === doi
      ? envelope.data.candidates.find((found) => found.doi === doi)
      : undefined;
    return candidate === undefined ? undefined : { doi, ...known("title", candidate.title), ...year(candidate.year) };
  });
  if (work.kind !== "found") return missing(work, "crossref");
  const markers = await crossrefRetraction(doi, run);
  // Crossref gave the work a moment ago, so a missing record now is a provider fault, not an answer.
  if (markers.kind === "not_found") return unavailable("crossref", "crossref_record_not_found");
  if (markers.kind === "unavailable") return unavailable("crossref", markers.errorCode);
  return checked(run, "crossref", work.value, [{ via: "crossref", doi, ...markers.value }],
    [work.envelope, markers.envelope]);
}

/** A PMID: PubMed's record, then the markers of the DOI it lists, and its own "Retracted Publication" type. */
async function checkPmid(pmid: string, run: Run): Promise<SourceOutcome> {
  const record = await pubmedRecord(pmid, run);
  if (record.kind !== "found") return missing(record, "pubmed");
  const readings = await pubmedReadings(record.value, run);
  if (readings.kind === "unavailable") return unavailable("crossref", readings.errorCode);
  return checked(run, "pubmed", record.value, readings.readings, [record.envelope, ...readings.envelopes]);
}

/**
 * A PMCID: Europe PMC's record, which gives its PMID and DOI; then the DOI's markers or, for a PMCID without a DOI
 * Crossref knows, PubMed's record of its PMID.
 */
async function checkPmcid(pmcid: string, run: Run): Promise<SourceOutcome> {
  const search = await lookup(
    () => searchEuropePmc({ query: `PMCID:${pmcid}`, pageSize: 5 }),
    (envelope) => ({ match: envelope.data.find((record) => record.pmcid?.trim().toUpperCase() === pmcid) })
  );
  if (search.kind !== "found") return missing(search, "europe_pmc");
  const match = search.value.match;
  if (match === undefined) return { outcome: "not_found", provider: "europe_pmc" };
  const doi = normalizeDoiIdentifier(match.doi);
  const listedPmid = match.pmid?.trim();
  const pmid = listedPmid !== undefined && /^[1-9]\d{0,8}$/u.test(listedPmid) ? listedPmid : undefined;
  const record: AtlasSourceRecord = {
    pmcid,
    ...known("title", match.title),
    ...year(match.year),
    ...(doi === undefined ? {} : { doi }),
    ...(pmid === undefined ? {} : { pmid })
  };
  const envelopes: unknown[] = [search.envelope];
  if (doi !== undefined) {
    const markers = await crossrefRetraction(doi, run);
    if (markers.kind === "unavailable") return unavailable("crossref", markers.errorCode);
    envelopes.push(markers.envelope);
    if (markers.kind === "found") {
      return checked(run, "europe_pmc", record, [{ via: "crossref", doi, ...markers.value }], envelopes);
    }
  }
  if (pmid !== undefined) {
    const pubmed = await pubmedRecord(pmid, run);
    if (pubmed.kind === "unavailable") return unavailable("pubmed", pubmed.errorCode);
    envelopes.push(pubmed.envelope);
    if (pubmed.kind === "found") {
      // PubMed may list a DOI Europe PMC did not; one Crossref already lacks is not asked about again.
      const readings = await pubmedReadings(pubmed.value.doi === doi ? withoutDoi(pubmed.value) : pubmed.value, run);
      if (readings.kind === "unavailable") return unavailable("crossref", readings.errorCode);
      return checked(run, "europe_pmc", record, readings.readings, [...envelopes, ...readings.envelopes]);
    }
  }
  // Neither a DOI Crossref knows nor a PubMed record: no provider gives a retraction status.
  return checked(run, "europe_pmc", record, [], envelopes);
}

/** An NCT number: the registration. A registration is not retracted, so its status does not apply. */
async function checkNct(nctId: string, run: Run): Promise<SourceOutcome> {
  const trial = await lookup(() => fetchClinicalTrial(nctId), (envelope) =>
    envelope.data.nct_id === nctId ? { nctId, ...known("title", envelope.data.title) } : undefined);
  if (trial.kind !== "found") return missing(trial, "clinicaltrials_gov");
  return checked(run, "clinicaltrials_gov", trial.value, "not_applicable", [trial.envelope]);
}

/** PubMed's record of a PMID, read once per call. */
function pubmedRecord(pmid: string, run: Run): Promise<Lookup<AtlasSourceRecord>> {
  let record = run.pubmedRecords.get(pmid);
  if (record === undefined) {
    record = lookup(() => fetchPubmedRecord(pmid, run.pubmed), (envelope) =>
      envelope.access_status === "api_visible_complete" && envelope.data.pmid === pmid
        ? pubmedSourceRecord(pmid, envelope.data)
        : undefined);
    run.pubmedRecords.set(pmid, record);
  }
  return record;
}

function pubmedSourceRecord(pmid: string, data: PubmedRecord): AtlasSourceRecord {
  const doi = normalizeDoiIdentifier(data.doi);
  const pmcid = data.pmcid?.trim().toUpperCase();
  // The publication date leads with its four-digit year, as in 2025-01-30 or "1998 Dec-1999 Jan".
  const published = data.dates?.find(({ type }) => type === "publication")?.value;
  return {
    pmid,
    ...known("title", data.title),
    ...year(published === undefined ? undefined : /^\d{4}(?!\d)/u.exec(published)?.[0]),
    ...(doi === undefined ? {} : { doi }),
    ...(pmcid !== undefined && /^PMC[1-9]\d{0,15}$/u.test(pmcid) ? { pmcid } : {}),
    ...(data.publication_types === undefined || data.publication_types.length === 0
      ? {}
      : { publicationTypes: [...data.publication_types] })
  };
}

const RETRACTED_PUBLICATION = "Retracted Publication";

/**
 * The status readings of a PubMed record: PubMed's own "Retracted Publication" type, which is the status of a PMID
 * without a DOI Crossref knows (owner choice 3a), and, when the record lists a DOI, Crossref's markers for it. Both
 * count when both are read, so a retraction either one records is never missed.
 */
async function pubmedReadings(record: AtlasSourceRecord, run: Run): Promise<
  { kind: "read"; readings: Reading[]; envelopes: unknown[] } | { kind: "unavailable"; errorCode: string }
> {
  const retracted = (record.publicationTypes ?? []).some((type) => type.trim() === RETRACTED_PUBLICATION);
  const pubmed: Reading = { via: "pubmed_publication_type", status: retracted ? "retracted" : "none_found" };
  if (record.doi === undefined) return { kind: "read", readings: [pubmed], envelopes: [] };
  const markers = await crossrefRetraction(record.doi, run);
  if (markers.kind === "unavailable") return markers;
  return {
    kind: "read",
    readings: markers.kind === "found" ? [{ via: "crossref", doi: record.doi, ...markers.value }, pubmed] : [pubmed],
    envelopes: [markers.envelope]
  };
}

const withoutDoi = ({ doi: _doi, ...record }: AtlasSourceRecord): AtlasSourceRecord => record;

const CROSSREF_STATUSES: Record<RetractionStatus, AtlasRetractionStatus> = {
  retracted: "retracted",
  expression_of_concern: "expression_of_concern",
  corrected_or_updated: "corrected_or_updated",
  no_retraction_record_found: "none_found",
  unknown: "unknown"
};

/**
 * Crossref's update markers for a DOI, through checkRetractionStatus (the check_retraction_status tool's own call),
 * read once per call. The notices are the markers about the work itself: its legacy evidence labels each marker
 * "relation | direction[ | label]", and only inbound ones are about this work.
 */
function crossrefRetraction(doi: string, run: Run): Promise<Lookup<CrossrefRetraction>> {
  let markers = run.retractions.get(doi);
  if (markers === undefined) {
    markers = lookup(() => checkRetractionStatus(doi, run.crossref), (envelope) => {
      if (envelope.data.doi !== doi) return undefined;
      const notices = new Map<string, AtlasRetractionNotice>();
      for (const evidence of envelope.data.evidence) {
        if (evidence.raw_label.split(" | ")[1] !== "inbound") continue;
        const notice = { type: evidence.type, date: evidence.date, doi: evidence.doi };
        notices.set(JSON.stringify(notice), notice);
      }
      return { status: CROSSREF_STATUSES[envelope.data.status], notices: [...notices.values()] };
    });
    run.retractions.set(doi, markers);
  }
  return markers;
}

// The more serious status counts when two readings differ.
const SEVERITY: readonly AtlasRetractionStatus[] = [
  "retracted", "expression_of_concern", "corrected_or_updated", "unknown", "none_found", "not_applicable"
];

function checked(
  run: Run,
  provider: AtlasSourceProvider,
  record: AtlasSourceRecord,
  readings: readonly Reading[] | "not_applicable",
  envelopes: readonly unknown[]
): AtlasCheckedSource {
  const read = readings === "not_applicable" ? [] : readings;
  const status: AtlasRetractionStatus = readings === "not_applicable"
    ? "not_applicable"
    : read.length === 0 ? "unknown" : SEVERITY.find((severity) => read.some((reading) => reading.status === severity))!;
  const crossref = read.find((reading) => reading.via === "crossref");
  const rule = ATLAS_RETRACTION_RULES[status];
  return {
    outcome: "checked",
    provider,
    record,
    retraction: {
      status,
      via: read.map(({ via }) => via),
      ...(crossref === undefined ? {} : { doi: crossref.doi }),
      notices: crossref === undefined ? [] : crossref.notices
    },
    needsConfirmation: rule.needsConfirmation,
    binding: rule.binding,
    checkedAt: run.checkedAt,
    envelopeSha256: createHash("sha256").update(canonicalJson(envelopes), "utf8").digest("hex")
  };
}

function missing(
  lookedUp: Exclude<Lookup<unknown>, { kind: "found" }>,
  provider: AtlasSourceProvider
): SourceOutcome {
  return lookedUp.kind === "not_found" ? { outcome: "not_found", provider } : unavailable(provider, lookedUp.errorCode);
}

/** A source to check again later: only the provider and its error code, with nothing read. */
function unavailable(provider: AtlasSourceProvider, errorCode: string): SourceOutcome {
  return { outcome: "unavailable", provider, errorCode };
}

/**
 * One provider call, read as found, not found or unavailable. Not found is the provider's own not_found state; any
 * other error, a call that throws, or a response that does not name the record asked for is unavailable, so a
 * provider fault is never read as an answer either way.
 */
async function lookup<T, R>(
  call: () => Promise<ProvenanceEnvelope<T>>,
  read: (envelope: ProvenanceEnvelope<T>) => R | undefined
): Promise<Lookup<R>> {
  let envelope: ProvenanceEnvelope<T>;
  try {
    envelope = await call();
  } catch {
    return { kind: "unavailable", errorCode: "provider_call_failed" };
  }
  if (envelope.access_status === "not_found") return { kind: "not_found", envelope };
  if (envelope.error !== undefined) {
    const code = envelope.error.code;
    return { kind: "unavailable", errorCode: /^[a-z][a-z0-9_]{0,63}$/u.test(code) ? code : "provider_error" };
  }
  let value: R | undefined;
  try {
    value = read(envelope);
  } catch {
    value = undefined;
  }
  return value === undefined
    ? { kind: "unavailable", errorCode: "provider_response_unexpected" }
    : { kind: "found", value, envelope };
}

function known<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  const text = value?.trim();
  return text === undefined || text.length === 0 ? {} : { [key]: text } as Record<K, string>;
}

function year(value: string | undefined): { year?: string } {
  const text = value?.trim();
  return text !== undefined && /^\d{4}$/u.test(text) ? { year: text } : {};
}
