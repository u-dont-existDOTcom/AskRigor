# Show the plan, say whether it waits, and steer without losing track (22 Nov 2026), v2

Branch `claude/next-build-20261122`, on top of AskRigor#508 (person_asked). Data use: DEVELOPMENT. Nothing here is
released without the owner's typed yes. v1 was red-teamed by Fable
(`/home/joel/askrigor-releases/20261122-steering/redteam-fable.md`); v2 takes its changes, and moves the three that
change an owner decision into a question for him (part B), not into the build.

## The owner's request (Inbox, 21 Nov 2026, word for word)

On question 399 (15:31:40 UTC; he then chose 399b): "how about this, the menu is shown for everyone, but unless it's
high confidence the user will be needed for steering, it's non-blocking, so it shows at the beginning off the research
what the plan is and it says "you can stop at any time to modify the plan" and it should accept steering very well (gpt
does not accept steering well, it loses track of what it was doing sometimes, claude also, so hopefully we can do
better). if it accepts steering well we can also make sure the user knows "AskRigor accepts steering well, don't worry
about confusing it." or you can brainstorm improvements if you have any on that"

On the planning call's release (17:04:17 UTC): "ok but are you making sure that the intiial output while it's working
is explaining the map it's using for its research and how long each should take and that the user can hit stop and
steer it (or even without hitting stop maybe)? the point is, we want to give the user steering capability without
blocking them if they don't happen to be at the computer. and we want to immediately also like first output should be,
"Wait a minute, building the steering menu" which should say it is blocking or non-blocking at somepoint depending
which it is, so that the user understands, if they wait that minute, they get to steer it. do you see where i'm going
here?"

## Facts the design rests on (code at 4bc8cf44, read 22 Nov)

- Balanced (the default) waits on a first menu when the plan names a question, when the AI's `steering_could_help` is
  true or left out (left out means wait), or before any menu when the framing has a redirecting question; since 399b
  never for length alone (research-steering.ts l.1486-1503). Autonomous never waits; guided always waits. AskRigor's
  own planning call (which names a question only when needed) runs on dev accounts only.
- ChatGPT shows nothing the AI writes until its turn ends; Claude, Gemini and Codex show it between calls.
  `isChatGptCall(extra)` (tool-result.ts) tells the server which; the access handler receives `extra`.
- A message cannot be sent while ChatGPT or the Claude chat apps work; Claude Code and Codex queue it.
- `plan_research` refuses `later_inputs.asked` (research-contributor-access-tool.ts l.1168) and makes no model call.
  A re-plan or a changed menu without an allocation asks again on balanced and guided (l.1478, l.1500).
- The planner rubric is at version `2026-11-21.2` (research-planner.ts l.154).

## A. What is built now

### A1. A first line while the plan is built (apps that show words as they are written)

`inspect` appends to its `next_step` (never replacing ASKED_REQUEST or the notice; never before the notice is
accepted; not for ChatGPT calls, where the line would arrive after the research):

- planning call active for the account: `Before your next call, tell the person in one line, in their language: you
  are building the research plan, about a minute; then you will show it and say whether you are waiting for their
  choice or starting, and how they can change it.`
- otherwise: the same, with `you are taking a first look to build the research plan, a few minutes;`

When a registration on a planned account comes back without a plan (`research_plan_not_used`), that result adds, for
calls not from ChatGPT: `Tell the person in one line that the plan will take a few minutes more: you are taking a first
look yourself.`

### A2. The plan block when a first menu goes on (balanced and autonomous; guided waits by the person's choice)

Apps that show words as they are written, before the first research call, in the person's language:
1. **The reading line** (READING_FIRST, widened, and in place of `wentOnLongSentence`, which goes): how it read the
   question (which meaning, form, comparison or situation) and the nearest reading it left out.
2. **The plan:** the recommended tasks, numbered, each with its rough minutes and whether it means a quick look, reading
   in full or a method audit; then the total with the check and the answer.
3. **The steer line, by why it went on:**
   - default: `I didn't wait for your answer before starting. To change the plan, tell me what to change (stop me first
     if I'm still working).`
   - the person's own go-ahead: `As you asked, I started without waiting. To change the plan, ...` (same ending)
   - autonomous: `You chose research that doesn't stop to ask. To change the plan, ...` (same ending)
   - an assumed answer: the existing ASSUMED_ANSWER_FIRST line, then `To change the plan, ...`

ChatGPT calls: the answer opens with the reading line only (answers first). It ends with: `What I did: [each task done,
one line]. Not done: [the open tasks, numbered, with their minutes]. To change direction, tell me which, and I'll go on
from here without redoing the rest.`

The light lane and the aside keep their own short lines. Nothing says AskRigor "accepts steering well" (part C).

### A3. When it waits, the first line says why (chosen from the result's own fields)

- a named question, first menu: `Before I start, I need one answer from you; the plan below depends on it.`
- a named question, research begun: `Before I go on, I need one answer from you; the rest of the plan depends on it.`
- a re-plan or a changed menu, no question: `The plan changed with what I found; before I go on, choose how to spend
  the time.`
- a later menu past about 10 minutes: `The next part could take more than about 10 minutes; before I go on, choose how
  to spend the time.`
- guided: `You chose to approve the plan first; here it is.` (after the question line, when there is one)
- any other ask (today's default on an account without AskRigor's plan): `Before I start, choose how to spend the
  time; your choice can change what I check.`

ASK_NOW: "your whole reply this turn is the message below" becomes "your whole reply from here on this turn is the
message below" (the A1 line may come first).

### A4. A steer goes on, and the chat shows what is done

New runtime value inside `researchMenu` (allowed like `person_go_ahead`; no tool descriptor change): `person_steered:
true`, used only with the person's words in `person_reason` (existing field: cleaned, cut to 300 characters, kept only
in learn mode). With it, a changed menu or a re-plan goes on with the recommendation on balanced and autonomous; guided
still shows the menu. Tasks the person's words ask for are marked `person_asked` (always recommended since #508).
Learn mode does not keep such a call as a menu choice.

The steer sentence, in the go-on text and in `planNextStep` (Claude Code's model reads only structured content):

> If the person stops you or tells you to change something, their message is the plan's new instruction. Unless it
> asks about a different thing, call plan_research again with the same research_target and plain_answer_receipt, the
> last result's menu_digest, done (the numbers of the tasks you finished), the tasks changed as their words ask
> (person_asked true on each task their words ask for), person_steered true, and their words, word for word, as
> person_reason. Then follow that result.

The steered re-plan's own result says:

> Show the person now, in their language: what is done, one line per finished task with what it found; what changes
> because of their message; and the tasks still to do, numbered, with their minutes. Then go on. Do not repeat a
> finished task, and keep its receipts for the final check.

When to register again (in the same text):

> Register the plain answer again only when their message asks about a different thing (another substance, product,
> claim, study or person), not when it narrows, widens or redirects the same question; then tell them in one line which
> finished work still applies, and pass those receipts to the final check too.

### A5. The menu's outline when no plan is handed over

`register_plain_answer`, whenever its result carries no plan from AskRigor's planning call (every ordinary account, and
a dev account whose plan was not used or was paused), adds `menu_outline` to the structured result and `next_step` says:
`Fill in menu_outline for your plan_research call.` The outline is the refusal's own example shape (`correctedMenu`):
`research_target` (the target itself when it is at most about 300 characters, otherwise the existing placeholder),
`plain_answer_receipt`, one task with the existing placeholders, and the account's steering field with the SAME wording
its menu has today (dev: the `steering_choice` placeholder of the dev refusal; ordinary: `steering_could_help` as
RESEARCH_MENU_SHAPE describes it). It changes no decision about waiting; it only removes the refused first call. Check
the result stays inside `MCP_RESULT_MAX_BYTES` (`heldVariants`).

### A6. The planning call's reading covers each form a person may have (dev accounts' rubric)

Rubric version `2026-11-22.1`. The clause for a whole class or "a substance that comes in several forms" becomes (no
named preparations, so it is not fitted to the test that found the miss):

> ...a substance or thing that comes in several forms: plan for the whole class, with its main members grouped. Before
> you plan, list for yourself the forms a person asking this could have in hand: what is sold, and what people make or
> prepare themselves. When they differ much in strength, content or how they are used, the form a person is most
> likely to have gets a task of its own. Say in about which forms the research covers and the nearest form it leaves
> out.

And for every reading: `about` says which meaning the research takes and the nearest one it leaves out. Step 2 is
unchanged: forms are still not a reason to name a question on a dev account.

### A7. Records

`docs/research-contributor-access.md` (the steering section) and a `docs/design-decisions.md` entry: the plan shown with
its steer line, the first line, person_steered, the outline; built 22 Nov, not released; what it does not change (part
B).

## B. A question for the owner (not built)

Each changes one of his earlier decisions, so each needs his yes:
1. **Ordinary accounts wait only when the person's answer is needed.** Today an AI-written first menu on balanced waits
   unless the AI says steering couldn't help (his 10 Nov rule: steering "usually can"), and the framing's redirecting
   questions are asked before any menu. His 21 Nov message asks the opposite: non-blocking unless it's high confidence
   the person is needed. Proposal: on every account a balanced first menu waits only for a named question (a fact only
   they can give, or two different things their words can mean that a search didn't settle); the rest are shown in the
   reading line and the steer line.
2. **Forms stop asking on every account.** His 9 Nov words: "that should also be confirmed with the user". Dev accounts'
   plans no longer ask about forms since 21 Nov; ordinary accounts still do (FORM_PEOPLE_USE). Proposal: none ask; the
   reading line names the form taken and the nearest left out.
3. **ChatGPT checks back at about 10 minutes when a plan went on with an open choice.** In ChatGPT the person can only
   steer after the turn; since 399b a first menu runs whatever its length. Proposal: there, a checked answer at about 10
   minutes ending with the open tasks, as autonomous already does.

Later, if A2's ChatGPT ending proves too late: ChatGPT apps can show a short status line while a tool runs, set in the
tool's descriptor (to be checked in OpenAI's reference first). It would change the tool list (one refresh).

## C. Tests

- Unit: research-steering.test.ts (block per style and per reason, ChatGPT and not; ask openings; guided; person_steered
  goes on, not on guided; learn mode skips it; planNextStep carries the sentences), research-contributor-access.test.ts
  (inspect's first line: planned, not planned, ChatGPT, before acceptance; menu_outline with and without a plan, its
  size), research-planner.test.ts (version, the forms clause), frozen-tool-lists unchanged.
- Replay of the planning call (development data, confirms nothing): the five test questions, the regression set, and
  forms questions not in the rubric's words (a fermented food, a diluted solution, a topical paste, one non-health
  case). Pass: the likely form gets a task; no new questions.
- **The steering test, before anything says steering works:** in ChatGPT and in Claude, a research stopped mid-way and
  steered (one narrowing steer, one that changes the subject). Scored on: plan_research called again with
  person_steered; finished tasks not redone; what is done and what comes next shown; the steer followed in the answer.
  If a ChatGPT stop loses the turn's results, the ChatGPT line becomes "to change the plan, tell me after the answer",
  and keeping finished work on AskRigor's side becomes the next build. Only when it passes on both does any text say
  "AskRigor accepts steering well".
- "Without hitting stop": true today only in apps that queue a message while the AI works (Claude Code, Codex); the
  same steer sentence covers it there. Not possible in ChatGPT or the Claude chat apps.
