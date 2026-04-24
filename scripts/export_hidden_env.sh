#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

rollout_b64="$(base64 < "${ROOT_DIR}/game/rolloutAI.bench.js" | tr -d '\n')"
aivsai_b64="$(base64 < "${ROOT_DIR}/game/aivsai.bench.js" | tr -d '\n')"

printf 'export HIDDEN_ROLLOUT_BENCH_B64=%q\n' "${rollout_b64}"
printf 'export HIDDEN_AIVSAI_BENCH_B64=%q\n' "${aivsai_b64}"
