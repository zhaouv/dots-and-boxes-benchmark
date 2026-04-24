#!/usr/bin/env bash
set -euo pipefail

cp "$(dirname "$0")/rolloutAI.solution.js" /app/rolloutAI.js

cat > /app/REPORT.md <<'EOF'
# REPORT

- Solution source: `solution/rolloutAI.solution.js`
- Notes: Oracle baseline copies the hidden rollout strategy into `rolloutAI.js`.
EOF
