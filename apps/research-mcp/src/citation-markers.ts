import { joinRules, rule, type CheckRule } from "./check-rules.js";

/**
 * Citation markers no reader can follow (AskRigor#431). ChatGPT cites its own tools' results with internal markers,
 * such as turn0search3 or turn2view1, which render as source chips inside ChatGPT but stay bare tokens anywhere the
 * answer is copied, and never resolve to a source the reader can open. When the answer draft holds one, the final check
 * adds a note asking to replace each with the source's link or remove it; it never blocks an answer.
 *
 * The match is exact, on ChatGPT's token form alone: "turn", the turn's number, one of the result kinds below, and the
 * result's number, with no space, as the markers are written even when run together ("citeturn0search3turn0news1").
 * It reads no meaning. Limits: a marker of a kind not listed here, or another app's marker form, is not caught, and a
 * citation that names a source the research never read is a different question (source receipts and links).
 */
const MARKER = /turn[0-9]{1,3}(?:search|view|news|fetch|image|file|product|finance|sports|weather|time|forecast)[0-9]{1,3}/gu;

/** The distinct markers in a text, in order of first appearance. */
export function untraceableCitationMarkers(text: string | undefined): string[] {
  if (text === undefined) return [];
  return [...new Set(text.match(MARKER) ?? [])];
}

const SHOWN = 6;

/** The note for a draft holding such markers, with the markers as an inserted value; none when it holds none. */
export function untraceableCitationNote(draft: string | undefined): CheckRule | undefined {
  const markers = untraceableCitationMarkers(draft);
  if (markers.length === 0) return undefined;
  const shown = markers.length <= SHOWN ? markers.join(", ")
    : `${markers.slice(0, SHOWN).join(", ")} and ${markers.length - SHOWN} more`;
  return joinRules(rule`The draft holds the app's own citation markers (${shown}), which no reader can open: `,
    "replace each with the link of the source it stands for, or remove it, and call finalize_research again with the ",
    "changed draft.");
}
