import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import {
  ATLAS_ERASED_TEXT,
  ATLAS_LABELS,
  assertSafeAtlasSchema,
  atlasCurrentLabels,
  atlasPool,
  type AtlasLabel,
  type AtlasState,
  type AtlasVersionContent,
  type InMemoryAtlasCanonicalStore,
  type PostgresAtlasStoreOptions,
} from "./atlas-findings.js";
import { readAtlasStateWith } from "./atlas-postgres.js";
import {
  ATLAS_COMMENTS_PER_PAGE,
  atlasCommentId,
  type AtlasPageParticipation,
  type InMemoryAtlasParticipation,
} from "./atlas-participation.js";
import {
  atlasPublicationOrder,
  atlasPublishedFindingSchema,
  type AtlasPublishedFinding,
  type InMemoryAtlasPublicationStore,
} from "./atlas-publications.js";

// Decision 171, section 4C (plan docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md; design
// docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, section C): what the public Atlas pages read. A page
// shows a publication that is unreviewed (its published fields, with the label "Not checked by supervisors yet"),
// accepted or edited (its F number's latest version, as the owner accepted it); held, rejected and withdrawn ones are
// never read. The pages read through the public runtime's SELECT-only reader role, in one read-only snapshot, and
// select only a publication's public number, state, F number, published fields and dates: never its card number or
// digest, its finding's place on the card, the owner's private reason, or why it was held or withdrawn.

/** The publication states a page shows. */
export const ATLAS_PAGE_STATES = ["unreviewed", "accepted", "edited"] as const;
export type AtlasPageState = typeof ATLAS_PAGE_STATES[number];
/** The most publications one read returns, and the most F numbers one read of findings takes. */
export const ATLAS_PAGE_PUBLICATIONS_PER_READ = 500;
export const ATLAS_PAGE_FINDINGS_PER_READ = 500;
/** The change kinds the pages list (an erasure's wording_removed is not one of them). */
export const ATLAS_PAGE_CHANGE_KINDS = ["accepted", "edited", "corrected", "withdrawn", "rechecked", "relabeled"] as const;
export type AtlasPageChangeKind = typeof ATLAS_PAGE_CHANGE_KINDS[number];
/** The identifier schemes a page links a source by. */
export const ATLAS_PAGE_SOURCE_SCHEMES = ["doi", "pmid", "pmcid", "nct"] as const;
export type AtlasPageSourceScheme = typeof ATLAS_PAGE_SOURCE_SCHEMES[number];

const PUBLICATION_NUMBER = /^P-[1-9][0-9]{3,}$/u;
const ATLAS_NUMBER = /^F-[1-9][0-9]{3,}$/u;
const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{0,199}$/u;

/** A publication as the pages read it: nothing that names its card, and nothing the owner keeps private. */
export interface AtlasPagePublication {
  /** P-1001 onward, never an ARF number. */
  publicationNumber: string;
  state: AtlasPageState;
  /** The F number of an accepted or edited publication. */
  atlasNumber: string | null;
  /** Its published fields; null once erased (an unreviewed publication is read only with them). */
  published: AtlasPublishedFinding | null;
  publishedAt: string;
  stateChangedAt: string;
}

export interface AtlasPagePublicationQuery {
  publicationNumbers?: readonly string[];
  atlasNumbers?: readonly string[];
  /** An unreviewed publication by its published topic key; an accepted or edited one by its F number's topic key. */
  topicKey?: string;
  states?: readonly AtlasPageState[];
  /** published (the default): newest published first; changed: newest state change first. */
  order?: "published" | "changed";
  /** 1 to ATLAS_PAGE_PUBLICATIONS_PER_READ. */
  limit: number;
}

/** One source of an accepted finding, by its identifiers in canonical form. */
export type AtlasPageSourceIdentifiers = Array<{ scheme: AtlasPageSourceScheme; value: string }>;

/** An accepted finding as its pages read it: its F number's latest version, and what its label and dates need. */
export interface AtlasPageFinding {
  atlasNumber: string;
  entryKind: "finding" | "lead";
  label: AtlasLabel;
  topic: { key: string; label: string } | null;
  versionNumber: number;
  content: AtlasVersionContent;
  /** Whether a redaction erased the latest version's wording (decision 7): the pages then show nothing of it. */
  erased: boolean;
  /** The day the owner accepted it (its accepted change), YYYY-MM-DD; null if no accepted change is recorded. */
  acceptedOn: string | null;
  /** The newest research day: the latest version's, or a later re-check's. */
  researchCheckedOn: string;
  askrigorVersion: string;
  /** The latest version's sources, each by the identifiers its source family holds. */
  sources: AtlasPageSourceIdentifiers[];
  /** The unwithdrawn contradicts links that join it to another finding, with what the two disagree on. */
  contradicts: Array<{ atlasNumber: string; disagreement: string | null }>;
  /** The findings an unwithdrawn replaces link names as replacing it. */
  replacedBy: string[];
}

/** An unwithdrawn contradicts link between two accepted findings. */
export interface AtlasPageContradiction {
  fromNumber: string;
  toNumber: string;
  disagreement: string | null;
  decidedAt: string;
}

/** A change record of an accepted finding, as the "what changed" page lists it. */
export interface AtlasPageChange {
  atlasNumber: string;
  kind: AtlasPageChangeKind;
  labelBefore: AtlasLabel | null;
  labelAfter: AtlasLabel;
  /** The change's public dated note (5a), when it has one whose wording was not erased. */
  publicNote: string | null;
  decidedAt: string;
}

/** One of the owner's picks for the home page (decision 2a), with the owner's public reason. */
export interface AtlasPageHomePick {
  slot: number;
  publicationNumber: string;
  reason: string;
}

/** The reads one page makes, inside one snapshot. */
export interface AtlasPageReads {
  /** Publications in a state the pages show: unreviewed with its published fields, accepted or edited. */
  listPublications(query: AtlasPagePublicationQuery): Promise<AtlasPagePublication[]>;
  /** The accepted findings these F numbers name; an F number the canonical writer has not written yet is absent. */
  readFindings(atlasNumbers: readonly string[]): Promise<AtlasPageFinding[]>;
  /** Unwithdrawn contradicts links, newest first. */
  listContradictions(limit: number): Promise<AtlasPageContradiction[]>;
  /** Change records of the kinds the pages list, newest first. */
  listChanges(limit: number): Promise<AtlasPageChange[]>;
  /**
   * A publication's vote totals and the comments that show (section 4E), with the signed-in viewer's own vote, display
   * name and comments when a participant key is given; never another participant's key.
   */
  readParticipation(publicationNumber: string, participantKey: string | null): Promise<AtlasPageParticipation>;
  /** The owner's picks for the home page, in order. */
  listHomePicks(): Promise<AtlasPageHomePick[]>;
}

/** Where the pages read from: each page's reads run in one read-only snapshot. */
export interface AtlasPageSource {
  read<T>(work: (reads: AtlasPageReads) => Promise<T>): Promise<T>;
}

export class AtlasPageQueryError extends Error {
  constructor() {
    super("ATLAS_PAGE_QUERY_INVALID");
  }
}

function validateLimit(limit: number, max: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > max) throw new AtlasPageQueryError();
  return limit;
}

function validatePublicationQuery(query: AtlasPagePublicationQuery): Required<Pick<AtlasPagePublicationQuery, "order">> &
  AtlasPagePublicationQuery {
  validateLimit(query.limit, ATLAS_PAGE_PUBLICATIONS_PER_READ);
  if ((query.publicationNumbers !== undefined && !query.publicationNumbers.every((number) => PUBLICATION_NUMBER.test(number))) ||
    (query.atlasNumbers !== undefined && !query.atlasNumbers.every((number) => ATLAS_NUMBER.test(number))) ||
    (query.topicKey !== undefined && !TOPIC_KEY.test(query.topicKey)) ||
    (query.states !== undefined && !query.states.every((state) => (ATLAS_PAGE_STATES as readonly string[]).includes(state))) ||
    (query.order !== undefined && query.order !== "published" && query.order !== "changed")) {
    throw new AtlasPageQueryError();
  }
  return { ...query, order: query.order ?? "published" };
}

function validateAtlasNumbers(atlasNumbers: readonly string[]): string[] {
  const unique = [...new Set(atlasNumbers)];
  if (unique.length > ATLAS_PAGE_FINDINGS_PER_READ || !unique.every((number) => ATLAS_NUMBER.test(number))) {
    throw new AtlasPageQueryError();
  }
  return unique;
}

/**
 * A publication row as a page reads it, or undefined when it is not one a page shows: an unreviewed one needs
 * published fields that read as the publication schema has them; an accepted or edited one is read without them if
 * they were erased or do not read.
 */
function pagePublicationOf(row: {
  publicationNumber: string;
  state: string;
  atlasNumber: string | null;
  published: unknown;
  publishedAt: string;
  stateChangedAt: string;
}): AtlasPagePublication | undefined {
  const state = (ATLAS_PAGE_STATES as readonly string[]).includes(row.state) ? row.state as AtlasPageState : undefined;
  if (state === undefined || !PUBLICATION_NUMBER.test(row.publicationNumber)) return undefined;
  const parsed = row.published === null ? undefined : atlasPublishedFindingSchema.safeParse(row.published);
  const published = parsed?.success === true ? parsed.data : null;
  if (state === "unreviewed" && published === null) return undefined;
  if (state !== "unreviewed" && (row.atlasNumber === null || !ATLAS_NUMBER.test(row.atlasNumber))) return undefined;
  return {
    publicationNumber: row.publicationNumber,
    state,
    atlasNumber: state === "unreviewed" ? null : row.atlasNumber,
    published,
    publishedAt: row.publishedAt,
    stateChangedAt: row.stateChangedAt,
  };
}

const laterDay = (left: string, right: string | null) => right !== null && right > left ? right : left;

/**
 * The accepted findings an Atlas state holds for these F numbers, assembled the same way for PostgreSQL and memory:
 * each one's latest version, its label (atlasLabelOf, from the state's links and partners), its topic, its latest
 * version's sources by their families' identifiers, its contradicts partners and what replaces it, and its dates.
 */
export function atlasPageFindingsOf(
  state: AtlasState,
  atlasNumbers: readonly string[],
  dates: ReadonlyMap<string, { acceptedOn: string | null; recheckedOn: string | null }>,
): AtlasPageFinding[] {
  const wanted = new Set(atlasNumbers);
  const seeds = state.findings.filter((finding) => wanted.has(finding.publicNumber) && finding.versions.length > 0);
  const labels = atlasCurrentLabels(state, seeds.map(({ findingId }) => findingId));
  const numberOf = new Map(state.findings.map((finding) => [finding.findingId, finding.publicNumber]));
  const topics = new Map(state.topics.map((topic) => [topic.topicId, topic]));
  const families = new Map(state.sourceFamilies.map((family) => [family.familyId, family]));
  return seeds.map((finding) => {
    const latest = finding.versions.at(-1)!;
    const topic = topics.get(finding.topicId);
    const familyIds = [...new Set(latest.bindings.map(({ familyId }) => familyId))];
    const sources = familyIds.flatMap((familyId): AtlasPageSourceIdentifiers[] => {
      const identifiers = (families.get(familyId)?.identifiers ?? [])
        .filter((identifier): identifier is { scheme: AtlasPageSourceScheme; value: string } =>
          (ATLAS_PAGE_SOURCE_SCHEMES as readonly string[]).includes(identifier.scheme))
        .map(({ scheme, value }) => ({ scheme, value }))
        .sort((left, right) => ATLAS_PAGE_SOURCE_SCHEMES.indexOf(left.scheme) - ATLAS_PAGE_SOURCE_SCHEMES.indexOf(right.scheme) ||
          left.value.localeCompare(right.value));
      return identifiers.length === 0 ? [] : [identifiers];
    });
    const live = state.links.filter((link) => !link.withdrawn);
    const contradicts = live
      .filter((link) => link.relation === "contradicts" &&
        (link.fromFindingId === finding.findingId || link.toFindingId === finding.findingId))
      .flatMap((link) => {
        const other = numberOf.get(link.fromFindingId === finding.findingId ? link.toFindingId : link.fromFindingId);
        return other === undefined ? [] : [{ atlasNumber: other, disagreement: link.disagreement }];
      });
    const replacedBy = live
      .filter((link) => link.relation === "replaces" && link.toFindingId === finding.findingId)
      .flatMap((link) => {
        const other = numberOf.get(link.fromFindingId);
        return other === undefined ? [] : [other];
      });
    const dated = dates.get(finding.publicNumber);
    return {
      atlasNumber: finding.publicNumber,
      entryKind: finding.entryKind,
      label: labels.get(finding.findingId)!,
      topic: topic === undefined ? null : { key: topic.canonicalKey, label: topic.label },
      versionNumber: latest.versionNumber,
      content: structuredClone(latest.content),
      erased: latest.erased || latest.content.wording === ATLAS_ERASED_TEXT,
      acceptedOn: dated?.acceptedOn ?? null,
      researchCheckedOn: laterDay(latest.researchCheckedOn, dated?.recheckedOn ?? null),
      askrigorVersion: latest.madeWith.askrigorVersion,
      sources,
      contradicts,
      replacedBy,
    };
  }).sort((left, right) => left.atlasNumber.localeCompare(right.atlasNumber, "en", { numeric: true }));
}

const instant = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();
const noteOf = (note: string | null) => note === null || note === ATLAS_ERASED_TEXT ? null : note;
const labelSchema = z.enum(ATLAS_LABELS);
const changeKindSchema = z.enum(ATLAS_PAGE_CHANGE_KINDS);

// PostgreSQL ---------------------------------------------------------------------------------------------------------

// The only columns of atlas_publications a page reads.
const PAGE_PUBLICATION_COLUMNS = "listed.publication_number, listed.state, listed.atlas_number, listed.published_json, " +
  "listed.published_at, listed.state_changed_at";

function publicationsSql(order: "published" | "changed"): string {
  return `SELECT ${PAGE_PUBLICATION_COLUMNS}
    FROM atlas_publications listed
   WHERE ((listed.state = 'unreviewed' AND listed.published_json IS NOT NULL)
          OR listed.state IN ('accepted', 'edited'))
     AND ($1::text[] IS NULL OR listed.state = ANY($1::text[]))
     AND ($2::text[] IS NULL OR listed.publication_number = ANY($2::text[]))
     AND ($3::text[] IS NULL OR listed.atlas_number = ANY($3::text[]))
     AND ($4::text IS NULL
          OR (listed.state = 'unreviewed' AND listed.published_json -> 'topic' ->> 'key' = $4::text)
          OR (listed.state IN ('accepted', 'edited') AND EXISTS (
            SELECT 1
              FROM atlas_findings finding
              JOIN claims claim ON claim.claim_id = finding.claim_id
              JOIN questions question ON question.question_id = claim.question_id
              JOIN topics topic ON topic.topic_id = question.topic_id
             WHERE finding.public_number = listed.atlas_number
               AND topic.canonical_key = $4::text)))
   ORDER BY ${order === "changed" ? "listed.state_changed_at" : "listed.published_at"} DESC,
            substring(listed.publication_number FROM 3)::bigint DESC
   LIMIT $5`;
}

const DATES_SQL = `SELECT finding.public_number,
       min(recorded.decided_at) FILTER (WHERE recorded.change_kind = 'accepted') AS accepted_at,
       to_char(max(recorded.research_checked_on) FILTER (WHERE recorded.change_kind = 'rechecked'), 'YYYY-MM-DD')
         AS rechecked_on
  FROM atlas_findings finding
  JOIN atlas_finding_changes recorded ON recorded.finding_id = finding.finding_id
 WHERE finding.public_number = ANY($1::text[])
 GROUP BY finding.public_number`;

const CONTRADICTIONS_SQL = `SELECT from_finding.public_number AS from_number, to_finding.public_number AS to_number,
       link.disagreement, link.decided_at
  FROM atlas_finding_links link
  JOIN atlas_findings from_finding ON from_finding.finding_id = link.from_finding_id
  JOIN atlas_findings to_finding ON to_finding.finding_id = link.to_finding_id
 WHERE link.relation = 'contradicts'
   AND NOT EXISTS (
     SELECT 1 FROM atlas_finding_link_withdrawals withdrawal WHERE withdrawal.link_id = link.link_id
   )
 ORDER BY link.decided_at DESC, link.link_id
 LIMIT $1`;

const CHANGES_SQL = `SELECT finding.public_number, recorded.change_kind, recorded.label_before, recorded.label_after,
       recorded.public_note, recorded.decided_at
  FROM atlas_finding_changes recorded
  JOIN atlas_findings finding ON finding.finding_id = recorded.finding_id
 WHERE recorded.change_kind = ANY($1::text[])
 ORDER BY recorded.decided_at DESC, recorded.inserted_at DESC, recorded.change_id
 LIMIT $2`;

/** readAtlasStateWith takes at most 100 F numbers in one request. */
const STATE_REQUEST_NUMBERS = 100;

// What a finding page reads of its votes and comments (section 4E): totals, and the comments that show with the display
// name each was posted under; a participant's key only to find the signed-in viewer's own rows.
const VOTE_TOTALS_SQL = `SELECT count(*) FILTER (WHERE counted.vote = 'agree') AS agree,
       count(*) FILTER (WHERE counted.vote = 'disagree') AS disagree
  FROM atlas_votes counted
 WHERE counted.publication_number = $1`;
// A commenter's marker is the start of their tag; the key itself is only joined on, never read out.
const SHOWN_COMMENTS_SQL = `SELECT shown.comment_number, shown.display_name, shown.body, shown.posted_at,
       substr(author.commenter_tag, 3, 6) AS marker
  FROM atlas_comments shown
  JOIN atlas_participants author ON author.participant_key = shown.participant_key
 WHERE shown.publication_number = $1 AND shown.state = 'shown'
 ORDER BY shown.comment_number
 LIMIT $2`;
const VIEWER_SQL = `SELECT viewer.display_name, viewer.stopped_at IS NOT NULL AS stopped
  FROM atlas_participants viewer
 WHERE viewer.participant_key = $1`;
const VIEWER_VOTE_SQL = `SELECT own.vote FROM atlas_votes own WHERE own.publication_number = $1 AND own.participant_key = $2`;
const VIEWER_COMMENTS_SQL = `SELECT own.comment_number FROM atlas_comments own
 WHERE own.publication_number = $1 AND own.participant_key = $2
 ORDER BY own.comment_number`;
const HOME_PICKS_SQL = `SELECT pick.slot, pick.publication_number, pick.reason FROM atlas_home_picks pick ORDER BY pick.slot`;

const PARTICIPANT_KEY = /^[a-f0-9]{64}$/u;

function validateParticipationRead(publicationNumber: string, participantKey: string | null): void {
  if (!PUBLICATION_NUMBER.test(publicationNumber) || (participantKey !== null && !PARTICIPANT_KEY.test(participantKey))) {
    throw new AtlasPageQueryError();
  }
}

function postgresReads(client: PoolClient): AtlasPageReads {
  return {
    async listPublications(raw) {
      const query = validatePublicationQuery(raw);
      const result = await client.query<{
        publication_number: string;
        state: string;
        atlas_number: string | null;
        published_json: unknown;
        published_at: Date | string;
        state_changed_at: Date | string;
      }>(publicationsSql(query.order), [
        query.states === undefined ? null : [...query.states],
        query.publicationNumbers === undefined ? null : [...query.publicationNumbers],
        query.atlasNumbers === undefined ? null : [...query.atlasNumbers],
        query.topicKey ?? null,
        query.limit,
      ]);
      return result.rows.flatMap((row) => {
        const publication = pagePublicationOf({
          publicationNumber: row.publication_number,
          state: row.state,
          atlasNumber: row.atlas_number,
          published: row.published_json,
          publishedAt: instant(row.published_at),
          stateChangedAt: instant(row.state_changed_at),
        });
        return publication === undefined ? [] : [publication];
      });
    },

    async readFindings(raw) {
      const atlasNumbers = validateAtlasNumbers(raw);
      if (atlasNumbers.length === 0) return [];
      const dates = new Map<string, { acceptedOn: string | null; recheckedOn: string | null }>();
      const dated = await client.query<{ public_number: string; accepted_at: Date | string | null; rechecked_on: string | null }>(
        DATES_SQL,
        [atlasNumbers],
      );
      for (const row of dated.rows) {
        dates.set(row.public_number, {
          acceptedOn: row.accepted_at === null ? null : instant(row.accepted_at).slice(0, 10),
          recheckedOn: row.rechecked_on,
        });
      }
      const findings: AtlasPageFinding[] = [];
      for (let start = 0; start < atlasNumbers.length; start += STATE_REQUEST_NUMBERS) {
        const chunk = atlasNumbers.slice(start, start + STATE_REQUEST_NUMBERS);
        const state = await readAtlasStateWith(client, { publicNumbers: chunk });
        findings.push(...atlasPageFindingsOf(state, chunk, dates));
      }
      return findings;
    },

    async listContradictions(limit) {
      const result = await client.query<{
        from_number: string;
        to_number: string;
        disagreement: string | null;
        decided_at: Date | string;
      }>(CONTRADICTIONS_SQL, [validateLimit(limit, ATLAS_PAGE_PUBLICATIONS_PER_READ)]);
      return result.rows.map((row) => ({
        fromNumber: row.from_number,
        toNumber: row.to_number,
        disagreement: row.disagreement,
        decidedAt: instant(row.decided_at),
      }));
    },

    async listChanges(limit) {
      const result = await client.query<{
        public_number: string;
        change_kind: string;
        label_before: string | null;
        label_after: string;
        public_note: string | null;
        decided_at: Date | string;
      }>(CHANGES_SQL, [[...ATLAS_PAGE_CHANGE_KINDS], validateLimit(limit, ATLAS_PAGE_PUBLICATIONS_PER_READ)]);
      return result.rows.map((row) => ({
        atlasNumber: row.public_number,
        kind: changeKindSchema.parse(row.change_kind),
        labelBefore: row.label_before === null ? null : labelSchema.parse(row.label_before),
        labelAfter: labelSchema.parse(row.label_after),
        publicNote: noteOf(row.public_note),
        decidedAt: instant(row.decided_at),
      }));
    },

    async readParticipation(publicationNumber, participantKey) {
      validateParticipationRead(publicationNumber, participantKey);
      const totals = (await client.query<{ agree: string | number; disagree: string | number }>(VOTE_TOTALS_SQL,
        [publicationNumber])).rows[0];
      const comments = (await client.query<{ comment_number: string | number; display_name: string; body: string;
        posted_at: Date | string; marker: string }>(SHOWN_COMMENTS_SQL, [publicationNumber, ATLAS_COMMENTS_PER_PAGE])).rows;
      let viewer: AtlasPageParticipation["viewer"] = null;
      if (participantKey !== null) {
        const [own] = (await client.query<{ display_name: string | null; stopped: boolean }>(VIEWER_SQL,
          [participantKey])).rows;
        const [vote] = (await client.query<{ vote: string }>(VIEWER_VOTE_SQL, [publicationNumber, participantKey])).rows;
        const ownComments = (await client.query<{ comment_number: string | number }>(VIEWER_COMMENTS_SQL,
          [publicationNumber, participantKey])).rows;
        viewer = {
          displayName: own?.display_name ?? null,
          stopped: own?.stopped === true,
          vote: vote === undefined ? null : z.enum(["agree", "disagree"]).parse(vote.vote),
          ownComments: ownComments.map(({ comment_number: number }) => atlasCommentId(Number(number))),
        };
      }
      return {
        agree: Number(totals?.agree ?? 0),
        disagree: Number(totals?.disagree ?? 0),
        comments: comments.map((row) => ({
          publicId: atlasCommentId(Number(row.comment_number)),
          displayName: row.display_name,
          body: row.body,
          postedAt: instant(row.posted_at),
          marker: z.string().regex(/^[a-f0-9]{6}$/u).parse(row.marker),
        })),
        viewer,
      };
    },

    async listHomePicks() {
      return (await client.query<{ slot: number; publication_number: string; reason: string }>(HOME_PICKS_SQL)).rows
        .map((row) => ({ slot: Number(row.slot), publicationNumber: row.publication_number, reason: row.reason }));
    },
  };
}

/**
 * The pages' reads in PostgreSQL, through the public runtime's SELECT-only reader role (the reader can select every
 * table; the pages select only what a page may show). Each page's reads run in one REPEATABLE READ READ ONLY
 * transaction, so a page never mixes two states of the Atlas.
 */
export class PostgresAtlasPageSource implements AtlasPageSource {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async read<T>(work: (reads: AtlasPageReads) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query(`SET LOCAL search_path TO ${this.schema}, public`);
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      const result = await work(postgresReads(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// In memory ------------------------------------------------------------------------------------------------------------

/**
 * The pages' reads over the in-memory publication and canonical stores, with the PostgreSQL reads' semantics, for tests
 * and the hermetic scenarios.
 */
export class InMemoryAtlasPageSource implements AtlasPageSource {
  constructor(private readonly stores: {
    publications: InMemoryAtlasPublicationStore;
    canonical?: InMemoryAtlasCanonicalStore;
    /** Votes, comments and picks (section 4E); none without it. */
    participation?: InMemoryAtlasParticipation;
  }) {}

  async read<T>(work: (reads: AtlasPageReads) => Promise<T>): Promise<T> {
    return await work(this.reads());
  }

  private async state(): Promise<AtlasState> {
    return this.stores.canonical === undefined
      ? { findings: [], links: [], replacesLinks: null, topics: [], questions: [], sourceFamilies: [], sourceVersions: [] }
      : await this.stores.canonical.readAtlasState({});
  }

  private rows() {
    return this.stores.canonical?.snapshot();
  }

  private reads(): AtlasPageReads {
    return {
      listPublications: async (raw) => {
        const query = validatePublicationQuery(raw);
        const state = await this.state();
        const topicKeyOf = new Map(state.findings.map((finding) =>
          [finding.publicNumber, state.topics.find(({ topicId }) => topicId === finding.topicId)?.canonicalKey]));
        const time = (row: { publishedAt: string; stateChangedAt: string }) =>
          Date.parse(query.order === "changed" ? row.stateChangedAt : row.publishedAt);
        return this.stores.publications.allRows()
          .filter((row) => (row.state === "unreviewed" && row.published !== null) ||
            row.state === "accepted" || row.state === "edited")
          .filter((row) => (query.states === undefined || (query.states as readonly string[]).includes(row.state)) &&
            (query.publicationNumbers === undefined || query.publicationNumbers.includes(row.publicationNumber)) &&
            (query.atlasNumbers === undefined || (row.atlasNumber !== null && query.atlasNumbers.includes(row.atlasNumber))) &&
            (query.topicKey === undefined || (row.state === "unreviewed"
              ? row.published?.topic?.key === query.topicKey
              : row.atlasNumber !== null && topicKeyOf.get(row.atlasNumber) === query.topicKey)))
          .sort((left, right) => time(right) - time(left) ||
            atlasPublicationOrder(right.publicationNumber) - atlasPublicationOrder(left.publicationNumber))
          .flatMap((row) => {
            const publication = pagePublicationOf(row);
            return publication === undefined ? [] : [publication];
          })
          .slice(0, query.limit);
      },

      readFindings: async (raw) => {
        const atlasNumbers = validateAtlasNumbers(raw);
        const state = await this.state();
        const rows = this.rows();
        const numberOf = new Map(state.findings.map((finding) => [finding.findingId, finding.publicNumber]));
        const dates = new Map<string, { acceptedOn: string | null; recheckedOn: string | null }>();
        for (const change of rows?.changes ?? []) {
          const number = numberOf.get(change.findingId);
          if (number === undefined) continue;
          const dated = dates.get(number) ?? { acceptedOn: null, recheckedOn: null };
          if (change.changeKind === "accepted") {
            const day = instant(change.decidedAt).slice(0, 10);
            if (dated.acceptedOn === null || day < dated.acceptedOn) dated.acceptedOn = day;
          }
          if (change.changeKind === "rechecked" && change.researchCheckedOn !== null) {
            dated.recheckedOn = laterDay(change.researchCheckedOn, dated.recheckedOn);
          }
          dates.set(number, dated);
        }
        return atlasPageFindingsOf(state, atlasNumbers, dates);
      },

      listContradictions: async (limit) => {
        validateLimit(limit, ATLAS_PAGE_PUBLICATIONS_PER_READ);
        const rows = this.rows();
        if (rows === undefined) return [];
        const withdrawn = new Set(rows.linkWithdrawals.map(({ linkId }) => linkId));
        const numberOf = new Map(rows.findings.map((finding) => [finding.findingId, finding.publicNumber]));
        return rows.links
          .filter((link) => link.relation === "contradicts" && !withdrawn.has(link.linkId))
          .sort((left, right) => Date.parse(right.decidedAt) - Date.parse(left.decidedAt) ||
            left.linkId.localeCompare(right.linkId))
          .slice(0, limit)
          .map((link) => ({
            fromNumber: numberOf.get(link.fromFindingId)!,
            toNumber: numberOf.get(link.toFindingId)!,
            disagreement: link.disagreement,
            decidedAt: instant(link.decidedAt),
          }));
      },

      listChanges: async (limit) => {
        validateLimit(limit, ATLAS_PAGE_PUBLICATIONS_PER_READ);
        const rows = this.rows();
        if (rows === undefined) return [];
        const numberOf = new Map(rows.findings.map((finding) => [finding.findingId, finding.publicNumber]));
        return rows.changes
          .map((change, position) => ({ change, position }))
          .filter(({ change }) => (ATLAS_PAGE_CHANGE_KINDS as readonly string[]).includes(change.changeKind))
          .sort((left, right) => Date.parse(right.change.decidedAt) - Date.parse(left.change.decidedAt) ||
            right.position - left.position)
          .slice(0, limit)
          .map(({ change }) => ({
            atlasNumber: numberOf.get(change.findingId)!,
            kind: change.changeKind as AtlasPageChangeKind,
            labelBefore: change.labelBefore,
            labelAfter: change.labelAfter,
            publicNote: noteOf(change.publicNote),
            decidedAt: instant(change.decidedAt),
          }));
      },

      readParticipation: async (publicationNumber, participantKey) => {
        validateParticipationRead(publicationNumber, participantKey);
        return this.stores.participation?.pageParticipation(publicationNumber, participantKey) ?? {
          agree: 0, disagree: 0, comments: [],
          viewer: participantKey === null ? null : { displayName: null, stopped: false, vote: null, ownComments: [] },
        };
      },

      listHomePicks: async () => (await this.stores.participation?.inspectHomePicks() ?? [])
        .map(({ slot, publicationNumber, reason }) => ({ slot, publicationNumber, reason })),
    };
  }
}
