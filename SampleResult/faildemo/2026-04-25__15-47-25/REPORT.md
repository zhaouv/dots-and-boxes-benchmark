# RolloutAI Report

## 实现思路

我最终实现的是一个偏基线风格的 `RolloutAI`：

- 继承 `OffensiveKeeperAI`
- 在安全步阶段，不直接按 `ok` 的随机安全边走法落子，而是：
  - 枚举/采样一批安全边候选
  - 对每个候选，把该步落下后用 `OffensiveKeeperAI` 作为默认策略模拟到终局
  - 按当前玩家视角的最终分差选最好的一步
- 在无安全边且只剩一个得分区域时：
  - 对正常 `eat` 和可行的 `yield`（`L2` / `R4` handout）分别做 rollout
  - 再按终局分差决策
- 其余情况继续复用 `OffensiveKeeperAI`

为了降低对局中 `scoreRegion` / `connectedRegion` 增量维护失真的影响，我在 rollout 过程中加入了一个轻量的 `normalizeGameData`：

- 当检测到 `EDGE_NOW` 与 `scoreRegion` 状态不一致时
- 或无安全边但又取不到最小联通区域时
- 用当前边状态重建一份 `GameData`

这样可以避免模拟阶段把 `ok` 的策略送进明显坏掉的中间状态。

## 关键取舍

- 没有继续走更重的 exact search / alpha-beta 路线。
  - 我尝试过把无安全边残局提前精确搜索，但在当前实现和数据结构上，强度提升没有明显覆盖时间成本。
- 安全步候选数做了自适应裁剪。
  - 剩余安全边很多时只采样较少候选，避免 rollout 过慢。
  - 剩余安全边较少时放宽候选数，并对最后若干安全步的候选做重复 rollout，降低采样波动。
- 默认策略仍然用 `OffensiveKeeperAI`，而不是额外实现一整套新的中后盘策略。
  - 这样实现简单，且能比较直接地把“比 `ok` 多一层 rollout”的收益体现出来。

## 本地命令

我主要跑了下面这些命令：

```bash
node aivsai.js -1 ro -2 gr -n 10 -s --seed tune-final-gr
node aivsai.js -1 ro -2 ok -n 10 -s --seed tune-final-ok
node aivsai.js -1 ro -2 ok -n 20 -s --seed tune-high-ok
node aivsai.js -1 ro -2 gr -n 20 -s --seed tune-high-gr
node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-ok-v1
node aivsai.js -1 ro -2 gr -n 50 -s --seed gate-gr-v1
```

## 观察到的结果

当前这版本地结果：

- `node aivsai.js -1 ro -2 gr -n 50 -s --seed gate-gr-v1`
  - `95 / 100`
- `node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-ok-v1`
  - `87 / 100`

一些中样本结果：

- `node aivsai.js -1 ro -2 gr -n 20 -s --seed tune-high-gr`
  - `39 / 40`
- `node aivsai.js -1 ro -2 ok -n 20 -s --seed tune-high-ok`
  - `35 / 40`
- `node aivsai.js -1 ro -2 gr -n 10 -s --seed tune-final-gr`
  - `20 / 20`
- `node aivsai.js -1 ro -2 ok -n 10 -s --seed tune-final-ok`
  - `20 / 20`

## 结论

这版已经比空实现强很多，也能稳定打赢 `gr`，但我本地最终没有把公开门槛里对 `ok` 的 95% 胜率打穿。

如果继续迭代，我认为下一步最值得做的是：

- 不再只用 `ok` 做默认 rollout policy，而是在布局期引入更明确的结构/奇偶分析
- 针对“能改变先后手的结构”做更直接的状态评估，而不是单纯依赖终局分差 rollout
