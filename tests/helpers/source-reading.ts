import { normalizeIdentifier } from "../../apps/research-mcp/src/research-finalization-gate.js";
import { SOURCE_READING_LABELS, type SourceReading } from "../../apps/research-mcp/src/source-reading.js";

type Entry = { source: string; quote: string };
type KeySource = { id: string; read_depth?: string; other_route?: string };

/** The words a fixture's answer gives for a key source: its declared reading's, or plain words when it declares none. */
export function fixtureReadingWords({ read_depth, other_route }: KeySource): string {
  return other_route === "read" ? SOURCE_READING_LABELS.other_tool
    : read_depth !== undefined && Object.hasOwn(SOURCE_READING_LABELS, read_depth)
      ? SOURCE_READING_LABELS[read_depth as SourceReading] : "read for this answer";
}

/**
 * The owner, 5 Nov 2026: an answer citing a key source says beside it how it was read, and source_reading copies those
 * words, or the read_depth check holds the answer back. Fixtures that isolate other checks get, for each key source
 * without an entry, an entry in later_inputs quoting its declared reading's words, and those words, when the draft
 * doesn't show them yet, in a paragraph of their own at its end, so the reading check changes no other check. Entries a
 * fixture gives itself, at the top level or in later_inputs, are kept, and so is a call without key sources or a draft.
 * A fixture whose test sets later_inputs aside takes the entries at the top level, which the runtime also reads.
 */
export function withSourceReading<T>(input: T, { topLevel = false }: { topLevel?: boolean } = {}): T {
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
  const added: Entry[] = [];
  for (const source of keySources) {
    if (typeof source?.id !== "string" || named.has(normalizeIdentifier(source.id))) continue;
    named.add(normalizeIdentifier(source.id));
    added.push({ source: source.id, quote: fixtureReadingWords(source) });
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
