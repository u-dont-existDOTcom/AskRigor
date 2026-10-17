# AskRigor strict runner

The strict runner is a local command-line wrapper for the owner's personal use.
It runs Codex on the owner's signed-in ChatGPT subscription and reads its JSON
events. It displays a research answer only after AskRigor's `finalize_research`
passed and the final message matches the draft supplied to that check.

## Installation

Use a checkout of AskRigor with Node 24.18.0. Install its dependencies with
`npm ci`. Install the Codex CLI separately, ensure `codex` is on `PATH`, sign in
with the owner's ChatGPT subscription, and enable the AskRigor app in Codex.
Use subscription sign-in rather than API-key billing. This runner makes no
model API calls of its own.

Run commands from the AskRigor checkout:

```bash
npx tsx scripts/askrigor-strict.mts "Your question"
npx tsx scripts/askrigor-strict.mts --continue "Your follow-up"
```

## Options

| Option | Behavior |
| --- | --- |
| `--rounds N` | Allow N fix rounds after the initial attempt; default 3. Zero is allowed. |
| `--show-unchecked` | Also print an answer that failed, under `Unchecked answer:`. |
| `--keep-log` | Retain the raw Codex JSON event log in the state directory. |
| `--no-second-reading` | Turn off the local second reading, which is on by default. |
| `--state-dir DIR` | Use a different directory; default `~/.askrigor-strict`. |
| `--help` | Print usage without running Codex. |

`--continue` resumes the last saved thread in the chosen state directory. Without
it, the runner starts a new thread. A stored carry-forward token is included in
either case. Use separate state directories for separate conversation histories.
Exit status is 0 for a checked or model-declared non-research answer, 1 for an
unchecked answer or runtime failure, and 2 for invalid arguments.

## While it runs

A research answer usually takes 5 to 15 minutes. While Codex works, the runner prints progress to the
terminal's error stream: the time, the number of AskRigor calls (every ten), each final-check status, and when it
sends the AI back or runs the second reading. Progress lines never contain the question or the answer; the answer
itself comes at the end, on standard output.

## What the gate checks

The runner reads local MCP server names and enabled flags at runtime and disables
every listed local server that Codex lets it switch off for one invocation (a
server that config.toml does not define, such as a plugin's or a built-in one,
refuses that override and is left as it is). AskRigor arrives through
`codex_apps`. Browser and computer-use features are disabled. Prompts go to Codex
on stdin, and raw event output is withheld from the terminal.

The gate accepts AskRigor app tools with a slug beginning `askrigor` before the
first dot, on server `codex_apps`, and Codex's built-in web search. Any other app
or MCP tool makes the turn unchecked and is named, and that remains in force
through all fix rounds. Shell commands (the AI may read the clock for its
timestamp line, for example) are reported by count only and do not make the turn
unchecked: a research answer rests on the final check's receipts, which only
AskRigor's tools issue.

If there is no finalizer call, the runner asks the model once whether its last
answer is research. Only an exact `NOT RESEARCH` reply allows the earlier answer
to be shown as `Not a research answer (no final check).` The runner uses no
language or length heuristic to decide what research means.

Otherwise, the latest finalizer must return `ready` or `ready_with_limits`. Failed
calls and `not_ready` checks send the model back to complete the returned next
steps. The final message must match that call's `answer_draft`, allowing only
line-ending normalization to `\n`, trailing whitespace removal on each line, and
trimming the whole text. No words, internal spacing, punctuation, case or Unicode
characters are otherwise normalized. A stored `carried_state` must be supplied
unchanged to the passing call.

Readiness, draft and carried-state fixes share the `--rounds` budget. The single
research-classification question is separate. A passing receipt can cover a
later fix round that simply repeats its checked draft. A newer failed finalizer
supersedes an earlier passing one. Process failure, an incomplete event stream
or invalid JSON cannot produce a checked answer.

Checked answers end with this footer, with the returned status filled in:

> — Checked by AskRigor's final check (ready). The answer above is the checked draft, word for word (strict runner).

When checks fail, the runner prints `Not checked: <reason>.` and the open steps.
The unchecked final answer is hidden unless `--show-unchecked` is set.

## Second reading

After the gate passes, a new Codex session reads the checked answer and the
passing finalizer's `safety_claims`, `key_terms` and `scale_results` declarations.
It looks for harm or safety statements, specialized terms and scale or
questionnaire results that those declarations leave out. It runs on the owner's
Codex subscription, with low reasoning effort, and is instructed to use only the
supplied text. Any tool call, web search or command makes the reading unusable.

Only quotes present in the answer count, after whitespace normalization, and
quotes covered by a declaration are discarded. Open findings prompt one revision
round on the main thread, within the existing `--rounds` budget, followed by the
usual final gate. The reader does not run again in that owner turn. Findings are
advisory after that revision: any still open appear after the footer, while the
AI may keep its answer if it judges that a finding does not belong to that kind.
If the budget is already exhausted, the findings appear without a revision.

Use `--no-second-reading` to disable it. An unusable reading adds
`Second reading: could not run (<reason>).` without changing the main gate's
result. No findings are saved in `state.json`; with `--keep-log`, the reading's
events join the same private event log as the main thread's events.

## Limits and privacy

The AI still declares the research it performed and the check's inputs. The
runner only makes sure the check ran, passed, and covers the exact text shown,
subject to the whitespace rules above. It does not independently validate
research quality, source truth, completeness, or the model's non-research
classification. It observes tool use; it cannot undo an action a tool already
performed.

The runner's state and optional logs stay on the laptop. Its state directory and
`work` directory have mode 0700; runner-created files have mode 0600.
`state.json` holds only `thread_id`, the latest supplied `carry_forward` token
from a passing finalizer, and `updated_at`. Tokens are opaque continuation state.
It stores no question, answer or tool result in that file. Without `--keep-log`,
the runner does not save events. With it, `events-<random-id>.jsonl` contains raw
events, potentially including questions, drafts and private tool results. Keep
these files private and delete them when no longer needed. Local MCP
configuration, which can contain credentials, is never printed or logged.

Codex maintains its own session history outside the runner's state directory so
threads can be resumed; `--keep-log` controls only the runner's additional log.
Codex and AskRigor's research providers still receive the requests needed to
answer the question. This wrapper adds no remote storage or new service, and
does not change those services' normal data handling.
