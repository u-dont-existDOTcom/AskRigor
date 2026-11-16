# Deep research on the person's own plan, and an Atlas that shows what still needs research (15 Nov 2026)

From the owner's message of 15 Nov 2026, 12:36 UTC, and the owner's Inbox reply on question 310 six minutes before it.
This plan covers four things that turn out to be one design: a deep research mode with a budget, a local app that runs
it, a final check that works for it at no API cost, and an Atlas that shows what each finding still needs.

Status (15 Nov, 14:20 UTC): the server's part for the final check is released (owner answer 310a, below): live since
14:14 UTC on 15 Nov (`docs/audits/2026-11-15-caller-readings-production-release.md`). Of stage 1, the budget
arithmetic is written and tested in a working copy of the runner on the owner's laptop (branch `deep-research`), not
in this repository. Nothing else here is built. Each stage is released only with the owner's yes where the release
rule asks for it. Nothing here changes the tool list (owner answer 189a).

## The owner's words

Chat, 12:36 UTC:

> let's make a deep research mode with time horizon setting and graceful output before credits run out so that work
> isn't lost. i want people to be able to do deeper research than they can with normal GPT or claude deep research
> modes, like up to thousands of searches instead of hundreds, depending what they select for the time, and we should
> make it as parallel as possible so hopefully we can do more research and much faster than regular GPT and claude. but
> the key is the ability to know how much credits the user wants to use and how much are being used vs what's left so
> that the user isn't left with a huge unfinished research task that felt like a waste of credits. and the deep
> research must be self-learning so it doesn't get lost on wrong tracks which is what often happens now with AI deep
> research

> also for the atlas we should be giving some idea for each card like what would be the most important next research
> tasks for this card and some idea of how preliminary the research is that was done vs what could be known with more
> research (vs some things that dead end pretty quick due to lack of info available). this should be vsible at a
> glance and people should be able to contribute by browsing the atlas for the tasks that need the most research and
> which may be the most important to research/most likely to give results that people can't easily find which makes
> real world impact on whatever matters most in that category of interest or whatever, we can brainstorm it but my
> idea is people will contribute their AI credits to help build up the atlas this way also.

Inbox reply on question 310, 12:30 UTC:

> ok i'm not sure why the server would be needed to add to the atlas maybe you can explain why the server which uses
> claude api calls would be more reliable than local claude cli, is it just a question of whether th eperson is using
> high enough thinking on a good model or what, this should be for all accounts i want to make a downloadable app (on
> linux first) that would run locally with a GUI to work the runner and to show preferences etc. like model thinking
> levels, model selectors, provider selectors (GPT, claude for now, not sure i trust gemini and grok enough)

## What exists today

**The runner** (the owner's laptop, `~/askrigor-runner`, not in this repository; version 2, 14 Nov). A program runs
each step of a research as its own Claude Code run on the owner's Claude plan: plan, the person's reply, one worker per
task (at most four at once), write, review, one revision, the program's own check. Workers reach 16 of AskRigor's
research tools through the owner's connector, each call through the program's gate. Measured on the five test
questions, once each: 44 seconds to 6 minutes 41 seconds a question, 153 AskRigor calls in all, and the plan's weekly
limit moved from 29% to 32% with every other session on the account included (about USD 11.90 at API list prices).
One account, one model, one evening: a first measurement, not a rate to promise.

**What the runner lacks for this plan:** a budget, a way to stop early with an answer, picking up a stopped run, more
than one round of tasks, and the server's final check.

**The final check.** Most of it is rules that need no AI: it verifies the server's signed proof of each thing read,
and ties the answer's links, readings and declared figures to that proof. Only the server can do this part, because
only the server can verify its own signatures; a local program can be changed by anyone, so its own word proves
nothing to the Atlas. On top ride three AI readings: the review of the draft and the meaning judge (the owner's dev
accounts only, paid from the owner's Claude API credits) and the second reading (every account, within its daily
budget). Judging meaning is not something the server does better than a good model on the person's own plan. How well
it is done depends on the model and how hard it thinks, which the app can show and the Atlas can say.

**Owner answer 310a, released on 15 Nov 2026 (#469):** a call marked `later_inputs.ai_readings` `"caller"` gets the
rule checks and no AI reading from the server, on any account. The result, the receipt and the check line say who made
the readings, and the result counts what the call declared, since a pass tests safety statements, harms and figures
only as far as they are declared. Until the owner answers question 311, such a check saves no card.

**What Claude Code tells a program about the plan** (checked in Anthropic's documentation on 15 Nov, and in the
runner's own code): each run's final message gives tokens used and a cost estimate at API prices; the stream carries
rate-limit events, from which the runner already reads how much of each window is used; a run can be given a cost
ceiling and then ends by itself; an interrupt ends a turn cleanly; a session can be resumed. Not documented: what a
run returns when the plan's limit is hit in the middle, and any limit on runs side by side. All runs draw on the same
plan.

**Measured from the runner's five recorded runs** (14 Nov, read from each step's own event stream on 15 Nov; one
evening, one account, five questions once each: figures to design with, not rates to promise).

- **A researched question** (four of the five): USD 2.59 to 3.35 at API list prices, 414 to 753 seconds of step time
  (the steps of one run overlap, so the clock time was shorter), 63 to 85 tool calls. The light look-up: USD 0.35,
  38 seconds, 4 tool calls.
- **Where it goes:** the five workers take 75 to 80 percent (USD 0.23 to 0.74 a task, 49 to 123 seconds, 8 to 20 tool
  calls each: about USD 0.03 and 6 to 7 seconds a tool call). Planning: USD 0.08 to 0.26.
- **The ending** (write, review, revise): USD 0.51 to 0.62 and 74 to 119 seconds, nearly the same in every run. So the
  share to set aside is a floor that grows with the amount of material to write from, not a percentage of the run.
- **What the plan reports:** only the weekly window, in whole points (0.29, 0.30, 0.31, 0.32). The five runs moved it
  three points, with every other session on the account included: roughly USD 4 at list prices a point. No five-hour
  window appeared in these runs' events.
- **What this means for the budget:** the plan's own meter is too coarse to steer a run by. The program steers by
  the cost count each step reports (exact for the run, a list-price estimate), converts the person's share into that
  count with the measured rate, and treats the plan's meter as the limit that wins: research stops when the reported
  use reaches the person's cap, whatever the count says.
- **Thousands of searches:** at about USD 0.03 a tool call, a thousand single calls is about USD 30 to 40 at list
  prices, eight to ten points of the weekly limit. That is why the list-of-searches call on the server comes before
  any run of that size.

**What Codex tells a program** (checked in OpenAI's documentation and the `openai/codex` source on 15 Nov; OpenAI's
Service Terms could not be read). A `codex exec --json` run reports tokens only, as the thread's running total, and
nothing about limits. The limits come from a second channel, `codex app-server`: it returns each window's used
percentage, its length and when it resets, and pushes changes. A turn refused at the limit fails with a message that
names the reset time, and the thread can be resumed. A program that drives a person's local Codex is a documented use
(OpenAI's own SDK starts the CLI). For a tool that other people use with their own ChatGPT plan, the route OpenAI
offers by name is Sign in with ChatGPT for open-source tools, where the person caps each app's weekly share; whether
a distributed app may instead drive each person's signed-in Codex is not answered anywhere. No documented cap on runs
side by side; a separate rate limiter exists with no published numbers, so the number of workers is a setting that
starts low and backs off.

**The Atlas's data** (read in the code on 15 Nov). A saved card has, for each finding, `what_would_change_it`, and for
the card up to six `open_leads`; a finding that reports nothing found lists its searches. The published finding has
the first and the last, not the open leads. A card's stamp counts receipts, validated sources and lead sources, and
each source has how it was read (audited, read in full, in part, abstract only); the counts are not published. The
research frontier keeps open trails with a kind and a priority, by topic; the lookup tool returns them, and no Atlas
page shows them. Nothing about a research's tasks is kept after the turn. The free-use notice does not mention
publishing open leads or how far a research went.

## One design under all four: a run with a ledger

A deep research is not a long conversation. It is a run that keeps a ledger on disk and spends a budget:

- **The question**, in the person's words.
- **The budget**: a time horizon and a share of the plan.
- **The ledger**: every call with the server's receipt, every finding with its source and how it was read, every
  line of inquiry with what it cost and what it gave, and what is still open.

Everything the owner asked for reads from the ledger. The answer at any moment is written from it, so stopping early
loses nothing. The meters are sums over it. Staying on track is a rule about which lines of inquiry get more budget.
The Atlas card, with what was read and what is still open, is a copy of part of it.

## Deep research mode

### The budget

The person sets two things before the run: how long, and how much of the plan.

- **Time horizon:** for example 10 minutes, 30 minutes, 2 hours, 8 hours.
- **Plan share:** for example "at most 10% of my weekly limit", shown beside what is used already.

The program, not a model, keeps three meters and shows each as used and left:

1. **Time**, by the clock.
2. **Plan share**, from what Claude Code reports for the 5-hour and weekly windows. For Codex, from its app-server,
   since its run events carry no limits.
3. **Work done**: searches, sources opened, sources read in full.

Before starting, it says what the budget is likely to buy, from measured rates, and it corrects that estimate from
the run's own burn rate as it goes ("at this rate, 40 minutes left"). The estimate is shown as a range and called an
estimate.

**The ending is reserved first.** Writing, the review, the revision and the server's check need budget too. The
program sets that share aside at the start (measured, not guessed: in the runner's five runs these steps are a known
part of each run) and research can never spend it. This is what makes "a huge unfinished research task" impossible:
research stops when its share is spent, whatever state it is in, and the reserved share turns the ledger into a
checked answer.

### Rounds of workers

Research goes in rounds. Each round: plan the tasks, run them side by side, merge what they found into the ledger,
check the course, plan the next round from what was learned.

- **Width comes from workers side by side.** Each worker has one small task (search one line of inquiry, read one
  paper in full, audit one method, read one thread) and a small budget of its own. Small tasks keep each worker's
  context small, which is what lets many run at once.
- **Depth comes from rounds.** A 10-minute run has one or two rounds. An 8-hour run has dozens.
- **How many at once** is set from the plan's limits and from what the server and its sources allow, and is one of
  the things to measure. The runner's four is the starting point.

### Thousands of searches: batches on the server

A model that makes one tool call per search spends most of its budget reading results. For wide searching, the
server takes a list of queries in one call, runs them side by side, and returns one list of records with duplicates
removed (title, year, journal, identifiers), each with the query that found it. This goes in `later_inputs` of the
existing search tools, so the tool list does not change. The program keeps the set of records already seen and asks
only for new ones. This, more than the number of workers, is what makes thousands of searches affordable. The
server's own limits on its sources (PubMed, Europe PMC, OpenAlex, Reddit, YouTube's daily quota) bound it, and a deep
run needs a fair-use limit per account.

### Nothing is lost: checkpoints

- Every call's result and receipt is in the ledger the moment it arrives, not when a worker finishes.
- After each round the program writes a short current answer from the ledger. Stopping at any time, by the person,
  by the budget or by a failure, ends with the latest one, brought up to date and checked.
- A stopped run can be picked up: it reads its ledger, repeats no call it holds a receipt for, and goes on.
- When the plan's limit is near, the program stops starting workers, lets the running ones finish or interrupts them
  cleanly, and writes the answer from the reserve.

### Staying on track

Deep research goes wrong in a known way: it follows a line that looked promising, keeps spending on it, and loses
the question. Two things prevent it, one for the program and one for a model.

**The program's rule (exact things).** The ledger has a row for each line of inquiry: what part of the question it
serves, what it has cost, and what it has given (new sources, facts that changed or qualified the answer, things that
contradict it). A line that gives nothing new for a set number of workers is closed as a dead end, and the ledger
keeps what was searched, so nobody searches it again. Budget goes only to lines the course check ranked.

**The course check (a judgment of meaning).** After every round, one fresh worker sees only the person's words, the
current answer in a few lines, and the table of lines of inquiry. It has not read the workers' reports, so it cannot
be carried along by them. It must say:

1. What the person asked, and whether the current work still answers that. Tasks that do not serve it are cut.
2. Which open lines could change the conclusion, which only how sure it is, which only detail (the menu's own three
   words), and so which get the next round's budget.
3. What would show the current answer wrong, and one task that looks for exactly that.
4. Whether more research can still change the answer. If not, the run ends early and gives the budget back.

**Learning across runs.** A new run starts from what AskRigor already holds: the Atlas's findings, its open leads and
its dead ends for that topic. So a line someone already found empty is not searched again, and a run can begin where
another stopped. This is why the Atlas part below matters to the research itself, not only to readers.

### What the person sees

Before: the question as understood, the budget, and what it is likely to buy. During: the three meters, the round,
each worker's one-line task, and the current answer. Any time: Stop and give me what you have. After: the answer, the
check, what was read and how, what is still open, the dead ends, and what a further budget would do first.

## The app

A local program with a window, Linux first, that runs the runner.

- **Settings:** provider (Claude, GPT), model, how hard it thinks, the default budget, how many workers at once.
- **A run:** the views above.
- **History:** every run's folder, with Pick up where it stopped.
- **The Atlas:** findings that need research, each with Research this (below).

**It never handles a login.** It starts the person's own installed and signed-in Claude Code or Codex, as the runner
does today. Anthropic's documentation (read on 15 Nov) allows a person to use the unmodified Claude Code with their
own subscription, forbids a third party's product from offering the Claude login or passing requests through plan
credentials, and does not say which of the two a distributed open-source runner is. So the owner's own use is clear,
and giving it to other people needs Anthropic's answer in writing first. The same question goes to OpenAI for Codex,
with a second one: whether AskRigor's app should use Sign in with ChatGPT, which OpenAI offers to open-source tools.

**First form:** a page in the browser served by the runner on the person's own computer. It is the shortest way to a
working window, it is the same on every system, and it can be wrapped as a desktop app later without rewriting it.

## The Atlas: what each finding still needs

### On each finding, at a glance

Three lines, all computed by rule from what the check signed, never a model's impression:

1. **How far the research went.** Counts, not a grade: sources read in full or audited, sources seen only as an
   abstract, forum threads read, whether the method was audited. Shown as a small bar and one sentence, such as "2 of
   5 sources read in full, 14 threads read, no method audit".
2. **What more research would do first.** The open tasks, most important first, each saying what it could change:
   the conclusion, how sure it is, or detail.
3. **Dead ends.** What was searched and gave nothing, with the searches, so a reader knows the gap is real and a
   researcher does not repeat it.

### A page of what needs research

Findings ranked by how much research would matter, with the reason shown beside each. The order comes from exact
fields, and the page says which:

- **It matters:** a strong claim (the Atlas's existing strength score) that no supervisor has checked.
- **Research could change it:** an open task marked as able to change the conclusion; key sources not read in full.
- **People cannot easily find it:** the finding differs from the usual quick answer, or rests on few sources.

People can filter by topic. Whether people may also vote "I want this researched" is a later question.

### Contributing

Each open task has Research this. In the app it starts a run on that task with the person's own budget. For ChatGPT
or Claude it gives a sentence to paste ("Use AskRigor: continue Atlas finding P-…, task 2: …"). The result is
checked like any research and joins the finding as a later version; the finding's page shows what each contribution
added.

### What this needs that does not exist

- The card's open leads, and how far its research went, published (stored today, not public).
- New on the card: each open task's kind and what it could change, and dead ends beyond "nothing found".
- A link from a frontier trail to a finding.
- The free-use notice and the privacy page say what is published. Both must say this first.

## Stages

Each stage names what is built, where, and how it is judged. Criteria are written before any run. All runs here are
DEVELOPMENT / DISCOVERY: they tune the program, and cannot confirm it for other questions, accounts or models. A
later set of questions that nothing was tuned on confirms it.

**Stage 0. The check works for the runner (released on 15 Nov 2026, #469).** Owner answer 310a. Judged by its tests
and by one real check from the runner: every receipt verified, a pass, no review, second reading or judge call on the
server.

**Stage 1. The runner gets a budget and rounds** (the laptop, the owner's use). Built: the two budget settings and the
reserve, the ledger, rounds with the course check, the dead-end rule, a current answer after each round, pick-up, and
the server's check at the end. Judged on the five test questions at 10 minutes and one open question at 30 minutes:

1. Every run ends inside its time horizon and its plan share.
2. A run interrupted at a moment chosen beforehand leaves an answer that passes the server's rule check on what was
   read until then; picked up, it repeats no call it holds a receipt for.
3. On the two questions that carry a false premise, the first course check names the premise.
4. At 30 minutes the run reads more sources in full than at 10 on the same question, and at least one claim changes
   or is qualified. If not, the extra budget bought nothing, and the report says so.
5. Every final answer passes the server's rule check with every receipt verified.

**Stage 2. Batches on the server.** Built: a list of queries in one call on the search tools. Judged: the same wide
search as single calls and as one batch returns the same records, and the batch costs the worker a measured fraction
of the tokens.

**Stage 3. The app's first form.** Built: the local page over the runner with settings, a run's views and history.
Judged by the owner using it.

**Stage 4. The Atlas shows what findings need.** Built in two steps: first from what is stored today (how far the
research went, open leads, the page of what needs research), then the new card fields. Needs the notice and the
privacy page first, so it needs the owner's yes on the exact words.

**Stage 5. Other people.** After Anthropic's and OpenAI's answers: the app for download, GPT as a provider,
contributions shown on findings.

## Decisions that are the owner's

Asked on the owner questions page on 15 Nov:

- **311.** May a check whose AI readings the app made save its card to the Atlas, marked as such?
- **312.** May the Atlas show, for each finding, how far its research went, its open tasks and its dead ends, with the
  notice and privacy page saying so first?
- **313.** Ask Anthropic and OpenAI in writing before the app goes to anyone else?

Also the owner's: a share of the plan for real test runs. Not asked as a question: the app's first form is a page in
the browser served on the person's own computer (the session's choice; the owner was told and can say otherwise).

## Not done, and risks

- **A budget in plan share is only as good as what the provider reports.** Claude Code reports each window's use;
  what a run returns when the limit is hit in the middle is not documented, which is why the reserve and the
  checkpoints do not depend on it.
- **A deep run on a health question can meet Claude's own safeguards** (the runner's Syrian rue runs did). A stopped
  step is never worked around; the answer says which step stopped.
- **The server's sources have limits**, and YouTube's quota is shared by everyone. A deep run needs its own limits
  there.
- **Rounds can still chase a wrong line for one round.** The course check runs after each round, not during it.
- **Deep research in ChatGPT's or Claude's own app is not this.** Those apps end a turn after a set amount of work,
  and AskRigor cannot change that. There, AskRigor stays the menu with minutes. Deep research is the runner's.
