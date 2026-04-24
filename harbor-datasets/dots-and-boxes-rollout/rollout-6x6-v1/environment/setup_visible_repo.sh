#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:?missing source dir}"
TARGET_DIR="${2:?missing target dir}"
OWNER_NAME="${3:-}"

mkdir -p "${TARGET_DIR}"
cp -a "${SOURCE_DIR}/." "${TARGET_DIR}/"

cd "${TARGET_DIR}"

git init -q -b main
git config user.email benchmark@local
git config user.name benchmark

git add .
GIT_AUTHOR_DATE="1970-01-01T00:00:00Z" \
GIT_COMMITTER_DATE="1970-01-01T00:00:00Z" \
git commit -q -m init

if [ -n "${OWNER_NAME}" ]; then
    chown -R "${OWNER_NAME}:${OWNER_NAME}" "${TARGET_DIR}"
fi
