# The engine an AskRigor web app would run on: a trial

Owner answer 221, 2 November 2026: "we can also maybe try the web app and see how that works better now using these api
credits that will expire anyway". Built on the branch `claude/funny-solomon-87af0f` from `main` at `b9e658e2`, the build
production runs. Nothing here changes the server, its tools or the apps.

## What it is

`scripts/web-engine.mts`: Claude Opus 5.5, through the Claude API, answers one question the way AskRigor's ChatGPT app
does. It connects to AskRigor's MCP server itself, offers the model the same 35 tools with the server's own instructions,
adds web search and web fetch (ChatGPT's app has its own web search), runs the tool loop, and keeps the answer, an event
log and each request's cost. A laptop script, not a site.

- **A manual tool loop, not the API's MCP connector.** The engine holds the AskRigor pass and sends it only to AskRigor;
  with the connector, Anthropic's servers would receive it. The loop also lets the engine refuse calls before they reach
  AskRigor and time each one.
- **What it refuses, without calling AskRigor:** every save, submission, review or share, and every
  `manage_research_access` action other than `inspect` and `register_plain_answer` (the plain answer the final check
  compares claim by claim, owner answer 217b; ChatGPT's runs use exactly these two). The ChatGPT harness forbids the
  first three in its preamble and watches the save switch after each case; the engine makes them impossible.
- **The account:** before each case the engine inspects it and runs only on an active dev account with card saving
  off, and on the account the run names. It stops the run at the first result that shows saving on or a card saved,
  as the harness's save guard does.
- **The same prompt as ChatGPT's run:** each case's first message is the harness's preamble and the case, word for word;
  later turns are the case's turn files. The system prompt is the date, one line naming the tools, the server's
  instructions, which an MCP client receives when it connects, and, since the pilot, the AskRigor plugin's skill
  (`skills/askrigor/SKILL.md`, the same bytes as the plugin installed in Codex). In the pilot, without the skill, Claude
  loaded 0 to 2 protocol sections a case, against 11 to 34 for ChatGPT, because the server's instructions don't mention
  the protocols. Codex shows GPT the skill's name and one-line description, not its text, and GPT loads them anyway. A web
  app AskRigor builds writes its own system prompt, so the engine gives Claude the skill's text, which says to load
  Universal and HRP. `--no-skill` runs it as the pilot ran.
- **Limits per turn, as the harness's:** 35 minutes (the harness's `timeout 2100`). The engine adds a hard ceiling of 100
  AskRigor calls a turn (the preamble asks for about 60) and a cost ceiling per case, and a run stops at its budget.
- **Settings:** effort `high`, adaptive thinking with summaries in the log, server-side refusal fallback (`fallbacks:
  "default"`; a fallback attempt is priced at its own model's rates and shows in the usage), prompt caching with the
  tools and system prompt held an hour. ChatGPT's run uses GPT-6.1 Sol at extra-high reasoning through Codex.
- **Output, outside the repository:** `out/<id>[.turnN].md`, `logs/<id>[.turnN].jsonl` in the shape of a Codex event log
  (so `digest-check.py` and the other judging helpers read both runs), `usage/<id>.json` and `progress.txt`.
- **Cost:** computed from each response's usage and the price list (Claude Opus 5.5: $4 input, $20 output, $5 and $8
  cache writes for 5 minutes and 1 hour, $0.20 cache reads per million tokens; $10 per 1,000 web searches). The
  Console's billing is the authority; the record says so.

## Spending

Owner answer 221 allows Claude API inference for "trying an AskRigor web app", from the owner's monthly Claude API credit
($200 this month on the account whose key AskRigor was given). The policy record is on `claude/next-build-20261102`
(`aa46501d`, scope `ASKRIGOR_WEB_APP_TRIAL`). Its gate passes a $20 pilot request in that scope, and fails the same
request without the scope, as a control (2 Nov, 18:3x UTC), and the pilot's worst case, $36 (three cases at $12). The
plumbing check (two requests on the public endpoint, no sign-in) cost $0.09 and the pilot $13.00. After the pilot, the
owner sets the cap for the sample (question 226); a run's `--budget` is that cap less one case's ceiling, so a case
started under the budget can't take the run past the cap.

Owner answer 226b (2 Nov, about 20:43 UTC): up to $60 for nine cases, "make sure before you spend so much that it's
actually worthwhile, sounds like you wasted money on this round." The gate passes $60 in the trial's scope. So the
sample spends only where it can still change the conclusion:

1. **Free first:** the pilot's three answers are judged blind against ChatGPT's, by a subagent on the Claude plan. If
   Claude's are judged worse in all three, stage 1 waits for the owner; otherwise it is set to start by itself.
2. **A guard:** `--require-protocols-by 10` stops the run when a case has made 10 AskRigor calls without loading both
   Universal and HRP. Tonight's ChatGPT run loaded both by its 7th call in all 43 cases. The pilot's cases never did,
   and the guard would have stopped them at about a dollar.
3. **Stage 1, at most $36:** three cases ChatGPT failed or met in part (`q136-weak-lead-given`, `r376-forum-500`,
   `q126-39-replication`), on the same build as ChatGPT's answers (the script checks it). It starts after tonight's
   regression run ends, and after YouTube's quota resets at 08:00 UTC if that run used it up.
4. **The rule, set before any result:** stage 2 runs only if the blind judging of stage 1 finds Claude's answers better
   than ChatGPT's in more cases than worse. Otherwise the record says so, and the rest of the cap stays unspent.
5. **Stage 2, the rest of the $60:** `q130-maker-authors-turmeric`, `o356-ssris-years` and `r382-week-800`, then the
   pilot's three cases again, until the budget stops it. Both stages share one ledger, so `--budget 48` at $12 a case
   keeps the sample at $60 or less.

## On the Claude plan, not the API (the owner, 2 November, about 23:15 UTC)

The owner asked: "why we need to use the api credits if there's no web app. you can open a claude worker any time
right here". The API was needed only to learn what a web app would pay and how long it would take, and the pilot
measured that. Judging Claude's answers against ChatGPT's doesn't need it: a Claude worker on the owner's Claude plan
gives the same model's answers at no API cost and, like ChatGPT's run through Codex, is an agent run from the laptop. So
the overnight API run was stopped before it spent anything, API spending stays at $13.09 ($0.09 for the plumbing check
and $13.00 for the pilot), and the sample runs on the plan, in the same stages and under the same rule.

- `scripts/web-engine-worker.mts` runs each turn as Claude Code headless (`claude -p`, Claude Opus 5.5 at effort
  `high`) with the engine's system prompt (the date, the server's instructions and the skill), AskRigor's tools on the
  engine's sign-in, web search and web fetch, and nothing else. The user's settings, plugins, skills, memory and other
  MCP servers are left out. It starts from an empty environment, so Claude Code uses its own claude.ai login; a turn
  that reports an API key, or isn't connected to AskRigor, stops at once.
- The engine's own functions decide every tool call, in a hook Claude Code runs before and after each one: the same
  refusals, the limit of 100 AskRigor calls a turn, the save guard and the protocol guard. The account is checked before
  each case as the engine checks it. Claude Code's permissions also remove the five tools the engine refuses, in case
  the hook can't run, so the worker isn't offered them at all (the engine offered them and refused the calls).
- **Differences from the engine that remain:** Claude Code shows the model each AskRigor result's structured content,
  where the engine showed its text and then its structured content, and it compacts a conversation that outgrows the
  model's context (the record says if a case was compacted). The cost Claude Code reports is what the same requests
  would cost on the API; on the plan they come out of the plan's usage.
- **Checked on 2 Nov at 23:25 UTC, with two small cases and no YouTube search:** the worker reported no API key, only
  AskRigor (30 tools), web search and web fetch, and no instructions besides the system prompt. It loaded Universal's
  index and saw its structured result. The hook refused the call it was set to refuse, with its reason, and the protocol
  guard stopped a turn before its second call. Both cases together would have cost $0.62 on the API.
- `plan-sample.sh` (outside the repository, beside `sample.sh`, which is no longer used) starts stage 1 by itself after
  tonight's regression run, as before. Stage 2 runs only under the rule above.

## The sign-in (owner question 222)

AskRigor's research tools need a signed-in account, and AskRigor accepts passes only from the two apps it knows,
ChatGPT's and Claude's. The session never signs in. Question 222 asks the owner to choose:

- **a (recommended):** add a laptop return address to the Auth0 "Claude" application, save its client ID and secret in
  the owner's key folder, and sign in once in the browser with the everyday Google login (the dev account). The engine
  asks only for `research:use`, keeps no refresh token, stores the pass in a private file outside the repository and
  sends it only to AskRigor. Nothing changes on AskRigor's server. After the trial the owner removes the address and
  deletes the files.
- **b:** the owner gets a pass from Auth0's Authentication API Debugger extension and saves it in a file.
- **c:** a release that accepts a third app, the engine's own (what a real web app needs).

The owner chose a (222a, about 19:05 UTC), added the address and saved the two files. `scripts/web-engine-sign-in.mts`
is the one command: PKCE with a loopback address on the laptop, the Google connection, a fresh sign-in, `research:use`
only. It keeps the pass only if it is for AskRigor's Claude surface, issued to the Claude app, for a Google login, with
no other scope, and never keeps the refresh token. The owner signed in at 19:44 UTC.

## Cases, chosen before any result

From the regression list as it stands at `b9e658e2`. ChatGPT's verdicts on #393's build are in brackets.

- **Pilot (3):** `i44-gh-secretagogue-safety` [pass], `l25-columns-passages` [in part], `l32-negative-controls`
  (two turns) [in part]. All three had finished in tonight's ChatGPT run before the pilot.
- **Sample (12 more, after tonight's regression run ends, since both use AskRigor's YouTube quota):**
  `q126-39-replication` [in part], `q126-40-aura` [pass], `q128-oral-liver` [pass], `q130-maker-authors-turmeric`
  [in part], `q132-copper-b12` (two turns) [in part], `q136-weak-lead-given` [fail], `o355-best-ocd` [in part],
  `o356-ssris-years` [in part], `q120-sleep-inside-outside` (two turns) [in part], `r376-forum-500` [fail],
  `r382-week-800` [in part], `s360-studies` [in part].

Weighted toward cases ChatGPT met only in part or failed, where a better engine would show; three passes check that
nothing that works gets worse. If the engine changes after the pilot, the pilot's cases run again. It did (the skill), so
the sample was to be these 12 and the pilot's 3, 15 cases, on one version of the engine. Owner answer 226b keeps nine:
the pilot's three and six of the twelve, run in the stages above.

## Judging

Against each case's criteria (`docs/owner-regressions.md` at `b9e658e2`) and against ChatGPT's answer to the same case
in tonight's run on the same build, with the brief of the judgment of #393's run (`judge-61215c0b`) and the same helper
summaries for both runs. Each case's two answers go to the judges as A and B in an order drawn at random, so a judge
doesn't know which engine wrote which. Judges: Claude subagents, and the other model family (GPT through Codex) on the
same blind packets, because a Claude judge may favour Claude's answers; the record reports where they disagree.

**Two judges, one rule (written on 3 Nov at 08:43 UTC, after stage 1 ran and before either judge saw it):** for
the stage-2 rule, a case counts as won by Claude, or by ChatGPT, only when both judges prefer the same answer. A split or
a tie counts as neither. Stage 2 runs only if Claude wins more cases than ChatGPT does.

## Done

A pull request with the engine and its tests, a record under `docs/audits/` (cost and time per case, and quality against
ChatGPT's run), and a line on the owner page.
