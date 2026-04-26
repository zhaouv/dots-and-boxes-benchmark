在需要时, 复制出来后额外加了 RolloutSalt 来避免对弈时始终是同一个局面

内部对战:
72gpt54 66% 70gpt55 
72gpt54 63% 65gpt54
70gpt55 62% 65gpt54

100hgpt55 91% 72gpt54

100hgpt55 55% 93hds4p
100hgpt55 44% 93hds4p
100hgpt55 48% 93hds4p

93hds4p 58% 72gpt54
93hds4p 53% 72gpt54
93hds4p 57% 72gpt54

46ds4p

## 100hgpt55

**GOAT**

对所有其他ai都表现出了统治级的水平

来源 测试benchmark2 时超时了, 把得到的ai复制出来看了看

SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl

• 100h.gpt55.js 实现的是一个“启发式候选裁剪 + 轻量 rollout”的 RolloutAI，不是纯 minimax。主入口在 SampleResult/
  codex_gpt-5.5_xhigh/100h.gpt55.js:549。

  主流程

  - 如果有 EDGE_NOW，也就是当前有立刻得分边，走 _chooseScoringMove()。
  - 如果有 EDGE_NOT，也就是还有安全边，走 _chooseSafeMove()。
  - 否则进入布局/让分阶段，走 _chooseOpeningMove()。
  - 最后兜底取任意可走边。

  核心策略

  - 得分阶段：如果已经没有安全边，就直接复用 OffensiveKeeperAI.tryKeepOffensive() 做控手；否则在可得分边里用静态估值挑一
    个。
  - 安全边阶段：先用 _safeShapeScore() 给所有安全边排序，只保留一部分候选；再对每个候选做 rollout，估计走到后续收官的收
    益。
  - 布局阶段：从每个 connected region 里抽 EDGE_WILL 候选。如果候选太多，只取几个代表边，避免爆炸。然后同时用 ok 风格和
    gr 风格 rollout 评估，取更稳的走法。

  Rollout 怎么做

  - _hashGame() 根据局面生成 seed，并 XOR getRolloutSalt()，所以不同 RolloutAI 实例会有不同 rollout 扰动。
  - _simulate() 用内部 LCG 随机数，不直接依赖全局 Math.random。
  - policy='ok' 时，收官尽量复用 OffensiveKeeperAI.tryKeepOffensive()。
  - policy='gr' 时，对手在能得分时更像 GreedyRandomAI，随机吃分。
  - 安全边阶段只抽少量 gr rollout，布局阶段会同时跑 ok 和 gr rollout。


  - _staticEval() 主要看：
      - 当前分差，权重很高。
      - 是否有立刻得分边。
      - 剩余 box 数量。
  - _safeShapeScore() 在 _staticEval() 基础上更强调安全边耗尽后谁会被迫开链。

  性能控制

  - 候选裁剪很重：安全边多时最多保留 12/16/22 个候选。

  明显特点 / 风险

  - 强项是针对公开 ok 和 gr 都做了建模，不只优化单一对手。
  - RolloutSalt 会让 rollout seed 带实例扰动；在固定 benchmark seed 下通常仍可复现，但不同创建顺序或无固定 seed 时结果会
    变。
  - 有一些未使用代码：_regionHasScore()、_chooseByLateSearch()、_fastScoreMove()、_fastSafeMove() 基本不在主路径上。
  - _simulate() 会吞异常并返回当前静态估值，鲁棒但也可能掩盖某些非法 move 问题。


分析这个session文件看看ai是怎么慢慢走到这个方向的SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-
  019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl  这个文件很大不要直接加载到上下文里去读,想办法过滤一下

• 我没有直接读整份 JSONL，而是用 Node 按行解析，只抽了三类信息：agent 自述、aivsai 测试结果、18 次 apply_patch 的函数/关
  键词摘要。

  演化脉络

  1. 一开始发现 RolloutAI 只是空继承 OffensiveKeeperAI。基线结果：
      - ro vs ok: 50%
      - ro vs gr: 91%
  2. 第一版方向很“重”：补了候选生成、静态估值、_lateSearch()、_chooseByLateSearch()、rollout。很快暴露问题：小局数测试都
     跑不完，单局中后段每步能到几秒级。
  3. 它开始砍性能：
      - move ordering 不再在 sort comparator 里反复 clone
      - rollout 内部不再递归调用重搜索
      - 安全边多时少 rollout
      - 对 _clonePut() 加 try/catch，跳过会触发 GameData.putxy 增量维护异常的分支
  4. 砍太狠后速度快了，但棋力崩了，单局出现 5:18 这种输法。它于是放弃“自己写完整收官”，把无安全边/得分阶段恢复为
     OffensiveKeeperAI.tryKeepOffensive()，把增强重点改成“布局阶段和安全边选择”。
  5. 轻量 OK-style rollout 是第一个有效突破：
      - 小样本 ok: 85%
      - 小样本 gr: 100%
      - 公开 seed 后来达到 ok: 98%，但 gr: 97%
  6. 为了修 GR 的 100% 门槛，它定位了 GR loss 的具体 seed，判断不是小误差，而是布局阶段低估了 GR 贪吃长链的行为。先尝
     试“OK/GR 混合 playout”，结果反而变差：
      - ok: 88%
      - gr: 90%
        所以撤回。
  7. 后面真正关键的判断是：GR playout 不能把双方都当 GR。正确模型是不对称的：
      - RO 自己仍按 OK 控手
      - 只有对手在得分阶段按 GR 贪吃
  8. 这个不对称模型加进去后，小样本 OK/GR 都到 100%。随后它压低采样数控制时间，最后完整 OK 公开 seed 确认为 100/100，用
     时约 143 秒；GR 完整命令跑到先手半边 50/50 时 session 被 agent timeout 截断。

  最终 SampleResult/codex_gpt-5.5_xhigh/100h.gpt55.js:549 的方向就是这个过程留下来的：主路径不用重型 late search，而是
  where() 三分支，收官依赖 OK，安全边和开口阶段用裁剪候选 + 少量 OK/不对称 GR rollout。_lateSearch() 还留在文件里，但主
  路径基本不用它。

  补充：RolloutSalt 不是这个 session 里产生的，是我们后面手动加到 100h.gpt55.js 的。

| 阶段 | JSONL 行 | 发生了什么 |
|---|---:|---|
| Git 权限问题 | 15, 18 | git status 被 dubious ownership 拦下，agent 改为直接读文件。 |
| 基线确认 | 57, 58, 61 | 空 RolloutAI 等价 OK：对 OK 50%，对 GR 91%。方向定为利用 GameData 的链/环/安全边信息。 |
| 第一版大实现 | 66, 71 | 一次性加入候选生成、静态估值、late search、rollout。 |
| 发现太慢 | 76, 101 | 小局数 smoke test 长时间不结束，判断搜索/rollout 预算过重。 |
| 第一轮性能削减 | 142, 144, 168 | 减少 sort 中重复 clone，降低搜索预算，让 rollout 策略不再递归重搜索。 |
| 发现 GameData 异常分支 | 235, 238, 240 | 搜索会走到 baseline 不常走的分割局面，触发 putxy 相关异常，于是 _clonePut 改为异常返回 null。
|
| 晚盘全局搜索被放弃 | 279, 290 | 无安全边但危险边很多时，late search 分支太大，改为快速开口启发式。 |
| 恢复 OK 收官 | 297, 300, 302 | 单局变快但惨败，判断自写收官不稳，于是无安全边/得分阶段回退到OffensiveKeeperAI.tryKeepOffensive()。 |
| 转向 OK-style rollout | 320, 322, 351, 352 | 认识到要赢 OK 不能只靠静态结构，要模拟“走到收官后的 OK 风格结果”。小样本变成 OK 85%，GR100%。 |
| 公开 seed 第一次接近 | 393, 426, 429 | OK 公开 seed 到 98%，GR 只有 97%，于是开始定位 GR loss。 |
| 错误尝试：混合 OK/GR playout | 460, 462, 483, 487 | 认为 GR 会贪吃长链，于是混合 OK/GR rollout；结果 OK/GR 都掉了，40 局只有 88%/90%。 |
| 撤回混合，增加 OK 采样 | 490, 492, 518, 519 | GR 仍 95%，OK 回到 100%。 |
| 强化无安全边开口 | 552, 554 | 发现 GR loss 来自无安全边开口给了大结构，开始用多候选终局模拟替代固定最小区域。 |
| 模拟异常处理 | 572, 585, 590, 595 | 新模拟触发 Cannot read properties of undefined (reading 'block')，于是把模拟里的 OK 控手异常降级为普通得分边/终止模拟。 |
| 关键突破：不对称 GR 模拟 | 626, 628, 643, 647 | 认识到不能把双方都模拟成 GR；RO 自己仍按 OK 控手，只有对手按 GR 贪吃。小样本 OK/GR 都到100%。 |
| 压采样控时 | 650, 652, 678, 679 | 降采样后 40 局 OK/GR 都是 100%。 |
| 完整公开验证被超时截断 | 706, 709, 713, 725 | OK 完整公开 seed 已 100/100；GR 完整测试只跑出前半边 RO 50/50，后半边还没结束 agent 就接近/进入 timeout。 |


核心路线带行号概括就是：基线差距 57 -> 重搜索失败 66 -> 回退 OK 收官 300 -> OK-style rollout 有效 320 -> 对称 GR 混合失败 460 -> 不对称 GR 模拟成功 626。


• 不是“突然灵感”，是被一个反常诊断输出逼出来的。关键链条是：

  1. 先发现 GR 仍有固定 loss
      - 497：提
        高 OK-style rollout 后，OK 已经 40/40，但 GR 还是 38/40。
      - 522：定
        位到一个具体 GR loss：seed 1817335080，比分 [5,18]。这不是一两分误差，而是开口/控手彻底错了。
  2. 第一次判断：问题在“无安全边开口”
      - 552：
        agent 明确说，RO 进入无安全边时把大结构交给 GR，GR 随后连吃到 18。
      - 554：于
        是加了 _chooseOpeningMove()，对开口候选同时跑 okTotal 和 grTotal。
  3. 但这一版 GR 模拟有个隐藏错误
     在 554 的
     patch 里，GR policy 是这样加的：

     if(state.policy==='gr')return this._randEdgeOfType(gameData,gameData.EDGE_NOW,state)

     这个判断没有看当前行动方是谁。也就是说，只要这盘 rollout 标记成 gr，双方在能得分时都会随机/贪吃，连 RO 自己也不再用
     OK 控手。这样模拟出来的不是“RO 对 GR”，而是“双方都像 GR”。
  4. 反常诊断输出把这个问题暴露了
      - 617：它
        专门复现 seed 1817335080，停在开口关键点，然后对 42 个候选分别跑 20 次 OK 模拟和 20 次 GR 模拟。
      - 623：输
        出很怪：

     state ply 42 p 0 score 0 0 edges 0 0 42
     topGR ... "ok": 2006000, "gr": -2010000 ...
     topOK ... "ok": 2026000, "gr": -2026000 ...

     同一个候选，OK 模拟是大正数，GR 模拟却是大负数。直觉上 GR 应该比 OK 更容易被利用，不应该让 RO 全部候选都灾难性变
     差。这个矛盾说明：GR 模拟不是“对手变 GR”，而是“RO 自己也变 GR”，导致 RO 失去控手能力。
  5. 所以得出“不对称 GR 模拟”
      - 626：
        agent 的文字判断就是这个：
        “之前的 GR playout 把双方都当成 GR，低估了 RO 自己在收官里的控手能力。”
      - 628：
        patch 把逻辑改成：

     if(state.opponentPolicy==='gr' && gameData.playerId!==state.rootPlayer){
         return this._randEdgeOfType(gameData,gameData.EDGE_NOW,state)
     }

     并把 state 改成：

     var state={seed:seed>>>0,rootPlayer:rootPlayer,opponentPolicy:policy||'ok'}

     这就是关键变化：只有 gameData.playerId !== rootPlayer 时，才让对手按 GR 贪吃；RO 自己仍然保留 OK 控手。
  6. 立刻验证成功
      - 643：OK
        小样本 20/20。
      - 647：GR
        小样本 20/20。

  所以这个决定的触发点不是抽象策略思考，而是 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-
  7712-8eb3-adcb524e2300.jsonl:623 的数值矛盾：ok rollout 大幅看好，gr rollout 大幅看空。它意识到这个 gr 不是对手模型，
  而是污染了自己模型，于是改成只污染 opponent。


• 对，这个 session 最后收敛到的判断就是：

  - 自己，也就是 rootPlayer / RO：始终按 OK 风格控手
  - 对手：分别用两种模型 rollout
      - ok：对手也按 OK 风格控手
      - gr：对手在得分阶段按 GR 贪吃/随机吃，不控手

  关键是 gr 不能作用到双方。之前失败的版本相当于“双方都 GR”，这会把 RO 自己的控手能力也抹掉，评估就偏了。

  对应代码判断是这种形状：

  if (state.opponentPolicy === 'gr' && gameData.playerId !== state.rootPlayer) {
      return randomScoringEdge(...)
  }

  也就是说，只有当前行动方不是 RO 时，才套用 GR 对手模型。RO 自己在 rollout 里仍走 OK-style 策略。


它做到接近门槛的原因主要有三层。

  第一层：先把收官还给 OK。
  SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:300 发现自己写
  的收官很快但输得重，于是 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-
  adcb524e2300.jsonl:302 改成无安全边时直接用：

  OffensiveKeeperAI.prototype.tryKeepOffensive.call({gameData:gameData})

  这一步让它不再在晚盘自己送掉优势，但还不够强：SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-
  a1d9-7712-8eb3-adcb524e2300.jsonl:316 对 OK 还是 45%，对 GR SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-
  33-019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:317 是 90%。

  第二层：把安全步从“静态看起来好”改成“走完后真的好”。
  SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:320 的关键判断
  是：OK 的安全步本身是随机的，能 exploit 的地方不是单步静态形状，而是“我选这条安全边之后，双方按 OK 风格随机/控手走到收
  官，最终谁赢”。

  所以 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:322 做了
  一个轻量 OK 模拟器：

  if (EDGE_NOW) {
    if (EDGE_NOT === 0) tryKeepOffensive()
    else random EDGE_NOW
  }
  else if (EDGE_NOT) random EDGE_NOT
  else getOneEdgeFromRegion(getMinConnectedRegion())

  这基本就是 OffensiveKeeperAI.where() 的高层策略，只是用内部 seeded RNG 代替真实 Math.random。然后安全边选择恢复多次
  rollout：

  var rollouts=safe>45?3:(safe>25?4:(safe>12?6:10))

  已有的 _safeCandidates() 负责先用结构分数裁剪候选，再对候选做这些 OK-style playout。这样每一步安全边不是随便走，而是在
  估计“这步之后按 OK 对局自然滚下去，我的终局收益如何”。

  第三层：实际落子仍保持 OK 收官，rollout 只用于选更好的安全步。
  这点很重要。它没有把整套 AI 改成随机模拟器；真实 where() 里只是在有 EDGE_NOT 时用 _chooseSafeMove() 选安全边，进入得
  分/无安全边后仍依赖 OK 的控手逻辑。也就是：

  - OK 的稳定收官保留下来
  - 安全边阶段比 OK 更会挑结构
  - 模拟对手用 OK 风格随机安全步，正好匹配 OK 的弱点

  所以小样本立刻变成 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-
  adcb524e2300.jsonl:351 OK 85%、SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-
  adcb524e2300.jsonl:352 GR 100%。然后同一份代码跑公开 seed，变成：

  - OK: RO 先手 50/50，RO 后手 48/50，总计 98%，见 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-
    019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:381 和 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-
    019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:393
  - GR: RO 先手 49/50，RO 后手 48/50，总计 97%，见 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-
    019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:414 和 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-
    019dc33a-a1d9-7712-8eb3-adcb524e2300.jsonl:426

  为什么 GR 也能到 97？因为 OK-style 收官本来就比 GR 强，安全边 rollout 选出的布局也避免了很多直接送长链的局面。剩下 3
  局 GR loss 才暴露出后续问题：这个 rollout 还主要按 OK 对手建模，没充分建模 GR 贪吃长链，所以后面才进入“不对称 GR 模
  拟”。


• 基本是这样，但要分清两个阶段：

  1. 静态候选裁剪 + OK-style rollout 已经很强
     它不是纯静态。真正起飞是在 SampleResult/codex_gpt-5.5_xhigh/rollout-2026-04-25T06-01-33-019dc33a-a1d9-7712-8eb3-
     adcb524e2300.jsonl:322 后：先用静态分数筛安全边候选，再对候选做 OK-style rollout。
     这一版公开 seed 已经到：
      - OK: 98/100
      - GR: 97/100
  2. 双策略/对手策略 rollout 修掉剩余 GR loss
     最后成功点不是简单“双策略 rollout”，而是“不对称对手策略 rollout”：
      - RO 自己始终按 OK 控手
      - 对手分别按 OK 或 GR 模拟
      - GR 只作用在对手得分阶段

     这个修正后，小样本 OK/GR 到 100%，随后 40 局 OK/GR 也到 100%。完整 OK 公开 seed 是 100/100；完整 GR 在 session 里只
     跑完前半 50/50，后半被 agent timeout 截断，但 verifier 后来看到 GR 是 100/100。

  所以更准确的总结是：

  静态计算负责把候选缩小和提供形状先验，OK-rollout 让它接近满分，不对称 OK/GR rollout 把剩下对 GR 的建模误差补掉。

## 93hds4p

  核心行为

  - 继承 OffensiveKeeperAI，复用它的随机落子、吃分、让分抢先手逻辑：SampleResult/faildemo/2026-04-26__11-05-02/
    rolloutAI.js:3
  - 主决策在 where()：
      - 有立即得分边且还有安全边时，随机吃一条得分边。
      - 有立即得分边但没有安全边时，进入收官 tryKeepOffensive()。
      - 没有得分边但有安全边时，进入 safePhaseDecision() 做 rollout。
      - 连安全边也没有时，按最小连通区域让分：SampleResult/faildemo/2026-04-26__11-05-02/rolloutAI.js:114

  它加了三块东西

  1. 快速模拟器 simFastWhere() / simToEnd()
     用很便宜的策略把局面模拟到结束：能吃就吃，安全阶段按连通区域抽样走，必须让分就让最小区域：SampleResult/
     faildemo/2026-04-26__11-05-02/rolloutAI.js:12
  2. 安全步阶段 rollout
     safePhaseDecision() 会抽一批 EDGE_NOT 候选，根据剩余安全边数量调整候选数和 rollout 次数，然后模拟终局，用最终分差选
     边：SampleResult/faildemo/2026-04-26__11-05-02/rolloutAI.js:133
     它还额外加了“奇偶奖励”：剩余安全边少时，如果走完后 EDGE_NOT 是偶数或 0，就加分，试图抢“最后一个安全步”的节奏：
     SampleResult/faildemo/2026-04-26__11-05-02/rolloutAI.js:183
  3. 收官阶段 eat / yield 选择
     getYieldEdgeForRegion() 尝试为长条、环、L2/R4 这种区域找“让分保先手”的边：SampleResult/faildemo/2026-04-26__11-05-
     02/rolloutAI.js:51
     tryKeepOffensive() 在单区域时比较“直接吃”和“让分”的 rollout 分差；多区域时收集吃分边和让分边，少量 rollout 后选分差
     最高的，但只有让分明显优于吃分时才让：SampleResult/faildemo/2026-04-26__11-05-02/rolloutAI.js:211

  实际效果

  结果里它对 ok 达到了 98%，过了 95% 的公开门槛；但对 gr 只有 91%，没达到 100%，所以 visible gate 失败，hidden eval 没
  跑：SampleResult/faildemo/2026-04-26__11-05-02/summary.json:6

  主要问题是它把“剩余 EDGE_NOT 数量的奇偶”当成很强信号，但真实局面里一次落子可能把多个 EDGE_NOT 转成 EDGE_WILL，奇偶会被
  翻转；而且 rollout 里双方都按同一个 simFastWhere() 策略模拟，不是真正模拟 GreedyRandomAI 或强隐藏对手。结果就是能利用
  一些 OK 的漏洞，但泛化不稳，对 GR 反而会输 9%。

## faildemo

$ time node aivsai.bench.js -1 ro -2 br -n 50 -s -o rd4.html
RolloutAI(先手) vs BenchRolloutAI(后手) 6x6 50局
结果: RO 49胜 BR 1负
平均步数: 73

BenchRolloutAI(先手) vs RolloutAI(后手) 6x6 50局
结果: RO 44胜 BR 6负
平均步数: 74

综合 100局: RO 93胜 BR 7负 (93%)

录像已保存: rd4.html
直接在浏览器中打开即可观看

real    0m52.297s
user    0m53.182s
sys     0m0.402s
$ time node aivsai.bench.js -1 ro -2 br -n 50 -s -o r55.html
RolloutAI(先手) vs BenchRolloutAI(后手) 6x6 50局
结果: RO 37胜 BR 13负
平均步数: 73

BenchRolloutAI(先手) vs RolloutAI(后手) 6x6 50局
结果: RO 39胜 BR 11负
平均步数: 73

综合 100局: RO 76胜 BR 24负 (76%)

录像已保存: r55.html
直接在浏览器中打开即可观看

real    2m8.319s
user    2m8.694s
sys     0m0.466s
$ time node aivsai.bench.js -1 ro -2 br -n 50 -s -o r54.html
RolloutAI(先手) vs BenchRolloutAI(后手) 6x6 50局
结果: RO 41胜 BR 9负
平均步数: 72

BenchRolloutAI(先手) vs RolloutAI(后手) 6x6 50局
结果: RO 38胜 BR 12负
平均步数: 73

综合 100局: RO 79胜 BR 21负 (79%)

录像已保存: r54.html
直接在浏览器中打开即可观看

real    0m39.409s
user    0m39.827s
sys     0m0.325s