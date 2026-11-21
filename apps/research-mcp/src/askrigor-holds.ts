import { ATLAS_NAMED_VIDEOS_PER_FINDING, type AtlasPageSource } from "@askrigor/evidence-repository";
import { z } from "zod";

import { ATLAS_NEAR, nearAtlasMatches } from "./atlas/near-match.js";
import { loadAtlasSearchIndex, NOT_CHECKED_LABEL, type AtlasSearchIndex, type ShownFinding } from "./atlas/page-data.js";
import { machineFinding } from "./atlas/person-claims.js";
import { atlasPageUrl } from "./atlas/reuse.js";
import { ownerPointersFor, type OwnerPointer } from "./owner-pointers.js";

/**
 * What AskRigor already holds for a question, handed over when its plain answer is registered (the owner, 14 November
 * 2026: "make sure if someone asks about peeling sweet potatoes it explains they should cut out any parts that turn
 * dark after some seconds of air contact", "make sure someone asking ... can see this video", "anyone asking how they
 * can get into flow state also should know about Systema breathing"). Two things, kept apart: the Atlas's findings
 * near the question (atlas/near-match.ts), and the owner's pointers for it (owner-pointers.ts). Every account gets
 * them, in every lane: a look-up AskRigor steps aside for is the very case where the AI would not have searched the
 * Atlas. Nothing is kept and nothing leaves the server: the registered research target is read against the Atlas's
 * public findings and the pointers' word groups, in memory.
 *
 * Codex's review of 14 November 2026 shaped five things here: a registration waits at most ATLAS_NEAR_WAIT_MS, and
 * only for the first reading (later ones refresh behind an answer); a reading that fails is tried again after
 * ATLAS_NEAR_RETRY_MS, not at every registration; a finding keeps its label (a lead, a contested one) and a
 * superseded one is not handed over; what is handed over shrinks to fit the result's size; and the texts are given
 * once, in the structured result, with how to use them beside them.
 */
export const OWNER_POINTERS_SHOWN = 4;
export const OWNER_POINTERS_LISTED = 12;

export const heldAtlasFindingSchema = z.object({
  publication_number: z.string(),
  state: z.enum(["checked", NOT_CHECKED_LABEL]),
  /** unreviewed, or the owner's label for a reviewed finding: checked, lead or contested. */
  label: z.string(),
  certainty: z.string().nullable(),
  wording: z.string(),
  applies_to: z.string().nullable(),
  question: z.string().nullable(),
  page_url: z.url(),
  shared_words: z.array(z.string()),
  /**
   * Owner answer 307b (15 November 2026): the YouTube videos a person named that the finding is about, each as its
   * watch page, as the finding's page links them; left out when it has none.
   */
  named_videos: z.array(z.url()).min(1).max(ATLAS_NAMED_VIDEOS_PER_FINDING).optional(),
}).strict();
export type HeldAtlasFinding = z.infer<typeof heldAtlasFindingSchema>;

export const shownOwnerPointerSchema = z.object({
  id: z.string(),
  about: z.string(),
  says: z.string(),
  link: z.object({ title: z.string(), url: z.url() }).strict().optional(),
  checked: z.string(),
  limits: z.string(),
  added: z.string(),
}).strict();
export type ShownOwnerPointer = z.infer<typeof shownOwnerPointerSchema>;

export const askrigorHoldsSchema = z.object({
  how_to_use: z.string(),
  atlas_findings: z.array(heldAtlasFindingSchema).max(ATLAS_NEAR.matches).optional(),
  owner_pointers: z.array(shownOwnerPointerSchema).max(OWNER_POINTERS_SHOWN).optional(),
  other_owner_pointers: z.array(z.object({ id: z.string(), about: z.string() }).strict()).max(OWNER_POINTERS_LISTED)
    .optional(),
}).strict();
export type AskRigorHolds = z.infer<typeof askrigorHoldsSchema>;

export interface AskRigorHoldsOptions {
  /** The Atlas's findings near a text; it answers with none rather than fail. */
  atlas?: (text: string) => Promise<HeldAtlasFinding[]>;
  /** The owner's pointers. */
  pointers?: () => readonly OwnerPointer[];
}

export function shownOwnerPointer({ id, about, says, link, checked, limits, added }: OwnerPointer): ShownOwnerPointer {
  return { id, about, says, ...(link === undefined ? {} : { link: { ...link } }), checked, limits, added };
}

function heldFinding(shown: ShownFinding, words: readonly string[], origin: string): HeldAtlasFinding {
  // Atlas Release B (Fable's recheck, change 2): what another AI app is handed follows the lookup's rule, so an
  // unverified claim about a named person is left out, with the line saying so, never handed over in brackets.
  const finding = machineFinding(shown);
  return {
    publication_number: finding.publicationNumber,
    state: finding.status.kind === "unreviewed" ? NOT_CHECKED_LABEL : "checked",
    label: finding.status.kind,
    certainty: finding.certainty,
    wording: finding.claim,
    applies_to: finding.appliesTo,
    question: finding.question,
    page_url: atlasPageUrl(finding.publicationNumber, origin),
    shared_words: [...words],
    ...(finding.namedVideos.length === 0 ? {} : { named_videos: [...finding.namedVideos] }),
  };
}

/** How long one reading of the Atlas's findings serves, how long a first reading may hold a registration, and how soon a failed one is tried again. */
export const ATLAS_NEAR_KEEP_MS = 5 * 60_000;
export const ATLAS_NEAR_WAIT_MS = 1_500;
export const ATLAS_NEAR_RETRY_MS = 30_000;

/**
 * The findings near a text, from the Atlas's shown findings and those kept for research (as the lookup reads them),
 * without those a later finding replaced. A registration never fails for the Atlas and barely waits for it:
 * - the findings are read once, then again when a registration comes ATLAS_NEAR_KEEP_MS after the last reading; that
 *   registration is answered from the earlier reading, and the new one serves those after it;
 * - only while there is no reading yet does a registration wait, at most ATLAS_NEAR_WAIT_MS; when that is not
 *   enough it gets none, and so do the registrations of the next ATLAS_NEAR_RETRY_MS, without waiting;
 * - a reading that fails is tried again by the first registration ATLAS_NEAR_RETRY_MS later, never by each one.
 */
export function atlasNearFinder(source: AtlasPageSource, settings: {
  origin?: string; now?: () => number; keepMs?: number; waitMs?: number; retryMs?: number;
  load?: (source: AtlasPageSource) => Promise<AtlasSearchIndex>;
  /**
   * Atlas Release B, while the mark is on (Fable's recheck, change 2): a reading older than keepMs is never used, so a
   * claim taken off after a dispute is not handed over from it; a registration waits for the new one, at most waitMs,
   * or gets none.
   */
  fresh?: boolean;
} = {}): (text: string) => Promise<HeldAtlasFinding[]> {
  const origin = settings.origin ?? "https://askrigor.com";
  const now = settings.now ?? Date.now;
  const keepMs = settings.keepMs ?? ATLAS_NEAR_KEEP_MS;
  const waitMs = settings.waitMs ?? ATLAS_NEAR_WAIT_MS;
  const retryMs = settings.retryMs ?? ATLAS_NEAR_RETRY_MS;
  const load = settings.load ?? ((from: AtlasPageSource) => loadAtlasSearchIndex(from, true));
  let ready: AtlasSearchIndex | undefined;
  /** When the reading that is ready began: its findings are as of then. */
  let readyAt = Number.NEGATIVE_INFINITY;
  let readAgainAt = Number.NEGATIVE_INFINITY;
  let noWaitUntil = Number.NEGATIVE_INFINITY;
  let reading: Promise<AtlasSearchIndex> | undefined;
  /** When the reading in flight began. */
  let readingBegan = Number.NEGATIVE_INFINITY;
  const fresh = settings.fresh === true;
  const read = (): void => {
    // While the mark is on, a reading in flight that began keepMs ago or more no longer stands for a new one (Codex's
    // check of the last fix round): its findings would be too old to hand over when it ends.
    if (reading !== undefined && !(fresh && now() - readingBegan >= keepMs)) return;
    const began = now();
    readingBegan = began;
    const mine = Promise.resolve().then(() => load(source)).then((index): AtlasSearchIndex => ({
      // A finding a later one replaced is not handed over; its replacement is, where it is near.
      entries: index.entries.filter(({ finding }) => finding.status.kind !== "superseded"), bytes: index.bytes,
    }));
    reading = mine;
    mine.then((index) => {
      // A reading that ends after a newer one never replaces it.
      if (began < readyAt) return;
      ready = index;
      readyAt = began;
      // While the mark is on, the keep time counts from when the reading began, as its findings are as of then.
      readAgainAt = fresh ? began + keepMs : now() + keepMs;
    }, () => {
      readAgainAt = now() + retryMs;
    }).finally(() => {
      if (reading === mine) reading = undefined;
    });
  };
  return async (text) => {
    try {
      const current = now();
      if (current >= readAgainAt) read();
      let index = fresh && current - readyAt >= keepMs ? undefined : ready;
      if (index === undefined) {
        const first = reading;
        const firstBegan = readingBegan;
        if (first === undefined || current < noWaitUntil) return [];
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("ATLAS_NEAR_LATE")), waitMs);
        });
        try {
          index = await Promise.race([first, late]);
        } catch (error) {
          if (error instanceof Error && error.message === "ATLAS_NEAR_LATE") noWaitUntil = now() + retryMs;
          return [];
        } finally {
          clearTimeout(timer);
        }
        // Never one that began keepMs ago or more, even if it ended during this wait.
        if (fresh && now() - firstBegan >= keepMs) return [];
      }
      return nearAtlasMatches(index, text).map(({ finding, words }) => heldFinding(finding, words, origin));
    } catch {
      return [];
    }
  };
}

export const OWNER_POINTER_HOW = "It is the owner's own pointer, not a finding of AskRigor's: after your answer, give " +
  "it to the person as that, in a short paragraph of its own, with its link if it has one, what AskRigor checked and " +
  "what to weigh. Leave it out when the question is about something else than its subject.";

/** How to use what is handed over, said once, beside it: an app may give its model only the structured result. */
function howToUse(findings: number, pointers: number, others: number, videos = false): string {
  const parts: string[] = [];
  if (findings > 0) {
    // 14 Nov 2026, the owner's ChatGPT after the release: told to give a finding "where one bears on the question",
    // it left out both sweet potato findings for "How do I peel sweet potatoes?", since neither "changes the peeling
    // instructions". The owner asked for the opposite: a person asking about the subject is told. So a finding on
    // the question's subject is given, after the answer, unless it is plainly about another thing.
    parts.push(`atlas_findings: AskRigor's Atlas already holds ${findings === 1 ? "a finding" : `${findings} findings`} ` +
      "on what this question is about (shared_words gives the words each shares with it). After your answer, in " +
      "any lane, give each to the person in a sentence or two, under words such as \"AskRigor's Atlas also holds " +
      "this:\" in the person's language: what it found, what that means for what the person is doing or asking " +
      "about, for whom it holds, how sure it is, and its page_url. Give it also when it does not answer the " +
      "question itself: the person is dealing with its subject and may not know it. Leave a finding out only when " +
      "it is plainly about another thing than the question is (another food, substance, condition or device). One " +
      `whose state is ${JSON.stringify(NOT_CHECKED_LABEL)} was written by an AI and not reviewed by a person: say ` +
      "so, and give it as a lead, not as established. Give one labelled lead or contested as that. When you " +
      "research, search_research_frontiers still gives the receipt the final check needs." +
      // Owner answer 307b: said only when a finding links a video, so the words every other registration gets stand.
      (videos ? " A finding that gives named_videos is about those videos, which a person named: give their links " +
        "with it, as the videos it is about, not as its evidence." : ""));
  }
  if (pointers > 0) {
    parts.push("owner_pointers: AskRigor's owner asked that people with this kind of question be shown " +
      `${pointers === 1 ? "this" : "these"}. ${OWNER_POINTER_HOW}`);
  }
  if (others > 0) {
    parts.push(`other_owner_pointers: the questions AskRigor's owner keeps ${pointers > 0 ? "other pointers" : "pointers"} ` +
      "for. Only if this question is about one of them, in other words or another language, call " +
      "manage_research_access with action owner_pointer and later_inputs.ownerPointer set to its id, and give it to " +
      "the person as its result says.");
  }
  return parts.join(" ");
}

/** What AskRigor holds for a research target; undefined when there is nothing to hand over. */
export async function heldFor(options: AskRigorHoldsOptions | undefined, text: string): Promise<AskRigorHolds | undefined> {
  if (options === undefined) return undefined;
  const pointers = options.pointers?.() ?? [];
  const matched = ownerPointersFor(text, pointers).slice(0, OWNER_POINTERS_SHOWN);
  const others = pointers.filter((pointer) => !matched.includes(pointer)).slice(0, OWNER_POINTERS_LISTED);
  const findings = options.atlas === undefined ? []
    : (await options.atlas(text).catch(() => [])).slice(0, ATLAS_NEAR.matches);
  return holding(findings, matched.map(shownOwnerPointer), others.map(({ id, about }) => ({ id, about })));
}

function holding(findings: readonly HeldAtlasFinding[], pointers: readonly ShownOwnerPointer[],
  others: ReadonlyArray<{ id: string; about: string }>): AskRigorHolds | undefined {
  if (findings.length === 0 && pointers.length === 0 && others.length === 0) return undefined;
  return {
    how_to_use: howToUse(findings.length, pointers.length, others.length,
      findings.some(({ named_videos: links }) => (links ?? []).length > 0)),
    ...(findings.length === 0 ? {} : { atlas_findings: [...findings] }),
    ...(pointers.length === 0 ? {} : { owner_pointers: [...pointers] }),
    ...(others.length === 0 ? {} : { other_owner_pointers: [...others] }),
  };
}

/**
 * The same, and then less of it: the last finding dropped, one at a time; then the matched pointers listed by id and
 * subject only; then nothing (undefined). A registration takes the first that keeps its result within the size a
 * client accepts: a research target may be 5,000 characters and is itself repeated in the result.
 */
export function heldVariants(held: AskRigorHolds | undefined): Array<AskRigorHolds | undefined> {
  if (held === undefined) return [undefined];
  const findings = held.atlas_findings ?? [];
  const pointers = held.owner_pointers ?? [];
  const others = held.other_owner_pointers ?? [];
  const variants: Array<AskRigorHolds | undefined> = [held];
  for (let kept = findings.length - 1; kept >= 0; kept--) variants.push(holding(findings.slice(0, kept), pointers, others));
  if (pointers.length > 0) {
    variants.push(holding([], [], [...pointers.map(({ id, about }) => ({ id, about })), ...others]
      .slice(0, OWNER_POINTERS_LISTED)));
  }
  variants.push(undefined);
  return variants.filter((variant, at) => at === 0 || variant !== undefined || at === variants.length - 1);
}

/** Whether there is something to give the person now, not only a list of pointers for other questions. */
export const holdsSomethingNow = (held: AskRigorHolds | undefined): held is AskRigorHolds =>
  held !== undefined && ((held.atlas_findings?.length ?? 0) > 0 || (held.owner_pointers?.length ?? 0) > 0);

export const HELD_NEXT_STEP = "With your answer, give the person what askrigor_holds in this result holds for the " +
  "question, as its how_to_use says.";

export function ownerPointerText(pointer: ShownOwnerPointer): string {
  return `Owner's pointer ${pointer.id} (for: ${pointer.about}). ${pointer.says}` +
    (pointer.link === undefined ? "" : ` Link: ${pointer.link.title}, ${pointer.link.url}`) +
    ` What AskRigor checked: ${pointer.checked} What to weigh: ${pointer.limits}`;
}

/**
 * What the registration's text says of what AskRigor holds: how to use it and which entries there are, by number and
 * id. The entries' own texts are in the structured result (askrigor_holds), which a client that reads only text gets
 * as text too; saying them here again would give each three times.
 */
export function heldText(held: AskRigorHolds): string {
  const named = [
    ...(held.atlas_findings ?? []).map(({ publication_number, label }) =>
      label === "unreviewed" || label === "checked" ? publication_number : `${publication_number} (${label})`),
    ...(held.owner_pointers ?? []).map(({ id }) => `the owner's pointer ${id}`),
  ];
  return `What AskRigor already holds for this question is in askrigor_holds${named.length === 0 ? "" : ` (${named.join(", ")})`}. ` +
    held.how_to_use;
}
