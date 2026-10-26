import type {
  AtlasFindingDirection,
  AtlasFindingKind,
  AtlasLabel,
  AtlasPageOwnComment,
  AtlasPageOwnVote,
  AtlasPageParticipation,
  AtlasPageChangeKind,
  AtlasPageFinding,
  AtlasPagePublication,
  AtlasPageReads,
  AtlasPageSource,
  AtlasPageSourceIdentifiers,
  AtlasPageSourceScheme,
  AtlasPublishedFinding,
  AtlasSubjectType,
} from "@askrigor/evidence-repository";
import { ATLAS_OWN_COMMENTS_PER_PAGE, ATLAS_OWN_VOTES_PER_PAGE } from "@askrigor/evidence-repository";

import { passesPageGuard } from "./page-guard.js";

/**
 * What the public Atlas pages show (decision 171, section 4C; plan
 * docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md, section 3), read in one snapshot and
 * resolved to one shape for every page:
 * - an unreviewed publication shows its published fields, with the label "Not checked by supervisors yet";
 * - an accepted or edited one shows its F number's latest version (the accepted wording, never the card's), with the
 *   F number, the day it was checked and its label; until the canonical writer has written that F number (its
 *   five-minute timer), or once that version's wording was erased or the finding withdrawn, it shows nowhere;
 * - held, rejected and withdrawn publications are never read.
 * Nothing here names a card, an account or a contributor: the reads select no such field.
 */

export type AtlasCertainty = "high" | "moderate" | "low" | "very_low";
export type AtlasVerifiedBasis = "full_text_audit" | "bounded_absence" | "research_correction";
export type AtlasSearchDatabase = "pubmed" | "europepmc" | "ctgov";

/** The exact label an unreviewed finding carries, the approved notice's words. */
export const NOT_CHECKED_LABEL = "Not checked by supervisors yet";

/** How a finding stands: published without review, or reviewed, with its F number and canonical label. */
export type ShownStatus =
  | { kind: "unreviewed" }
  | {
    kind: Exclude<AtlasLabel, "withdrawn">;
    atlasNumber: string;
    /** The day the owner checked it (its acceptance), YYYY-MM-DD. */
    checkedOn: string;
  };

/** A two-group yes-or-no figure: the counts only; rates, NNT and NNH are worked out when it renders. */
export interface ShownNumber {
  outcome: string;
  better: "fewer" | "more";
  option: string;
  optionEvents: number;
  optionTotal: number;
  comparator: string;
  comparatorEvents: number;
  comparatorTotal: number;
  followUp: string;
  harmsNoneFound: boolean;
}

export interface ShownSearch {
  database: AtlasSearchDatabase;
  query: string;
  dateRange: { start: string; end: string } | null;
}

/** Another finding a page points to: by its page when it has one shown, else by its F number alone. */
export interface ShownRelated {
  atlasNumber: string;
  publicationNumber: string | null;
}

export interface ShownFinding {
  publicationNumber: string;
  status: ShownStatus;
  topic: { key: string; label: string } | null;
  claim: string;
  certainty: AtlasCertainty | null;
  appliesTo: string | null;
  kind: AtlasFindingKind | null;
  subject: string | null;
  subjectType: AtlasSubjectType | null;
  direction: AtlasFindingDirection | null;
  numbers: ShownNumber[];
  searches: ShownSearch[];
  /** Each source by its identifiers, parsed by exact patterns; anything else is left out. */
  sources: AtlasPageSourceIdentifiers[];
  whyNotUsual: string | null;
  whatWouldChangeIt: string | null;
  verifiedBases: AtlasVerifiedBasis[];
  /** An unreviewed finding: the day its card was saved. */
  savedOn: string | null;
  /** A reviewed finding: its newest research day. */
  researchCheckedOn: string | null;
  askrigorVersion: string | null;
  /** A contested finding: the checked findings that disagree with it, and on what. */
  contested: Array<ShownRelated & { disagreement: string | null }>;
  /** A superseded finding: the findings that replace it. */
  replacedBy: ShownRelated[];
  publishedAt: string;
  stateChangedAt: string;
}

/** The owner's "most important now" pick with its reason (decision 2a). */
export interface AtlasOwnerPick {
  finding: ShownFinding;
  reason: string;
}

export interface AtlasContestedPair {
  disagreement: string | null;
  /** The pair's findings that have a page, one or two. */
  findings: ShownFinding[];
}

export interface AtlasHomeModel {
  /**
   * The owner's picks with their reasons (decision 2a). An owner action that sets them comes later; until then this is
   * empty and the home page renders nothing for it.
   */
  picks: readonly AtlasOwnerPick[];
  recentlyPublished: ShownFinding[];
  recentlyChecked: ShownFinding[];
  contested: AtlasContestedPair[];
}

export const TOPIC_SECTIONS = [
  { id: "options", heading: "Options and what they do" },
  { id: "harms", heading: "Harms" },
  { id: "products", heading: "What was tested and what is sold" },
  { id: "corrections", heading: "Common claims corrected" },
  { id: "nothing_found", heading: "Searched, nothing found" },
  { id: "other", heading: "Other findings" },
  { id: "leads", heading: "Leads" },
  { id: "earlier", heading: "Earlier findings" },
] as const;
export type TopicSectionId = typeof TOPIC_SECTIONS[number]["id"];

export interface AtlasTopicModel {
  topic: { key: string; label: string };
  sections: Array<{ id: TopicSectionId; heading: string; findings: ShownFinding[] }>;
}

export interface AtlasFindingModel {
  finding: ShownFinding;
  /**
   * Votes and comments (decision 171, section 4E): the totals, the comments that show and the signed-in viewer's own;
   * null when votes and comments are switched off, and then nothing of them renders.
   */
  participation: AtlasPageParticipation | null;
}

/** What a finding page's votes and comments render with: the model's, with each form's token and the page's notice. */
export interface AtlasFindingParticipationView {
  totals: { agree: number; disagree: number };
  comments: Array<{
    publicId: string;
    displayName: string;
    body: string;
    postedAt: string;
    /** Six hexadecimal characters that tell apart commenters who chose the same name. */
    marker: string;
    /** The report form's token: the session's, or for a reader not signed in, the day's. */
    reportToken: string;
    /** The viewer's own comment's delete token; null for another's. */
    deleteToken: string | null;
  }>;
  /** The signed-in viewer, with their forms' tokens; null for a reader who is not signed in. */
  viewer: null | {
    displayName: string | null;
    stopped: boolean;
    vote: "agree" | "disagree" | null;
    tokens: { vote: string; comment: string };
  };
  /** Where a reader who is not signed in signs in, returning to this page. */
  signInHref: string;
  /** A line confirming the reader's last action, such as their vote being saved. */
  notice: string | null;
  /** Right after signing out: the link that also signs out of the AskRigor login in this browser. */
  tenantSignOutHref: string | null;
  /** Why the reader's last form was refused, such as a comment holding contact details. */
  error: string | null;
  /** What the reader wrote, kept when the form was refused. */
  draft: { body: string; displayName: string } | null;
  /** The next page of older comments, when the page holds only some of them. */
  olderHref: string | null;
}

export type AtlasChangeEntryKind = "published" | AtlasPageChangeKind;

export interface AtlasChangeEntry {
  at: string;
  kind: AtlasChangeEntryKind;
  atlasNumber: string | null;
  /** The finding as it shows now; null for a withdrawn one, which shows nowhere. */
  finding: ShownFinding | null;
  labelBefore: AtlasLabel | null;
  labelAfter: AtlasLabel | null;
  note: string | null;
}

export interface AtlasChangesModel {
  entries: AtlasChangeEntry[];
}

/** How many findings each home lane shows, and how many publications it reads to fill itself. */
export const ATLAS_LANE_SIZES = { published: 20, checked: 10, contested: 10 } as const;
const LANE_READ = 60;
const CONTRADICTIONS_READ = 50;
/** The most findings a topic page shows. */
export const ATLAS_TOPIC_FINDINGS = 200;
/** The most entries the "what changed" page lists, and how many records it reads for them. */
export const ATLAS_CHANGE_ENTRIES = 100;
const CHANGES_READ = 200;
const READ_CHUNK = 500;

// Source identifiers, by exact patterns ------------------------------------------------------------------------------

// A card's source as the card schema admits it (findings/card.ts, isSourceIdentifier): a DOI, with or without its
// doi.org link or doi: prefix; a PMID or PMCID, with or without its label; an NCT number. Only the identifier is kept;
// the pages build every link from it, never from the card's text.
const CARD_DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S{1,300})$/iu;
const CARD_PMID = /^(?:pmid:?\s*)?0*([1-9]\d{0,8})$/iu;
const CARD_PMCID = /^(?:pmcid:?\s*)?pmc0*([1-9]\d{0,8})$/iu;
const CARD_NCT = /^nct(\d{8})$/iu;

// The canonical forms the Atlas stores (atlasSourceIdentifierSchema), checked again before a link is built.
const CANONICAL: Record<AtlasPageSourceScheme, RegExp> = {
  doi: /^10\.\d{4,9}\/\S{1,300}$/u,
  pmid: /^[1-9]\d{0,8}$/u,
  pmcid: /^PMC[1-9]\d{0,8}$/u,
  nct: /^NCT\d{8}$/u,
};

/** A card's source as an identifier in canonical form, or undefined (a video's ID, or anything else, is left out). */
export function sourceIdentifierOf(source: string): { scheme: AtlasPageSourceScheme; value: string } | undefined {
  const text = source.trim();
  const doi = CARD_DOI.exec(text);
  if (doi !== null) return { scheme: "doi", value: doi[1]!.toLowerCase() };
  const nct = CARD_NCT.exec(text);
  if (nct !== null) return { scheme: "nct", value: `NCT${nct[1]!}` };
  const pmcid = CARD_PMCID.exec(text);
  if (pmcid !== null) return { scheme: "pmcid", value: `PMC${pmcid[1]!}` };
  const pmid = CARD_PMID.exec(text);
  if (pmid !== null) return { scheme: "pmid", value: pmid[1]! };
  return undefined;
}

/** Whether an identifier is in the canonical form its scheme has. */
export function canonicalIdentifier(identifier: { scheme: string; value: string }): boolean {
  const pattern = CANONICAL[identifier.scheme as AtlasPageSourceScheme];
  return pattern !== undefined && pattern.test(identifier.value);
}

// Resolving publications ----------------------------------------------------------------------------------------------

const unique = <T>(values: readonly T[]) => [...new Set(values)];
const numberOf = (publicationNumber: string) => Number(publicationNumber.slice(2));
const byPublicationNumber = (left: AtlasPagePublication, right: AtlasPagePublication) =>
  numberOf(left.publicationNumber) - numberOf(right.publicationNumber);

async function readFindings(reads: AtlasPageReads, atlasNumbers: readonly string[]): Promise<Map<string, AtlasPageFinding>> {
  const numbers = unique(atlasNumbers);
  const found = new Map<string, AtlasPageFinding>();
  for (let start = 0; start < numbers.length; start += READ_CHUNK) {
    for (const finding of await reads.readFindings(numbers.slice(start, start + READ_CHUNK))) {
      found.set(finding.atlasNumber, finding);
    }
  }
  return found;
}

/** Whether an accepted finding shows on the pages: written, its latest wording not erased, and not withdrawn. */
function canonicalShows(finding: AtlasPageFinding | undefined): finding is AtlasPageFinding {
  return finding !== undefined && !finding.erased && finding.label !== "withdrawn";
}

interface RelatedFinding {
  label: AtlasLabel;
  /** The lowest-numbered publication that shows it, if any. */
  publicationNumber: string | null;
}

/** The findings a page points to, each with its label and the publication that shows it, if any. */
async function relatedFindings(reads: AtlasPageReads, atlasNumbers: readonly string[]): Promise<Map<string, RelatedFinding>> {
  const numbers = unique(atlasNumbers);
  const related = new Map<string, RelatedFinding>();
  if (numbers.length === 0) return related;
  const findings = await readFindings(reads, numbers);
  const publications: AtlasPagePublication[] = [];
  for (let start = 0; start < numbers.length; start += READ_CHUNK) {
    publications.push(...await reads.listPublications({
      atlasNumbers: numbers.slice(start, start + READ_CHUNK),
      states: ["accepted", "edited"],
      limit: READ_CHUNK,
    }));
  }
  for (const [atlasNumber, finding] of findings) {
    const publication = canonicalShows(finding)
      ? publications.filter((candidate) => candidate.atlasNumber === atlasNumber).sort(byPublicationNumber)[0]
      : undefined;
    related.set(atlasNumber, { label: finding.label, publicationNumber: publication?.publicationNumber ?? null });
  }
  return related;
}

function fromPublished(publication: AtlasPagePublication, published: AtlasPublishedFinding): ShownFinding {
  return {
    publicationNumber: publication.publicationNumber,
    status: { kind: "unreviewed" },
    topic: published.topic === null ? null : { key: published.topic.key, label: published.topic.label },
    claim: published.claim,
    certainty: published.certainty,
    appliesTo: published.applies_to,
    kind: published.kind,
    subject: published.subject,
    subjectType: published.subject_type,
    direction: published.direction,
    numbers: (published.numbers ?? []).map((entry) => ({
      outcome: entry.outcome,
      better: entry.better,
      option: entry.option,
      optionEvents: entry.option_events,
      optionTotal: entry.option_total,
      comparator: entry.comparator,
      comparatorEvents: entry.comparator_events,
      comparatorTotal: entry.comparator_total,
      followUp: entry.follow_up,
      harmsNoneFound: entry.harms_none_found === true,
    })),
    searches: (published.searches ?? []).map((search) => ({
      database: search.database,
      query: search.query,
      dateRange: search.date_range === undefined ? null : { start: search.date_range.start, end: search.date_range.end },
    })),
    sources: published.sources.flatMap((source) => {
      const identifier = sourceIdentifierOf(source);
      return identifier === undefined ? [] : [[identifier]];
    }),
    whyNotUsual: published.why_not_usual,
    whatWouldChangeIt: published.what_would_change_it,
    verifiedBases: [...published.verified_bases],
    savedOn: published.saved_on,
    researchCheckedOn: null,
    askrigorVersion: published.askrigor_version === "unknown" ? null : published.askrigor_version,
    contested: [],
    replacedBy: [],
    publishedAt: publication.publishedAt,
    stateChangedAt: publication.stateChangedAt,
  };
}

function fromCanonical(
  publication: AtlasPagePublication,
  finding: AtlasPageFinding,
  related: ReadonlyMap<string, RelatedFinding>,
): ShownFinding {
  const content = finding.content;
  const label = finding.label as Exclude<AtlasLabel, "withdrawn">;
  return {
    publicationNumber: publication.publicationNumber,
    status: {
      kind: label,
      atlasNumber: finding.atlasNumber,
      checkedOn: finding.acceptedOn ?? publication.stateChangedAt.slice(0, 10),
    },
    topic: finding.topic,
    claim: content.wording,
    certainty: content.certainty,
    appliesTo: content.appliesTo,
    kind: content.kind ?? null,
    subject: content.subject ?? null,
    subjectType: content.subjectType ?? null,
    direction: content.direction ?? null,
    numbers: content.numbers.map((entry) => ({
      outcome: entry.outcome,
      better: entry.better,
      option: entry.option,
      optionEvents: entry.option_events,
      optionTotal: entry.option_total,
      comparator: entry.comparator,
      comparatorEvents: entry.comparator_events,
      comparatorTotal: entry.comparator_total,
      followUp: entry.follow_up,
      harmsNoneFound: entry.harms_none_found === true,
    })),
    searches: (content.searchScope ?? []).map((search) => ({
      database: search.database,
      query: search.query,
      dateRange: search.dateRange === undefined ? null : { start: search.dateRange.start, end: search.dateRange.end },
    })),
    sources: finding.sources
      .map((identifiers) => identifiers.filter(canonicalIdentifier))
      .filter((identifiers) => identifiers.length > 0),
    whyNotUsual: content.whyNotUsual,
    whatWouldChangeIt: content.whatWouldChangeIt,
    verifiedBases: [...content.verifiedBases],
    savedOn: null,
    researchCheckedOn: finding.researchCheckedOn,
    askrigorVersion: finding.askrigorVersion,
    // Only partners that make it contested (atlasLabelOf): not withdrawn, superseded or a lead.
    contested: label !== "contested" ? [] : finding.contradicts.flatMap(({ atlasNumber, disagreement }) => {
      const partner = related.get(atlasNumber);
      return partner === undefined || ["withdrawn", "superseded", "lead"].includes(partner.label) ? []
        : [{ atlasNumber, publicationNumber: partner.publicationNumber, disagreement }];
    }),
    replacedBy: label !== "superseded" ? [] : finding.replacedBy.map((atlasNumber) =>
      ({ atlasNumber, publicationNumber: related.get(atlasNumber)?.publicationNumber ?? null })),
    publishedAt: publication.publishedAt,
    stateChangedAt: publication.stateChangedAt,
  };
}

/** What a publication shows, or undefined when it shows nowhere. */
function shownFindingOf(
  publication: AtlasPagePublication,
  findings: ReadonlyMap<string, AtlasPageFinding>,
  related: ReadonlyMap<string, RelatedFinding> = new Map(),
): ShownFinding | undefined {
  if (publication.state === "unreviewed") {
    return publication.published === null ? undefined : fromPublished(publication, publication.published);
  }
  const finding = publication.atlasNumber === null ? undefined : findings.get(publication.atlasNumber);
  return canonicalShows(finding) ? fromCanonical(publication, finding, related) : undefined;
}

async function shownFindings(reads: AtlasPageReads, publications: readonly AtlasPagePublication[]): Promise<ShownFinding[]> {
  const findings = await readFindings(reads, publications.flatMap(({ atlasNumber }) => atlasNumber === null ? [] : [atlasNumber]));
  return publications.flatMap((publication) => {
    const shown = shownFindingOf(publication, findings);
    return shown === undefined ? [] : [shown];
  });
}

/** One entry per accepted finding (two publications can show one F number after a re-check): the first in order. */
function oncePerFinding(findings: readonly ShownFinding[]): ShownFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (finding.status.kind === "unreviewed") return true;
    if (seen.has(finding.status.atlasNumber)) return false;
    seen.add(finding.status.atlasNumber);
    return true;
  });
}

/** Leads and superseded findings never go in a home lane (organization draft, sections 3 and 4). */
const inLanes = (finding: ShownFinding) => finding.status.kind !== "lead" && finding.status.kind !== "superseded";

const CERTAINTY_RANK: Record<AtlasCertainty, number> = { high: 0, moderate: 1, low: 2, very_low: 3 };
const certaintyRank = (finding: ShownFinding) => finding.certainty === null ? 4 : CERTAINTY_RANK[finding.certainty];

// The pages' models ---------------------------------------------------------------------------------------------------

/** The home page: the owner's picks with their reasons, then recently published, recently checked and contested findings. */
export async function loadAtlasHome(source: AtlasPageSource): Promise<AtlasHomeModel> {
  return await source.read(async (reads) => {
    const pickRows = await reads.listHomePicks();
    let picks: AtlasOwnerPick[] = [];
    if (pickRows.length > 0) {
      const pickPublications = await reads.listPublications({
        publicationNumbers: pickRows.map(({ publicationNumber }) => publicationNumber), limit: pickRows.length,
      });
      const shownPicks = new Map((await shownFindings(reads, pickPublications))
        .map((finding) => [finding.publicationNumber, finding]));
      // A reason the pages' last check would refuse is left out with its pick, so it cannot stop the home page.
      picks = pickRows.flatMap(({ publicationNumber, reason }) => {
        const finding = shownPicks.get(publicationNumber);
        return finding === undefined || !passesPageGuard(reason) ? [] : [{ finding, reason }];
      });
    }

    const published = await shownFindings(reads, await reads.listPublications({ order: "published", limit: LANE_READ }));
    const recentlyPublished = oncePerFinding(published.filter(inLanes)).slice(0, ATLAS_LANE_SIZES.published);

    const checked = await shownFindings(reads, await reads.listPublications({
      states: ["accepted", "edited"], order: "changed", limit: LANE_READ,
    }));
    const recentlyChecked = oncePerFinding(checked.filter(inLanes)
      .sort((left, right) => checkedDay(right).localeCompare(checkedDay(left)) ||
        Date.parse(right.stateChangedAt) - Date.parse(left.stateChangedAt)))
      .slice(0, ATLAS_LANE_SIZES.checked);

    return { picks, recentlyPublished, recentlyChecked, contested: await contestedPairs(reads) };
  });
}

const checkedDay = (finding: ShownFinding) => finding.status.kind === "unreviewed" ? "" : finding.status.checkedOn;

/** The contested lane: the newest unwithdrawn contradicts links whose findings show as contested. */
async function contestedPairs(reads: AtlasPageReads): Promise<AtlasContestedPair[]> {
  const contradictions = await reads.listContradictions(CONTRADICTIONS_READ);
  if (contradictions.length === 0) return [];
  const numbers = unique(contradictions.flatMap(({ fromNumber, toNumber }) => [fromNumber, toNumber]));
  const publications = (await reads.listPublications({ atlasNumbers: numbers, states: ["accepted", "edited"], limit: READ_CHUNK }))
    .sort(byPublicationNumber);
  const shown = await shownFindings(reads, publications);
  const byNumber = new Map<string, ShownFinding>();
  for (const finding of shown) {
    if (finding.status.kind === "contested" && !byNumber.has(finding.status.atlasNumber)) {
      byNumber.set(finding.status.atlasNumber, finding);
    }
  }
  const pairs: AtlasContestedPair[] = [];
  const seen = new Set<string>();
  for (const { fromNumber, toNumber, disagreement } of contradictions) {
    const key = [fromNumber, toNumber].sort().join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    const findings = [fromNumber, toNumber].flatMap((number) => byNumber.get(number) ?? []);
    if (findings.length > 0) pairs.push({ disagreement, findings });
    if (pairs.length === ATLAS_LANE_SIZES.contested) break;
  }
  return pairs;
}

/** A topic page: the findings on the topic, by section; undefined when none shows. */
export async function loadAtlasTopic(source: AtlasPageSource, topicKey: string): Promise<AtlasTopicModel | undefined> {
  return await source.read(async (reads) => {
    const shown = oncePerFinding(await shownFindings(reads,
      await reads.listPublications({ topicKey, limit: ATLAS_TOPIC_FINDINGS })))
      // A finding shows on the page of the topic it shows with.
      .filter((finding) => finding.topic?.key === topicKey);
    if (shown.length === 0) return undefined;
    const label = shown.find((finding) => finding.status.kind !== "unreviewed")?.topic?.label ??
      shown[0]!.topic!.label;
    const order = (left: ShownFinding, right: ShownFinding) =>
      Number(left.status.kind === "unreviewed") - Number(right.status.kind === "unreviewed") ||
      certaintyRank(left) - certaintyRank(right) ||
      Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    const sections = TOPIC_SECTIONS.map(({ id, heading }) => ({
      id,
      heading,
      findings: shown.filter((finding) => topicSectionOf(finding) === id).sort(order),
    })).filter(({ findings }) => findings.length > 0);
    return { topic: { key: topicKey, label }, sections };
  });
}

/** Which section of a topic page a finding goes under: by its label, then its kind. */
export function topicSectionOf(finding: ShownFinding): TopicSectionId {
  if (finding.status.kind === "lead") return "leads";
  if (finding.status.kind === "superseded") return "earlier";
  switch (finding.kind) {
    case "effect":
    case "overlooked_option":
      return "options";
    case "harm":
      return "harms";
    case "tested_vs_sold":
      return "products";
    case "correction":
      return "corrections";
    case "nothing_found":
      return "nothing_found";
    default:
      return "other";
  }
}

/**
 * A finding page; undefined when the publication does not show. With participation, its votes and comments are read in
 * the same snapshot, with the signed-in viewer's own when a participant key is given.
 */
export async function loadAtlasFinding(
  source: AtlasPageSource,
  publicationNumber: string,
  options: { participation?: { participantKey: string | null; before?: number } } = {},
): Promise<AtlasFindingModel | undefined> {
  return await source.read(async (reads) => {
    const [publication] = await reads.listPublications({ publicationNumbers: [publicationNumber], limit: 1 });
    if (publication === undefined) return undefined;
    const findings = publication.atlasNumber === null ? new Map<string, AtlasPageFinding>()
      : await readFindings(reads, [publication.atlasNumber]);
    const finding = publication.atlasNumber === null ? undefined : findings.get(publication.atlasNumber);
    const partners = finding === undefined ? []
      : [...finding.contradicts.map(({ atlasNumber }) => atlasNumber), ...finding.replacedBy];
    const related = await relatedFindings(reads, partners);
    const shown = shownFindingOf(publication, findings, related);
    if (shown === undefined) return undefined;
    const participation = options.participation === undefined ? null
      : await reads.readParticipation(publicationNumber, options.participation.participantKey, options.participation.before);
    return { finding: shown, participation };
  });
}

/**
 * A signed-in reader's own page: their votes on every publication (the newest publication first) and their comments in
 * every state (newest first), each list a page at a time, with whether more remain.
 */
export interface AtlasOwnCommentsModel {
  comments: AtlasPageOwnComment[];
  more: boolean;
  votes: AtlasPageOwnVote[];
  moreVotes: boolean;
}

export async function loadAtlasOwnComments(source: AtlasPageSource, participantKey: string, before?: number,
  votesBefore?: number): Promise<AtlasOwnCommentsModel> {
  return await source.read(async (reads) => {
    const rows = await reads.listOwnComments(participantKey, before, ATLAS_OWN_COMMENTS_PER_PAGE + 1);
    const votes = await reads.listOwnVotes(participantKey, votesBefore, ATLAS_OWN_VOTES_PER_PAGE + 1);
    return {
      comments: rows.slice(0, ATLAS_OWN_COMMENTS_PER_PAGE),
      more: rows.length > ATLAS_OWN_COMMENTS_PER_PAGE,
      votes: votes.slice(0, ATLAS_OWN_VOTES_PER_PAGE),
      moreVotes: votes.length > ATLAS_OWN_VOTES_PER_PAGE,
    };
  });
}

/**
 * The "what changed" page: each shown finding's publication, and the change records of the accepted findings the
 * pages show (checked, edited, corrected with its public note, checked again, relabeled), newest first. A finding the
 * owner withdrew after acceptance is listed as withdrawn, with its public note and F number, and nothing else of it.
 */
export async function loadAtlasChanges(source: AtlasPageSource): Promise<AtlasChangesModel> {
  return await source.read(async (reads) => {
    const published = await reads.listPublications({ order: "published", limit: ATLAS_CHANGE_ENTRIES });
    const changes = await reads.listChanges(CHANGES_READ);
    const changedNumbers = unique(changes.map(({ atlasNumber }) => atlasNumber));
    const changedPublications: AtlasPagePublication[] = [];
    for (let start = 0; start < changedNumbers.length; start += READ_CHUNK) {
      changedPublications.push(...await reads.listPublications({
        atlasNumbers: changedNumbers.slice(start, start + READ_CHUNK), states: ["accepted", "edited"], limit: READ_CHUNK,
      }));
    }
    const publications = [...new Map([...published, ...changedPublications]
      .map((publication) => [publication.publicationNumber, publication])).values()];
    const shown = new Map((await shownFindings(reads, publications))
      .map((finding) => [finding.publicationNumber, finding]));
    const byAtlasNumber = new Map<string, ShownFinding>();
    for (const publication of [...changedPublications].sort(byPublicationNumber)) {
      const finding = shown.get(publication.publicationNumber);
      if (finding !== undefined && !byAtlasNumber.has(publication.atlasNumber!)) {
        byAtlasNumber.set(publication.atlasNumber!, finding);
      }
    }
    const onPages = new Set(changedPublications.map(({ atlasNumber }) => atlasNumber!));
    const entries: AtlasChangeEntry[] = [];
    for (const publication of published) {
      const finding = shown.get(publication.publicationNumber);
      if (finding === undefined) continue;
      entries.push({
        at: publication.publishedAt,
        kind: "published",
        atlasNumber: finding.status.kind === "unreviewed" ? null : finding.status.atlasNumber,
        finding,
        labelBefore: null,
        labelAfter: null,
        note: null,
      });
    }
    for (const change of changes) {
      if (change.kind === "withdrawn") {
        // Withdrawn after acceptance: listed only if a publication had put it on the pages.
        if (onPages.has(change.atlasNumber)) {
          entries.push({
            at: change.decidedAt, kind: "withdrawn", atlasNumber: change.atlasNumber, finding: null,
            labelBefore: change.labelBefore, labelAfter: change.labelAfter, note: change.publicNote,
          });
        }
        continue;
      }
      const finding = byAtlasNumber.get(change.atlasNumber);
      if (finding === undefined) continue;
      entries.push({
        at: change.decidedAt, kind: change.kind, atlasNumber: change.atlasNumber, finding,
        labelBefore: change.labelBefore, labelAfter: change.labelAfter, note: change.publicNote,
      });
    }
    entries.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
    return { entries: entries.slice(0, ATLAS_CHANGE_ENTRIES) };
  });
}
