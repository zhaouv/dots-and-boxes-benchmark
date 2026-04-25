#!/usr/bin/env bash
set -euo pipefail

cp "$(dirname "$0")/rolloutAI.solution.js" /app/rolloutAI.js

cat > /app/REPORT.md <<'EOF'
# REPORT

- Solution source: `solution/rolloutAI.solution.js`
- Notes: Highgate oracle uses a higher rollout budget to target the stricter visible gates.
EOF
