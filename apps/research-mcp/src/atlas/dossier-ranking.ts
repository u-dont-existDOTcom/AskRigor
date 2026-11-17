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
 *   researching AI set and the owner's review can change.
 * - "An ordinary AI answer would miss it" is the AI's own list of the findings that save the most work against one
 *   ordinary answer (value.adds); stage 2 has no separate novelty test.
 * - Rule 3 compares forms only, not people: a finding's people are free text, which code cannot match. So a
 *   "not known" finding goes after every known finding of the same declared form, whoever they are about, which keeps
 *   rule 3 for the same people and is stricter for others. Known means helps, harms, no difference or mixed (mixed
 *   results were measured too). It moves only the "not known" finding; the others keep their order.
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

const formOf = (item: DossierRankItem) => item.finding.form?.trim().toLocaleLowerCase("en") ?? "";

/** The findings in the order of rule 333a. */
export function rankDossierFindings(items: readonly DossierRankItem[]): DossierRankItem[] {
  const sorted = [...items].sort((left, right) =>
    IMPORTANCE[left.finding.importance] - IMPORTANCE[right.finding.importance] ||
    Number(right.finding.hard_to_find) - Number(left.finding.hard_to_find) ||
    right.evidence.strength - left.evidence.strength ||
    (CERTAINTY[left.finding.certainty] ?? 4) - (CERTAINTY[right.finding.certainty] ?? 4) ||
    Date.parse(right.shownAt) - Date.parse(left.shownAt) ||
    left.publicNumber.localeCompare(right.publicNumber) ||
    left.place - right.place);
  // Rule 3: each "not known" finding moves after the last known finding of its form; nothing else moves.
  let moved = true;
  for (let guard = 0; moved && guard < sorted.length * sorted.length + 1; guard += 1) {
    moved = false;
    for (let index = 0; index < sorted.length; index += 1) {
      const item = sorted[index]!;
      if (item.finding.kind !== "not_known") continue;
      let last = -1;
      for (let later = index + 1; later < sorted.length; later += 1) {
        const other = sorted[later]!;
        if (KNOWN.has(other.finding.kind) && formOf(other) === formOf(item)) last = later;
      }
      if (last > index) {
        sorted.splice(index, 1);
        sorted.splice(last, 0, item);
        moved = true;
        break;
      }
    }
  }
  return sorted;
}
