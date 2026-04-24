# 任务：实现 RolloutAI

当前工作目录是点格棋游戏目录的可见副本。

你需要在不给参考实现的情况下，补全 `rolloutAI.js` 里的 `RolloutAI`，并自行运行对战进行迭代。

## 可修改文件

- `rolloutAI.js`
- `REPORT.md`
- 你自行新增的临时分析文件

## 不允许修改

- `aivsai.js`
- `game.js`
- `gamedata.js`
- `player.js`
- 游戏规则、对战脚本语义和已有基线 AI 的行为定义

如果修改了受保护文件，评测会直接失败。

## 公开目标

你的实现需要尽量同时满足：

1. `node aivsai.js -1 ro -2 ok -n 50 -s` 胜率达到 70% 以上
2. `node aivsai.js -1 ro -2 gr -n 50 -s` 胜率达到 90% 以上
3. `node aivsai.js -1 ro -2 ok -n 50 -s` 在规定资源下 60 秒内完成

建议使用固定 seed 做复现，例如：

```bash
node aivsai.js -1 ro -2 ok -n 50 -s --seed gate-ok-v1
node aivsai.js -1 ro -2 gr -n 50 -s --seed gate-gr-v1
```

## 输出要求

完成后，请尽量补充 `REPORT.md`，至少包含：

- 你的实现思路
- 关键取舍
- 你本地跑过的命令
- 你观察到的结果

## 说明

- 当前目录已经初始化为 git 仓库，便于你查看改动。
- 还有隐藏评测，请不要只针对公开门槛做过拟合。
- 可先阅读 `README.md` 了解 AI 背景和脚本用法。
