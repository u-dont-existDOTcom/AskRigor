# Instruction-optimization evaluation

Supports `docs/superpowers/plans/2026-09-26-instruction-optimization.md`.

- `questions.json`: real-user-style test questions. `DEVELOPMENT` questions may
  influence changes; `HELD_OUT` questions run only in the final before/after
  comparison.
- `inventory/rules.jsonl`: one row per protocol rule (1,411 rows) with category,
  research steps, provenance, current enforcement, and a recommendation. Rows are
  model-assisted estimates, not decisions.
- `inventory/sections.json`: per-section size, estimated remaining bytes, and
  the main opportunities.
- `inventory/history.json`: the 54 revision-history entries classified by the
  failure that triggered them.
- `inventory/stress-tests.json`: the 149 HRP stress cases mapped to the rules
  they restate.
- `inventory/server-enforcement-map.md`: what the server enforces today, with
  file, line and test references.
