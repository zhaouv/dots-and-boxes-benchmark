# dots-and-boxes-benchmark

基于点格棋游戏代码构建 Harbor benchmark，用来评估 agent 在受限上下文下实现 `RolloutAI` 的能力。

## 仓库结构

- `game/`：原始游戏代码、公开 runner 和 bench 参考资产
- `BENCHMARK_DESIGN.md`：benchmark 设计草案
- `plan.md`：当前落地计划
- `harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1/`：第一版 Harbor task 骨架
- `scripts/export_hidden_env.sh`：把隐藏 bench 文件编码成 verifier 环境变量

## 当前 Harbor task

任务路径：

`harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1`

该 task 当前包含：

- 可见工作区 fixture
- Docker 环境与 git 初始化脚本
- 公开门槛 verifier
- 基于环境变量注入的隐藏评分接口
- oracle solution 占位

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

具体运行命令以你的 Harbor 版本为准；任务路径已经按官方 task 结构整理完成。运行前建议先：

```bash
eval "$(./scripts/export_hidden_env.sh)"
```

然后让 Harbor 读取：

`harbor-datasets/dots-and-boxes-rollout/rollout-6x6-v1`

## 文档约束

- 更新完代码后保持文档和代码一致。
- 如果 task 结构、评分逻辑或隐藏资产注入方式发生变化，需要同步更新相关文档。
