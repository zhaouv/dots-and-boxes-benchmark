from harbor.agents.installed.claude_code import ClaudeCode
from harbor.environments.base import BaseEnvironment


class ClaudeCodeSkipInstall(ClaudeCode):
    """Claude Code agent variant for task images that already include Claude Code."""

    async def install(self, environment: BaseEnvironment) -> None:
        pass
