import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type { NextStepKind } from "./next-step-kinds.js";

/**
 * The final check's rounds within one turn (owner answer 172a, 2026-10-24): at most ten calls, and a step that comes
 * back unchanged three rounds running is stuck, so the check stops asking for it and counts it as a reason. When the
 * limit is reached, or every step left is stuck, the check stops and gives a final result, which says why it did not
 * pass. A not-ready result gives a signed round token that the next call in the same turn passes back, so the server
 * keeps no state. Issued after the result's carried state is built, the token accepts the call's carried state or
 * that result's carry_forward, with the same research target; a later turn passes no token and starts at round 1.
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
  v: z.literal(1),
  n: z.number().int().min(1).max(CHECK_ROUND_LIMIT),
  bind: z.string().regex(/^[0-9a-f]{32}$/u),
  next_bind: z.string().regex(/^[0-9a-f]{32}$/u).optional(),
  at: z.iso.datetime(),
  steps: z.array(z.tuple([digestSchema, z.number().int().min(1).max(CHECK_ROUND_LIMIT)])).max(MAX_TRACKED_STEPS),
  stuck: z.array(digestSchema).max(MAX_TRACKED_STEPS)
}).strict();
type RoundState = z.output<typeof roundStateSchema>;

export interface CheckStep {
  kind: NextStepKind;
  text: string;
}

export type RoundOutcome =
  | { status: "open"; round: number; issueToken: (nextBind?: string) => string; open: CheckStep[]; stuck: CheckStep[] }
  | { status: "stopped"; round: number; reason: "limit" | "stuck"; couldNot: CheckStep[]; nextTurn: CheckStep[] };

/** What a round token is bound to: the call's carried state and research target. */
export function roundBinding(carriedState: string | undefined, researchTarget: string | undefined): string {
  return createHash("sha256").update(`${carriedState ?? ""}\u0000${researchTarget ?? ""}`, "utf8")
    .digest("hex").slice(0, 32);
}

function digestOf(kind: NextStepKind, text: string): string {
  return createHash("sha256").update(`${kind}\u0000${text}`, "utf8").digest("hex").slice(0, 16);
}

function mac(body: string, secret: string): Buffer {
  const key = createHmac("sha256", secret).update("askrigor check round v1").digest();
  return createHmac("sha256", key).update(body).digest().subarray(0, 16);
}

function issueRoundToken(state: RoundState, secret: string): string {
  const body = `cr1~${Buffer.from(JSON.stringify(roundStateSchema.parse(state))).toString("base64url")}`;
  return `${body}~${mac(body, secret).toString("base64url")}`;
}

/** The previous round of this turn, or none when the token is absent, altered, for another turn or lapsed. */
function verifyRoundToken(token: string | undefined, secret: string, bind: string, now: Date): RoundState | undefined {
  if (token === undefined || token.length > ROUND_TOKEN_MAX_CHARACTERS) return undefined;
  const parts = token.split("~");
  if (parts.length !== 3 || parts[0] !== "cr1" || !/^[A-Za-z0-9_-]+$/u.test(parts[1]!) ||
      !/^[A-Za-z0-9_-]{22}$/u.test(parts[2]!)) return undefined;
  const body = `${parts[0]}~${parts[1]}`;
  const signature = Buffer.from(parts[2]!, "base64url");
  if (signature.length !== 16 || signature.toString("base64url") !== parts[2] ||
      !timingSafeEqual(mac(body, secret), signature)) return undefined;
  try {
    const parsed = roundStateSchema.safeParse(JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")));
    if (!parsed.success || (parsed.data.bind !== bind && parsed.data.next_bind !== bind)) return undefined;
    const age = now.getTime() - Date.parse(parsed.data.at);
    return age >= -CLOCK_SKEW_MS && age <= ROUND_TOKEN_LIFETIME_MS ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One round of a check that did not pass. `wholeList` counts the steps as one unit, for the invalid-input result,
 * whose first line is a heading that repeats while the problems under it change. An open round's token is issued
 * after its result's carried state is built, with that state's binding when there is a replacement.
 */
export function advanceCheckRound(steps: readonly CheckStep[], options: {
  token: string | undefined;
  secret: string;
  bind: string;
  now: Date;
  wholeList?: boolean;
}): RoundOutcome {
  const previous = verifyRoundToken(options.token, options.secret, options.bind, options.now);
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
    const count = stuckBefore.has(digest) ? STUCK_AFTER_ROUNDS
      : nextCounts.get(digest) ?? Math.min((counts.get(digest) ?? 0) + 1, CHECK_ROUND_LIMIT);
    if (count >= STUCK_AFTER_ROUNDS) {
      stuckDigests.add(digest);
      stuck.push(...unitSteps);
    } else {
      nextCounts.set(digest, count);
      open.push(...unitSteps);
    }
  }
  if (open.length === 0 || round >= CHECK_ROUND_LIMIT) {
    const reason = open.length === 0 ? "stuck" : "limit";
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
    v: 1,
    n: round,
    bind: options.bind,
    at: options.now.toISOString(),
    steps: [...nextCounts].slice(0, MAX_TRACKED_STEPS),
    stuck: [...stuckDigests].slice(-MAX_TRACKED_STEPS)
  };
  return {
    status: "open", round, open, stuck,
    issueToken: (nextBind) => issueRoundToken({
      ...state,
      ...(nextBind === undefined ? {} : { next_bind: nextBind })
    }, options.secret)
  };
}

const KIND_WORDS: Record<NextStepKind, string> = {
  input_invalid: "the call's inputs",
  receipt_rejected: "its research records",
  research: "research",
  declaration: "the answer's declarations",
  answer_draft: "the answer draft",
  carried_state: "the conversation's state",
  second_reading: "a second reading of the answer",
  tool_list: "the app's tool list"
};

/**
 * The bug report a stopped answer shows before asking whether AskRigor may send it: general, with the kinds of step
 * only, never their text, which can hold the user's topic.
 */
export function stoppedCheckBugReport(outcome: Extract<RoundOutcome, { status: "stopped" }>): string | undefined {
  if (outcome.couldNot.length === 0) return undefined;
  const kinds = [...new Set(outcome.couldNot.map(({ kind }) => KIND_WORDS[kind]))];
  const about = kinds.length === 1 ? kinds[0]! : `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)!}`;
  return outcome.reason === "limit"
    ? `AskRigor's final check reached its limit of ${CHECK_ROUND_LIMIT} rounds without passing, with steps about ` +
      `${about} still open.`
    : `AskRigor's final check stopped without passing after ${outcome.round} rounds, because steps about ${about} ` +
      `came back unchanged ${STUCK_AFTER_ROUNDS} rounds running.`;
}

// The question that follows that report (owner answer 172a, in the words of question 172).
export const STOPPED_CHECK_REPORT_OFFER = "May AskRigor send a bug report about this?";
