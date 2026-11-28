/**
 * HRP's core handed over when the plain answer is registered (owner answer 412a, 24 November 2026). An AI can research
 * without ever loading HRP, as one of two baseline chats of 22 November did; the owner chose: "When the AI registers its
 * plain answer, the result carries the core's exact text and names the further sections to fetch." So the result carries
 * the same bytes load_protocol serves for section "core" (register-tools.ts joins both with one function), once, in its
 * structured content, and says where they are. An AI that registers again in the same conversation says it holds them,
 * by the first characters of their SHA-256, and is not sent them again; a plain look-up (lane light or aside) gets none.
 * The text is public (docs/privacy-data-map.md); nothing of a question is in it.
 *
 * What AskRigor holds for the question is kept (24 November 2026, after the review of AskRigor#520, F4): its findings
 * exist nowhere else in the conversation, and the core is one call away. So the core goes in the registration's result only
 * when it fits beside all of it. When it doesn't and AskRigor planned the research, the core comes with the next call's
 * result, plan_research on the research's first menu, under the same size rules; otherwise a sentence says to load it.
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

/** How much of the core's end a result gives beside it, so that an AI shown only part of the text can tell. */
export const HRP_CORE_END_CHARACTERS = 60;
/** The core's last characters, whole ones. */
export const hrpCoreEnd = (core: Pick<HrpCore, "text">): string =>
  Array.from(core.text).slice(-HRP_CORE_END_CHARACTERS).join("");

/** The one load_protocol call for the further sections: a step a result asks for gets made (the review of 24 Nov 2026). */
const ONE_CALL = "in one load_protocol call (protocol \"hrp\", section the names separated by commas)";
const READ_AND_FOLLOW = "They are the rules this research and its answer are held to, not background. Read all of them " +
  "now, before your next call. Their Architecture section says to load every further section the question needs and no " +
  `others: choose them for this question from hrp_core.further_sections and load them now ${ONE_CALL}, before your ` +
  "first search. When this result says to ask the person first, ask first, and load them once they have answered. If " +
  "what you see of hrp_core.text doesn't end with hrp_core.ends_with, load the core with load_protocol (protocol " +
  "\"hrp\", section \"core\"); otherwise do not load the core again in this conversation.";
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
    // The paragraph itself is in the result's text and, shorter, in next_step: here it would only take the room of what
    // AskRigor holds for the question.
    how_to_use: "HRP's core rules, exact canonical text: the rules this research and its answer are held to. next_step says " +
      `when to read them and what to load. ${registerAgain(core)}`,
    characters: Array.from(core.text).length,
    ends_with: hrpCoreEnd(core),
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
export const HRP_CORE_NEXT_STEP = "Before your next call, read all of HRP's core rules in hrp_core.text of this result " +
  "and follow them; then, before your first search, load the further sections this question needs, chosen from " +
  `hrp_core.further_sections, ${ONE_CALL}. When this result says to ask the person first, ask first, and load them once ` +
  "they have answered. Do not load the core again in this conversation, unless hrp_core.text doesn't end with " +
  "hrp_core.ends_with.";

/**
 * What a result served of HRP's core, in its structured content (runtime only), so that a test round can tell its runs
 * apart (the review of 24 Nov 2026, F4): the core itself (here); the word that it comes with plan_research's result; the
 * sentence to load it (load_it); nothing, since the AI holds it (already_held) or the research is a plain look-up
 * (not_for_this).
 */
export const HRP_CORE_STATUSES = ["here", "with_plan_research", "load_it", "already_held", "not_for_this"] as const;
export type HrpCoreStatus = typeof HRP_CORE_STATUSES[number];

/**
 * What a registration's receipt signs of the core when its result does not carry it (the claim core): that it comes with
 * plan_research, whose first menu then hands it over, or that the AI said it holds it. A registration that hands it over
 * signs its digest instead (the claim hrp).
 */
export const HRP_CORE_COMES_WITH_PLAN = "plan";
export const HRP_CORE_HELD_ALREADY = "held";

/**
 * Where a registration's result has no room for the core beside all that AskRigor holds for the question, and AskRigor
 * planned the research: the next call is plan_research, whose result carries it, or says to load it when that result has
 * no room either. In text and next_step.
 */
export const HRP_CORE_WITH_PLAN = "HRP's core rules come with plan_research's result, or that result says to load them: " +
  "read them before your first search.";

/** In place of the core, when the call says this conversation holds it (later_inputs.hrpCoreHeld), in text and next_step. */
export const HRP_CORE_ALREADY_HELD = "You already hold HRP's core rules in this conversation, so they are not sent " +
  "again: follow them, and give finalize_research the research_receipt that came with them too.";

/** Beside the receipt that came with the core (load_protocol's, or plan_research's when it hands the core over). */
export const HRP_CORE_RECEIPT_USE = "Give finalize_research this research_receipt with the others: it shows that HRP's " +
  "core rules were loaded.";
/** load_protocol's words beside the receipt it gives for the core, while the switch holds (owner answer 412a, option c). */
export const hrpCoreReceiptUse = (core: Pick<HrpCore, "sha256">): string =>
  `${HRP_CORE_RECEIPT_USE} ${registerAgain(core, "")}`;
/** The same in next_step, where plan_research's result hands the core over with a receipt. */
export const HRP_CORE_RECEIPT_NEXT_STEP = "Give finalize_research this result's research_receipt with the others.";

/**
 * The final check's one note, for an account the switch holds for, when its research shows no receipt of HRP's core
 * (owner answer 412a, option c: "the final check adds a note when none is shown. It never blocks"). Whether the AI read
 * what it was given is not checked, so the note says only what AskRigor can tell; and it asks for no late load, which at
 * the last step would cost a call and a second check for a receipt alone (the review of 24 Nov 2026, part 2).
 */
export const HRP_CORE_NOT_SHOWN = "No receipt passed here shows that HRP's core rules were loaded in this research, so " +
  "AskRigor can't tell whether they were. Don't load them now for the receipt's sake; in the next research, loading them " +
  "first (load_protocol, protocol \"hrp\", section \"core\") gives one. Nothing here holds back the answer.";

/** A receipt's claim that the core was given, hrpCoreDigest's form. */
export const HRP_CORE_CLAIM = /^[0-9a-f]{16}$/u;

/** In place of the core, when the result has no room for it or the server could not read it, in text and next_step. */
export const HRP_CORE_LOAD_FIRST = "Before the first search, call load_protocol with protocol \"hrp\" and section " +
  "\"core\", and follow what it gives.";
