# Claude runner

`run-claude.mjs` runs one health question through AskRigor with Claude Code
(`claude -p`) against a local AskRigor MCP server built from a chosen git ref,
and records the transcript, the final answer and metrics. It supports the
old (`main`) versus new (branch) comparison in
`docs/superpowers/plans/2026-09-26-instruction-optimization.md`. Node built-ins
only; run it with Node 24.

## Commands

```sh
export PATH=/home/user/node-v24.18.0-linux-x64/bin:$PATH   # Node 24
R=evaluation/instruction-optimization/runner/run-claude.mjs

# One development question against the branch (HEAD) and against main
node $R --ref HEAD --question-id dev-hip-fix --model claude-opus-5-5 --effort max --out /tmp/eval/hip-new
node $R --ref main --question-id dev-hip-fix --model claude-opus-5-5 --effort max --out /tmp/eval/hip-old

# Plumbing check without calling Claude (build, serve, probe, stop)
node $R --ref main --setup-only

# Re-derive metrics.json and answer.md from a saved transcript
node $R --reanalyze /tmp/eval/hip-new
```

Other options: `--prompt <text>` instead of `--question-id`, `--max-turns`
(default 200), `--port`, `--work-dir` (default `$ASKRIGOR_RUNNER_WORK_DIR` or
`<tmp>/askrigor-runner`; must be outside the repository), `--timeout-minutes`
(default 240). `HELD_OUT` questions refuse to run without `--allow-held-out`
(final comparison only). Without `--model`, Claude Code picks its default model
(Sonnet 5 when this was written), so pass `--model` for comparisons.

## What a run does

1. Resolves `--ref` to a commit (committed state only) and materializes it as a
   detached worktree at `<work-dir>/worktrees/<sha12>`, reused when present.
   When `package-lock.json` matches the main checkout, `node_modules` is a
   directory of links to the main checkout's packages, except that the
   workspace links (`node_modules/@askrigor/*`) point into the worktree; a
   single `node_modules` symlink would silently load the main checkout's
   packages and protocol files. Otherwise it runs `npm ci`. Then `npm run build`.
2. Starts the server as production does (`createAskRigorHttpServer` from
   `apps/research-mcp/dist/index.js`, `NODE_ENV=production`,
   `ASKRIGOR_PUBLIC_SERVER_ENABLED=true`), bound to 127.0.0.1, with no OAuth, so
   research-access checks are off. The server environment is an allowlist: a
   random `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET` per run; `YOUTUBE_API_KEY`,
   `NCBI_API_KEY`, `NCBI_TOOL`, `NCBI_EMAIL`, `CROSSREF_MAILTO` and
   `ASKRIGOR_UNPAYWALL_EMAIL` only when set (presence is recorded as booleans);
   `ASKRIGOR_GEMINI_API_KEY` (from itself or `GEMINI_API_KEY`) with a monthly
   budget ledger at `<work-dir>/ai-budget-ledger.json` capped at USD 50, as in
   production, so the Gemini scout can run;
   proxy and CA variables, plus `NODE_USE_ENV_PROXY=1` behind a proxy. It waits
   for `/healthz`, lists the MCP tools, and checks that `get_protocol_manifest`
   returns the SHA-256 of the ref's protocol files.
3. Creates a clean workspace outside the repository, copies the ref's
   `skills/askrigor/` to `.claude/skills/askrigor/`, and writes an MCP config with
   one HTTP server named `askrigor`.
4. Runs `claude -p "<question>" --mcp-config <file> --strict-mcp-config
   --output-format stream-json --verbose --allowedTools mcp__askrigor
   "Skill(askrigor)" --disallowedTools Bash Edit Write NotebookEdit WebFetch
   WebSearch --no-session-persistence --permission-prompts none` in that
   workspace. The child environment drops variables that would attach it to a
   calling Claude Code session, load extra directories or account-synced skills,
   or carry unrelated credentials, and always drops `ANTHROPIC_API_KEY`
   (zero-spend policy: the plan, never a paid key). Removed names are listed in
   `metrics.json`.
5. Stops the server (always, also on errors and Ctrl-C) and writes the outputs.

## Outputs (`--out`)

- `transcript.jsonl`: raw stream-json from Claude Code.
- `answer.md`: the final assistant text.
- `metrics.json`: see below.
- `server.log`, `claude-stderr.log`, `setup.log`, `mcp-config.json`.

Known secret values (continuation secret, provider keys) are replaced with
`[REDACTED]` in every saved file; `metrics.transcript.redactions` counts them.

## metrics.json

- Run: `ref`, `commit_sha`, `question_id`, `prompt`, `model`, `started_at`,
  `ended_at`, `wall_seconds` (Claude run), `setup_seconds`, `num_turns`,
  `exit`, `claude_session` (model, `api_key_source`, MCP servers, tools, skills).
- Tools: `tool_calls_total`, `tool_calls_by_name`, `tool_call_order`, and
  `tool_calls[]` with `seq` (1 = first call), `index_before_final_answer`
  (-1 = the last call before the final answer), timings and input summaries.
- Tokens and cost: `tokens` (input, output, cache read, cache creation, from the
  result event), `tokens_by_model`, `api_equivalent_cost_usd_estimate` (Claude
  Code's list-price estimate; actual spend is $0 on the plan), and
  `plan_rate_limit` (plan-window utilization reported in the stream).
- `protocol_loads[]`: each `load_protocol` call with the protocol, the size of
  the returned protocol text, the canonical file size at the ref, and the bytes
  the model actually saw (`model_saw_full_text` is false when Claude Code
  truncated or redirected the result).
- `receipts`: `manage_research_access` outcomes; `survey_youtube_community`
  (called, count); `audit_youtube_video_community` counts by
  `receipt.completion_state` and final state per video; other YouTube tool
  counts; `full_text` chains keyed by `document_handle` (acquire and continue
  counts, chains reaching `exhausted: true`, validations and whether the
  validator's receipt matches the acquisition's handle and hash);
  `method_audits` by status; `check_retraction_status` calls. Every entry has
  `seq` and `index_before_final_answer`. In `-p` mode all calls precede the
  final answer.
- `server.unhandled_socket_errors`: socket `error` events that no listener
  handled. Pilot run 1 lost its server to one (`read ECONNRESET`, no
  application frame in the stack); the runner's server bootstrap now logs each
  one to `server.log` with its local and remote address and whether it was a
  server-side socket, and keeps serving.

## Notes

- Without OAuth, `manage_research_access` returns `authorization_required`, and
  the skill asks the model to check access before research. Runs therefore
  append a short test-run note (recorded as `harness_note` in metrics): access
  is not required on the local server, and no user can reply, so approvals and
  clarifications are treated as granted with sensible defaults. The note is
  identical for every arm; `--no-harness-note` turns it off.
- `--surface claude-app` (default) gives the model only the `Skill` and
  `ToolSearch` built-ins plus the AskRigor tools, like a Claude app user with the
  connector and skill. `--surface claude-code` keeps Claude Code's other
  built-ins (`Read`, `Agent`, ...), with which the model can page an oversized
  tool result from disk or delegate to sub-agents.
- Claude Code rejects MCP tool results above its output limit. On `main`,
  `load_protocol` returns each protocol whole (about 604,000 characters for HRP
  and 168,000 for Universal as tool-result JSON), so the model receives an error
  and none of the protocol text (checked 2026-09-26 with Claude Code 2.1.283).
- The server keeps its production limits (60 MCP requests per minute per client
  IP, 16 concurrent).
- Claude Code defers most tool schemas behind `ToolSearch`, so runs include
  `ToolSearch` calls; its bundled skills (for example `deep-research`) remain
  available next to `askrigor`.
- Worktrees stay registered in the repository for reuse; remove one with
  `git worktree remove --force <work-dir>/worktrees/<sha12>`.
