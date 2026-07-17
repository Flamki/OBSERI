#!/bin/sh
set -eu

if [ -z "${OBSERI_SUPERTONIC_API_KEY:-}" ]; then
  echo "OBSERI_SUPERTONIC_API_KEY must be set" >&2
  exit 1
fi

supertonic serve --host 127.0.0.1 --port 7789 &
engine_pid=$!
trap 'kill "$engine_pid" 2>/dev/null || true' EXIT INT TERM

# The proxy owns the public port and enforces bearer authentication. The
# official Supertonic server remains loopback-only as its maintainers advise.
exec uvicorn auth_proxy:app --host 0.0.0.0 --port "${PORT:-7788}" --no-access-log
