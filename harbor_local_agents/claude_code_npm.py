from harbor.agents.installed.claude_code import ClaudeCode
from harbor.environments.base import BaseEnvironment


class ClaudeCodeNpm(ClaudeCode):
    """Claude Code agent that prefers npm install when npm is available."""

    async def install(self, environment: BaseEnvironment) -> None:
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apk &> /dev/null; then"
                "  apk add --no-cache curl bash nodejs npm;"
                " elif command -v apt-get &> /dev/null; then"
                "  apt-get update && apt-get install -y curl;"
                " elif command -v yum &> /dev/null; then"
                "  yum install -y curl;"
                " else"
                '  echo "Warning: No known package manager found, assuming curl is available" >&2;'
                " fi"
            ),
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        package_name = "@anthropic-ai/claude-code"
        if self._version:
            package_name += f"@{self._version}"
        version_flag = f" {self._version}" if self._version else ""

        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                'export PATH="$HOME/.local/bin:$PATH"; '
                'export NPM_CONFIG_PREFIX="$HOME/.local"; '
                "if command -v npm &> /dev/null; then "
                f"  npm install -g {package_name};"
                " else "
                f"  curl -fsSL https://claude.ai/install.sh | bash -s --{version_flag};"
                " fi && "
                "echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.bashrc && "
                "claude --version"
            ),
        )

