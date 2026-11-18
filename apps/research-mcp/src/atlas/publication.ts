import { createHash } from "node:crypto";

import {
  ATLAS_AI_READINGS_CALLER,
  ATLAS_LIVING_PERSON_MATCHES_PER_RECORD,
  ATLAS_NAMED_VIDEO_LINK,
  ATLAS_NAMED_VIDEOS_PER_FINDING,
  ATLAS_PUBLICATION_HOLD_REASONS,
  ATLAS_PUBLICATION_SCHEMA,
  ATLAS_PUBLICATION_SCHEMA_V2,
  ATLAS_PUBLICATION_SCHEMA_V3,
  ATLAS_PUBLICATIONS_PER_INSPECT,
  ATLAS_PUBLISHED_RETRACTIONS,
  ATLAS_PUBLISHED_THREADS_PER_FINDING,
  ATLAS_THREAD_COMMUNITY,
  ATLAS_THREAD_LINK,
  ATLAS_VERIFIED_BASES,
  atlasPublishedFindingSchema,
  atlasResearchSchema,
  researchUseNoticeCovered,
  withoutFormatCharacters,
  type AtlasDecisionView,
  type AtlasNumberEntry,
  type AtlasIntentView,
  type AtlasLivingPersonDraft,
  type AtlasLivingPersonReading,
  type AtlasPublicationDraft,
  type AtlasPublicationHoldReason,
  type AtlasPublicationStore,
  type AtlasPublicationView,
  type AtlasPublishedFinding,
  type AtlasResearch,
} from "@askrigor/evidence-repository";

import { containsCardReference } from "../findings/acceptance-checks.js";
import { isYouTubeVideoId, normalizedFindingsText, topicKeyText, type StoredFinding } from "../findings/card.js";
import { sourceIdKey } from "../findings/research-behind.js";
import type {
  FindingsCardPublisher,
  FindingsRecord,
  FindingsSaveAccount,
  SavedFindingsCard,
} from "../findings/service.js";
import type { AtlasSourceTitleLookup, AtlasSourceTitles } from "../findings/source-checks.js";
import { contactDetailKinds, withoutDirectionControls } from "./contact-check.js";
import { unrecordedLivingPersonClaims, type UnrecordedLivingPersonClaims } from "./living-person-pending.js";

/**
 * Publishing saved findings cards in the Atlas (decision 171, section 4B; owner answers 168a and "171 approved", 24 Oct
 * 2026): which cards and findings are published, what is published of each, and the save path's publisher. Every rule
 * here is an exact check: the account's mode and notice version, the card's set-aside label and its
 * public-value scope, the closed markers of a finding drawn from YouTube comments, and the structural contact-details
 * check (contact-check.ts). What a finding means stays the research AI's declaration and the owner's review.
 */

/** Why a card is not published, each an exact check. */
export const CARD_PUBLICATION_PROBLEMS = [
  /** The card was not saved in free contributor mode (a paid private card waits for the owner's acceptance). */
  "not_free_contributor",
  /** The saving account had not accepted the current free contributor notice. */
  "notice_not_current",
  /** The card carries the set-aside label. */
  "set_aside",
  /** The card does not declare its findings public (owner answer 156a). */
  "not_public",
] as const;
export type CardPublicationProblem = typeof CARD_PUBLICATION_PROBLEMS[number];

/** Why one finding of an eligible card is left out. */
export const FINDING_LEFT_OUT_REASONS = [
  /** Drawn from YouTube comments, by the rule withoutYouTubeData applies (owner answer 170). */
  "youtube_comments",
  /** The owner rejected it, so it is not published (the owner's choice of card only). */
  "rejected",
  /** Its stored fields do not make a publication (a record that does not read as the card schema has it). */
  "not_publishable",
] as const;
export type FindingLeftOutReason = typeof FINDING_LEFT_OUT_REASONS[number];

/**
 * Who asks for a card to be published: the save path, right after a confirmed save, with the saving account; or the
 * owner, naming the card (publish_cards), whose choice is the consent for the owner's own cards, so the notice check
 * does not apply. A card whose marker says it was saved in paid private mode is still refused: its
 * findings are published only after the owner accepts them (the privacy page's wording).
 */
export type CardPublicationRoute =
  | { route: "save"; account: FindingsSaveAccount | undefined }
  | { route: "owner"; paidPrivate: boolean };

/** The card-level checks: an empty list when the card's eligible findings are published. */
export function cardPublicationProblems(
  record: FindingsRecord,
  setAside: boolean,
  route: CardPublicationRoute,
): CardPublicationProblem[] {
  const problems: CardPublicationProblem[] = [];
  if (route.route === "save") problems.push(...accountPublicationProblems(route.account));
  if (route.route === "owner" && route.paidPrivate) problems.push("not_free_contributor");
  if (setAside) problems.push("set_aside");
  // A card saved before cards declared whether their findings help anyone else has no declaration: the owner naming
  // it is that choice (owner answer 182a, the owner's earlier cards). A card declared personal only never publishes.
  const declared = record.card.public_value?.scope;
  if (declared === undefined ? route.route !== "owner" : declared !== "public") problems.push("not_public");
  return problems;
}

/**
 * The saving account's checks: free contributor mode and a yes that covers the current notice (the notice that says
 * cards are published as soon as they are saved): RESEARCH_USE_NOTICE_VERSION itself, never a literal, or an earlier
 * version no version since changed materially (researchUseNoticeCovered; the owner, 6 Nov 2026). A dev account's cards
 * publish like everyone's (owner answer 196a, 29 Oct 2026): a regression run switches its card saving off instead.
 */
export function accountPublicationProblems(account: FindingsSaveAccount | undefined): CardPublicationProblem[] {
  if (account === undefined || account.mode !== "FREE_CONTRIBUTOR") return ["not_free_contributor"];
  return researchUseNoticeCovered(account.noticeVersion) ? [] : ["notice_not_current"];
}

/**
 * Whether a stored finding is drawn from YouTube comments, by the rule withoutYouTubeData applies at the save (owner
 * answer 170): a YouTube video among its sources (counted as youtube_videos once its id is left out), the
 * community_checked tag, or a comment audit among its signed bases. It also covers cards saved before that rule.
 */
export function drawnFromYouTubeComments(finding: StoredFinding): boolean {
  return (finding.youtube_videos ?? 0) > 0 || finding.sources.some(isYouTubeVideoId) ||
    finding.tags.includes("community_checked") || (finding.verified_bases ?? []).includes("comment_audit") ||
    finding.draws_on_youtube_comments === true;
}

/**
 * What the Atlas publishes of a card's finding (findingNumber from 1): the card's topic, or the owner's when the card
 * declares none (owner answer 191b); the finding's claim, certainty, applies_to, kind, subject, subject type, direction,
 * numbers block (the raw counts and follow-up; rates, NNT and NNH are worked out when the pages render), searches, source identifiers,
 * why_not_usual and what_would_change_it; its verified bases; the day the card was saved; and the AskRigor version from
 * its stamp; and the watch pages of the videos the person named (owner answer 307b). Never the ARF number, the account
 * or contributor, the thread key, the answer quote, the surface, the reported model, the id of a video AskRigor found, or
 * a count of videos. Every text is written without text-direction controls, which could show
 * reversed characters as an address the contact-details check never sees (contact-check.ts). Undefined when the card has
 * no such finding or its fields do not make a publication.
 */
export function publishedFindingOf(record: FindingsRecord, findingNumber: number,
  ownerTopic?: NonNullable<AtlasPublishedFinding["topic"]>): AtlasPublishedFinding | undefined {
  const base = publishedFieldsOf(record, findingNumber, ownerTopic);
  if (base === undefined) return undefined;
  const parsed = atlasPublishedFindingSchema.safeParse(base);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The videos the person named that a stored finding is about, as the Atlas holds them (owner answer 307b): each watch
 * page the save stored, once, and nothing else of a video.
 */
export function namedVideosOf(finding: Pick<StoredFinding, "named_videos">): string[] {
  return [...new Set((finding.named_videos ?? []).filter((link) => ATLAS_NAMED_VIDEO_LINK.test(link)))]
    .slice(0, ATLAS_NAMED_VIDEOS_PER_FINDING);
}

/** A finding's version 1 fields, unchecked: what publishedFindingOf reads, and what a version 3 builds on. */
function publishedFieldsOf(record: FindingsRecord, findingNumber: number,
  ownerTopic?: NonNullable<AtlasPublishedFinding["topic"]>): AtlasPublishedFinding | undefined {
  const finding = record.card.findings[findingNumber - 1];
  if (!Number.isSafeInteger(findingNumber) || findingNumber < 1 || finding === undefined) return undefined;
  const topic = record.card.topic ?? ownerTopic;
  const plain = withoutDirectionControls;
  const named = namedVideosOf(finding);
  return {
    schema: ATLAS_PUBLICATION_SCHEMA,
    topic: topic === undefined ? null : { key: topic.key, label: plain(topic.label) },
    claim: plain(finding.claim),
    certainty: finding.certainty,
    applies_to: plain(finding.applies_to),
    kind: finding.kind ?? null,
    subject: finding.subject === undefined ? null : plain(finding.subject),
    subject_type: finding.subject_type ?? null,
    direction: finding.direction ?? null,
    numbers: finding.numbers === undefined ? null : finding.numbers.map((entry) => ({
      outcome: plain(entry.outcome),
      better: entry.better,
      option: plain(entry.option),
      option_events: entry.option_events,
      option_total: entry.option_total,
      comparator: plain(entry.comparator),
      comparator_events: entry.comparator_events,
      comparator_total: entry.comparator_total,
      follow_up: plain(entry.follow_up),
      ...(entry.harms_none_found === undefined ? {} : { harms_none_found: entry.harms_none_found }),
    })),
    searches: finding.searches === undefined ? null : finding.searches.map((search) => ({
      database: search.database,
      query: plain(search.query),
      ...(search.date_range === undefined ? {} : { date_range: { start: search.date_range.start, end: search.date_range.end } }),
    })),
    sources: finding.sources.filter((source) => !isYouTubeVideoId(source)),
    why_not_usual: plain(finding.why_not_usual),
    what_would_change_it: plain(finding.what_would_change_it),
    verified_bases: ATLAS_VERIFIED_BASES.filter((basis) => (finding.verified_bases ?? []).includes(basis)),
    saved_on: record.stamp.saved_at.slice(0, 10),
    askrigor_version: /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u.test(record.stamp.askrigor_version)
      ? record.stamp.askrigor_version
      : "unknown",
    // Owner answer 307b: the videos the person named, as the save stored their watch pages.
    ...(named.length === 0 ? {} : { named_videos: named }),
    ...(callerMadeAiReadings(record) ? { ai_readings: ATLAS_AI_READINGS_CALLER } : {}),
  };
}

/**
 * Whether the app that sent the checking call made the final check's AI readings (owner answers 310a and 311a): what
 * the saved card's stamp keeps of the finalization receipt's signed `ar`. Every finding of such a card says so, in its
 * publication and in the research an accepted version keeps.
 */
export function callerMadeAiReadings(record: Pick<FindingsRecord, "stamp">): boolean {
  return record.stamp.research.ai_readings === ATLAS_AI_READINGS_CALLER;
}

// The Atlas's own guard against a YouTube link in a text it keeps (atlasText in @askrigor/evidence-repository).
const YOUTUBE_REFERENCE = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu;

/**
 * Every text a publication shows, by field: the topic (its key read as words, as the card's privacy screen reads it),
 * the claim, whom it applies to, the subject, each figure's labels, each search's query, why it is not the usual answer
 * and what would change it; with version 2, the card's question and usual answer and each source's title. Source
 * identifiers are identifiers, not text.
 */
export function publishedTexts(published: AtlasPublishedFinding): Array<[string, string]> {
  return [
    ...(published.topic === null ? [] : [
      ["topic.label", published.topic.label] as [string, string],
      ["topic.key", topicKeyText(published.topic.key)] as [string, string],
    ]),
    ["claim", published.claim],
    ["applies_to", published.applies_to],
    ...(published.subject === null ? [] : [["subject", published.subject] as [string, string]]),
    ...(published.numbers ?? []).flatMap((entry, at): Array<[string, string]> => [
      [`numbers[${at}].outcome`, entry.outcome],
      [`numbers[${at}].option`, entry.option],
      [`numbers[${at}].comparator`, entry.comparator],
      [`numbers[${at}].follow_up`, entry.follow_up],
    ]),
    ...(published.searches ?? []).map((search, at): [string, string] => [`searches[${at}].query`, search.query]),
    ["why_not_usual", published.why_not_usual],
    ["what_would_change_it", published.what_would_change_it],
    ...(published.question === undefined ? [] : [["question", published.question] as [string, string]]),
    ...(published.usual_answer === undefined ? [] : [["usual_answer", published.usual_answer] as [string, string]]),
    ...(published.source_details ?? []).map(({ title }, at): [string, string] => [`source_details[${at}].title`, title]),
    // Version 3 (owner answer 252a): the quotes and where they were found, the strongest thing against each, and the
    // forum signal's communities, links and words.
    ...(published.backing ?? []).flatMap((line, at): Array<[string, string]> => [
      ...(line.sentence === undefined ? [] : [[`backing[${at}].sentence`, line.sentence] as [string, string]]),
      ...(line.sentence_section === undefined ? [] : [[`backing[${at}].sentence_section`, line.sentence_section] as [string, string]]),
      ...(line.conclusion === undefined ? [] : [[`backing[${at}].conclusion`, line.conclusion] as [string, string]]),
      ...(line.conclusion_section === undefined ? []
        : [[`backing[${at}].conclusion_section`, line.conclusion_section] as [string, string]]),
      [`backing[${at}].against`, line.against],
    ]),
    ...(published.forum_signal === undefined ? [] : [
      ...published.forum_signal.communities.map((community, at): [string, string] => [`forum_signal.communities[${at}]`, community]),
      ...published.forum_signal.threads.map((thread, at): [string, string] => [`forum_signal.threads[${at}]`, thread]),
      ...(published.forum_signal.mechanism === undefined ? []
        : [["forum_signal.mechanism", published.forum_signal.mechanism] as [string, string]]),
      ...(published.forum_signal.studies_measured === undefined ? []
        : [["forum_signal.studies_measured", published.forum_signal.studies_measured] as [string, string]]),
    ]),
  ];
}

/**
 * Why a publication is held rather than shown, in ATLAS_PUBLICATION_HOLD_REASONS order: the contact-details check's
 * kinds (email address, phone number, messaging handle), a findings card's reference (ARF- and four digits or more), or
 * a YouTube link. Empty when it is shown.
 */
export function publicationHoldReasons(published: AtlasPublishedFinding): AtlasPublicationHoldReason[] {
  const found = new Set(publishedTexts(published).flatMap(([, text]) => textHoldReasons(text)));
  return ATLAS_PUBLICATION_HOLD_REASONS.filter((reason) => found.has(reason));
}

/**
 * What one text holds that the pages never show, by the same three checks: a publication's texts here, and a challenge
 * mark's usual view, source and link (challenge-review.ts).
 */
export function textHoldReasons(text: string): AtlasPublicationHoldReason[] {
  // Read as a reader sees it, without its format characters, as the pages read it (the review of #422, fourth round: a
  // zero-width space inside "youtube.com" passed here, and every page showing the text then refused to serve).
  const shown = withoutFormatCharacters(text);
  return [
    ...contactDetailKinds(shown),
    ...(containsCardReference(shown) ? ["card_reference" as const] : []),
    ...(YOUTUBE_REFERENCE.test(shown) ? ["youtube_link" as const] : []),
  ];
}

/**
 * A publication with its card's context (plan docs/superpowers/plans/2026-11-02-atlas-finding-pages-in-context.md):
 * version 2, with the card's question and usual answer (the card's own general wording, which the free notice says a
 * published card holds) and each source's title and year where its public record gave one. A title is provider text:
 * one that holds what the pages never show, or does not fit, is left out rather than holding the finding. The fields as
 * they are when the context does not make a publication (a card text longer than the publication takes, say).
 */
export function withCardContext(published: AtlasPublishedFinding, record: FindingsRecord,
  titles: AtlasSourceTitles = new Map(), findingNumber?: number): AtlasPublishedFinding {
  return inCardContext(published, record, titles, findingNumber) ?? published;
}

/**
 * The finding in its card's context, as version 2, or as version 3 when its stored finding carries the research behind
 * it (owner answer 252a: researchBehindOf): undefined when neither makes a publication. A version 3 that doesn't make one
 * falls back to version 2.
 */
function inCardContext(published: AtlasPublishedFinding, record: FindingsRecord, titles: AtlasSourceTitles,
  findingNumber: number | undefined): AtlasPublishedFinding | undefined {
  const plain = withoutDirectionControls;
  const finding = findingNumber === undefined ? undefined : record.card.findings[findingNumber - 1];
  const research = finding === undefined ? undefined : researchBehindOf(finding, published);
  const details = (v3: boolean) => published.sources.flatMap((source) => {
    const found = titles.get(source);
    const title = found === undefined ? "" : plain(found.title).replace(/[\s\p{Cc}]+/gu, " ").trim();
    const year = found?.year ?? null;
    const retraction = v3 && found?.retraction !== undefined &&
      (ATLAS_PUBLISHED_RETRACTIONS as readonly string[]).includes(found.retraction) ? found.retraction : undefined;
    return title === "" || title.length > 500 || textHoldReasons(title).length > 0 ? []
      : [{ source, title, year: year !== null && Number.isInteger(year) && year >= 1500 && year <= 2200 ? year : null,
        ...(retraction === undefined ? {} : { retraction }) }];
  });
  const context = (v3: boolean) => {
    const shown = details(v3);
    return {
      ...published,
      schema: v3 ? ATLAS_PUBLICATION_SCHEMA_V3 : ATLAS_PUBLICATION_SCHEMA_V2,
      question: plain(record.card.question),
      usual_answer: plain(record.card.usual_answer),
      ...(shown.length === 0 ? {} : { source_details: shown }),
      ...(v3 ? research : {}),
    };
  };
  if (research !== undefined) {
    const parsed = atlasPublishedFindingSchema.safeParse(context(true));
    if (parsed.success) return parsed.data;
  }
  const parsed = atlasPublishedFindingSchema.safeParse(context(false));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The research behind a finding as its accepted version keeps it (owner answer 255a), so that an accepted finding from
 * any card, a paid private one's too, shows it: what a version 3 publication would show of it, with each figure's source
 * by the figure's place in the version's numbers when those are the card's own figures. Only the sources the owner
 * accepted (`kept`, the accept's sources; all the finding's when the owner kept them all) are in it, so a source the
 * owner dropped, a retracted one say, never shows (the review of 5 November, finding 4). Undefined when the finding
 * carries none, or when what it carries is not what the canonical Atlas keeps (its texts refuse a card's number and a
 * YouTube link): the accept goes ahead without it. `callerRead`: the app that sent the checking call made the final
 * check's AI readings (owner answer 311a); the research says so, and says it alone when nothing else of it is kept, so
 * the finding's page never loses it.
 */
export function canonicalResearchOf(finding: StoredFinding, numbers: readonly AtlasNumberEntry[],
  kept: readonly string[] = finding.sources, callerRead = false): AtlasResearch | undefined {
  const keys = new Set(kept.map(sourceIdKey));
  const sources = finding.sources.filter((source) => !isYouTubeVideoId(source) && keys.has(sourceIdKey(source)));
  const research = researchBehindOf(finding, { sources, numbers: null });
  const own = (finding.numbers ?? []).map(({ source: _source, ...figure }) => figure);
  const named = namedVideosOf(finding);
  const figureSources = own.length === numbers.length && own.every((figure, index) =>
    JSON.stringify(figure) === JSON.stringify(numbers[index]))
    ? (finding.numbers ?? []).map(({ source }) => source === undefined
      ? null : sources.find((named) => sourceIdKey(named) === sourceIdKey(source)) ?? null)
    : [];
  const readings = callerRead ? { ai_readings: ATLAS_AI_READINGS_CALLER } as const : undefined;
  const parsed = atlasResearchSchema.safeParse({
    ...(research?.backing === undefined ? {} : { backing: research.backing }),
    ...(research?.source_reading === undefined ? {} : { source_reading: research.source_reading }),
    ...(figureSources.some((source) => source !== null) ? { figure_sources: figureSources } : {}),
    ...(research?.forum_signal === undefined ? {} : { forum_signal: research.forum_signal }),
    // Owner answer 307b: the videos the person named, as the save stored their watch pages.
    ...(named.length === 0 ? {} : { named_videos: named }),
    ...readings,
  });
  return parsed.success ? parsed.data : readings;
}

/**
 * An accepted version's research behind it with only the sources a revision keeps (the review of 5 November, finding
 * 4): each backing line and reading of a source dropped is left out, and a figure's source dropped becomes none.
 * Who made the final check's AI readings stays (owner answer 311a). Undefined when nothing is left.
 */
export function researchKeeping(research: AtlasResearch, keeps: (source: string) => boolean): AtlasResearch | undefined {
  const backing = (research.backing ?? []).filter(({ source }) => keeps(source));
  const reading = (research.source_reading ?? []).filter(({ source }) => keeps(source));
  const figures = (research.figure_sources ?? []).map((source) => source !== null && keeps(source) ? source : null);
  const kept: AtlasResearch = {
    ...(backing.length === 0 ? {} : { backing }),
    ...(reading.length === 0 ? {} : { source_reading: reading }),
    ...(figures.some((source) => source !== null) ? { figure_sources: figures } : {}),
    ...(research.forum_signal === undefined ? {} : { forum_signal: research.forum_signal }),
    // Owner answer 307b: a named video is no source, so no dropped source takes it with it.
    ...(research.named_videos === undefined ? {} : { named_videos: research.named_videos }),
    ...(research.ai_readings === undefined ? {} : { ai_readings: research.ai_readings }),
  };
  return Object.keys(kept).length === 0 ? undefined : kept;
}

/**
 * What version 3 adds of a stored finding (owner answer 252a), by the publication's own source strings: its backing
 * lines, their quotes and sections as the save kept them, each left out when it holds what the pages never show (it is
 * a paper's text, so it never holds the finding back) and a line with no quote left out, with the strongest thing
 * against it in AskRigor's words; how each source was read; which source each figure comes from; and the forum signal,
 * with the communities and the number of threads the save kept, and a link only from a signal that holds one, as the
 * pages show it (a Reddit post by its id). Undefined when the finding carries none of them, so an older card stays
 * version 2.
 */
export function researchBehindOf(finding: StoredFinding, published: Pick<AtlasPublishedFinding, "sources" | "numbers">): Partial<
  Pick<AtlasPublishedFinding, "backing" | "source_reading" | "numbers" | "forum_signal">> | undefined {
  const plain = withoutDirectionControls;
  const sourceOf = (named: string) => published.sources.find((source) => sourceIdKey(source) === sourceIdKey(named));
  const shown = (value: string | undefined) => {
    if (value === undefined) return undefined;
    const text = plain(value).trim();
    return text === "" || textHoldReasons(text).length > 0 ? undefined : text;
  };
  const backing = (finding.backing ?? []).flatMap((line) => {
    const source = sourceOf(line.source);
    const sentence = shown(line.sentence);
    const conclusion = shown(line.conclusion);
    if (source === undefined || (sentence === undefined && conclusion === undefined)) return [];
    const sentenceSection = sentence === undefined ? undefined : shown(line.sentence_section);
    const conclusionSection = conclusion === undefined ? undefined : shown(line.conclusion_section);
    return [{
      source,
      ...(sentence === undefined ? {} : { sentence }),
      ...(sentenceSection === undefined ? {} : { sentence_section: sentenceSection }),
      ...(conclusion === undefined ? {} : { conclusion }),
      ...(conclusionSection === undefined ? {} : { conclusion_section: conclusionSection }),
      text: line.text,
      against: plain(line.against),
    }];
  });
  const read = new Set<string>();
  const reading = (finding.source_reading ?? []).flatMap((entry) => {
    const source = sourceOf(entry.source);
    if (source === undefined || read.has(source)) return [];
    read.add(source);
    return [{ source, read: entry.read, ...(entry.figures === undefined ? {} : { figures: entry.figures }) }];
  });
  const figureSources = (finding.numbers ?? []).map(({ source }) => source === undefined ? undefined : sourceOf(source));
  const numbers = published.numbers === null || figureSources.every((source) => source === undefined) ? undefined
    : published.numbers.map((entry, index) => {
      const source = figureSources[index];
      return source === undefined ? entry : { ...entry, source };
    });
  // The stored signal holds how many threads were read and their communities, and the threads' links only when the
  // saving account's notice covered them (owner answer 253a), each rebuilt at the save from the read's verified parts.
  // Only a community and a link in the Atlas's own forms are published (the review of 5 November, findings 1 and 2).
  const signal = finding.forum_signal;
  const communities = signal === undefined ? [] : [...new Set(signal.communities.flatMap((community) => {
    const named = shown(community);
    return named === undefined || !ATLAS_THREAD_COMMUNITY.test(named) ? [] : [named];
  }))].slice(0, Math.min(ATLAS_PUBLISHED_THREADS_PER_FINDING, signal.threads_read));
  const links = signal?.threads ?? [];
  const threads = [...new Set(links.flatMap((thread) => {
    const link = shown(thread);
    return link === undefined || !ATLAS_THREAD_LINK.test(link) ? [] : [link];
  }))].slice(0, signal?.threads_read ?? 0);
  const forum = signal === undefined ? undefined : {
    communities,
    threads_read: signal.threads_read,
    threads,
    people: { ...signal.people },
    report_quality: { ...signal.report_quality },
    ...(signal.mechanism === undefined ? {} : { mechanism: plain(signal.mechanism) }),
    studies: signal.studies,
    ...(signal.studies_measured === undefined ? {} : { studies_measured: plain(signal.studies_measured) }),
  };
  if (backing.length === 0 && reading.length === 0 && numbers === undefined && forum === undefined) return undefined;
  return {
    ...(backing.length === 0 ? {} : { backing: backing.slice(0, 3) }),
    ...(reading.length === 0 ? {} : { source_reading: reading }),
    ...(numbers === undefined ? {} : { numbers }),
    ...(forum === undefined ? {} : { forum_signal: forum }),
  };
}

/**
 * The titles of a card's sources, looked up once for all its findings; none when there is no lookup or it fails, which
 * never holds publishing back.
 */
export async function cardSourceTitles(record: FindingsRecord, lookup: AtlasSourceTitleLookup | undefined):
  Promise<AtlasSourceTitles> {
  const sources = [...new Set(record.card.findings.flatMap((finding) => finding.sources)
    .filter((source) => !isYouTubeVideoId(source)))];
  if (lookup === undefined || sources.length === 0) return new Map();
  try {
    return await lookup(sources);
  } catch {
    return new Map();
  }
}

/** What a decided finding's publication becomes: accepted or edited with its F number, or rejected. */
export interface DecidedPublicationState {
  state: "accepted" | "edited" | "rejected";
  atlasNumber: string | null;
}

/**
 * The publication state the owner's decision on a card's finding gives it: rejected; edited when the F number's accept
 * took the owner's wording (editedAtAcceptance) or a revision of it is recorded and not refused; accepted otherwise (a
 * re-check takes the F number it re-checks). Undefined for an open lead's decision, which has no publication.
 */
export function decidedPublicationState(
  decision: Pick<AtlasDecisionView, "itemKind" | "decision" | "publicNumber">,
  intents: readonly Pick<AtlasIntentView, "intentKind" | "publicNumber" | "status" | "payload">[],
): DecidedPublicationState | undefined {
  if (decision.itemKind !== "finding") return undefined;
  if (decision.decision === "rejected" || decision.publicNumber === null) return { state: "rejected", atlasNumber: null };
  const number = decision.publicNumber;
  const edited = intents.some((intent) => intent.publicNumber === number && intent.status !== "FAILED" &&
    ((intent.payload.kind === "accept" && intent.payload.editedAtAcceptance) || intent.intentKind === "revise"));
  return { state: edited ? "edited" : "accepted", atlasNumber: number };
}

export interface CardPublicationPlan {
  /** The card-level checks it failed; when any, nothing is published. */
  problems: CardPublicationProblem[];
  /** The findings to publish, each with the state it starts in. */
  drafts: AtlasPublicationDraft[];
  /** The findings left out, with why. */
  leftOut: Array<{ findingNumber: number; reason: FindingLeftOutReason }>;
}

/**
 * The plan for publishing a card: its card-level checks, then, finding by finding, the YouTube rule, the projection and
 * the hold check. A finding the owner has decided (the owner's choice of an older card) starts in its decided state, or
 * is left out when rejected; any other starts unreviewed, or held when its text holds contact details.
 */
export function planCardPublication(input: {
  record: FindingsRecord;
  setAside: boolean;
  route: CardPublicationRoute;
  /** The owner's decisions on the card's findings, by finding number. */
  decided?: ReadonlyMap<number, DecidedPublicationState>;
  /** publish_cards only: a topic for a card that declares none. */
  ownerTopic?: NonNullable<AtlasPublishedFinding["topic"]>;
  /** The card's sources' titles and years, for the findings published unreviewed. */
  sourceTitles?: AtlasSourceTitles;
}): CardPublicationPlan {
  const problems = cardPublicationProblems(input.record, input.setAside, input.route);
  if (problems.length > 0) return { problems, drafts: [], leftOut: [] };
  const drafts: AtlasPublicationDraft[] = [];
  const leftOut: CardPublicationPlan["leftOut"] = [];
  input.record.card.findings.forEach((finding, index) => {
    const findingNumber = index + 1;
    if (drawnFromYouTubeComments(finding)) {
      leftOut.push({ findingNumber, reason: "youtube_comments" });
      return;
    }
    const decided = input.decided?.get(findingNumber);
    if (decided?.state === "rejected") {
      leftOut.push({ findingNumber, reason: "rejected" });
      return;
    }
    // Owner answer 252a: a finding resting on its forum signal alone has no source, so it makes no version 1 and is
    // published in its card's context only, as version 3. A decided finding goes the same way (the review of 5
    // November, finding 3), so an accepted forum-only finding gets its page too.
    const shown = cardPublicationOf(input.record, findingNumber, input.sourceTitles ?? new Map(), input.ownerTopic);
    if (shown === undefined) {
      leftOut.push({ findingNumber, reason: "not_publishable" });
      return;
    }
    const holds = publicationHoldReasons(shown);
    if (decided !== undefined && (input.ownerTopic === undefined || input.record.card.topic !== undefined || holds.length === 0)) {
      // A decided finding's page shows its F number's latest version; its publication holds the card's fields.
      drafts.push({ findingNumber, state: decided.state, atlasNumber: decided.atlasNumber, heldBecause: null,
        published: shown });
      return;
    }
    drafts.push(holds.length === 0
      ? { findingNumber, state: "unreviewed", atlasNumber: null, heldBecause: null, published: shown }
      : { findingNumber, state: "held", atlasNumber: null, heldBecause: holds, published: shown });
  });
  return { problems, drafts, leftOut };
}

/** The kept reason a saved finding carries until the quick-answer test reads it (owner answer 240a). */
export const QUICK_ANSWER_TEST_WAITING = "waiting for the quick-answer test (owner answer 240a)";

/**
 * The kept reason a saved finding carries, while saved findings show at once, when its card doesn't declare, as the
 * final check's receipt signed, that it names no living person (Codex's review of 17 Nov 2026, finding 1). The owner's
 * rule: claims about named living people publish only on his explicit decision, so it waits for the owner's
 * show_on_pages (shown_by owner), and the quick-answer test, which reads only its own reason, leaves it alone.
 */
export const LIVING_PERSON_WAITING = "waiting for the owner's decision: it may name a living person";

/**
 * The save path's publisher (FindingsSaveService calls it right after a confirmed save, without waiting for it): it
 * withdraws the unreviewed and held publications of the cards the save replaced (a corrected answer's findings, not the
 * replaced ones, are what stays: owner decision Q9), then publishes the card's eligible findings when the save made the
 * card (a later save joining an open card publishes nothing of its own). Publishing is idempotent by the card's digest,
 * so a retried save publishes nothing twice; a failure is the owner's to retry with publish_cards.
 *
 * Owner answer 240a: what publishing makes is kept for AskRigor's research, off every list, until a separate AI's
 * quick-answer test shows it (docs/atlas-quick-answer-test.md), since the AI that did the research can't fairly judge
 * its own card. Held findings stay held, and a card the owner publishes shows at once.
 *
 * The owner, 17 Nov 2026 ("show all the findings automatically when they pass quality checks like this one, i
 * shouldn't be reviewing everything"): with showOnPages (ASKRIGOR_ATLAS_SHOW_SAVED_FINDINGS=enabled), a finding that
 * passed the final check and the publication checks shows on the pages at once, unreviewed, labelled "Not checked by
 * supervisors yet". What is held, left out or never published stays so: a finding whose text holds contact details, a
 * card reference or a YouTube link is held, one drawn from YouTube comments is left out, and a paid private or
 * earlier-notice card publishes nothing here (planCardPublication, cardPublicationProblems). Codex's review of 17 Nov
 * 2026, finding 1 (P0): a finding shows at once only when its card declares that it names no living person and the
 * final check's receipt signed that (SavedFindingsCard.clearOfLivingPeople); any other is published kept, off every
 * list, for the owner's decision (LIVING_PERSON_WAITING), kept in the publishing's own write. Codex's re-review of 17
 * Nov 2026, finding 1: a kept finding's own page stays public, so one whose card declares that it names a living
 * person, or that the meaning judge read as naming one, is held (living_person_review), with no page, whatever the
 * setting (namesLivingPerson, withLivingPersonHold). Codex's fourth review of 17 Nov 2026 (P0s): the database enforces
 * that hold. recordSave stores, before the save answers, what the save says of each finding, and a yes holds the card's
 * matching publications in the same transaction; the publishing then reads the stored value under lock, so a later
 * save's yes holds a publication still on its way. recordSave throws when that fails, and the save fails.
 */
export class AtlasCardPublisher implements FindingsCardPublisher {
  private readonly now: () => Date;

  constructor(private readonly options: {
    store: AtlasPublicationStore;
    now?: () => Date;
    /** The sources' titles and years for the pages; without it, a page shows each source's identifier alone. */
    sourceTitles?: AtlasSourceTitleLookup;
    /** Show what the save publishes at once instead of keeping it for the quick-answer test (the owner, 17 Nov 2026). */
    showOnPages?: boolean;
    /**
     * What a finding whose card doesn't say whether it names a living person becomes
     * (ASKRIGOR_ATLAS_LIVING_PERSON_UNKNOWN, livingPersonReading): keep, as before, when left out.
     */
    livingPersonUnknown?: "keep" | "hold" | "reader";
    /**
     * Codex's fifth review of 17 Nov 2026 (P0): the claims whose record hasn't stored yet, which the pages don't show;
     * the process's own by default.
     */
    unrecorded?: UnrecordedLivingPersonClaims;
  }) {
    this.now = options.now ?? (() => new Date());
  }

  accountPublishes(account: FindingsSaveAccount | undefined): boolean {
    return accountPublicationProblems(account).length === 0;
  }

  /**
   * Codex's third review of 17 Nov 2026, finding 1, and its fourth review's two P0s: before the save answers, stores
   * what it says of whether each of its card's findings names a living person, by the card and the finding's claim
   * (record_atlas_living_person), and, in the same transaction, holds every publication of the card with a claim it
   * says yes of that the owner hasn't decided; what he decided (accepted or edited, or shown by his own action) stays as
   * he decided it, and his list says that a later save marks it. A later save of the same question and claims lands on
   * the open card (existing_card) and publishes nothing of its own, so its yes is matched by claim, whatever the claims'
   * order: by the key stored with each publication, and, for one from before keys were stored, by the claim read here.
   * Whatever the settings: the owner's rule is that claims about named living people publish only on his explicit
   * decision. It throws when the store does: the save then fails, retryable, and publishes nothing.
   */
  async recordSave(saved: SavedFindingsCard): Promise<void> {
    const readings = saved.record.card.findings.map((finding, index) => ({
      claimKey: livingPersonClaimKey(finding.claim), reading: livingPersonStoredReading(saved, index + 1) }));
    if (readings.length === 0) return;
    const naming = new Set(readings.flatMap(({ claimKey, reading }) => reading === "yes" ? [claimKey] : []));
    // Codex's fifth review of 17 Nov 2026 (P0): until the record stores them, this process's pages don't show a claim it
    // says yes of. A record that fails leaves them so, until a later record of the card stores them.
    const unrecorded = this.options.unrecorded ?? unrecordedLivingPersonClaims;
    unrecorded.pending(saved.issueNumber, [...naming]);
    let matched: string[] = [];
    if (saved.kind === "existing" && naming.size > 0) {
      const rows = await this.options.store.inspect({ cardNumbers: [saved.issueNumber], limit: ATLAS_PUBLICATIONS_PER_INSPECT });
      matched = rows.filter(({ published }) => published !== null && naming.has(livingPersonClaimKey(published.claim)))
        .map(({ publicationNumber }) => publicationNumber).slice(0, ATLAS_LIVING_PERSON_MATCHES_PER_RECORD);
    }
    await this.options.store.recordLivingPerson({ cardNumber: saved.issueNumber, readings, publicationNumbers: matched,
      at: this.now().toISOString() });
    unrecorded.recorded(saved.issueNumber, readings.map(({ claimKey }) => claimKey));
  }

  async afterSave(saved: SavedFindingsCard): Promise<void> {
    let failure: unknown;
    if (saved.replacedCards.length > 0) {
      try {
        await this.options.store.withdraw({
          reason: "card_replaced",
          cardNumbers: saved.replacedCards,
          withdrawnAt: this.now().toISOString(),
        });
      } catch (error) {
        failure = error;
      }
    }
    if (saved.kind === "created" && cardPublicationProblems(saved.record, saved.setAside,
      { route: "save", account: saved.account }).length === 0) {
      const plan = planCardPublication({
        record: saved.record,
        setAside: saved.setAside,
        route: { route: "save", account: saved.account },
        sourceTitles: await cardSourceTitles(saved.record, this.options.sourceTitles),
      });
      if (plan.problems.length === 0 && plan.drafts.length > 0) {
        // Codex's review of 17 Nov 2026, finding 4: what the save publishes under the setting is stored as such
        // (migration 0041), so its page says nothing of the quick-answer test whether the setting is on or later turned
        // off. Finding 1: one its card doesn't declare, as the receipt signed, to name no living person is kept for the
        // owner in the same write.
        const showing = this.options.showOnPages === true;
        const unknown = this.options.livingPersonUnknown ?? "keep";
        const reading = (findingNumber: number) => livingPersonReading(saved, findingNumber, unknown);
        const forOwner = (findingNumber: number) => reading(findingNumber) !== "clear";
        // Codex's re-review of 17 Nov 2026, finding 1 (P0): keeping a finding leaves its own page public, so one that
        // names a living person is held, with no page, until the owner decides, whatever the setting; one whose card
        // doesn't say is held too while ASKRIGOR_ATLAS_LIVING_PERSON_UNKNOWN says hold, or says reader and the meaning
        // judge read it as naming no one.
        // The database holds them too, from what is stored for the card when it publishes (recordSave): so a later
        // save's yes stored meanwhile holds this one.
        const drafts = plan.drafts.map((draft) => withLivingPersonHold({ ...draft,
          livingPerson: savedLivingPersonDraft(saved, draft.findingNumber, unknown) },
        reading(draft.findingNumber) === "names" || (reading(draft.findingNumber) === "unknown" && unknown !== "keep")));
        const rows = await this.options.store.publish({
          cardNumber: saved.issueNumber,
          cardSha256: saved.record.card_sha256,
          findings: showing
            ? drafts.map((draft) => draft.state !== "unreviewed" ? draft : {
                ...draft, shownBy: "automatic_showing" as const,
                ...(forOwner(draft.findingNumber) ? { keptReason: LIVING_PERSON_WAITING } : {}),
              })
            : drafts,
          publishedAt: this.now().toISOString(),
          revive: false,
        });
        const waiting = rows.filter(({ outcome, state, findingNumber }) => outcome === "published" &&
          state === "unreviewed" && (!showing || forOwner(findingNumber)))
          .map(({ publicationNumber }) => publicationNumber);
        if (waiting.length > 0) {
          // While saved findings show at once, kept already by the publishing itself; kept again here, with the same
          // reason, in case the store's publishing didn't (one whose function predates migration 0041).
          await this.options.store.keep({ publicationNumbers: waiting, atlasNumbers: [], keep: true,
            reason: showing ? LIVING_PERSON_WAITING : QUICK_ANSWER_TEST_WAITING, at: this.now().toISOString() });
        }
      }
    }
    if (failure !== undefined) throw failure;
  }
}

/** A finding's identity across saves of the same card: its claim as the duplicate check reads it (findingsCardFingerprint). */
function findingIdentity(claim: string): string {
  return normalizedFindingsText(withoutDirectionControls(claim));
}

/**
 * The key a finding's living-person reading is stored under with its card (migration 0041): the sha256, in hex, of its
 * claim as the duplicate check reads it, so every save of the card, in any order, finds the same one.
 */
export function livingPersonClaimKey(claim: string): string {
  return createHash("sha256").update(findingIdentity(claim), "utf8").digest("hex");
}

/**
 * What a save stores of whether its finding names a living person: yes (namesLivingPerson); no, when its stored card
 * declares it names no one and the receipt signed that; not_said otherwise. A stored yes is never lowered.
 */
export function livingPersonStoredReading(
  saved: Pick<SavedFindingsCard, "record" | "clearOfLivingPeople" | "judgedNamingLivingPeople">,
  findingNumber: number,
): AtlasLivingPersonReading {
  if (namesLivingPerson(saved, findingNumber)) return "yes";
  return saved.record.card.findings[findingNumber - 1]?.names_living_person === false &&
    saved.clearOfLivingPeople.has(findingNumber) ? "no" : "not_said";
}

/**
 * What the save path's draft says of a finding for the database to read under lock: its claim's key, what the save
 * says, and whether one stored as not said is held, as ASKRIGOR_ATLAS_LIVING_PERSON_UNKNOWN says (with reader, the
 * meaning judge's no clears it).
 */
function savedLivingPersonDraft(saved: SavedFindingsCard, findingNumber: number, unknown: "keep" | "hold" | "reader"):
  AtlasLivingPersonDraft {
  return {
    claimKey: livingPersonClaimKey(saved.record.card.findings[findingNumber - 1]!.claim),
    reading: livingPersonStoredReading(saved, findingNumber),
    holdNotSaid: unknown !== "keep" && livingPersonReading(saved, findingNumber, unknown) === "unknown",
  };
}

/**
 * What the owner's publishing (publish_cards) says of a card's finding for the database to read under lock: yes when
 * its stored card declares it names a living person, not_said otherwise (the owner's route has no receipt), and a
 * finding stored as not said is not held for it, as before. What a save stored for the card stands: a stored yes holds
 * the finding here too, and the owner decides it.
 */
export function ownerLivingPersonDraft(record: FindingsRecord, findingNumber: number): AtlasLivingPersonDraft {
  const finding = record.card.findings[findingNumber - 1]!;
  return { claimKey: livingPersonClaimKey(finding.claim),
    reading: finding.names_living_person === true ? "yes" : "not_said", holdNotSaid: false };
}

/**
 * Whether a saved finding names a living person, as far as the save knows (Codex's re-review of 17 Nov 2026, finding
 * 1): its stored card declares it does, or the meaning judge read it as naming one, as the receipt signed (`nly`).
 */
export function namesLivingPerson(
  saved: Pick<SavedFindingsCard, "record" | "judgedNamingLivingPeople">,
  findingNumber: number,
): boolean {
  return saved.record.card.findings[findingNumber - 1]?.names_living_person === true ||
    saved.judgedNamingLivingPeople?.has(findingNumber) === true;
}

/**
 * What the save knows of whether a saved finding names a living person: names (namesLivingPerson); clear, when its
 * stored card declares it names no one and the receipt signed that (`nlp`), or, while ASKRIGOR_ATLAS_LIVING_PERSON_UNKNOWN
 * is reader, when its card doesn't say and the meaning judge read it as naming no one (`nln`); unknown otherwise.
 */
export function livingPersonReading(
  saved: Pick<SavedFindingsCard, "record" | "clearOfLivingPeople" | "judgedNamingLivingPeople" | "judgedClearOfLivingPeople">,
  findingNumber: number,
  unknown: "keep" | "hold" | "reader",
): "names" | "clear" | "unknown" {
  if (namesLivingPerson(saved, findingNumber)) return "names";
  const declared = saved.record.card.findings[findingNumber - 1]?.names_living_person;
  if (declared === false && saved.clearOfLivingPeople.has(findingNumber)) return "clear";
  return unknown === "reader" && declared === undefined && saved.judgedClearOfLivingPeople?.has(findingNumber) === true
    ? "clear" : "unknown";
}

/**
 * A draft held for the owner's decision because it may name a living person (living_person_review), with any reason it
 * is held for already, or the draft as it is: the save path's own reading (the owner's rule is that such claims
 * publish only on his explicit decision). The database holds such a finding on every path from what a save stored for
 * the card (Codex's fourth review of 17 Nov 2026), and only the owner's accept or edit shows it.
 */
export function withLivingPersonHold(draft: AtlasPublicationDraft, holds: boolean): AtlasPublicationDraft {
  if (!holds || draft.state === "accepted" || draft.state === "edited") return draft;
  const reasons = new Set<AtlasPublicationHoldReason>([...(draft.heldBecause ?? []), "living_person_review"]);
  return { ...draft, state: "held", heldBecause: ATLAS_PUBLICATION_HOLD_REASONS.filter((reason) => reasons.has(reason)) };
}

/**
 * The publication an accepted or edited finding gets when its card has none for it (a paid private card, whose
 * findings are published only after the owner accepts them, or one of the owner's own older cards that publish_cards
 * has not published): its decided state and F number, with the card's published fields, which its page does not show
 * (an accepted publication shows its F number's latest version). Undefined for a rejection, for a finding drawn from
 * YouTube comments (owner answers 170 and 173: never published), and for one whose stored fields do not make a
 * publication.
 */
export function decidedPublicationDraft(
  record: FindingsRecord,
  findingNumber: number,
  target: DecidedPublicationState,
): AtlasPublicationDraft | undefined {
  if (target.state === "rejected" || target.atlasNumber === null) return undefined;
  const finding = record.card.findings[findingNumber - 1];
  if (finding === undefined || drawnFromYouTubeComments(finding)) return undefined;
  // The review of 5 November, finding 3: by the same path as a card's other publications, so a finding accepted from a
  // paid private card, or a forum-only one, gets its page.
  const published = cardPublicationOf(record, findingNumber, new Map());
  return published === undefined ? undefined
    : { findingNumber, state: target.state, atlasNumber: target.atlasNumber, heldBecause: null, published };
}

/**
 * A card's finding as it is published (findingNumber from 1): in its card's context, as version 3 when its stored
 * finding carries the research behind it and as version 2 otherwise, or as version 1 when the context makes no
 * publication. Undefined when none does, which a finding resting on its forum signal alone, with no source, can only
 * make as version 3.
 */
function cardPublicationOf(record: FindingsRecord, findingNumber: number, titles: AtlasSourceTitles,
  ownerTopic?: NonNullable<AtlasPublishedFinding["topic"]>): AtlasPublishedFinding | undefined {
  const published = publishedFindingOf(record, findingNumber, ownerTopic);
  const base = published ?? publishedFieldsOf(record, findingNumber, ownerTopic);
  return (base === undefined ? undefined : inCardContext(base, record, titles, findingNumber)) ?? published;
}

/**
 * Brings a card's publications in line with the owner's decisions (accept, edit, reject) and erasures: each publication
 * of a decided finding that is not withdrawn takes its decided state, and one whose F number has a recorded erasure has
 * its published fields erased. Given the stored card, an accepted or edited finding of which the card has no
 * publication at all is published in its decided state (decidedPublicationDraft), unless the card is set aside; a
 * finding with a publication in any state, withdrawn or rejected included, gets no other. The review calls it after
 * each decision and on each read of the card, so a state the decision's own call did not move (the store answered with
 * an error) is moved, or a publication it did not make is made, by the next one. Returns what changed.
 */
export async function reconcileCardPublications(input: {
  store: AtlasPublicationStore;
  cardNumber: number;
  decisions: readonly AtlasDecisionView[];
  intentsOf: (publicNumbers: readonly string[]) => Promise<readonly AtlasIntentView[]>;
  at: string;
  /** The stored card, when the caller read it, so a decided finding without a publication gets one. */
  card?: { record: FindingsRecord; setAside: boolean };
}): Promise<AtlasPublicationView[]> {
  const rows = await input.store.inspect({ cardNumbers: [input.cardNumber], limit: 100 });
  const live = rows.filter((row) => row.state !== "withdrawn" && row.cardForgottenAt === null);
  const findingDecisions = input.decisions.filter((decision) => decision.itemKind === "finding");
  const unpublished = findingDecisions.filter((decision) => decision.decision !== "rejected" &&
    !rows.some((row) => row.findingNumber === decision.itemNumber));
  const creates = input.card !== undefined && !input.card.setAside && unpublished.length > 0;
  if ((live.length === 0 && !creates) || findingDecisions.length === 0) return [];
  const numbers = [...new Set(findingDecisions.flatMap(({ publicNumber }) => publicNumber === null ? [] : [publicNumber]))];
  const intents = numbers.length === 0 ? [] : await input.intentsOf(numbers);
  const changed: AtlasPublicationView[] = [];
  if (creates) {
    const drafts = unpublished.flatMap((decision) => {
      const target = decidedPublicationState(decision, intents);
      const draft = target === undefined ? undefined
        : decidedPublicationDraft(input.card!.record, decision.itemNumber, target);
      // The owner's decision publishes it: the owner's action (Codex's re-review of 17 Nov 2026, finding 4).
      return draft === undefined ? [] : [{ ...draft, shownBy: "owner_action" as const }];
    });
    if (drafts.length > 0) {
      changed.push(...(await input.store.publish({
        cardNumber: input.cardNumber,
        cardSha256: input.card!.record.card_sha256,
        findings: drafts,
        publishedAt: input.at,
        revive: false,
      })).filter(({ outcome }) => outcome === "published"));
    }
  }
  for (const decision of findingDecisions) {
    const target = decidedPublicationState(decision, intents);
    if (target === undefined) continue;
    const behind = live.some((row) => row.findingNumber === decision.itemNumber &&
      (row.state !== target.state || row.atlasNumber !== target.atlasNumber));
    if (behind) {
      changed.push(...await input.store.decide({
        cardNumber: input.cardNumber,
        findingNumber: decision.itemNumber,
        state: target.state,
        atlasNumber: target.atlasNumber,
        decidedAt: input.at,
      }));
    }
  }
  // The rows as they are now, the moves just made included.
  const current = new Map(rows.map((row) => [row.publicationNumber, row]));
  for (const row of changed) current.set(row.publicationNumber, row);
  const erased = new Set(intents.filter((intent) => intent.intentKind === "erase" && intent.status !== "FAILED")
    .map(({ publicNumber }) => publicNumber));
  for (const number of erased) {
    if ([...current.values()].some((row) => row.atlasNumber === number && row.textsErasedAt === null)) {
      changed.push(...await input.store.eraseTexts(number, input.at));
    }
  }
  return changed;
}
