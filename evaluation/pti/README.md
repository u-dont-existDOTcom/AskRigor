# PTI benchmark

Tools for the Proactive Troubleshooting Intelligence comparison. The plan,
arms, metrics and validation rules are in
`docs/superpowers/plans/2026-10-04-proactive-troubleshooting-intelligence.md`.
Everything runs on the owner's Claude and ChatGPT plans; no API key reaches a
child process. Use Node 24.

```sh
export PATH=/home/joel/.nvm/versions/node/v24.18.0/bin:$PATH LC_ALL=C
OUT=~/askrigor-pti-runs/dev     # private, mode 0700, outside the repository and /tmp

# One arm over cases, then both judges; resumes past finished runs and verdicts.
evaluation/pti/runner/run-arm.sh bare-gpt "$OUT" evals/pti/cases/development/*.json
evaluation/pti/runner/run-arm.sh bare-claude "$OUT" evals/pti/cases/development/*.json
evaluation/pti/runner/run-arm.sh askrigor:27deb4a5 "$OUT" evals/pti/cases/development/*.json   # live build
evaluation/pti/runner/run-arm.sh askrigor:<candidate commit> "$OUT" evals/pti/cases/development/*.json

# Tables, each judge separately, with the paired comparison.
node evaluation/pti/judge/summarize-pti.mjs --root "$OUT" --cases evals/pti/cases/development \
  --baseline askrigor-27deb4a5 --candidate askrigor-<candidate commit>
```

- `runner/run-codex.mjs`: the bare-GPT arm (`codex exec`, then `codex exec
  resume` per turn) from a clean `CODEX_HOME` (`runner/codex-home.mjs`): apps,
  plugins, memories and the shell off. A run that used any other tool is
  rejected.
- `../instruction-optimization/runner/run-claude.mjs --turns-file`: the Claude
  arms; `--bare` for plain Claude.
- `judge/judge-pti.mjs`: one transcript per call, arm names redacted, ID-only
  verdict validated against the case. `computeMetrics` derives the timing,
  rank, burden and unlisted counts.
- `case-contract.mjs`: the case-authoring contract, shared by the tests and
  the sealed authoring.
- `authoring/author-validation.mjs`: writes the sealed validation set into a
  private folder and commits only hashes (`evals/pti/sealed-validation.json`).
  Do not open the sealed cases before the freeze.

Raw transcripts and answers stay in the private folder; only verdict tables
and hashes are committed.
