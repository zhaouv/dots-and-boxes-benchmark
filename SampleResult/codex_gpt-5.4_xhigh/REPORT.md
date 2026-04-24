# RolloutAI Report

## 实现思路

`RolloutAI` 继承 `OffensiveKeeperAI`，但只在两个最关键的决策点插入 rollout：

1. 没有可立即得分边、但存在安全边 (`EDGE_NOT`) 时：
   - 枚举安全边，最多采样 15 条候选。
   - 小盘面 (`totalScore <= 25`) 提高到最多 20 条，避免采样过粗。
   - 每个候选先落一手，再让双方都按 `OffensiveKeeperAI` 逻辑模拟到终局。
   - 以“优先胜负、其次分差”的方式打分，选最优候选。

2. 没有安全边且只剩一个得分区域时：
   - 识别 `L2` 和 `R4` 上的 `eat / yield` 两种处理。
   - 分别 rollout 到终局后再决策，而不是直接沿用 `OK` 的固定规则。

为了避免 rollout 过程污染真实对局里的全局 `Math.random`，我在 `rolloutAI.js` 里实现了独立的本地伪随机数发生器，playout 全程只用本地随机流。

## 关键取舍

- rollout 的后续策略没有继续递归调用 `RolloutAI`，而是固定为 `OffensiveKeeperAI`。
  这样做的原因是速度更稳，而且公开目标只要求显著优于 `OK`，不需要做昂贵的自对弈搜索。

- 候选采样先用 `getEdgeGroupedByRegion(EDGE_NOT)` 取一批结构上更分散的边，再用局面哈希驱动的本地随机补满。
  这样比纯随机抽 15 条更不容易漏掉关键结构。

- rollout 次数按盘面大小和候选规模动态分配：
  - `6x6` 保持较省的预算，保证 50x2 对局明显在 60 秒内完成。
  - 小盘面增加 rollout 数和候选数，补强 `4x4/5x5` 这类更容易被采样误差影响的局面。

- 终局评分使用“胜负优先 + 分差微调”：
  - 胜局统一给大正分，败局给大负分。
  - 分差只作为同为胜/负时的次级排序依据。

## 本地跑过的命令

```bash
node aivsai.js -1 ro -2 ok -n 10 -s --seed smoke-ok-1
node aivsai.js -1 ro -2 gr -n 10 -s --seed smoke-gr-1

/usr/bin/time -f 'TIME %e' node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-ok-v1
/usr/bin/time -f 'TIME %e' node aivsai.js -1 ro -2 gr -n 50 -s --seed gate-gr-v1

node aivsai.js -1 ro -2 ok -n 20 -s --seed regress-ok-a
node aivsai.js -1 ro -2 ok -n 20 -s --seed regress-ok-b
node aivsai.js -1 ro -2 ok -n 20 -s --seed regress-ok-c

node aivsai.js -1 ro -2 ok -x 4 -y 4 -n 20 -s --seed regress-4x4-v2
node aivsai.js -1 ro -2 ok -n 20 -s --seed smoke-ok-2
```

## 观察到的结果

- `node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-ok-v1`
  - `RO 87胜 OK 13负 (87%)`
  - `TIME 22.02`

- `node aivsai.js -1 ro -2 gr -n 50 -s --seed gate-gr-v1`
  - `RO 99胜 GR 1负 (99%)`
  - `TIME 22.32`

- 额外 `6x6` 固定 seed 回归：
  - `regress-ok-a`: `RO 33胜 OK 7负 (83%)`
  - `regress-ok-b`: `RO 31胜 OK 9负 (78%)`
  - `regress-ok-c`: `RO 34胜 OK 6负 (85%)`

- 小盘面补强后的 `4x4` 回归：
  - `regress-4x4-v2`: `RO 36胜 OK 4负 (90%)`

- 额外 `6x6` 烟测：
  - `smoke-ok-2`: `RO 37胜 OK 3负 (93%)`

整体上，这个版本已经明显超过公开门槛，且运行时间留有较大余量。
