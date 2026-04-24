#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-/app}"

if [ ! -d "${WORKDIR}/.git" ]; then
    echo "missing git repo: ${WORKDIR}" >&2
    exit 1
fi

cd "${WORKDIR}"

PROTECTED_FILES=(
    "aivsai.js"
    "game.js"
    "gamedata.js"
    "player.js"
)

modified=()

for file in "${PROTECTED_FILES[@]}"; do
    if [ ! -f "${file}" ]; then
        modified+=("${file} (missing)")
        continue
    fi

    if ! git diff --quiet HEAD -- "${file}"; then
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
