#!/usr/bin/env bash
# Runs several PTI arms case by case, so a stopped queue leaves paired results
# (every arm on the same cases) rather than one arm on every case.
#
#   evaluation/pti/runner/run-interleaved.sh <out-root> "<arm> <arm> ..." <case.json>...
#
# Each (arm, case) goes through run-arm.sh, which skips finished runs and
# verdicts. The queue stops when run-arm.sh does: a failed run (exit 3) or a
# PAUSE file in <out-root> (exit 4).
set -uo pipefail

if [ "$#" -lt 3 ]; then
  sed -n '2,10p' "$0"
  exit 2
fi
out_root=$1
arms=$2
shift 2
here=$(cd "$(dirname "$0")" && pwd)
for case_file in "$@"; do
  for arm in $arms; do
    "$here/run-arm.sh" "$arm" "$out_root" "$case_file"
    status=$?
    if [ "$status" -ne 0 ]; then
      echo "[$(date -u +%H:%M:%S)] queue stopped at $arm on $case_file (exit $status)"
      exit "$status"
    fi
  done
done
echo "[$(date -u +%H:%M:%S)] queue finished"
