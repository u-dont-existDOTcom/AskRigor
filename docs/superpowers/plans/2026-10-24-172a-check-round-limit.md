# Decision 172a: a round limit for the final check, and why it did not pass

Status: built on the build branch (owner answer "172 a", 24 Oct 2026, on owner question 172; the owner's 169 answer
asked for a limit "(maybe 8 or 10?) so we don't end up in a loop", for the answer to say why the check failed, and for
a bug report when nothing can be done, otherwise how the next turn handles it).

## What was approved

1. At most 10 rounds of `finalize_research` in a turn. At the limit the check stops asking and gives a final result.
2. A step that comes back unchanged three rounds running is stuck: the check stops asking for it and counts it as a
   reason. When only stuck steps are left, the check stops too.
3. The answer says why, in two kinds: what AskRigor could not do, with a short bug report and the question "May
   AskRigor send a bug report about this?"; and what the next turn can do, with how to continue.
4. The same reasons end an answer the model gives before the limit, and the panel under a stopped result says
   "Not checked:" with the short reason.

## How it is built

- `apps/research-mcp/src/check-rounds.ts`. The server keeps no state: a not-ready result returns `round` and a signed
  `round_token` (v2, HMAC domain "askrigor check round v2", prefix `cr2~`), which the model passes back as
  `round_token` on the turn's next call. It binds only the research target's 32-hex digest and holds a random
  16-lowercase-hex turn id, the round number, its time, and 16-hex digests of each step's kind and text with how many
  rounds running it came back, plus the digests of steps already stuck. A verified token preserves the turn id
  whether or not carried state is passed, including invalid-input calls; a passing call reads its turn too.
  It lapses two hours after it was issued, with one minute of clock skew. A missing or invalid token (`cr1~`
  included) starts at round 1 with a new turn id; a later turn passes no round token. Carried state records its
  issuing turn, first-turn flag and the earlier turn's open kinds, keeping this turn's calls distinct from earlier
  unchecked answers.
- "Unchanged" is exact: the same kind and the same text. An input that fails validation counts as a round, its list
  as one step, since its first line is a heading that repeats.
- `stopped` (a new status) is the turn's final result: no next steps, no finalization receipt (so no card is saved,
  and a paid save offer is taken back), no plain-answer note; the carried state records it as not passed, with every
  kind left open. `stopped` lists `could_not` and `next_turn`, with `short_reason`, and `bug_report` when anything is
  in `could_not`.
- The split is structural, by kind: research the check still asks for, and the app's tool list (which the user
  refreshes), are for the next turn; a step that kept coming back, and at the limit a declaration, draft, record or
  input the AI and the check could not settle, are what AskRigor could not do. The bug report names only kinds of
  step, never their text, which can hold the user's topic. The model words the reasons in plain language; nothing is
  sent unless the user says yes and the model calls `submit_lesson_candidate`.
- `unchecked_line` keeps its start ("AskRigor's final check has not passed") and gains "a research step kept failing"
  for stuck research. The result text tells the model, for a stopped check, not to call again and to answer now, and
  for any unchecked answer, what to say before its last line.
- Tests: `tests/finalize-round-limit.test.ts`; panel cases in `tests/final-check-panel.test.ts`; updated wording in
  `tests/finalize-next-steps-contract.test.ts` and `tests/finalize-unchecked-answer.test.ts`. The privacy data map
  describes the token.

## Not changed

The protocols ("on not_ready do its next steps") and the rule that an unchecked answer says at its start that it is
partial and gives no ranking or verdict an open step could change. Neither was part of question 172.

## 2026-10-26 quota steps

Discovery marks steps stopped by YouTube's rate limit or daily quota as deferred until the next turn at generation time. Even after three unchanged rounds these go to `stopped.next_turn`, whose own text says to rerun them once YouTube's limit resets; alone they offer no bug report, while ordinary stuck research stays in `could_not`.
