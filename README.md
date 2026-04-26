# dots-and-boxes-benchmark

基于点格棋游戏代码构建 Harbor benchmark，用来评估 agent 在受限上下文下实现 `RolloutAI` 的能力。

## 仓库结构

- `game/`：原始游戏代码、公开 runner 和 bench 参考资产
- `BENCHMARK_DESIGN.md`：benchmark 设计草案
- `plan.md`：当前落地计划
- `harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1/`：第一版 Harbor task 骨架
- `harbor-datasets/dots-and-boxes-rollout/rollout-6x6-highgate-v1/`：公开高门槛 Harbor task 变体
- `scripts/export_hidden_env.sh`：把隐藏 bench 文件编码成 verifier 环境变量

## 当前 Harbor tasks

任务路径：

- `harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1`
  - 公开门槛：`ro vs ok` >= 70%，`ro vs gr` >= 90%，OK 对战 <= 60 秒
- `harbor-datasets/dots-and-boxes-rollout/rollout-6x6-highgate-v1`
  - 公开门槛：`ro vs ok` >= 95%，`ro vs gr` = 100%，OK 对战 <= 180 秒

这些 task 当前包含：

- 可见工作区 fixture
- `environment/` 下的 Docker build-context 副本
- Docker 环境与 git 初始化脚本
- `agent` / `verifier` 显式以 `root` 运行，避免 Harbor mounted logs 的写权限问题
- 镜像将 `/app` 注册为 Git `safe.directory`，避免 root 运行 agent 时被仓库 owner 检查拦截
- 当前 task 允许容器联网，便于 Harbor 内置 `codex` agent 在环境内完成依赖安装与 API 调用
- 公开门槛 verifier
- 基于环境变量注入的隐藏评分接口
- oracle solution 占位
- 受保护文件通过镜像里的只读基线副本做字节级完整性校验，不依赖运行时 `git HEAD`

## 隐藏评分资产注入

为了避免把 `*.bench.js` 暴露到 agent 可见工作区，task 不直接保存隐藏 bench 文件，而是通过 `verifier.env` 从外部环境读取：

- `HIDDEN_ROLLOUT_BENCH_B64`
- `HIDDEN_AIVSAI_BENCH_B64`

本仓库提供一个作者侧辅助脚本：

```bash
eval "$(./scripts/export_hidden_env.sh)"
```

执行后可把当前仓库里的隐藏 bench 文件编码为对应环境变量，供本地 Harbor 运行时注入 verifier。

## 使用说明

这个仓库当前更适合按“先验证 task，再跑真实 agent”的顺序使用。

### 0. 前置条件

你至少需要：

- 本机可用的 Docker
- Harbor CLI
- 本机已经能正常使用 Codex CLI

其中 Codex 认证有两种常见模式：

- 模式 A：使用 `OPENAI_API_KEY`
- 模式 B：复用本机 `~/.codex/auth.json`

这两种模式二选一即可，不一定都要配。

Harbor 官方推荐安装方式：

```bash
uv tool install harbor
harbor --help

uv tool upgrade harbor
harbor --version
```

### 1. 导出隐藏评测变量

先在仓库根目录执行：

```bash
eval "$(./scripts/export_hidden_env.sh)"
```

这一步会把隐藏评测用到的 `*.bench.js` 编码后放进环境变量，供 verifier 读取。

### 2. 可选：先手动进环境调试

如果你第一次接触 Harbor，建议先把 task 环境拉起来看看：

```bash
harbor task start-env -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 -e docker -a -i
```

借助代理先手动build出镜像:
```bash
PROXY="http://172.25.128.1:1080" 
docker buildx build --progress=plain --load \
    --build-arg HTTP_PROXY="$PROXY" \
    --build-arg HTTPS_PROXY="$PROXY" \
    --build-arg http_proxy="$PROXY" \
    --build-arg https_proxy="$PROXY" \
    --build-arg NO_PROXY="localhost,127.0.0.1" \
    --build-arg no_proxy="localhost,127.0.0.1" \
    -t dots-and-boxes-rollout:proxy-build-6x6-v1 \
    harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1/environment
```

进入容器后，可以手动检查：

```bash
pwd
ls
node aivsai.js -1 ok -2 gr -n 1 -s --seed smoke
exit
```

### 3. 先跑 Oracle，确认 task 本身没问题

先跑一次 `oracle`，验证这个 Harbor task 能跑通：

```bash
harbor run -y -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 -a oracle
```

如果这一步失败，先不要上真实 agent，优先检查环境、Docker 构建和 verifier。

这里的 `-y` 用来跳过 Harbor 对“将从宿主机环境变量读取隐藏评测变量”的交互确认。

### 4. 跑 Codex + GPT-5.4

#### 方案 A：使用 `OPENAI_API_KEY`

确认本机已经有 `OPENAI_API_KEY` 后，再跑真实 agent：

```bash
export OPENAI_API_KEY=你的_key

harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae OPENAI_API_KEY="$OPENAI_API_KEY"
```

这里：

- `-p` 指向本地 task 路径
- `-a codex` 选择 Harbor 的内置 Codex agent
- `-m gpt-5.4` 选择模型
- `--ae` 把 API key 传给 agent 运行时

#### 方案 B：复用本机 `~/.codex/auth.json`

如果你本机的 Codex CLI 已经通过 `~/.codex/auth.json` 登录，可以不传 `OPENAI_API_KEY`，改为显式告诉 Harbor 复用这个登录态：

```bash
harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae CODEX_FORCE_AUTH_JSON=1
```

如果你不想依赖默认路径，也可以显式指定：

```bash
harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae CODEX_AUTH_JSON_PATH="$HOME/.codex/auth.json"
```

注意：

- Harbor 的 `codex` agent 默认**不是**自动读取你宿主机的 `~/.codex/auth.json`
- 不加 `CODEX_FORCE_AUTH_JSON=1` 或 `CODEX_AUTH_JSON_PATH=...` 时，它默认走 `OPENAI_API_KEY`
- Harbor 会在任务环境里创建新的 `CODEX_HOME`，不会自动复制你宿主机的 `~/.codex/config.toml`

#### 关于 `OPENAI_BASE_URL`

如果你走的是 OpenAI 官方默认端点，一般不需要设置 `OPENAI_BASE_URL`。

只有在下面这种情况才需要显式传：

- 你本机 Codex CLI 依赖自定义网关 / 代理 / OpenAI-compatible endpoint
- 且这个 base URL 只写在你宿主机的 `~/.codex/config.toml` 里

因为 Harbor 不会自动把宿主机的 `~/.codex/config.toml` 复制进任务环境，所以这种情况下你需要额外传：

```bash
--ae OPENAI_BASE_URL=你的_base_url
```

### 5. 关于 `xhigh`

`gpt-5.4` 官方支持 `xhigh` reasoning effort。这个仓库当前**没有**在 task 里强制写死推理档位，但可以直接通过 Harbor 的 agent kwarg 传给内置 `codex` agent。

如果你想测 `codex + gpt-5.4 + xhigh`，建议直接这样跑：

```bash
harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae OPENAI_API_KEY="$OPENAI_API_KEY" \
  --ak reasoning_effort=xhigh
```

如果你习惯放在 Codex CLI 自己的配置里，也可以继续用 `~/.codex/config.toml`，但对 Harbor 来说最直接的是 `--ak reasoning_effort=xhigh`。

### 6. Claude Code 安装 403 的本地绕过

如果你在这个 task 里跑 Harbor 内置 `claude-code`，并且 setup 阶段卡在：

```text
curl -fsSL https://claude.ai/install.sh | bash -s --
curl: (22) The requested URL returned error: 403
```

可以改用这个仓库自带的本地 agent 变体。它保留原有 `claude-code` 行为，但把安装步骤改成：

- 只要环境里有 `npm`，优先走 `npm install -g @anthropic-ai/claude-code`
- 并把 npm 全局前缀设到 `~/.local`，避免非 root 用户在 Debian 镜像里 `npm -g` 写权限失败
- 只有在没有 `npm` 时，才退回 `curl https://claude.ai/install.sh`

运行方式：

```bash
PYTHONPATH="$PWD" harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  --agent-import-path harbor_local_agents.claude_code_npm:ClaudeCodeNpm \
  -m 你的_claude_模型名 \
  --ae ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --ae ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
  --ak reasoning_effort=high
```

注意：

- 这里不要再同时传 `-a claude-code`，否则 Harbor 会优先用内置 agent，忽略 `--agent-import-path`
- 如果你还需要代理，继续额外传 `--ae HTTPS_PROXY=...` / `--ae HTTP_PROXY=...`
- 代理地址不要写容器内的 `127.0.0.1`，要写容器能访问到的宿主机地址

```bash
export ANTHROPIC_API_KEY="xx"
export ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
export HTTPS_PROXY=http://172.25.128.1:1080
export HTTP_PROXY=http://172.25.128.1:1080
export NO_PROXY=127.0.0.1,localhost

PYTHONPATH="$PWD" harbor run \
    -y \
    -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-highgate-v1 \
    --agent-import-path harbor_local_agents.claude_code_npm:ClaudeCodeNpm \
    -m "deepseek-v4-pro" \
    --ae HTTPS_PROXY="$HTTPS_PROXY" \
    --ae HTTP_PROXY="$HTTP_PROXY" \
    --ae NO_PROXY="$NO_PROXY" \
    --ae ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    --ae ANTHROPIC_BASE_URL="$ANTHROPIC_BASE_URL" \
    --ak reasoning_effort=high
```

### 7. 看结果

Harbor 会把 job 结果写到本地 `jobs/` 目录。这个 task 的 verifier 会额外产出：

- `reward.txt`
- `reward.json`
- `rolloutAI.js`
- `REPORT.md`（如果 agent 写了）
- `git.diff`
- `visible_eval.txt`
- `hidden_eval.txt`

可以直接开 Harbor viewer：

```bash
harbor view jobs
```

然后在浏览器里看：

- reward
- agent 轨迹
- verifier 输出
- artifacts

### 7. 最推荐的第一次运行顺序

如果你是 Harbor 小白，建议严格按这个顺序：

```bash
cd /home/zhaouv/e/git/github/dots-and-boxes-benchmark
export OPENAI_API_KEY=你的_key
eval "$(./scripts/export_hidden_env.sh)"

harbor task start-env -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 -e docker -a -i
harbor run -y -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 -a oracle

harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae OPENAI_API_KEY="$OPENAI_API_KEY"
```

如果你已经用 Codex CLI 登录过，也可以把最后一条换成：

```bash
harbor run \
  -y \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae CODEX_FORCE_AUTH_JSON=1
```

任务路径是：

`harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1`

### 8. 当前 task 的一个实现细节

Harbor 的 Docker 环境构建时，build context 是 `environment/` 目录，不是整个 task 根目录。

因此这个仓库里有两份“可见工作区”文件：

- `fixtures/workspace/`：逻辑上的可见 fixture
- `environment/workspace/`：给 Docker build 使用的上下文副本

如果你后续更新可见工作区文件，必须同步这两处，保持文档和代码一致。

## Sample Run

下面是一条在 `2026-04-24` 本地实际跑通的命令，用的是 Harbor 内置 `codex` agent、`gpt-5.4`、`xhigh`，并通过自定义 `OPENAI_BASE_URL` 走网关：

```bash
eval "$(./scripts/export_hidden_env.sh)"
harbor run \
  -p harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1 \
  -a codex \
  -m gpt-5.4 \
  --ae OPENAI_API_KEY="$OPENAI_API_KEY" \
  --ae OPENAI_BASE_URL="$OPENAI_BASE_URL" \
  --ak reasoning_effort=xhigh
```

Harbor 顶层输出如下：

```text
1/1 Mean: 0.650

adhoc • codex
Trials: 1
Exceptions: 0
Reward: 0.65

Job Info
Total runtime: 13m 18s
Results written to jobs/2026-04-24__17-02-18/result.json
```

这次运行的关键指标：

- 最终隐藏分 `0.65`
- `ro vs ok` 胜率 `0.87`
- `ro vs gr` 胜率 `0.99`
- `ro vs br` 胜率 `0.65`
- token 用量：`input=1260233`、`cache=1223552`、`output=22688`

时间消耗：

- Harbor 总耗时：`13m 18s`
- 环境启动：约 `4.29s`
- agent 安装/setup：约 `1m45s`
- agent 执行：约 `9m45s`
- verifier：约 `1m26s`
- `ro vs ok` 评测时间：`21.21s`
- `ro vs gr` 评测时间：`21.10s`
- `ro vs br` 评测时间：`40.50s`

这次样例里，公开门槛和隐藏评测都成功完成，`failure_reason = null`，可以作为一个完整跑通的参考基线。

另外，这个 task 当前显式把 Harbor 的 `agent.user` 和 `verifier.user` 设成了 `root`。
原因不是为了放宽 benchmark 约束，而是为了避免 Docker bind mount 的 `/logs/agent`、`/logs/verifier` 在部分主机上出现写权限问题。

## 文档约束

- 更新完代码后保持文档和代码一致。
- 如果 task 结构、评分逻辑或隐藏资产注入方式发生变化，需要同步更新相关文档。
