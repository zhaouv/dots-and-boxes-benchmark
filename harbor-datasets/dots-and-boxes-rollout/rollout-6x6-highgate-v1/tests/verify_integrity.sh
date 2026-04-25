#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-/app}"
BASELINE_DIR="${2:-${BASELINE_DIR:-/opt/dots-and-boxes-visible}}"

if [ ! -d "${WORKDIR}" ]; then
    echo "missing workspace: ${WORKDIR}" >&2
    exit 1
fi

if [ ! -d "${BASELINE_DIR}" ]; then
    echo "missing baseline workspace: ${BASELINE_DIR}" >&2
    exit 1
fi

PROTECTED_FILES=(
    "aivsai.js"
    "game.js"
    "gamedata.js"
    "player.js"
)

modified=()

for file in "${PROTECTED_FILES[@]}"; do
    if [ ! -f "${WORKDIR}/${file}" ]; then
        modified+=("${file} (missing)")
        continue
    fi

    if [ ! -f "${BASELINE_DIR}/${file}" ]; then
        modified+=("${file} (missing baseline)")
        continue
    fi

    if ! cmp -s "${WORKDIR}/${file}" "${BASELINE_DIR}/${file}"; then
        modified+=("${file}")
    fi
done

while IFS= read -r bench_file; do
    modified+=("${bench_file} (unexpected bench file in workspace)")
done < <(find "${WORKDIR}" -maxdepth 1 -type f -name '*.bench.js' -print | sed "s#^${WORKDIR}/##")

if [ "${#modified[@]}" -gt 0 ]; then
    printf 'protected workspace violation:\n' >&2
    printf '  %s\n' "${modified[@]}" >&2
    exit 1
fi
