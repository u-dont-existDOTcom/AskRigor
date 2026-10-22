# Planted-error test, 21 Oct 2026

The owner's answer 131c (owner questions page, 20 Oct): run the planted-error test through the owner's Codex, with no
paid model API, after the day's regression list. Method: UDA's Sakana item, method 6 (UDA#371), and the benchmark item
it supersedes (UDA#370): reports with one planted error each, or none (controls), errors of differing centrality and
place, exact-error matching, a blinded reading of each answer, and wrong claims and false positives counted as well as
recall. Results and judgment: `docs/audits/2026-10-21-planted-error-test.md`.

- `cases/`: each case's question under a neutral name, as the run sent it after the preamble.
  - `t01` to `t11`: invented reports (`t05.png` is sent with `t05.md`); frozen at 0fa41fdd before the first run.
  - `u01`, `u02`: invented reports with a table in the one-line form AskRigor's extraction gives the model; `n01` to
    `n03`: real papers with a published correction of a table error. Written after the first eleven results were read
    (DISCOVERY) and frozen at 9348776e before they ran.
- `key.json` (`t01` to `t11`, with each case's original label) and `key-extension.json` (`u01`, `u02`, `n01` to
  `n03`): the answer keys, kept out of the runs' reach until every run had finished; their SHA-256 are in
  `manifest.sha256` and `manifest-extension.sha256`, committed before the runs.
- `scripts/`: what made the cases and figure (`make_cases.py` names them `s01`-`s09`, `c01`, `c02`; `key.json` maps the
  neutral names back), the one-line table rendering through AskRigor's own extraction (`flatten.mts`), and the script
  that lays each key beside the readers' output (`assemble.py`).
- `readers/`: the two blinded readers' instructions and output for each set (`-2` for the second set).
- `preamble-invented.md`, `preamble-real.md`, `run.sh`: the runs' preambles and the runner on the owner's laptop.

The invented reports, products and results do not exist. The real papers are cited by DOI in their cases. The answers
and run logs stay on the owner's laptop.
