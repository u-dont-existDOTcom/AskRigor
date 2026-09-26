#!/bin/sh
set -eu

failures=0
while :; do
  if /usr/bin/curl --fail --silent --show-error --max-time 3 \
      http://127.0.0.1:9224/json/version >/dev/null; then
    failures=0
  else
    failures=$((failures + 1))
    if [ "$failures" -ge 3 ]; then
      /usr/bin/systemctl kill --signal=KILL --kill-whom=main askrigor-mast-round3-brave.service || true
      failures=0
    fi
  fi
  /usr/bin/sleep 10
done
