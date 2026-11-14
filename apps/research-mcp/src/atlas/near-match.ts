import type { AtlasSearchIndex, ShownFinding } from "./page-data.js";
import { atlasSearchWords } from "./search.js";

/**
 * The findings near a question (the owner, 14 November 2026: "make sure if someone asks about peeling sweet potatoes
 * it explains they should cut out any parts that turn dark after some seconds of air contact"). The Atlas held that
 * finding, and an AI gets a finding only when it searches the Atlas with words every one of which the finding holds:
 * a person who asks how to peel sweet potatoes gets a plain answer, or a search for "peeling", and never sees it. So
 * when a question is registered AskRigor looks itself, by what each finding is about: its subject and its topic's
 * label, never the sentences of its wording, question or research. A finding is near when the question shares two
 * words with its subject, or two with its topic's label, each a word that few findings hold there; or when its
 * subject is one word and the question holds it.
 *
 * Tried on 14 November 2026 against the Atlas's 196 findings with 55 everyday questions. Matching the wording too,
 * with "few findings hold it" as the only test, handed over findings for words such as what, about and from, which
 * few of the Atlas's terse sentences hold; one shared word in a subject did the same for therapy, pressure and
 * exercise. Subjects and topic labels name things, so two shared words there, in the same one, seldom meet by
 * chance: every sweet potato question got both of its findings, twelve questions got findings on their own topic,
 * three got one that does not bear on them (a question about green potatoes got the sweet potato findings), and the
 * other forty got none. How common a word is comes from the findings themselves, never from a word list. Whether a
 * near finding bears on the question stays the AI's judgment; this only makes sure it sees the finding.
 */
export const ATLAS_NEAR = {
  /** At most this many findings are handed over. */
  matches: 3,
  /** A shorter word tells too little; counted in characters, in any script. */
  wordCharacters: 4,
  /** A word counts in subjects, or in topic labels, when at most a tenth of the findings hold it there, and always when at most three do. */
  fewShare: 10,
  fewAtLeast: 3,
  /** The question's first words, at most; a research target is at most 5,000 characters. */
  words: 80,
} as const;

export interface AtlasNearMatch {
  finding: ShownFinding;
  /** The question's words the finding shares, as the question wrote them (folded), the rarest first. */
  words: string[];
}

/**
 * A word and, for an English plural, its singular: the findings are written in English, and "potatoes" must find
 * "sweetpotato". A form is looked for inside longer words too, as the Atlas's own search does.
 */
function formsOf(word: string): string[] {
  const forms = [word];
  if (!/^[a-z]+$/u.test(word)) return forms;
  if (word.length > 5 && word.endsWith("ies")) forms.push(`${word.slice(0, -3)}y`);
  if (word.length > 5 && word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) forms.push(word.slice(0, -1));
  return forms;
}

const tells = (word: string): boolean => Array.from(word).length >= ATLAS_NEAR.wordCharacters && /\p{L}/u.test(word);

/** The question's words that can tell findings apart: long enough, holding a letter, each once, in its order. */
export function nearWordsOf(text: string): string[] {
  return [...new Set(atlasSearchWords(text).filter(tells))].slice(0, ATLAS_NEAR.words);
}

interface Shared { word: string; holders: number }

/**
 * The findings near the text, the nearest first: more shared words, then rarer ones, then the index's own order (the
 * newest first); a finding found only by its one-word subject comes after those found by two words. An index with no
 * finding, or a text with no telling word, gives none.
 */
export function nearAtlasMatches(index: AtlasSearchIndex, text: string, limit: number = ATLAS_NEAR.matches): AtlasNearMatch[] {
  const total = index.entries.length;
  const words = nearWordsOf(text);
  if (total === 0 || words.length === 0 || limit < 1) return [];
  // The index's texts are folded already (foldAtlasSearchTexts), as the question's words are.
  const part = (field: "subject" | "topic"): string[] => index.entries.map(({ texts }) =>
    texts.filter((entry) => entry.field === field).map((entry) => entry.text).join("\n"));
  const subjects = part("subject");
  const topics = part("topic");
  const few = Math.max(ATLAS_NEAR.fewAtLeast, Math.floor(total / ATLAS_NEAR.fewShare));
  const inSubject: Shared[][] = index.entries.map(() => []);
  const inTopic: Shared[][] = index.entries.map(() => []);
  const bySubjectAlone: Array<string | undefined> = index.entries.map(() => undefined);
  // A subject of one word, with its own forms: the question names the very thing the finding is about.
  const oneWordSubjects = subjects.map((subject) => {
    const subjectWords = atlasSearchWords(subject);
    return subjectWords.length === 1 && tells(subjectWords[0]!) ? formsOf(subjectWords[0]!) : undefined;
  });
  for (const word of words) {
    const forms = formsOf(word);
    for (const [parts, shared] of [[subjects, inSubject], [topics, inTopic]] as const) {
      const holders: number[] = [];
      parts.forEach((value, at) => {
        if (value !== "" && forms.some((form) => value.includes(form))) holders.push(at);
      });
      if (holders.length === 0 || holders.length > few) continue;
      for (const at of holders) shared[at]!.push({ word, holders: holders.length });
    }
    oneWordSubjects.forEach((subjectForms, at) => {
      if (bySubjectAlone[at] === undefined && subjectForms?.some((form) => forms.includes(form)) === true) {
        bySubjectAlone[at] = word;
      }
    });
  }
  const rarityOf = (shared: readonly Shared[]): number =>
    shared.length === 0 ? Number.POSITIVE_INFINITY : shared.reduce((sum, { holders }) => sum + holders, 0) / shared.length;
  const near: Array<{ at: number; words: string[]; count: number; rarity: number }> = [];
  index.entries.forEach((_, at) => {
    // The part that shares more words; when both share as many, the one whose words are rarer (Codex's review of
    // 14 Nov 2026: taking the subject on a tie placed a finding by its common subject and hid its rare topic).
    const [subject, topic] = [inSubject[at]!, inTopic[at]!];
    const best = subject.length !== topic.length ? (subject.length > topic.length ? subject : topic)
      : rarityOf(topic) < rarityOf(subject) ? topic : subject;
    if (best.length >= 2) {
      const ordered = [...best].sort((left, right) => left.holders - right.holders);
      near.push({ at, words: ordered.map(({ word }) => word), count: best.length, rarity: rarityOf(best) });
    } else if (bySubjectAlone[at] !== undefined) {
      near.push({ at, words: [bySubjectAlone[at]!], count: 1, rarity: 0 });
    }
  });
  near.sort((left, right) => right.count - left.count || left.rarity - right.rarity || left.at - right.at);
  return near.slice(0, limit).map(({ at, words: found }) => ({ finding: index.entries[at]!.finding, words: found }));
}
