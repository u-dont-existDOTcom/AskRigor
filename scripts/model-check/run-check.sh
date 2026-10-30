#!/usr/bin/env bash
# The model check (owner answer 198a), run over bundles from extract-bundles.py with one engine on the owner's own
# plan: Claude Code (`claude -p`) on the Claude plan or Codex (`codex exec`) on the ChatGPT plan, so no API spend.
# Each check is one stateless call with every tool off: the bundle holds all it may use. Results already written are
# kept, so a stopped run resumes.
# Usage: run-check.sh <claude|codex> <model> <effort> <bundles-dir> <out-dir> [parallel, default 2]
set -uo pipefail
ENGINE=${1:?engine}; MODEL=${2:?model}; EFFORT=${3:?effort}; IN=${4:?bundles}; OUT=${5:?out}; P=${6:-2}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
IN=$(cd "$IN" && pwd); OUT=$(cd "$OUT" && pwd)  # absolute, since each check runs from the empty directory below
WORK=$(mktemp -d)  # an empty working directory: no project files or instruction files
export ENGINE MODEL EFFORT OUT HERE WORK

check_one() {
  bundle=$1; name=$(basename "$bundle" .json)
  [ -s "$OUT/$name.result.json" ] && return 0
  input="$WORK/$name.input.md"
  { printf 'The input:\n\n'; cat "$bundle"; } > "$input"
  started=$(date +%s)
  if [ "$ENGINE" = claude ]; then
    (cd "$WORK" && timeout 1200 claude -p --model "$MODEL" --effort "$EFFORT" --tools "" --strict-mcp-config \
      --mcp-config '{"mcpServers":{}}' --no-session-persistence --system-prompt-file "$HERE/check-instructions.md" \
      --output-format json < "$input" > "$OUT/$name.raw.json" 2> "$OUT/$name.err")
  else
    { cat "$HERE/check-instructions.md"; printf '\n\n'; cat "$input"; } > "$WORK/$name.prompt.md"
    timeout 1200 codex exec --skip-git-repo-check -C "$WORK" -m "$MODEL" -c "model_reasoning_effort=\"$EFFORT\"" \
      --sandbox read-only --json -o "$OUT/$name.reply.md" - < "$WORK/$name.prompt.md" \
      > "$OUT/$name.raw.jsonl" 2> "$OUT/$name.err"
  fi
  code=$?
  python3 -I "$HERE/collect-result.py" "$ENGINE" "$OUT" "$name" "$code" "$(( $(date +%s) - started ))"
}
export -f check_one
ls "$IN"/*.json | xargs -P "$P" -I{} bash -c 'check_one {}'
echo "done: $(ls "$OUT"/*.result.json 2>/dev/null | wc -l) results in $OUT"
