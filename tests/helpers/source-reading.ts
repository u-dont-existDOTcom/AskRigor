import {
  finalizeResearch, normalizeIdentifier, type FinalizeResearchOptions
} from "../../apps/research-mcp/src/research-finalization-gate.js";
import { ANSWER_READING_LABELS, type AnswerReading } from "../../apps/research-mcp/src/source-reading.js";

type Entry = { source: string; reading?: string; quote: string };
type KeySource = { id: string; read_depth?: string; other_route?: string };

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
 * quoting that reading's words, and those words, when the draft
 * doesn't show them yet, in a paragraph of their own at its end, so the reading check changes no other check. Entries a
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
  const added: Entry[] = [];
  for (const source of keySources) {
    if (typeof source?.id !== "string" || named.has(normalizeIdentifier(source.id))) continue;
    named.add(normalizeIdentifier(source.id));
    const reading = verified.get(normalizeIdentifier(source.id));
    added.push(reading === undefined
      ? { source: source.id, reading: fixtureReading(source), quote: fixtureReadingWords(source) }
      : { source: source.id, reading, quote: ANSWER_READING_LABELS[reading] });
  }
  if (added.length === 0) return input;
  const shown = raw.answer_draft.toLowerCase();
  const words = [...new Set(added.map(({ quote }) => quote))].filter((quote) => !shown.includes(quote.toLowerCase()));
  const entries = [...given, ...added];
  return {
    ...input,
    ...(words.length === 0 ? {} : { answer_draft: `${raw.answer_draft}\n\nHow each study was read: ${words.join("; ")}.` }),
    ...(atTop ? { source_reading: entries } : { later_inputs: { ...later, source_reading: entries } })
  };
}
