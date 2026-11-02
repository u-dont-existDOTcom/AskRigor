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
  `manage_research_access` action other than `inspect`. The ChatGPT harness forbids the first three in its preamble and
  watches the save switch after each case; the engine makes it impossible. Card saving stays off on the dev account.
- **The same prompt as ChatGPT's run:** each case's first message is the harness's preamble and the case, word for word;
  later turns are the case's turn files. The system prompt is the date, one line naming the tools, and the server's
  instructions, which an MCP client receives when it connects.
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
request without the scope, as a control (2 Nov, 18:3x UTC). The plumbing check (two requests on the public endpoint, no
sign-in) cost $0.09. After the pilot, the owner sets the cap for the sample.

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

The sign-in command is built after the owner's answer.

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
nothing that works gets worse. If the engine changes after the pilot, the pilot's cases run again.

## Judging

Against each case's criteria (`docs/owner-regressions.md` at `b9e658e2`) and against ChatGPT's answer to the same case
in tonight's run on the same build, with the brief of the judgment of #393's run (`judge-61215c0b`) and the same helper
summaries for both runs. Each case's two answers go to the judges as A and B in an order drawn at random, so a judge
doesn't know which engine wrote which. Judges: Claude subagents, and the other model family (GPT through Codex) on the
same blind packets, because a Claude judge may favour Claude's answers; the record reports where they disagree.

## Done

A pull request with the engine and its tests, a record under `docs/audits/` (cost and time per case, and quality against
ChatGPT's run), and a line on the owner page.
