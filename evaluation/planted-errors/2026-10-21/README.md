# Planted-error test, 21 Oct 2026

The owner's answer 131c (owner questions page, 20 Oct): run the planted-error test through the owner's Codex, with no
paid model API, after the day's regression list. Method: UDA's Sakana item, method 6 (UDA#371), and the benchmark item
it supersedes (UDA#370): invented study reports with one planted error each, or none (controls), errors of differing
centrality and place (a table, a table pasted as flattened text, a supplement, a figure sent as an image, the text),
exact-error matching, a blinded reading of each answer, and wrong claims and false positives counted as well as recall.

- `cases/`: each case's question and report, under a neutral name; `t05.png` is sent with `t05.md`.
- `preamble-invented.md`: the test preamble for the invented reports; `preamble-real.md`: for real papers.
- `run.sh`: the runner on the owner's laptop (Codex settings, tool limits and clean start of the 21 Oct regressions).
- `manifest.sha256`: SHA-256 of every file, frozen before the first run, including `key.json`, the answer key, which
  stays out of the runs' reach and is committed here only after every run has finished.

The reports are invented: no such studies, products or results exist.
