# Claude judge

`judge-claude.mjs` compares two research answers to the same question, blinded,
with Claude (Opus 5.5 at max effort by default) through `claude -p` on the Claude
plan. It supports the research-quality measure in
`docs/superpowers/plans/2026-09-26-instruction-optimization.md`. Node built-ins
only; run it with Node 24.

```sh
export PATH=/home/user/node-v24.18.0-linux-x64/bin:$PATH
node evaluation/instruction-optimization/judge/judge-claude.mjs \
  --question-id dev-hip-avoid-replacement \
  --a <run dir> --b <run dir> --out <dir> --seed 1 --web
```

- Inputs are two runner output directories (each with `answer.md`).
- Blinding: the answer order is chosen from a hash of the seed and both answers,
  and arm-revealing text is redacted (protocol names and versions, the
  protocol-too-large remark, `finalize_research` and receipt vocabulary). The
  redaction is imperfect by nature; for the final comparison, judge each pair
  in both orders.
- The judge runs from a clean temporary directory with no MCP servers, no
  tools, or only `WebFetch` (`--web`, for up to three citation spot-checks per
  answer), and with credentials and calling-session variables removed from its
  environment (never a paid API key).
- Criteria: options beyond the mainstream answer, study appraisal, heterodox
  judgment (plausible versus crackpot), safety, and usefulness; each gets A, B or
  tie with reasons, plus an overall winner and confidence, factual errors found,
  and the citations checked.
- Outputs in `--out`: `prompt.txt` (the blinded prompt), `claude-stdout.json`,
  `claude-stderr.log`, and `judgment.json` (order, winners mapped back to the arm
  directory names, verdict, wall time, API-equivalent cost estimate).
