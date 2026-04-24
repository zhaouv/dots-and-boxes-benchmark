
////////////////// BenchRolloutAI //////////////////
BenchRolloutAI=function(){
    OffensiveKeeperAI.call(this)
    return this
}
BenchRolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
BenchRolloutAI.prototype.constructor = BenchRolloutAI

BenchRolloutAI.prototype.WIN_SCORE=10000
BenchRolloutAI.prototype.MAX_SAFE_SIM=15

BenchRolloutAI.prototype.where = function(){
    var gameData = this.gameData
    var myId = this.playerId

    // 收官阶段：判定点选择吃/让
    if (gameData.edgeCount[gameData.EDGE_NOW] > 0 && gameData.edgeCount[gameData.EDGE_NOT] === 0) {
        if (this.isDecisionPoint(gameData)) {
            var region = gameData.connectedRegion[gameData.scoreRegion[0]]
            if (region) {
                var eatResult = this.simulateBranch(gameData, 'eat', region)
                var yieldResult = this.simulateBranch(gameData, 'yield', region)
                if (yieldResult > eatResult) {
                    var yieldEdge = this.pickYieldEdge(gameData, region)
                    if (yieldEdge) return yieldEdge
                }
            }
        }
        return OffensiveKeeperAI.prototype.where.call(this)
    }

    // 安全步：模拟每个安全边选最优
    if (gameData.edgeCount[gameData.EDGE_NOW] === 0 && gameData.edgeCount[gameData.EDGE_NOT] > 0) {
        return this.pickBestSafeMove(gameData)
    }

    // 有得分且有安全步：直接吃（和OK一致）
    if (gameData.edgeCount[gameData.EDGE_NOW] > 0) {
        return this.getRandWhere(gameData.EDGE_NOW)
    }

    // 必须让分：让最小区域
    return gameData.getOneEdgeFromRegion(gameData.getMinConnectedRegion())
}

// 模拟一个分支到终局，返回我方最终得分差
BenchRolloutAI.prototype.simulateBranch = function(gameData, branchType, region) {
    var sim = gameData.clone()
    var myId = this.playerId

    if (branchType === 'eat') {
        var eatEdge = sim.getOneEdgeFromRegion(region)
        sim.putxy(eatEdge.x, eatEdge.y)
        while (sim.edgeCount[sim.EDGE_NOW] > 0 && sim.winnerId == null) {
            var edge = this.pickEatableEdge(sim)
            if (!edge) break
            sim.putxy(edge.x, edge.y)
        }
    } else {
        var yieldEdge = this.pickYieldEdge(gameData, region)
        if (!yieldEdge) return -Infinity
        sim.putxy(yieldEdge.x, yieldEdge.y)
    }

    this.simulateToEnd(sim)
    return sim.player[myId].score - sim.player[1 - myId].score
}

// 用 OK 策略模拟到终局
BenchRolloutAI.prototype.simulateToEnd = function(sim) {
    var maxSteps = 200
    while (sim.winnerId == null && maxSteps-- > 0) {
        var okAi = new OffensiveKeeperAI()
        okAi.playerId = sim.playerId
        okAi.gameData = sim
        try {
            var where = OffensiveKeeperAI.prototype.where.call(okAi)
        } catch(e) {
            if (sim.edgeCount[sim.EDGE_NOW] > 0) {
                var edges = sim.getAllEdges(sim.EDGE_NOW)
                if (edges.length > 0) { sim.putxy(edges[0].x, edges[0].y); continue }
            }
            break
        }
        if (!where || where.x == null) break
        sim.putxy(where.x, where.y)
    }
}

// 安全步模拟选择
BenchRolloutAI.prototype.pickBestSafeMove = function(gameData) {
    var edges = gameData.getAllEdges(gameData.EDGE_NOT)
    if (edges.length === 0) return null
    if (edges.length === 1) return edges[0]

    var myId = this.playerId
    var best = null, bestScore = -Infinity

    // 采样上限
    var candidates = edges
    if (candidates.length > this.MAX_SAFE_SIM) {
        // 随机采样
        for (var i = candidates.length - 1; i > 0; i--) {
            var j = ~~(Math.random() * (i + 1))
            var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp
        }
        candidates = candidates.slice(0, this.MAX_SAFE_SIM)
    }

    for (var i = 0; i < candidates.length; i++) {
        var sim = gameData.clone()
        sim.putxy(candidates[i].x, candidates[i].y)
        if (sim.winnerId != null) {
            var score = sim.player[myId].score - sim.player[1 - myId].score
            if (score > bestScore) { bestScore = score; best = candidates[i] }
            continue
        }
        // 如果产生了 EDGE_NOW，先吃完（当前玩家继续）
        while (sim.edgeCount[sim.EDGE_NOW] > 0 && sim.winnerId == null) {
            var okAi = new OffensiveKeeperAI()
            okAi.playerId = sim.playerId
            okAi.gameData = sim
            try {
                var where = OffensiveKeeperAI.prototype.where.call(okAi)
            } catch(e) {
                var eList = sim.getAllEdges(sim.EDGE_NOW)
                if (eList.length > 0) { sim.putxy(eList[0].x, eList[0].y); continue }
                break
            }
            if (!where || where.x == null) break
            sim.putxy(where.x, where.y)
        }
        this.simulateToEnd(sim)
        var score = sim.player[myId].score - sim.player[1 - myId].score
        if (score > bestScore) { bestScore = score; best = candidates[i] }
    }

    return best || edges[0]
}

BenchRolloutAI.prototype.isDecisionPoint = function(gameData) {
    if (gameData.edgeCount[gameData.EDGE_NOW] === 0) return false
    if (gameData.edgeCount[gameData.EDGE_NOT] > 0) return false
    if (gameData.regionNum <= 1) return false
    if (gameData.scoreRegion.length !== 1) return false

    var region = gameData.connectedRegion[gameData.scoreRegion[0]]
    if (!region) return false

    if (!region.isRing && region.block.length === 2) return true
    if (region.isRing && region.block.length === 4) return true

    return false
}

BenchRolloutAI.prototype.eatUntilDecision = function(gameData) {
    var way = []
    var sim = gameData.clone()

    while (sim.edgeCount[sim.EDGE_NOW] > 0 && sim.winnerId == null) {
        if (this.isDecisionPoint(sim)) {
            return { way: way, gameData: sim, atDecisionPoint: true }
        }
        var edge = this.pickEatableEdge(sim)
        if (!edge) break
        way.push(edge)
        sim.putxy(edge.x, edge.y)
    }

    return { way: way, gameData: sim, atDecisionPoint: false }
}

BenchRolloutAI.prototype.safeGetEdgeFromScoreRegion = function(gameData) {
    for (var ii = 0; ii < gameData.scoreRegion.length; ii++) {
        var region = gameData.connectedRegion[gameData.scoreRegion[ii]]
        if (region) return gameData.getOneEdgeFromRegion(region)
    }
    var edges = gameData.getAllEdges(gameData.EDGE_NOW)
    if (edges.length > 0) return edges[0]
    return null
}

BenchRolloutAI.prototype.pickEatableEdge = function(gameData) {
    if (gameData.regionNum <= 1) {
        return this.safeGetEdgeFromScoreRegion(gameData)
    }
    var regions = {}
    for (var ii in gameData.connectedRegion) {
        var region = gameData.connectedRegion[ii]
        if (!region) continue
        var len = region.block.length
        regions[len] = regions[len] || []
        regions[len].push(region.index)
    }
    if (regions[1]) {
        for (var ii = 0; ii < regions[1].length; ii++) {
            if (gameData.scoreRegion.indexOf(regions[1][ii]) !== -1)
                return gameData.getOneEdgeFromRegionIndex(regions[1][ii])
        }
    }
    if (regions[2] && gameData.scoreRegion.length > 1) {
        for (var ii = 0; ii < regions[2].length; ii++) {
            if (gameData.scoreRegion.indexOf(regions[2][ii]) !== -1)
                return gameData.getOneEdgeFromRegionIndex(regions[2][ii])
        }
    }
    if (gameData.scoreRegion.length > 2) {
        for (var ii in gameData.scoreRegion) {
            var r = gameData.connectedRegion[gameData.scoreRegion[ii]]
            if (r && r.isRing) return gameData.getOneEdgeFromRegion(r)
        }
        return this.safeGetEdgeFromScoreRegion(gameData)
    }
    if (gameData.scoreRegion.length === 2) {
        var r1 = gameData.connectedRegion[gameData.scoreRegion[1]]
        if (r1 && r1.isRing) return gameData.getOneEdgeFromRegion(r1)
        return this.safeGetEdgeFromScoreRegion(gameData)
    }
    return this.safeGetEdgeFromScoreRegion(gameData)
}

BenchRolloutAI.prototype.pickYieldEdge = function(gameData, region) {
    var stack = region.block
    if (region.isRing) {
        var mid = ~~(region.block.length / 2)
        return { x: (stack[mid-1].x + stack[mid].x) / 2, y: (stack[mid-1].y + stack[mid].y) / 2 }
    }
    if (!region.isRing) {
        var p1 = gameData.xy(stack[0].x, stack[0].y) !== gameData.SCORE_3 ? 0 : region.block.length - 1
        var directions = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
        for (var ii = 0, d; d = directions[ii]; ii++) {
            var xx = stack[p1].x + d.x, yy = stack[p1].y + d.y
            var xxx = stack[p1].x + 2*d.x, yyy = stack[p1].y + 2*d.y
            if (gameData.xy(xx, yy) !== gameData.EDGE_USED
                && gameData.xy(xxx, yyy) === 'out range')
                return { x: xx, y: yy }
        }
        // L2不在棋盘边缘，无法让分，直接吃
    }
    return null
}
