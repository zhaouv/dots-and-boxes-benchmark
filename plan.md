# plan

本计划基于 `BENCHMARK_DESIGN.md`，用于指导该仓库后续落地 Harbor benchmark。

当前 task 路径：

- `harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1`

## 目标

- 把当前 `game/` 资产整理成一个可运行的 Harbor benchmark。
- 公开目标用于驱动 agent 实现 `RolloutAI`。
- 隐藏评分用于最终排序，避免对公开门槛过拟合。

## Phase 1：最小可运行版本

1. 建立 Harbor task 基本目录。
2. 从 `game/` 复制可见 fixture，排除 `*.bench.js`。
3. 编写工作区初始化脚本：
   - 复制可见文件到工作目录
   - 初始化 git 仓库
   - 提交初始版本
4. 编写 `instruction.md`：
   - 明确实现目标是 `rolloutAI.js`
   - 明确公开门槛：`ro vs ok`、`ro vs gr`、运行时间
   - 明确不允许修改规则层和 runner
5. 编写 verifier：
   - 跑公开门槛
   - 记录胜率与耗时
   - 输出 `reward.txt` 与 `reward.json`
6. 导出 artifacts：
   - `rolloutAI.js`
   - `REPORT.md`
   - `git diff`
   - 评测摘要

## Phase 2：补齐评测完整性

1. 增加受保护文件校验。
2. 固定公开门槛与隐藏评分 seed。
3. 增加隐藏 bench 注入流程。
4. 跑 `ro vs br` 生成主分数。
5. 保证 hidden 资产不直接泄漏到 agent 可见上下文。

## Phase 3：提高稳定性和可维护性

1. 把结果解析脚本化，避免依赖脆弱的字符串匹配。
2. 固定环境资源，保证时间指标可比。
3. 增加更稳定的多 seed 评分方案。
4. 整理 task 命名、目录布局和复用脚本。

## Phase 4：扩展 benchmark

1. 增加更多 task 变体，如不同棋盘尺寸或不同时间预算。
2. 统一 leaderboard 展示字段。
3. 增加 oracle / sanity check，确认任务可解且评分稳定。

## 执行约束

- 更新完代码后保持文档和代码一致。
- 如果实现偏离 `BENCHMARK_DESIGN.md`，要先同步修正文档，再继续扩展。
- 新增目录或脚本时，优先保证可读性、可验证性和可复现性。
- 非明确要求下，不把隐藏 bench 文件放入 agent 可见工作区。

## 完成标准

- 能构建出一个 Harbor task。
- agent 能在可见环境中完成 `RolloutAI` 开发。
- verifier 能输出公开门槛结果与隐藏评分结果。
- 代码、计划和设计文档保持一致。
