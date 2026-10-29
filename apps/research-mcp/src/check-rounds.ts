import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { NextStepKind } from "./next-step-kinds.js";
import type { CheckRule } from "./check-rules.js";
import { maskedRule } from "./check-rules.js";

/**
 * The final check's rounds within one turn (owner answer 172a, 2026-10-24): at most ten calls, and a step that comes
 * back unchanged three rounds running is stuck, so the check stops asking for it and counts it as a reason. When the
 * limit is reached, or every step left is stuck, the check stops and gives a final result, which says why it did not
 * pass. A passing or not-ready result gives a signed round token that the next call in the same turn passes back, so the server
 * keeps no state. The v2 token binds only the research target and carries a random turn id, independent of carried
 * state; a later turn passes no round token and starts at round 1 with a new turn id.
 * It lapses two hours after the round that issued it.
 *
 * "Unchanged" is exact: a step is the same step when its kind and text are the same.
 */
export const CHECK_ROUND_LIMIT = 10;
export const STUCK_AFTER_ROUNDS = 3;
export const ROUND_TOKEN_LIFETIME_MS = 2 * 60 * 60 * 1000;
export const ROUND_TOKEN_MAX_CHARACTERS = 8_000;
const MAX_TRACKED_STEPS = 120;
// Several servers sign with the same secret; a token issued a moment "later" by another one's clock still counts.
const CLOCK_SKEW_MS = 60_000;

const digestSchema = z.string().regex(/^[0-9a-f]{16}$/u);
const roundStateSchema = z.object({
  v: z.literal(2),
  n: z.number().int().min(1).max(CHECK_ROUND_LIMIT),
  bind: z.string().regex(/^[0-9a-f]{32}$/u),
  turn: z.string().regex(/^[0-9a-f]{16}$/u),
  at: z.iso.datetime(),
  steps: z.array(z.tuple([digestSchema, z.number().int().min(1).max(CHECK_ROUND_LIMIT)])).max(MAX_TRACKED_STEPS),
  stuck: z.array(digestSchema).max(MAX_TRACKED_STEPS)
}).strict();
type RoundState = z.output<typeof roundStateSchema>;

export interface CheckStep {
  kind: NextStepKind;
  text: string;
  rule?: CheckRule;
  consecutive?: number;
  /** The generating tool's limit cannot reset during this turn. Never inferred from the step's prose. */
  deferUntilNextTurn?: boolean;
  /** Fixed user-facing boundary, supplied with a deferred step by its source. */
  deferredCaveat?: string;
}

export type RoundOutcome =
  | { status: "open"; round: number; token: string; open: CheckStep[]; stuck: CheckStep[] }
  | { status: "stopped"; round: number; reason: "limit" | "stuck"; couldNot: CheckStep[]; nextTurn: CheckStep[] };

/** What a round token is bound to: the research target only. */
export function roundBinding(researchTarget: string | undefined): string {
  return createHash("sha256").update(researchTarget ?? "", "utf8")
    .digest("hex").slice(0, 32);
}

function digestOf(kind: NextStepKind, text: string): string {
  return createHash("sha256").update(`${kind}\u0000${text}`, "utf8").digest("hex").slice(0, 16);
}

function mac(body: string, secret: string): Buffer {
  const key = createHmac("sha256", secret).update("askrigor check round v2").digest();
  return createHmac("sha256", key).update(body).digest().subarray(0, 16);
}

function issueRoundToken(state: RoundState, secret: string): string {
  const body = `cr2~${Buffer.from(JSON.stringify(roundStateSchema.parse(state))).toString("base64url")}`;
  return `${body}~${mac(body, secret).toString("base64url")}`;
}

/** The previous round of this turn, or none when the token is absent, altered, for another turn or lapsed. */
function verifyRoundToken(token: string | undefined, secret: string, bind: string, now: Date): RoundState | undefined {
  if (token === undefined || token.length > ROUND_TOKEN_MAX_CHARACTERS) return undefined;
  const parts = token.split("~");
  if (parts.length !== 3 || parts[0] !== "cr2" || !/^[A-Za-z0-9_-]+$/u.test(parts[1]!) ||
      !/^[A-Za-z0-9_-]{22}$/u.test(parts[2]!)) return undefined;
  const body = `${parts[0]}~${parts[1]}`;
  const signature = Buffer.from(parts[2]!, "base64url");
  if (signature.length !== 16 || signature.toString("base64url") !== parts[2] ||
      !timingSafeEqual(mac(body, secret), signature)) return undefined;
  try {
    const parsed = roundStateSchema.safeParse(JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.bind !== bind) return undefined;
    const age = now.getTime() - Date.parse(parsed.data.at);
    return age >= -CLOCK_SKEW_MS && age <= ROUND_TOKEN_LIFETIME_MS ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export interface CheckRound {
  turn: string;
  previous?: RoundState;
}

/** Read every call's turn, including a check that passes; only a verified round token continues a turn. */
export function readCheckRound(token: string | undefined, options: {
  secret: string; bind: string; now: Date;
}): CheckRound {
  const previous = verifyRoundToken(token, options.secret, options.bind, options.now);
  return previous === undefined ? { turn: randomBytes(8).toString("hex") } : { turn: previous.turn, previous };
}

/**
 * One round of a check, including a pass with no steps. `wholeList` counts the steps as one unit, for the invalid-input result,
 * whose first line is a heading that repeats while the problems under it change. Every issued token keeps the
 * call's turn, whether or not the call passed carried state.
 */
export function advanceCheckRound(steps: readonly CheckStep[], options: {
  call: CheckRound;
  secret: string;
  bind: string;
  now: Date;
  wholeList?: boolean;
}): RoundOutcome {
  // Tool-state limits become caveats at their source in the gate, never work for this turn's round tracker.
  steps = steps.filter(({ deferUntilNextTurn }) => deferUntilNextTurn !== true);
  const previous = options.call.previous;
  const round = Math.min((previous?.n ?? 0) + 1, CHECK_ROUND_LIMIT);
  const counts = new Map(previous?.steps ?? []);
  const stuckBefore = new Set(previous?.stuck ?? []);
  const units = options.wholeList === true && steps.length > 0
    ? [{ digest: digestOf(steps[0]!.kind, steps.map(({ text }) => text).join("\n")), steps: [...steps] }]
    : steps.map((step) => ({ digest: digestOf(step.kind, step.text), steps: [step] }));
  const stuckDigests = new Set(stuckBefore);
  const nextCounts = new Map<string, number>();
  const open: CheckStep[] = [];
  const stuck: CheckStep[] = [];
  for (const { digest, steps: unitSteps } of units) {
    const count = nextCounts.get(digest) ?? Math.min((counts.get(digest) ?? 0) + 1, CHECK_ROUND_LIMIT);
    nextCounts.set(digest, count);
    if (stuckBefore.has(digest) || count >= STUCK_AFTER_ROUNDS) {
      stuckDigests.add(digest);
      stuck.push(...unitSteps.map((step) => ({ ...step, consecutive: count })));
    } else {
      open.push(...unitSteps.map((step) => ({ ...step, consecutive: count })));
    }
  }
  if ((steps.length > 0 && (open.length === 0 || round >= CHECK_ROUND_LIMIT)) ||
      (previous?.n ?? 0) >= CHECK_ROUND_LIMIT) {
    const reason = steps.length > 0 && open.length === 0 ? "stuck" : "limit";
    // What the next turn can do: research the check still asks for, and the app's tool list, which the user
    // refreshes. Everything else is what AskRigor could not do this turn: a step that kept coming back, or, at the
    // limit, a declaration, draft or record the AI and the check could not settle in ten rounds.
    const nextTurn = (step: CheckStep, wasStuck: boolean) =>
      step.kind === "tool_list" || (step.kind === "research" && !wasStuck);
    return {
      status: "stopped",
      round,
      reason,
      couldNot: [...stuck.filter((step) => !nextTurn(step, true)), ...open.filter((step) => !nextTurn(step, false))],
      nextTurn: [...stuck.filter((step) => nextTurn(step, true)), ...open.filter((step) => nextTurn(step, false))]
    };
  }
  const state: RoundState = {
    v: 2,
    n: round,
    bind: options.bind,
    turn: options.call.turn,
    at: options.now.toISOString(),
    steps: [...nextCounts].slice(0, MAX_TRACKED_STEPS),
    stuck: [...stuckDigests].slice(-MAX_TRACKED_STEPS)
  };
  return {
    status: "open", round, open, stuck, token: issueRoundToken(state, options.secret)
  };
}

/** The first unmet rule, with every inserted value independently masked. */
export function stoppedCheckBugReport(outcome: Extract<RoundOutcome, { status: "stopped" }>,
  allowed: (value: unknown) => boolean = () => false): string | undefined {
  const first = outcome.couldNot[0];
  if (first === undefined) return undefined;
  const masked = maskedRule(first.rule, allowed);
  // The short offer quotes only the first sentence; the signed report keeps the full masked rule.
  const sentence = masked.split(/(?<=[.!?])\s/u, 1)[0]!;
  const wording = sentence.length > 450 ? sentence.slice(0, 448) + "…." :
    /[.!?]$/u.test(sentence) ? sentence : sentence + ".";
  const more = outcome.couldNot.length - 1;
  return `AskRigor's final check stopped at round ${outcome.round} with this rule still unmet: ${wording}` +
    (more === 0 ? "" : ` There ${more === 1 ? "is" : "are"} ${more} more unmet ${more === 1 ? "step" : "steps"}.`);
}

// The question that follows that report (owner answer 172a, in the words of question 172).
export const STOPPED_CHECK_REPORT_OFFER = "May AskRigor send a bug report about this?";
