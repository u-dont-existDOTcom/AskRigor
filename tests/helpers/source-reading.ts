import {
  finalizeResearch, normalizeIdentifier, type FinalizeResearchOptions
} from "../../apps/research-mcp/src/research-finalization-gate.js";
import { ANSWER_READING_LABELS, type AnswerReading } from "../../apps/research-mcp/src/source-reading.js";

type Entry = { source: string; reading?: string; quote: string };
type KeySource = { id: string; read_depth?: string; other_route?: string; answer_marker?: string };

// A Markdown link, its label and its target.
const LINK = /\[([^[\]\n]*)\]\(([^\s()]+)\)/gu;

/**
 * How a fixture's paragraph cites a key source beside its words: by its id as written, as the check reads a DOI, PMID or
 * PMCID in the prose, so no link the draft hides is shown; a forum thread, whose id is its link, by the draft's own link
 * to it.
 */
function citationOf(draft: string, id: string): string {
  if (!/^https?:\/\//iu.test(id.trim())) return id;
  const key = id.trim().toLowerCase();
  const decoded = (target: string): string => { try { return decodeURIComponent(target); } catch { return target; } };
  return [...draft.matchAll(LINK)].find(([, , target]) => decoded(target!).toLowerCase() === key)?.[0] ?? id;
}

/** The reading a fixture's answer gives a key source: its declared read_depth, or another tool's for a lead read so. */
export function fixtureReading({ read_depth, other_route }: KeySource): AnswerReading {
  return other_route === "read" ? "other_tool"
    : read_depth !== undefined && Object.hasOwn(ANSWER_READING_LABELS, read_depth)
      ? read_depth as AnswerReading : "found_in_search";
}

/** The words a fixture's answer gives for a key source: its declared reading's, or plain words when it declares none. */
export function fixtureReadingWords(source: KeySource): string {
  return source.other_route !== "read" && (source.read_depth === undefined ||
    !Object.hasOwn(ANSWER_READING_LABELS, source.read_depth))
    ? "read for this answer" : ANSWER_READING_LABELS[fixtureReading(source)];
}

/**
 * The owner, 5 Nov 2026: an answer citing a key source says beside it how it was read, and source_reading gives that
 * reading and copies those words, or the read_depth check holds the answer back. Fixtures that isolate other checks
 * get, for each key source without an entry, an entry in later_inputs giving its declared read_depth as its reading and
 * quoting that reading's words, and those words, beside a citation of the source, in a paragraph of their own at the
 * draft's end, so the reading check changes no other check. Entries a
 * fixture gives itself, at the top level or in later_inputs, are kept, and so is a call without key sources or a draft.
 * A fixture whose test sets later_inputs aside takes the entries at the top level, which the runtime also reads.
 */
export function withSourceReading<T>(
  input: T,
  { topLevel = false, check }: { topLevel?: boolean; check?: FinalizeResearchOptions } = {}
): T {
  if (input === null || typeof input !== "object") return input;
  const raw = input as Record<string, unknown>;
  const keySources = Array.isArray(raw.key_sources) ? raw.key_sources as KeySource[] : [];
  if (typeof raw.answer_draft !== "string" || raw.answer_draft.trim() === "" || keySources.length === 0) return input;
  const later = raw.later_inputs !== null && typeof raw.later_inputs === "object" && !Array.isArray(raw.later_inputs)
    ? raw.later_inputs as Record<string, unknown> : {};
  const atTop = Array.isArray(raw.source_reading) || (topLevel && !Array.isArray(later.source_reading));
  const given = (Array.isArray(raw.source_reading) ? raw.source_reading
    : Array.isArray(later.source_reading) ? later.source_reading : []) as Entry[];
  const named = new Set(given.map(({ source }) => normalizeIdentifier(String(source))));
  // With the check's options (by default, the receipts' secret the server reads), each added entry gives the reading
  // the check verifies, read from a check of the call as it stands, so a fixture declaring a lower read_depth than its
  // receipts show draws no note that it claims less.
  const secret = process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
  const options = check ?? (secret === undefined ? undefined : { secret });
  const verified = new Map<string, AnswerReading>();
  if (options !== undefined) {
    try {
      for (const { source, reading } of finalizeResearch(input, options).source_reading ?? []) {
        verified.set(normalizeIdentifier(source), reading);
      }
    } catch {
      // A fixture the check can't read keeps its declared readings.
    }
  }
  // Sources whose words need a paragraph citing them (the third check of 5 Nov 2026: an entry's words count only in a
  // block citing its source), and sources given a reading of nothing (below).
  const placed = new Set<string>();
  const unread = new Set<string>();
  const build = (all: boolean): T => {
    const added: Entry[] = [];
    for (const source of keySources) {
      const key = typeof source?.id === "string" ? normalizeIdentifier(source.id) : undefined;
      if (key === undefined || named.has(key) || added.some(({ source: id }) => normalizeIdentifier(id) === key)) continue;
      const reading = unread.has(key) ? "inaccessible" as const : verified.get(key);
      added.push(reading === undefined
        ? { source: source.id, reading: fixtureReading(source), quote: fixtureReadingWords(source) }
        : { source: source.id, reading, quote: ANSWER_READING_LABELS[reading] });
    }
    if (added.length === 0) return input;
    const draftText = raw.answer_draft as string;
    const paragraphs = added.filter(({ source, quote }) => all
      ? !draftText.toLowerCase().includes(quote.toLowerCase()) : placed.has(normalizeIdentifier(source)))
      .map(({ source, quote }) => `${citationOf(draftText, source)} (${quote}).`);
    const entries = [...given, ...added];
    return {
      ...input,
      ...(paragraphs.length === 0 ? {} : { answer_draft: `${draftText}\n\n${paragraphs.join("\n\n")}` }),
      ...(atTop ? { source_reading: entries } : { later_inputs: { ...later, source_reading: entries } })
    };
  };
  // Without the check, every source whose words the draft doesn't hold yet gets its paragraph.
  if (options === undefined) return build(true);
  // With it, only a source the check still asks about gets one: its words aren't beside it in the draft, or, with no
  // reading verified (its read_depth refused, or left out), its declared reading claims more than its receipts show
  // (the recheck of 5 Nov 2026), when the fixture gives a reading of nothing, which claims no more than any. So the
  // reading check changes no other check, and no draft that already says it changes.
  let result = build(false);
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      // A stopped check lists what it could not check in place of its steps.
      const checked = finalizeResearch(result, options);
      const steps = [...checked.next_steps, ...(checked.stopped?.could_not ?? []).map(({ step }) => step)];
      let changed = false;
      for (const source of keySources) {
        if (typeof source?.id !== "string" || named.has(normalizeIdentifier(source.id))) continue;
        const key = normalizeIdentifier(source.id);
        const asked = (start: string) => steps.some((step) => step.startsWith(start));
        if (!unread.has(key) && source.other_route !== "read" && asked(`source_reading gives ${source.id} the reading `)) {
          unread.add(key);
          placed.add(key);
          changed = true;
        } else if (!placed.has(key) && asked(`source_reading's quote for ${source.id} is not in the answer`)) {
          placed.add(key);
          changed = true;
        }
      }
      if (!changed) break;
      result = build(false);
    }
  } catch {
    return result;
  }
  return result;
}
