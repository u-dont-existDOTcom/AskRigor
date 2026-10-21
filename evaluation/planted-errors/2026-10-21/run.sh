#!/usr/bin/env bash
# Planted-error test (owner answer 131c, 21 Oct 2026) through the owner's Codex, with no paid model API: the settings,
# tool limits and clean start of the 21 Oct regressions (run.sh there), with these changes: invented study reports
# (s*, c*) get preamble-invented.md and real papers (n*) preamble-real.md; both forbid the two Gemini tools and keep
# to about 40 AskRigor calls; a case with a .png beside it sends that image with the prompt.
set -uo pipefail
R=/home/joel/askrigor-releases/planted-20261021
export R
cd "$R"
mkdir -p work logs out
# Clean start as in owner answer 144a: a one-line override makes Codex skip the owner's personal instructions while
# the test runs; it is removed when the run ends.
OVERRIDE="$HOME/.codex/AGENTS.override.md"
if [ -e "$OVERRIDE" ]; then echo "an override already exists; not touching it" >> progress.txt; else
  printf 'No personal instructions apply in this session.\n' > "$OVERRIDE"
  trap 'rm -f "$OVERRIDE"; echo "override removed $(date -u +%T)" >> "$R/progress.txt"' EXIT
  echo "override in place $(date -u +%T)" >> progress.txt
fi
OFF=(-c mcp_servers.brightdata-unlocker.enabled=false -c mcp_servers.anna-dl-api.enabled=false
     -c mcp_servers.anna-text-api.enabled=false -c mcp_servers.InfoAccess.enabled=false -c mcp_servers.node_repl.enabled=false
     --disable browser_use --disable browser_use_external --disable in_app_browser --disable computer_use)
export OFF_ARGS="${OFF[*]}"
run_case() {
  id="$1"
  case "$id" in n*) pre=preamble-real.md ;; *) pre=preamble-invented.md ;; esac
  { cat "$pre"; echo; cat "cases/$id.md"; } > "logs/$id.prompt.md"
  img=(); [ -f "cases/$id.png" ] && img=(-i "$R/cases/$id.png")
  echo "$id start $(date -u +%T)" >> progress.txt
  timeout 2100 codex exec --skip-git-repo-check $OFF_ARGS "${img[@]}" -C "$R/work" --json -o "out/$id.md" - < "logs/$id.prompt.md" > "logs/$id.jsonl" 2> "logs/$id.err"
  echo "$id exit $? $(date -u +%T)" >> progress.txt
  python3 -I /home/joel/askrigor-releases/regress-scan-tools.py logs/"$id".jsonl >> progress.txt || echo "$id DISCARD (other tools)" >> progress.txt
}
export -f run_case
date -u +%T > started.txt
ls cases | grep '\.md$' | sed 's/\.md$//' | xargs -P 3 -I{} bash -c 'run_case {}'
echo "PLANTED_DONE $(date -u +%T)" >> progress.txt
