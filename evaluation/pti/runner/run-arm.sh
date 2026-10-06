#!/usr/bin/env bash
# Runs one PTI arm over a list of case files, then judges each finished run with
# both judges. Runs and verdicts already on disk are kept, so a stopped queue
# resumes where it left off. Run outputs belong in a private folder outside the
# repository and outside /tmp (MAST lesson).
#
#   evaluation/pti/runner/run-arm.sh <arm> <out-root> <case.json>...
#
# Arms: bare-claude | bare-gpt | askrigor:<commit>. Output for each case goes to
# <out-root>/<case id>/<arm label>/, with judge-claude/ and judge-codex/ inside.
#
# A run that failed (a usage limit, a crash, a timeout; see run-validity.mjs) is
# moved aside to <arm label>.failed-<UTC time> and the queue stops with exit 3,
# since a usage limit fails every later run too. Rerunning the same command
# resumes. A file named PAUSE in <out-root> stops the queue before its next run.
set -uo pipefail

if [ "$#" -lt 3 ]; then
  sed -n '2,11p' "$0"
  exit 2
fi
arm=$1
out_root=$2
shift 2
repo=$(cd "$(dirname "$0")/../../.." && pwd)
claude_runner="$repo/evaluation/instruction-optimization/runner/run-claude.mjs"
work_dir="$out_root/work"
mkdir -p -m 700 "$out_root" "$work_dir"

case "$arm" in
  bare-claude) label=bare-claude ;;
  bare-gpt) label=bare-gpt ;;
  askrigor:*)
    commit=$(git -C "$repo" rev-parse --verify "${arm#askrigor:}^{commit}") || exit 2
    label="askrigor-${commit:0:8}"
    ;;
  *) echo "unknown arm: $arm" >&2; exit 2 ;;
esac

validity="$repo/evaluation/pti/run-validity.mjs"
for case_file in "$@"; do
  case_id=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).id)' "$case_file")
  run_dir="$out_root/$case_id/$label"
  mkdir -p "$out_root/$case_id"
  if [ ! -f "$run_dir/metrics.json" ]; then
    if [ -e "$out_root/PAUSE" ]; then
      echo "[$(date -u +%H:%M:%S)] $label: paused before $case_id ($out_root/PAUSE exists)"
      exit 4
    fi
    echo "[$(date -u +%H:%M:%S)] $label: running $case_id"
    case "$arm" in
      bare-claude)
        node "$claude_runner" --bare --turns-file "$case_file" --model claude-opus-5-5 --effort max --web-search \
          --work-dir "$work_dir" --out "$run_dir" --timeout-minutes 180 > "$run_dir.log" 2>&1 ;;
      bare-gpt)
        node "$repo/evaluation/pti/runner/run-codex.mjs" --turns-file "$case_file" --out "$run_dir" --web-search \
          --timeout-minutes 60 > "$run_dir.log" 2>&1 ;;
      askrigor:*)
        node "$claude_runner" --ref "$commit" --turns-file "$case_file" --model claude-opus-5-5 --effort max \
          --web-search --work-dir "$work_dir" --out "$run_dir" --timeout-minutes 180 > "$run_dir.log" 2>&1 ;;
    esac
    echo "[$(date -u +%H:%M:%S)] $label: $case_id run exit $?"
  fi
  [ -f "$run_dir/metrics.json" ] || continue
  if ! failure=$(node "$validity" "$run_dir"); then
    aside="$run_dir.failed-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$run_dir" "$aside"
    [ -f "$run_dir.log" ] && mv "$run_dir.log" "$aside.log"
    echo "[$(date -u +%H:%M:%S)] $label: $case_id failed ($failure); moved to $aside; queue stopped"
    exit 3
  fi
  for judge in claude codex; do
    if [ ! -f "$run_dir/judge-$judge/verdict.json" ]; then
      node "$repo/evaluation/pti/judge/judge-pti.mjs" --case "$case_file" --run "$run_dir" --judge "$judge" \
        --out "$run_dir/judge-$judge" > "$run_dir/judge-$judge.log" 2>&1
      echo "[$(date -u +%H:%M:%S)] $label: $case_id judge $judge exit $?"
    fi
  done
done
