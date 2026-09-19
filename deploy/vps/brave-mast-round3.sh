#!/bin/sh
set -eu
umask 077

exec /usr/bin/brave-browser \
  --user-data-dir=/home/cloudbrowser/.config/brave-mast-round3 \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9224 \
  --restore-last-session \
  --disable-session-crashed-bubble \
  --no-first-run \
  --no-default-browser-check \
  --disable-background-mode \
  --disable-features=TranslateUI \
  --password-store=basic
