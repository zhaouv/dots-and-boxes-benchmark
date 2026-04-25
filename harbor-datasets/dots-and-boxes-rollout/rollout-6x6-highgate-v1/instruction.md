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
- `gamedata.js` (当你需要修改GameData类时应该类似`this.gameData=new YouNewGameData().fromGame(game)`继承一个新的类给AI)
- `player.js`
- 游戏规则、对战脚本语义和已有基线 AI 的行为定义

如果修改了受保护文件，评测会直接失败。

## 公开目标

你的实现需要同时满足：

1. `node aivsai.js -1 ro -2 ok -n 50 -s` 胜率达到 95% 以上
2. `node aivsai.js -1 ro -2 gr -n 50 -s` 胜率达到 100%
3. `node aivsai.js -1 ro -2 ok -n 50 -s` 在规定资源下 3 分钟内完成

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
- 还有隐藏评测，请不要只针对公开门槛做过拟合。你的最终分数是面对这个隐藏对手的胜率.
- 可先阅读 `README.md` 了解 AI 背景和脚本用法。  
  你应该着重利用`#### 进一步提升的思路`里的分析. `### RolloutAI`里的说法仅供参考. 资源方面以公开目标里的资源上不超时即可. 策略方面, 你的隐藏评测的对手非常强, 尽量保证对`ok`的胜率接近100%, 建议充分利用`转化为布局阶段抢到最后一个能改变先后手的结构`来做布局阶段的rollout, 为此你很可能会需要做更多的对盘面结构的分析. 建议先针对`进一步提升的思路`的内容额外进行思考.

