import type {
  PublicDossier,
  PublicDossierFinding,
  PublicDossierStudy,
} from "../findings/dossier-publication.js";
import { resultSizes } from "../findings/dossier-publication.js";

/**
 * The ranking rule for research dossiers on a topic page, in the owner's words (owner answer 333a, 16 November 2026):
 *
 * 1. A finding comes higher the more it could change what a reader decides: first what could change a decision, then
 *    what is important, then background.
 * 2. Between findings that matter equally, one an ordinary AI answer would miss comes first.
 * 3. A finding that something is not known never comes before a finding of what the same form is known to do for the
 *    same people: that it helps, harms, or was measured to make no difference. A measured "no difference" counts as
 *    known.
 * 4. Every finding shows its kind of evidence beside it. Evidence strength decides the order only between findings
 *    that are otherwise equal.
 *
 * How each part is read here, exactly, from what the dossiers declare:
 * - "Could change a decision" is the finding's importance mark (decision_changing, important, context), which the
 *   researching AI set. The owner's review revises a mark only by a new version of the copy, with the reviewer and the
 *   reason recorded; the version it replaces stays as it was (Codex's review of stage 2, finding 7).
 * - "An ordinary AI answer would miss it" is the AI's own list of the findings that save the most work against one
 *   ordinary answer (value.adds); stage 2 has no separate novelty test.
 * - Rule 3 reads the form and the people as the AI declared them: the finding's form, and its population_key, a short
 *   key the AI gives for the people it applies to. A "not known" finding goes after every known finding with the same
 *   form and the same people. A form or people not declared never match anything, so a finding that gives neither is
 *   not moved. Known means helps, harms, no difference or mixed (mixed results were measured too). It moves only the
 *   "not known" finding; the others keep their order.
 * - Strength, a tie-break only: human trials, then reviews, observational studies, case reports, animal studies, and
 *   lab studies and people's reports last, a search alone below them; then how certain the finding is.
 * Then the newer dossier first, then the dossier's own order, so the order is the same on every read.
 */

export const DOSSIER_ORDER_LINE = "Findings that could change a decision come first, hard-to-find ones first among " +
  "equals; each says what kind of evidence it rests on, and what is unknown never comes before what is known.";

export type DossierEvidenceKind =
  | "human_trial" | "review" | "human_observational" | "case_report" | "animal" | "lab" | "people_reports" | "searches";

const STRENGTH: Readonly<Record<DossierEvidenceKind, number>> = {
  human_trial: 6, review: 5, human_observational: 4, case_report: 3, animal: 2, lab: 1, people_reports: 1, searches: 0,
};
const IMPORTANCE: Readonly<Record<PublicDossierFinding["importance"], number>> = {
  decision_changing: 0, important: 1, context: 2,
};
const CERTAINTY: Readonly<Record<string, number>> = { high: 0, moderate: 1, low: 2, very_low: 3 };
const KNOWN: ReadonlySet<string> = new Set(["helps", "harms", "no_difference", "mixed"]);

/** One kind of evidence a finding rests on: how many studies (or threads), and the people in those that say. */
export interface DossierEvidencePart {
  kind: DossierEvidenceKind;
  count: number;
  /** The people in the studies of this kind that give a size, from their participants or their results' groups. */
  people: number;
  /** How many of them give no size. */
  unsized: number;
}

export interface DossierFindingEvidence {
  parts: DossierEvidencePart[];
  /** The strongest kind's strength, for the tie-break. */
  strength: number;
}

/** The studies a finding rests on, directly or through its results, each once. */
export function findingStudies(dossier: PublicDossier, finding: PublicDossierFinding): PublicDossierStudy[] {
  const studies = new Map(dossier.studies.map((study) => [study.id, study]));
  const ids = new Set<string>();
  for (const reference of finding.rests_on) {
    if (studies.has(reference)) ids.add(reference);
    const result = dossier.results.find(({ id }) => id === reference);
    if (result !== undefined && studies.has(result.study)) ids.add(result.study);
  }
  return [...ids].map((id) => studies.get(id)!);
}

/** A study's people: its participants, or the largest total its results give. */
export function studyPeople(dossier: PublicDossier, study: PublicDossierStudy): number | undefined {
  if (study.participants !== undefined) return study.participants;
  const totals = dossier.results.filter((result) => result.study === study.id).flatMap((result) => {
    const sizes = resultSizes(result);
    return sizes === undefined ? [] : [sizes.option + (sizes.comparator ?? 0)];
  });
  return totals.length === 0 ? undefined : Math.max(...totals);
}

export function findingEvidence(dossier: PublicDossier, finding: PublicDossierFinding): DossierFindingEvidence {
  const parts = new Map<DossierEvidenceKind, DossierEvidencePart>();
  const add = (kind: DossierEvidenceKind, people: number | undefined) => {
    const part = parts.get(kind) ?? { kind, count: 0, people: 0, unsized: 0 };
    part.count += 1;
    if (people === undefined) part.unsized += 1;
    else part.people += people;
    parts.set(kind, part);
  };
  for (const study of findingStudies(dossier, finding)) {
    add(study.kind as DossierEvidenceKind, studyPeople(dossier, study));
  }
  if (finding.rests_on.includes("community") && dossier.community !== undefined) {
    const people = dossier.community.people;
    parts.set("people_reports", { kind: "people_reports", count: dossier.community.threads_read,
      people: people.better + people.no_change + people.worse + people.mixed, unsized: 0 });
  }
  if (parts.size === 0 && finding.rests_on.some((reference) => dossier.searches.some(({ id }) => id === reference))) {
    parts.set("searches", { kind: "searches", count: finding.rests_on.filter((reference) =>
      dossier.searches.some(({ id }) => id === reference)).length, people: 0, unsized: 0 });
  }
  const ordered = [...parts.values()].sort((left, right) => (STRENGTH[right.kind] ?? 0) - (STRENGTH[left.kind] ?? 0));
  return { parts: ordered, strength: ordered.length === 0 ? 0 : STRENGTH[ordered[0]!.kind] ?? 0 };
}

export interface DossierRankItem {
  publicNumber: string;
  dossier: PublicDossier;
  finding: PublicDossierFinding;
  evidence: DossierFindingEvidence;
  shownAt: string;
  accepted: boolean;
  /** The finding's place in its dossier. */
  place: number;
}

export function dossierRankItems(dossiers: ReadonlyArray<{ publicNumber: string; dossier: PublicDossier; shownAt: string;
  accepted: boolean }>): DossierRankItem[] {
  return dossiers.flatMap(({ publicNumber, dossier, shownAt, accepted }) => dossier.findings.map((finding, place) => ({
    publicNumber, dossier, finding, evidence: findingEvidence(dossier, finding), shownAt, accepted, place,
  })));
}

/**
 * The form and the people a finding is about, as declared, or undefined when either is not given: then it matches
 * nothing (Codex's review of stage 2, finding 7).
 */
const identityOf = (item: Pick<DossierRankItem, "finding">): string | undefined => {
  const form = item.finding.form?.trim().toLocaleLowerCase("en");
  const people = item.finding.population_key?.trim().toLocaleLowerCase("en");
  return form === undefined || form === "" || people === undefined || people === "" ? undefined
    : JSON.stringify([form, people]);
};

/** What the ranking reads of a finding: never its dossier's other parts, so a topic's every finding can be ranked. */
export type DossierRankKey = Pick<DossierRankItem, "publicNumber" | "finding" | "evidence" | "shownAt" | "place">;

/**
 * The findings in the order of rule 333a. Rule 3 in one pass (Codex's re-review of stage 2: a topic's every finding is
 * ranked now, so the order cannot cost the cube of their number): after the sort, each "not known" finding that a known
 * finding of its form and people follows moves to just after the last of them; those that move after the same known
 * finding go in the reverse of their order, as moving each in turn, the first first, puts them; nothing else moves.
 */
export function rankDossierFindings<T extends DossierRankKey>(items: readonly T[]): T[] {
  const sorted = [...items].sort((left, right) =>
    IMPORTANCE[left.finding.importance] - IMPORTANCE[right.finding.importance] ||
    Number(right.finding.hard_to_find) - Number(left.finding.hard_to_find) ||
    right.evidence.strength - left.evidence.strength ||
    (CERTAINTY[left.finding.certainty] ?? 4) - (CERTAINTY[right.finding.certainty] ?? 4) ||
    Date.parse(right.shownAt) - Date.parse(left.shownAt) ||
    left.publicNumber.localeCompare(right.publicNumber) ||
    left.place - right.place);
  const lastKnown = new Map<string, number>();
  sorted.forEach((item, index) => {
    const identity = KNOWN.has(item.finding.kind) ? identityOf(item) : undefined;
    if (identity !== undefined) lastKnown.set(identity, index);
  });
  const following = new Map<number, T[]>();
  const moved = new Set<number>();
  sorted.forEach((item, index) => {
    if (item.finding.kind !== "not_known") return;
    const identity = identityOf(item);
    const last = identity === undefined ? undefined : lastKnown.get(identity);
    if (last === undefined || last < index) return;
    moved.add(index);
    following.set(last, [item, ...following.get(last) ?? []]);
  });
  return sorted.flatMap((item, index) => moved.has(index) ? [] : [item, ...following.get(index) ?? []]);
}
