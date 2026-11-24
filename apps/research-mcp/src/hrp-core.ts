/**
 * HRP's core handed over when the plain answer is registered (owner answer 412a, 24 November 2026). An AI can research
 * without ever loading HRP, as one of two baseline chats of 22 November did; the owner chose: "When the AI registers its
 * plain answer, the result carries the core's exact text and names the further sections to fetch." So the result carries
 * the same bytes load_protocol serves for section "core" (register-tools.ts joins both with one function), once, in its
 * structured content, and says where they are. An AI that registers again in the same conversation says it holds them,
 * by the first characters of their SHA-256, and is not sent them again; a plain look-up (lane light or aside) gets none.
 * The text is public (docs/privacy-data-map.md); nothing of a question is in it.
 *
 * Off unless the account has it (ASKRIGOR_HRP_CORE, config.ts and research-trial.ts): with it off every text and result
 * is as before.
 */
export interface HrpCore {
  version: string;
  /** The SHA-256 of the text, load_protocol's scope_sha256 for section "core". */
  sha256: string;
  /** The core's sections, in the text's order. */
  sections: string[];
  /** Every other section for research, by name alone. */
  furtherSections: string[];
  text: string;
}

/** How much of the core's SHA-256 an AI gives back to say it holds it (later_inputs.hrpCoreHeld), and a receipt signs. */
export const HRP_CORE_DIGEST_CHARACTERS = 16;
export const hrpCoreDigest = (core: Pick<HrpCore, "sha256">): string => core.sha256.slice(0, HRP_CORE_DIGEST_CHARACTERS);

/** Whether a call says it holds this core: its digest, or the whole SHA-256. Any other value says nothing. */
export function holdsHrpCore(held: unknown, core: Pick<HrpCore, "sha256">): boolean {
  if (typeof held !== "string") return false;
  const given = held.trim().toLowerCase();
  return given.length >= HRP_CORE_DIGEST_CHARACTERS && core.sha256.startsWith(given);
}

/**
 * The largest result that carries the core, the app's own limit in mind (MCP_RESULT_MAX_BYTES, 40,000 bytes, cannot hold
 * the core): ChatGPT reads text and structured content together; every other app gets the structured content, which
 * Claude Code takes inline up to 50,000 characters, and the same as text.
 */
export const HRP_CORE_RESULT_LIMITS = Object.freeze({ chatGptBytes: 60_000, structuredCharacters: 49_000, wholeBytes: 150_000 });

const READ_AND_FOLLOW = "Read it before your first search and follow it; do not load the core again in this " +
  "conversation. Before a step that needs a further section (hrp_core.further_sections), load it by name with " +
  "load_protocol, protocol \"hrp\".";
const registerAgain = (core: Pick<HrpCore, "sha256">, again = " again"): string => "If you register the plain answer" +
  `${again} in this conversation, give later_inputs.hrpCoreHeld "${hrpCoreDigest(core)}", so it is not sent again.`;

/** The core as the result's structured content carries it. */
export function hrpCoreStructured(core: HrpCore) {
  return {
    protocol: "hrp" as const,
    version: core.version,
    scope_sha256: core.sha256,
    sections: [...core.sections],
    further_sections: [...core.furtherSections],
    how_to_use: `HRP's core rules, exact canonical text. ${READ_AND_FOLLOW} ${registerAgain(core)}`,
    text: core.text,
  };
}

/** Where the core is, for an app's model: ChatGPT's text carries no copy; every other app's carries it last, raw. */
export function hrpCoreText(core: HrpCore, chatGpt: boolean): string {
  return `HRP's core rules (version ${core.version}, exact canonical text) come with this result: hrp_core.text in its ` +
    `structured content${chatGpt ? ", not in this text" : ", and the last text block of this result"}. ${READ_AND_FOLLOW} ` +
    registerAgain(core);
}
/** The same in next_step, for an app that hands its model only the structured content. */
export const HRP_CORE_NEXT_STEP = "Before your first search, read HRP's core rules in hrp_core.text of this result and " +
  "follow them, without loading the core again in this conversation; load a further section by name with load_protocol " +
  "before the step that uses it.";

/** In place of the core, when the call says this conversation holds it (later_inputs.hrpCoreHeld), in text and next_step. */
export const HRP_CORE_ALREADY_HELD = "You already hold HRP's core rules in this conversation, so they are not sent " +
  "again: follow them, and give finalize_research the research_receipt that came with them too.";

/** load_protocol's words beside the receipt it gives for the core, while the switch holds (owner answer 412a, option c). */
export const hrpCoreReceiptUse = (core: Pick<HrpCore, "sha256">): string => "Give finalize_research this research_receipt " +
  `with the others: it shows that HRP's core rules were loaded. ${registerAgain(core, "")}`;

/**
 * The final check's one note, for an account the switch holds for, when its research shows no receipt of HRP's core
 * (owner answer 412a, option c: "the final check adds a note when none is shown. It never blocks"). Whether the AI read
 * what it was given is not checked, so the note says only what AskRigor can tell.
 */
export const HRP_CORE_NOT_SHOWN = "No receipt passed here shows that HRP's core rules were loaded in this research, so " +
  "AskRigor can't tell whether they were; loading them (load_protocol, protocol \"hrp\", section \"core\") gives one. " +
  "Nothing here holds back the answer.";

/** A receipt's claim that the core was given, hrpCoreDigest's form. */
export const HRP_CORE_CLAIM = /^[0-9a-f]{16}$/u;

/** In place of the core, when the result has no room for it or the server could not read it, in text and next_step. */
export const HRP_CORE_LOAD_FIRST = "Before the first search, call load_protocol with protocol \"hrp\" and section " +
  "\"core\", and follow what it gives.";
