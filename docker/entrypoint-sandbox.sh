#!/usr/bin/env bash
set -euo pipefail

# /src: read-only project mount, /out: writable output (dns log, npm log)
rm -rf /work/*
cp -a /src/. /work/
cd /work

: "${NPM_CI_FLAGS:=}"

DNS_LOG="${DNS_LOG:-/out/dns.log}"
NPM_LOG="${NPM_LOG:-/out/npm.log}"

touch "$DNS_LOG" "$NPM_LOG" 2>/dev/null || true

tcpdump -i any -n -l -tttt 'udp port 53' >>"$DNS_LOG" 2>/dev/null &
TPID=$!

cleanup() {
  kill "$TPID" 2>/dev/null || true
  wait "$TPID" 2>/dev/null || true
}
trap cleanup EXIT

set +e
npm ci $NPM_CI_FLAGS >"$NPM_LOG" 2>&1
NPM_EXIT=$?
set -e

cleanup
trap - EXIT

echo "$NPM_EXIT" >/out/npm-exit.code
exit "$NPM_EXIT"
