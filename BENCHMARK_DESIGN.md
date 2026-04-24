# Dots and Boxes RolloutAI Benchmark 设计草案

## 1. 目标

这个 benchmark 的目标不是测“会不会写 JS”，而是测 agent 在**受限可见信息**下，能否：

1. 理解已有游戏代码和 AI 基线。
2. 在不给参考实现的情况下实现 `RolloutAI`。
3. 自主运行对战、调参、迭代。
4. 在**胜率**和**运行时间**之间做权衡。
5. 最终在隐藏对手 `br` 面前取得尽量高的胜率。

你的当前仓库里已经具备这个 benchmark 的核心资产：

- 可见实现入口：`game/rolloutAI.js`
- 可见对战脚本：`game/aivsai.js`
- 隐藏参考实现：`game/rolloutAI.bench.js`
- 隐藏评分脚本：`game/aivsai.bench.js`

因此更合理的做法不是再发明一套题，而是把它包装成一个 Harbor task / dataset。

## 2. 总体思路

建议把 benchmark 分成两层：

- **可见目标（agent 训练/迭代目标）**
  - `ro vs ok` 胜率 >= 70%
  - `ro vs gr` 胜率 >= 90%
  - `time node aivsai.js -1 ro -2 ok -n 50 -s` 总耗时 <= 60s
- **隐藏评分（最终 leaderboard 分）**
  - 在 agent 完成后再注入 `*.bench.js`
  - 执行 `time node aivsai.bench.js -1 ro -2 br -n 50 -s`
  - 以 `ro vs br` 胜率作为主分数

这样设计的好处：

- agent 有明确的、可优化的中间目标。
- 最终分数不直接暴露，能防止只针对公开目标过拟合。
- 可见目标兼顾了“比已有基线更强”和“不能太慢”。

## 3. Harbor 中的映射

按 Harbor 的概念，这个 benchmark 可以建成：

- **一个 dataset**：`dots-and-boxes-rollout`
- **一个或多个 task**：先从单 task 版本做起，再扩展多 task

Harbor 的 task 本质上是：

- `instruction.md`：给 agent 的任务描述
- `task.toml`：资源、超时、元数据
- `environment/`：容器环境
- `tests/test.sh`：最终 verifier

所以这个 benchmark 可以非常自然地落在 Harbor task 格式上。

## 4. 建议的目录结构

建议先做一个最小可运行版本：

```text
harbor-datasets/
  dots-and-boxes-rollout/
    rollout-6x6-v1/
      instruction.md
      task.toml
      environment/
        Dockerfile
        setup_visible_repo.sh
        workspace/
          README.md
          game.js
          gamedata.js
          player.js
          rolloutAI.js
          aivsai.js
      fixtures/
        workspace/
          README.md
          game.js
          gamedata.js
          player.js
          rolloutAI.js
          aivsai.js
      solution/
        solve.sh
        rolloutAI.solution.js
      tests/
        test.sh
        parse_results.js
        verify_integrity.sh
scripts/
  export_hidden_env.sh
```

### 说明

- `fixtures/workspace/` 是从当前 `game/` 目录拷出来的**可见版本**。
- `environment/workspace/` 是同一份可见工作区在 Docker build context 下的副本，因为 Harbor 的 Docker build context 固定为 `environment/`。
- Harbor 运行时，`fixtures/workspace/` 会被铺到 `/app` 根目录，也就是 agent 看到的是 `aivsai.js`、`rolloutAI.js` 这类平铺文件。
- 明确排除：`*.bench.js`。
- `solution/solve.sh` 可选，但建议保留，方便用 oracle agent 验证任务本身可做。
- 隐藏评分资产不直接放进 task 源目录，而是通过 verifier 环境变量注入。

## 5. 工作区初始化流程

进入 task 后，先把 agent 的工作目录准备成一个小 git 仓库。

### 5.1 初始化步骤

建议在环境启动后执行如下逻辑：

1. 将 `fixtures/workspace/*` 复制到 `/app/`。
2. 执行：
   - `git init`
   - `git config user.email benchmark@local`
   - `git config user.name benchmark`
   - `git add .`
   - `git commit -m init`
3. 保留初始 git 提交，供 agent 查看改动；verifier 对受保护文件使用镜像内只读基线副本做完整性校验。

### 5.2 受保护文件

这是这个 benchmark 里必须补的一层，不然 agent 可以通过改 runner 或 game engine“作弊”。

建议默认只允许 agent 修改：

- `rolloutAI.js`
- `REPORT.md`（如果你希望 agent 交总结）
- 你显式允许的 scratch 文件

建议禁止修改：

- `aivsai.js`
- `game.js`
- `gamedata.js`
- `player.js`
- 任何 `*.bench.js`
- verifier 相关脚本

verifier 应对这些受保护文件做基于镜像内只读基线副本的完整性校验；如果被修改，直接记 0 分。

## 6. 给 agent 的指令设计

`instruction.md` 建议写得非常明确，避免 agent 在错误方向上花 token。

### 建议包含的信息

1. 你需要实现 `rolloutAI.js` 中的 `RolloutAI`。
2. 你可以阅读代码、运行对战、修改实现。
3. 你的目标是让：
   - `ro vs ok` 胜率达到 70%+
   - `ro vs gr` 胜率达到 90%+
   - `node aivsai.js -1 ro -2 ok -n 50 -s` 在规定资源下 <= 60s
4. 不允许修改对战脚本、游戏规则和基线 AI。
5. 完成后输出一份简短报告到 `REPORT.md`：
   - 算法思路
   - 关键取舍
   - 你本地跑过的命令和结果

### 不建议暴露的信息

- 不要告诉 agent 还有 `br`。
- 不要告诉 agent 隐藏 bench 文件的名字。
- 不要告诉 agent 最终评分公式的细节，只需要说“还有隐藏评测”。

## 7. 评测流程设计

建议 verifier 分 4 个阶段。

### 阶段 A：完整性校验

- 检查受保护文件是否被改动。
- 检查 agent 是否真的产出了 `rolloutAI.js` 的有效实现。
- 检查 `node aivsai.js ...` 能正常运行。

失败则直接 0 分。

### 阶段 B：可见门槛校验

运行：

```bash
node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-ok-v1
node aivsai.js -1 ro -2 gr -n 50 -s --seed gate-gr-v1
/usr/bin/time -f '%e' node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-perf-v1
```

建议 verifier 解析输出，得到：

- `ok_winrate`
- `gr_winrate`
- `ok_runtime_sec`

通过条件：

- `ok_winrate >= 0.70`
- `gr_winrate >= 0.90`
- `ok_runtime_sec <= 60`

### 阶段 C：隐藏评分

只有通过阶段 B，才进入隐藏评分：

1. verifier 从外部环境变量注入隐藏 bench 文件到临时评测目录。
2. 运行：

```bash
/usr/bin/time -f '%e' node aivsai.bench.js -1 ro -2 br -n 50 -s --seed score-br-v1
```

记录：

- `br_winrate`
- `br_runtime_sec`

主分数建议就是：

```text
primary_score = br_winrate
```

如果可见门槛没过：

```text
primary_score = 0
```

### 阶段 D：产物导出

把这些内容写到 `/logs/artifacts/`：

- `rolloutAI.js`
- `REPORT.md`
- `git diff`
- `visible_eval.txt`
- `hidden_eval.txt`
- `summary.json`

这样 Harbor 会自动收集，后续可以直接在 viewer 里看。

## 8. 评分输出建议

建议同时输出两个文件：

### 8.1 `/logs/verifier/reward.txt`

写主分数，便于 Harbor 直接按一个标量排序：

```text
0.62
```

### 8.2 `/logs/verifier/reward.json`

记录完整指标，例如：

```json
{
  "primary_score": 0.62,
  "passed_visible_gate": 1,
  "ok_winrate": 0.74,
  "gr_winrate": 0.95,
  "ok_runtime_sec": 38.4,
  "br_winrate": 0.62,
  "br_runtime_sec": 44.7
}
```

这样 leaderboards 可以按 `primary_score` 排，分析时又能看完整上下文。

## 9. Token / 总耗时 / 结果报告怎么采集

这块其实不用你自己在 task 里硬算。

更合理的做法是：

- **token 消耗、cost、agent 总耗时**：直接读取 Harbor trial 自带的运行结果和 trajectory 元数据。
- **实现代码与 agent 报告**：通过 `/logs/artifacts/` 导出。
- **胜率与性能数据**：由 verifier 统一写入 `reward.json` 和日志文件。

也就是：

- Harbor 负责“过程指标”
- verifier 负责“任务指标”

这两部分分工会很清楚。

## 10. 关键设计细节

### 10.1 固定 seed，减少偶然性

你描述里的命令没有显式 seed，但 benchmark 最好固定 seed，否则波动会比较大。

建议：

- 可见门槛用固定 seed
- 隐藏评分也用固定但不同的 seed
- 后续如果想更稳，可以升级成多 seed 平均值

例如：

- `gate-ok-v1`
- `gate-gr-v1`
- `gate-perf-v1`
- `score-br-v1`

再往后可以扩展成：

```text
score = avg(br_winrate over 5 hidden seeds)
```

这样会比单次 `n=50` 更稳。

### 10.2 资源固定，否则时间分没有可比性

因为你有“1 分钟内跑完”的要求，所以 `task.toml` 里要固定环境资源，比如：

- `cpus = 2`
- `memory_mb = 4096`

否则不同机器上的 `time` 没法比较。

### 10.3 防止 agent 直接看隐藏文件

这里要特别注意 Harbor 的实际运行方式。

如果 agent 在运行期间能直接读取 `/tests`，那就**不要**把 `*.bench.js` 明文放在 task 目录里；否则 benchmark 会被泄漏。

因此我建议分两档：

- **最小实现**：通过 `verifier.env` 注入 base64 编码的 bench 文件。
- **正式版**：继续沿用 verifier-only 注入，或升级为宿主机挂载的只读私有目录。

正式版可以通过以下方式做：

1. 由 verifier 通过环境变量恢复隐藏文件到临时目录。
2. 或者由宿主机挂载私有目录给 verifier 使用。
3. 或者把隐藏评分逻辑内嵌到 verifier 脚本中，而不是以独立 `.js` 文件暴露。

如果你要做公开 benchmark，我建议直接上正式版，不要依赖“agent 不会去看 `/tests`”这个假设。

### 10.4 防止通过改输出解析作弊

不要只看命令 stdout 里的“结果: XX胜YY负”。

更稳的是：

- verifier 自己解析结构化输出；或者
- 让 `aivsai.js` 在 benchmark 分支下支持 `--json` 输出；但这个脚本要列入受保护文件，agent 不能改。

如果你不想改现有脚本，也可以在 verifier 里写一个解析器，但要对输出格式做回归测试。

## 11. 推荐的 task.toml 参数

可以先用一个比较保守的配置：

```toml
version = "0.1"

[metadata]
author_name = "internal"
difficulty = "medium"
category = "game-algorithm"
tags = ["javascript", "search", "simulation", "game-ai"]

[agent]
timeout_sec = 1800
user = "root"

[verifier]
timeout_sec = 600
user = "root"

[environment]
cpus = 2
memory_mb = 4096
storage_mb = 4096
allow_internet = true
```

这里的逻辑是：

- agent 30 分钟内完成任务
- verifier 10 分钟内完成评分
- CPU 固定，便于比较时间
- 当前 Harbor task 允许联网，避免内置 `codex` agent 在容器内安装依赖时直接失败
- `agent` / `verifier` 默认用 `root`，优先保证 Harbor bind mount 的日志目录可写

## 12. 建议的环境镜像

`environment/Dockerfile` 只需要非常简单：

- Node.js LTS
- git
- bash
- GNU `time`

不要把任何 `*.bench.js` 打进可见工作区镜像层里。

如果要做正式隐藏评测，bench 资产应该以 verifier-only 方式提供。

## 13. 单 task 还是多 task

### 先做单 task

先做：

- `rollout-6x6-v1`

优点：

- 实现成本低
- 很快能开始跑 Harbor
- 方便先验证“agent 是否真的会迭代、调试、实现算法”

### 后续扩展到多 task

成熟后再扩展：

- `rollout-5x5-v1`
- `rollout-6x6-v1`
- `rollout-7x7-v1`
- `rollout-6x6-lowtime-v1`

或者保持同一棋盘尺寸，但换：

- 不同 seed 组
- 不同时间预算
- 不同 prompt 表述

这样可以降低对单一配置的过拟合。

## 14. 我建议的第一版落地方案

如果目标是**尽快把 benchmark 跑起来**，我建议按下面的顺序做：

### V0：先打通 Harbor 流程

- 单 task
- 单尺寸 `6x6`
- 可见 fixture 来自当前 `game/`
- 隐藏评分通过 `verifier.env` 注入
- verifier 产出 `reward.txt + reward.json`
- artifact 导出 `rolloutAI.js + REPORT.md + summary.json`

### V1：补防作弊和稳定性

- 加受保护文件完整性校验
- 固定 seed
- 结果解析脚本化
- 隐藏资产改成 verifier-only 注入

### V2：做成正式 benchmark

- 多 task / 多 seed
- 发布 Harbor dataset
- 统一 leaderboard 指标
- 增加 oracle sanity check

## 15. 建议的主分与展示指标

我建议最终展示这几列：

- `primary_score`：`ro vs br` 胜率
- `ok_winrate`
- `gr_winrate`
- `ok_runtime_sec`
- `token_total`
- `cost_usd`
- `trial_wall_sec`

其中：

- 排名按 `primary_score`
- 其余列是诊断信息

这样可以很直观看到：

- 是“真强”还是只会打公开基线
- 是“暴力 rollout” 还是“策略+效率”兼顾
- token 是否花得过高

## 16. 一个可执行的 verifier 逻辑草图

```text
setup visible repo
-> verify protected files against init commit
-> run visible gate: ro vs ok
-> run visible gate: ro vs gr
-> run perf gate
-> if any gate fail: score=0
-> else inject hidden bench files
-> run ro vs br
-> write reward.txt / reward.json
-> export artifacts
```

## 17. 结论

这个 benchmark 的核心设计是合理的，优点很明显：

- 任务边界清楚
- 代码上下文足够真实
- 有公开目标，也有隐藏最终分
- 既测算法效果，也测工程实现和运行效率
- 很适合 Harbor 这种“instruction + environment + verifier”的任务框架

我认为第一版最值得优先做的三件事是：

1. 把当前 `game/` 打包成 Harbor task 的可见 fixture。
2. 写一个 verifier，把可见门槛和隐藏评分跑通。
3. 补“受保护文件校验 + 隐藏资产注入”，防止 benchmark 被绕过。

## 18. 参考

- Harbor task 格式：<https://harborframework.com/docs/task-format>
- Harbor core concepts：<https://harborframework.com/docs/core-concepts>
- Harbor datasets：<https://harborframework.com/docs/datasets>
- Harbor results & artifacts：<https://harborframework.com/docs/run-jobs/results-and-artifacts>
