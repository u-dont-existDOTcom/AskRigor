import { createHash } from "node:crypto";

import {
  ATLAS_DISAGREEMENTS,
  ATLAS_VERIFIED_BASES,
  type AtlasLinkRelation,
} from "@askrigor/evidence-repository";

import type { PrivacyScreenReasonCode } from "../lessons/privacy-screen.js";
import { normalizedFindingsText, screenFindingsText, type StoredFinding, type VerifiedBasis } from "./card.js";
import type { FindingsRecord } from "./service.js";
import { parseAtlasSource } from "./source-checks.js";

/**
 * The exact checks before the owner accepts a saved finding into the Atlas (Atlas phase 2 design, section 2; owner
 * answer 160b): which save of a card a finding comes from and whether it has a verified basis, community evidence
 * under owner decision 4a, the privacy screen on the texts the Atlas would store, the exact re-check key, and the
 * rules for links between findings. The numbers checks are in binary-results.ts and the source checks in
 * source-checks.ts. Each check is exact: closed vocabularies, identifiers, and equality after normalization. What a
 * finding means, its topic, its numbers and its links are the AI's declarations, and the owner accepts or rejects.
 */

/**
 * The verified bases (139c) that make an accepted finding a checked one rather than a lead (3b) are
 * ATLAS_VERIFIED_BASES, defined once with the intents that store them: a full-text audit, a checked absence claim, or
 * a correction the research found. Audited comments are not one (owner choice 2a), so a finding that rests only on
 * them is a lead until the 4a rule for community evidence. Each is a basis the finalization receipt signs:
 */
const ATLAS_BASES_ARE_SIGNED_BASES: readonly VerifiedBasis[] = ATLAS_VERIFIED_BASES;
void ATLAS_BASES_ARE_SIGNED_BASES;
export type AtlasBasis = typeof ATLAS_VERIFIED_BASES[number];

/** A stored finding's bases that count for the Atlas, in ATLAS_VERIFIED_BASES order. */
export function atlasBases(finding: Pick<StoredFinding, "verified_bases">): AtlasBasis[] {
  const signed = finding.verified_bases ?? [];
  return ATLAS_VERIFIED_BASES.filter((basis) => signed.includes(basis));
}

/** The save of a card that a finding's wording, sources and bases come from, and what it would become. */
export interface AtlasFindingSave {
  /** The card's own record, or a later save of it (an occurrence comment). */
  from: "card" | "occurrence";
  /** With from "occurrence": that save's index in the occurrences given. */
  occurrence?: number;
  /** That save's record: its stamp dates the research and names the AskRigor that made it. */
  record: FindingsRecord;
  /** The finding as that save stored it. */
  finding: StoredFinding;
  /** Its bases that count for the Atlas. */
  bases: AtlasBasis[];
  /** A finding with a basis that counts is stored as a finding; one without is a lead (3b). */
  entryKind: "finding" | "lead";
}

/**
 * Which save counts (design section 2): finding n of the card, as the card's own record holds it, when that has a basis
 * that counts; otherwise, of the later saves (occurrence comments) holding a finding with the same normalized claim and
 * a basis that counts, the newest; otherwise the card's own record, as a lead. findingNumber counts from 1, as the
 * owner names findings; undefined when the card has no such finding.
 */
export function atlasBasesOf(
  card: FindingsRecord,
  occurrences: readonly FindingsRecord[],
  findingNumber: number
): AtlasFindingSave | undefined {
  if (!Number.isSafeInteger(findingNumber) || findingNumber < 1) return undefined;
  const own = card.card.findings[findingNumber - 1];
  if (own === undefined) return undefined;
  const ownBases = atlasBases(own);
  if (ownBases.length > 0) return { from: "card", record: card, finding: own, bases: ownBases, entryKind: "finding" };
  const claim = normalizedFindingsText(own.claim);
  const cardSavedAt = Date.parse(card.stamp.saved_at);
  // Newest first by save time, and by later position among saves made at the same time; a save that reads as earlier
  // than the card is not a later save.
  const later = occurrences
    .map((record, index) => ({ record, index, savedAt: Date.parse(record.stamp.saved_at) }))
    .filter(({ savedAt }) => Number.isFinite(savedAt) && !(savedAt < cardSavedAt))
    .sort((left, right) => right.savedAt - left.savedAt || right.index - left.index);
  for (const { record, index } of later) {
    const finding = record.card.findings.find((candidate) =>
      normalizedFindingsText(candidate.claim) === claim && atlasBases(candidate).length > 0);
    if (finding !== undefined) {
      const bases = atlasBases(finding);
      return { from: "occurrence", occurrence: index, record, finding, bases, entryKind: "finding" };
    }
  }
  return { from: "card", record: card, finding: own, bases: [], entryKind: "lead" };
}

export const ATLAS_COMMUNITY_STATES = ["none", "mixed", "community_only"] as const;
export type AtlasCommunityState = typeof ATLAS_COMMUNITY_STATES[number];

export interface AtlasCommunityCheck {
  state: AtlasCommunityState;
  /** community_only: the finding is refused. */
  refused: boolean;
  /** mixed: accepting it needs the owner's confirm. */
  needsConfirmation: boolean;
}

/**
 * Community evidence under owner decision 4a: audited comments, the community_checked tag and YouTube videos are never
 * stored in the Atlas, so a finding with no DOI, PMID, PMCID or NCT source is refused (community_only), and one that
 * also rested on audited comments needs the owner's confirm (mixed), since only its study sources are stored. Pass the
 * sources the accept would keep when the owner keeps fewer than the finding's own.
 */
export function communityState(
  finding: Pick<StoredFinding, "sources" | "tags" | "verified_bases" | "youtube_videos">
): AtlasCommunityCheck {
  if (!finding.sources.some((source) => parseAtlasSource(source) !== undefined)) {
    return { state: "community_only", refused: true, needsConfirmation: false };
  }
  const community = (finding.youtube_videos ?? 0) > 0 || (finding.verified_bases ?? []).includes("comment_audit") ||
    finding.tags.includes("community_checked");
  return community
    ? { state: "mixed", refused: false, needsConfirmation: true }
    : { state: "none", refused: false, needsConfirmation: false };
}

export type AtlasTextReason = PrivacyScreenReasonCode | "card_reference";

export interface AtlasTextProblem {
  field: string;
  reasonCode: AtlasTextReason;
}

// A card's public id as publicFindingsCardId writes it, ARF- and digits, read after normalizedFindingsText (so in any
// case and width, with invisible characters and extra spaces gone), with any dash, and digits of any script.
const CARD_REFERENCE = /arf ?[-‐-―−] ?\p{Nd}/u;

/** Whether a text names a findings card: ARF- followed by digits. */
export function containsCardReference(text: string): boolean {
  return CARD_REFERENCE.test(normalizedFindingsText(text));
}

/**
 * The privacy screen on every text an accept or edit would store (design section 2): the findings card's screen, which
 * sets aside the forms a study summary carries and then applies the lesson queue's screen (whose first-person and
 * address rules read English, as for cards), and a guard that no text names a card, since canonical rows never hold an
 * ARF number. Each field is named with every rule it breaks; an undefined text is skipped.
 */
export function screenAtlasTexts(texts: Readonly<Record<string, string | undefined>>): AtlasTextProblem[] {
  const problems: AtlasTextProblem[] = [];
  for (const [field, text] of Object.entries(texts)) {
    if (text === undefined) continue;
    const reasonCode = screenFindingsText(text);
    if (reasonCode !== undefined) problems.push({ field, reasonCode });
    if (containsCardReference(text)) problems.push({ field, reasonCode: "card_reference" });
  }
  return problems;
}

/**
 * The exact re-check key (design section 2): a later card whose question and claim match a current finding's, with
 * Unicode compatibility form, invisible characters, spacing and case set aside as the library's duplicate key sets them
 * aside, is a re-check of that finding, not a new one. SHA-256, as 64 hexadecimal characters.
 */
export function atlasWordingKey(question: string, claim: string): string {
  const parts = ["askrigor-atlas-wording-v1", normalizedFindingsText(question), normalizedFindingsText(claim)];
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

// The link relations (ATLAS_LINK_RELATIONS) and what two contradicting findings disagree on (ATLAS_DISAGREEMENTS),
// which both pages name, are defined once with the intents that store them.
export type AtlasDisagreement = typeof ATLAS_DISAGREEMENTS[number];

/** A link the AI declared and the owner agreed to, or, with relation unlink, the withdrawal of one. */
export interface AtlasLinkRequest {
  /** The finding the link is recorded on, as F-1007. */
  from: string;
  relation: AtlasLinkRelation | "unlink";
  /** The other finding: "from replaces to" makes to the older side. */
  to: string;
  disagreement?: AtlasDisagreement;
}

/** The Atlas as a link's checks read it: the findings the link names and those the stored links reach. */
export interface AtlasLinkState {
  findings: ReadonlyArray<{ number: string; entryKind: "finding" | "lead"; withdrawn: boolean }>;
  /** The stored links among them, withdrawn ones included. */
  links: ReadonlyArray<{ from: string; relation: AtlasLinkRelation; to: string; withdrawn: boolean }>;
}

export const ATLAS_LINK_PROBLEM_CODES = [
  "finding_missing",
  "same_finding",
  "finding_withdrawn",
  "lead_in_link",
  "disagreement_missing",
  "disagreement_not_allowed",
  "pair_already_linked",
  "link_stored_before",
  "replaces_cycle",
  "link_missing"
] as const;
export type AtlasLinkProblemCode = typeof ATLAS_LINK_PROBLEM_CODES[number];

export interface AtlasLinkProblem {
  code: AtlasLinkProblemCode;
  message: string;
}

/**
 * The exact checks a link meets (design section 2), in the pattern of topicLinkFindings: both findings exist and
 * differ, and neither is withdrawn; a lead takes no part in same_as, narrows or contradicts, and may only be the older
 * side of replaces; contradicts names its disagreement, and no other relation does; no pair carries two relations, in
 * either direction, and a withdrawn link is not recorded again, as each link is stored once; and replaces makes no
 * cycle. An unlink needs both findings and a link between them. Whether the relation is true stays the AI's
 * declaration and the owner's judgment.
 */
export function atlasLinkProblems(link: AtlasLinkRequest, state: AtlasLinkState): AtlasLinkProblem[] {
  const problems: AtlasLinkProblem[] = [];
  const add = (code: AtlasLinkProblemCode, message: string) => problems.push({ code, message });
  const numbered = (value: string) => value.trim().toUpperCase();
  const [from, to] = [numbered(link.from), numbered(link.to)];
  const findingNumbered = (number: string) => state.findings.find((finding) => numbered(finding.number) === number);
  const [fromFinding, toFinding] = [findingNumbered(from), findingNumbered(to)];
  for (const [number, finding] of [[from, fromFinding], [to, toFinding]] as const) {
    if (finding === undefined) {
      add("finding_missing", `${number} is not a finding in the Atlas: name two stored findings.`);
    }
  }
  if (from === to) add("same_finding", `${from} cannot be linked to itself: name two different findings.`);
  if (fromFinding === undefined || toFinding === undefined || from === to) return problems;

  const links = state.links.map((stored) => ({ ...stored, from: numbered(stored.from), to: numbered(stored.to) }));
  const between = links.find((stored) => !stored.withdrawn &&
    ((stored.from === from && stored.to === to) || (stored.from === to && stored.to === from)));
  if (link.relation === "unlink") {
    if (between === undefined) add("link_missing", `${from} and ${to} have no link to withdraw.`);
    if (link.disagreement !== undefined) {
      add("disagreement_not_allowed", "disagreement goes only with contradicts: leave it out.");
    }
    return problems;
  }
  for (const [number, finding] of [[from, fromFinding], [to, toFinding]] as const) {
    if (finding.withdrawn) add("finding_withdrawn", `${number} is withdrawn: a withdrawn finding takes no new links.`);
  }
  if (link.relation === "replaces") {
    if (fromFinding.entryKind === "lead") {
      add("lead_in_link", `${from} is a lead: a lead may only be the older side of replaces, the finding replaced.`);
    }
  } else {
    for (const [number, finding] of [[from, fromFinding], [to, toFinding]] as const) {
      if (finding.entryKind === "lead") {
        add("lead_in_link", `${number} is a lead: a lead takes no part in ${link.relation}, and may only be the ` +
          "older side of replaces.");
      }
    }
  }
  if (link.relation === "contradicts" && link.disagreement === undefined) {
    add("disagreement_missing", `contradicts names what the two findings disagree on, as disagreement: ` +
      `${ATLAS_DISAGREEMENTS.join(", ")}.`);
  } else if (link.relation !== "contradicts" && link.disagreement !== undefined) {
    add("disagreement_not_allowed", "disagreement goes only with contradicts: leave it out.");
  }
  if (between !== undefined) {
    add("pair_already_linked", `${from} and ${to} are already linked (${between.from} ${between.relation} ` +
      `${between.to}): a pair carries one relation, so unlink it first to record another.`);
  } else if (links.some((stored) => stored.withdrawn && stored.from === from && stored.to === to &&
    stored.relation === link.relation)) {
    add("link_stored_before", `${from} ${link.relation} ${to} was recorded before and withdrawn: the same link is ` +
      "not recorded again.");
  }
  if (link.relation === "replaces" && replacesPath(links, to, from)) {
    add("replaces_cycle", `${to} already replaces ${from}, directly or through other findings, so ${from} replaces ` +
      `${to} would make a cycle.`);
  }
  return problems;
}

/** Whether a finding reaches another through standing replaces links, each "x replaces y" read from x to y. */
function replacesPath(
  links: ReadonlyArray<{ from: string; relation: AtlasLinkRelation; to: string; withdrawn: boolean }>,
  start: string,
  target: string
): boolean {
  const seen = new Set<string>();
  const queue = [start];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (next === target) return true;
    if (seen.has(next)) continue;
    seen.add(next);
    for (const stored of links) {
      if (!stored.withdrawn && stored.relation === "replaces" && stored.from === next) queue.push(stored.to);
    }
  }
  return false;
}
