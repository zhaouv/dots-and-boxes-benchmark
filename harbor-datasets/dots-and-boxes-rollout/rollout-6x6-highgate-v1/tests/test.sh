#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKDIR="${WORKDIR:-/app}"
LOG_DIR="${LOG_DIR:-/logs}"
VERIFIER_DIR="${LOG_DIR}/verifier"
ARTIFACT_DIR="${LOG_DIR}/artifacts"
TMP_DIR="$(mktemp -d)"

mkdir -p "${VERIFIER_DIR}" "${ARTIFACT_DIR}"

cleanup() {
    rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

ok_win_rate="0"
ok_wins="0"
ok_losses="0"
ok_total_games="0"
ok_runtime_sec=""

gr_win_rate="0"
gr_wins="0"
gr_losses="0"
gr_total_games="0"

br_win_rate="0"
br_wins="0"
br_losses="0"
br_total_games="0"
br_runtime_sec=""

passed_visible_gate="0"
hidden_assets_present="0"
hidden_eval_ran="0"
primary_score="0"
failure_reason=""

copy_artifacts() {
    cp "${WORKDIR}/rolloutAI.js" "${ARTIFACT_DIR}/rolloutAI.js"

    if [ -f "${WORKDIR}/REPORT.md" ]; then
        cp "${WORKDIR}/REPORT.md" "${ARTIFACT_DIR}/REPORT.md"
    fi

    git -C "${WORKDIR}" diff --binary > "${ARTIFACT_DIR}/git.diff" 2>/dev/null || true

    if [ -f "${TMP_DIR}/visible_eval.txt" ]; then
        cp "${TMP_DIR}/visible_eval.txt" "${ARTIFACT_DIR}/visible_eval.txt"
    fi

    if [ -f "${TMP_DIR}/hidden_eval.txt" ]; then
        cp "${TMP_DIR}/hidden_eval.txt" "${ARTIFACT_DIR}/hidden_eval.txt"
    fi
}

write_summary_json() {
    SUMMARY_PATH="$1" node <<'EOF'
const fs = require('fs')

const summaryPath = process.env.SUMMARY_PATH

const summary = {
  primary_score: Number(process.env.PRIMARY_SCORE || 0),
  passed_visible_gate: Number(process.env.PASSED_VISIBLE_GATE || 0),
  hidden_assets_present: Number(process.env.HIDDEN_ASSETS_PRESENT || 0),
  hidden_eval_ran: Number(process.env.HIDDEN_EVAL_RAN || 0),
  ok_winrate: Number(process.env.OK_WIN_RATE || 0),
  ok_wins: Number(process.env.OK_WINS || 0),
  ok_losses: Number(process.env.OK_LOSSES || 0),
  ok_total_games: Number(process.env.OK_TOTAL_GAMES || 0),
  ok_runtime_sec: process.env.OK_RUNTIME_SEC === '' ? null : Number(process.env.OK_RUNTIME_SEC),
  gr_winrate: Number(process.env.GR_WIN_RATE || 0),
  gr_wins: Number(process.env.GR_WINS || 0),
  gr_losses: Number(process.env.GR_LOSSES || 0),
  gr_total_games: Number(process.env.GR_TOTAL_GAMES || 0),
  br_winrate: Number(process.env.BR_WIN_RATE || 0),
  br_wins: Number(process.env.BR_WINS || 0),
  br_losses: Number(process.env.BR_LOSSES || 0),
  br_total_games: Number(process.env.BR_TOTAL_GAMES || 0),
  br_runtime_sec: process.env.BR_RUNTIME_SEC === '' ? null : Number(process.env.BR_RUNTIME_SEC),
  failure_reason: process.env.FAILURE_REASON || null,
}

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
EOF
}

read_metric() {
    local file="$1"
    local key="$2"
    node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))[process.argv[2]]" "${file}" "${key}"
}

run_eval() {
    local run_dir="$1"
    local runner="$2"
    local opponent="$3"
    local seed="$4"
    local prefix="$5"
    local replay_file="${TMP_DIR}/${prefix}.json"
    local stdout_file="${TMP_DIR}/${prefix}.stdout"
    local time_file="${TMP_DIR}/${prefix}.time"
    local metrics_file="${TMP_DIR}/${prefix}.metrics.json"

    (
        cd "${run_dir}"
        /usr/bin/time -f '%e' -o "${time_file}" \
            node "${runner}" -1 ro -2 "${opponent}" -n 50 -s --seed "${seed}" -o "${replay_file}" \
            > "${stdout_file}" 2>&1
    )

    node "${TEST_DIR}/parse_results.js" "${replay_file}" ro > "${metrics_file}"

    printf '=== %s stdout ===\n' "${prefix}" >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
    cat "${stdout_file}" >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
    printf '\n=== %s metrics ===\n' "${prefix}" >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
    cat "${metrics_file}" >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
    printf '\n=== %s runtime_sec ===\n' "${prefix}" >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
    cat "${time_file}" >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
    printf '\n\n' >> "${TMP_DIR}/$([ "${prefix#hidden_}" != "${prefix}" ] && echo hidden_eval.txt || echo visible_eval.txt)"
}

if ! "${TEST_DIR}/verify_integrity.sh" "${WORKDIR}" > "${TMP_DIR}/integrity.stdout" 2> "${TMP_DIR}/integrity.stderr"; then
    failure_reason="integrity_check_failed"
else
    if ! (
        cd "${WORKDIR}"
        node -e "require('vm').runInThisContext(require('fs').readFileSync('player.js','utf8')); require('vm').runInThisContext(require('fs').readFileSync('rolloutAI.js','utf8')); if (typeof RolloutAI !== 'function' || typeof RolloutAI.prototype.where !== 'function') process.exit(1)"
    ) > "${TMP_DIR}/impl_check.stdout" 2> "${TMP_DIR}/impl_check.stderr"; then
        failure_reason="rollout_ai_not_implemented"
    fi
fi

if [ -z "${failure_reason}" ]; then
    if ! run_eval "${WORKDIR}" "aivsai.js" "ok" "gate-ok-v1" "visible_ok"; then
        failure_reason="visible_ok_eval_failed"
    else
        ok_win_rate="$(read_metric "${TMP_DIR}/visible_ok.metrics.json" "win_rate")"
        ok_wins="$(read_metric "${TMP_DIR}/visible_ok.metrics.json" "wins")"
        ok_losses="$(read_metric "${TMP_DIR}/visible_ok.metrics.json" "losses")"
        ok_total_games="$(read_metric "${TMP_DIR}/visible_ok.metrics.json" "total_games")"
        ok_runtime_sec="$(cat "${TMP_DIR}/visible_ok.time")"
    fi
fi

if [ -z "${failure_reason}" ]; then
    if ! run_eval "${WORKDIR}" "aivsai.js" "gr" "gate-gr-v1" "visible_gr"; then
        failure_reason="visible_gr_eval_failed"
    else
        gr_win_rate="$(read_metric "${TMP_DIR}/visible_gr.metrics.json" "win_rate")"
        gr_wins="$(read_metric "${TMP_DIR}/visible_gr.metrics.json" "wins")"
        gr_losses="$(read_metric "${TMP_DIR}/visible_gr.metrics.json" "losses")"
        gr_total_games="$(read_metric "${TMP_DIR}/visible_gr.metrics.json" "total_games")"
    fi
fi

if [ -z "${failure_reason}" ]; then
    if node -e "const ok = Number(process.argv[1]); const gr = Number(process.argv[2]); const runtime = Number(process.argv[3]); process.exit(ok >= 0.95 && gr >= 1.00 && runtime <= 180 ? 0 : 1)" "${ok_win_rate}" "${gr_win_rate}" "${ok_runtime_sec}"; then
        passed_visible_gate="1"
    else
        failure_reason="visible_gate_failed"
    fi
fi

if [ -n "${HIDDEN_ROLLOUT_BENCH_B64:-}" ] && [ -n "${HIDDEN_AIVSAI_BENCH_B64:-}" ]; then
    hidden_assets_present="1"
fi

if [ "${passed_visible_gate}" = "1" ] && [ "${hidden_assets_present}" = "1" ]; then
    hidden_dir="${TMP_DIR}/hidden-run"
    mkdir -p "${hidden_dir}"
    cp -a "${WORKDIR}/." "${hidden_dir}/"
    printf '%s' "${HIDDEN_ROLLOUT_BENCH_B64}" | base64 -d > "${hidden_dir}/rolloutAI.bench.js"
    printf '%s' "${HIDDEN_AIVSAI_BENCH_B64}" | base64 -d > "${hidden_dir}/aivsai.bench.js"

    if ! run_eval "${hidden_dir}" "aivsai.bench.js" "br" "score-br-v1" "hidden_br"; then
        failure_reason="hidden_eval_failed"
    else
        hidden_eval_ran="1"
        br_win_rate="$(read_metric "${TMP_DIR}/hidden_br.metrics.json" "win_rate")"
        br_wins="$(read_metric "${TMP_DIR}/hidden_br.metrics.json" "wins")"
        br_losses="$(read_metric "${TMP_DIR}/hidden_br.metrics.json" "losses")"
        br_total_games="$(read_metric "${TMP_DIR}/hidden_br.metrics.json" "total_games")"
        br_runtime_sec="$(cat "${TMP_DIR}/hidden_br.time")"
        primary_score="${br_win_rate}"
    fi
fi

if [ "${passed_visible_gate}" = "1" ] && [ "${hidden_assets_present}" = "0" ] && [ -z "${failure_reason}" ]; then
    failure_reason="hidden_assets_missing"
fi

copy_artifacts

cp "${TMP_DIR}/integrity.stdout" "${ARTIFACT_DIR}/integrity.stdout" 2>/dev/null || true
cp "${TMP_DIR}/integrity.stderr" "${ARTIFACT_DIR}/integrity.stderr" 2>/dev/null || true
cp "${TMP_DIR}/impl_check.stdout" "${ARTIFACT_DIR}/impl_check.stdout" 2>/dev/null || true
cp "${TMP_DIR}/impl_check.stderr" "${ARTIFACT_DIR}/impl_check.stderr" 2>/dev/null || true

export PRIMARY_SCORE="${primary_score}"
export PASSED_VISIBLE_GATE="${passed_visible_gate}"
export HIDDEN_ASSETS_PRESENT="${hidden_assets_present}"
export HIDDEN_EVAL_RAN="${hidden_eval_ran}"
export OK_WIN_RATE="${ok_win_rate}"
export OK_WINS="${ok_wins}"
export OK_LOSSES="${ok_losses}"
export OK_TOTAL_GAMES="${ok_total_games}"
export OK_RUNTIME_SEC="${ok_runtime_sec}"
export GR_WIN_RATE="${gr_win_rate}"
export GR_WINS="${gr_wins}"
export GR_LOSSES="${gr_losses}"
export GR_TOTAL_GAMES="${gr_total_games}"
export BR_WIN_RATE="${br_win_rate}"
export BR_WINS="${br_wins}"
export BR_LOSSES="${br_losses}"
export BR_TOTAL_GAMES="${br_total_games}"
export BR_RUNTIME_SEC="${br_runtime_sec}"
export FAILURE_REASON="${failure_reason}"

printf '%s\n' "${primary_score}" > "${VERIFIER_DIR}/reward.txt"
write_summary_json "${VERIFIER_DIR}/reward.json"
cp "${VERIFIER_DIR}/reward.json" "${ARTIFACT_DIR}/summary.json"

cat "${VERIFIER_DIR}/reward.json"
