from harbor.agents.installed.codex import Codex
from harbor.environments.base import BaseEnvironment


class CodexSkipInstall(Codex):
    """Codex agent variant for task images that already include Codex CLI."""

    async def install(self, environment: BaseEnvironment) -> None:
        pass
