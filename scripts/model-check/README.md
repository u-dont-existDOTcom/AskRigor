# The model check, offline (owner answer 198a)

AskRigor's code checks what code can check. The model check asks a frontier model what code can't judge: whether the
answer answers the question, whether its claims and numbers are supported by what the research read, whether the
harms that matter are weighed, whether its certainty fits the evidence, and what research it lacked. This folder runs
it offline over regression answers, on the owner's own plans, to measure whether it catches what the owner's criteria
catch before anything is built into AskRigor.

- `extract-bundles.py <regress-dir> <out-dir>`: one bundle per answer turn: the conversation so far, the answer and
  the research record (AskRigor's tool calls with their results; the AI's web searches show only their queries).
- `check-instructions.md`: the checker's instructions and reply format. It never sees the owner's criteria.
- `run-check.sh <claude|codex> <model> <effort> <bundles> <out> [parallel]`: one stateless call per bundle with every
  tool off, through `claude -p` (Claude plan) or `codex exec` (ChatGPT plan). No API key, no spend.
- `collect-result.py`: the reply, usage and timing into `<name>.result.json`.

Method (AGENTS.md, development against validation): the instructions are developed on the 27 to 28 Oct run, whose
answers are already judged (`docs/audits/2026-10-28-owner-regressions-judgment.md`), then frozen and judged on the
29 to 30 Oct run's answers once they are judged. The reference judgments are the Claude session's, so a Claude checker
may agree with them through shared habits; disagreements are reported case by case. Codex runs wait until no
regression run is using the ChatGPT plan.

Results: the frozen fourth draft on the 29 to 30 Oct run, through Claude and through Codex, scored against the
judges in `docs/audits/2026-10-30-model-check-claude-vs-codex.md` (the scoring files and every turn's verdicts in
`docs/audits/2026-10-30-model-check/`).
