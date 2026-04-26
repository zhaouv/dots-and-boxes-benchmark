
////////////////// RolloutAI //////////////////
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    return this
}
RolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
RolloutAI.prototype.constructor = RolloutAI

RolloutAI.prototype.where = function() {
    var gameData = this.gameData

    // Safe phase: no immediate scoring edges, safe edges exist — rollout candidates
    if (gameData.edgeCount[gameData.EDGE_NOW] === 0 && gameData.edgeCount[gameData.EDGE_NOT] > 0) {
        return this.rolloutSafeEdges()
    }

    // All other phases delegate to OK; tryKeepOffensive is overridden for L2/R4 rollout
    return OffensiveKeeperAI.prototype.where.call(this)
}

RolloutAI.prototype.tryKeepOffensive = function() {
    var gameData = this.gameData

    // Single scoring region: for L2 and R4, rollout eat vs yield
    if (gameData.scoreRegion.length === 1) {
        var region = gameData.connectedRegion[gameData.scoreRegion[0]]
        if (region) {
            if (!region.isRing && region.block.length === 2) {
                return this.rolloutL2(region)
            }
            if (region.isRing && region.block.length === 4) {
                return this.rolloutR4(region)
            }
        }
    }

    return OffensiveKeeperAI.prototype.tryKeepOffensive.call(this)
}

RolloutAI.prototype.rolloutSafeEdges = function() {
    var gameData = this.gameData
    var playerId = this.playerId

    // Get region-diverse candidates via getEdgeGroupedByRegion
    var candidates = gameData.getEdgeGroupedByRegion(gameData.EDGE_NOT)
    var seen = {}
    for (var ii = 0; ii < candidates.length; ii++) {
        seen[candidates[ii].x + ',' + candidates[ii].y] = true
    }

    // If fewer than 15, supplement with random EDGE_NOT edges
    if (candidates.length < 15) {
        var all = gameData.getAllEdges(gameData.EDGE_NOT)
        // Fisher-Yates shuffle
        for (var ii = all.length - 1; ii > 0; ii--) {
            var jj = this.rand(ii + 1)
            var tmp = all[ii]
            all[ii] = all[jj]
            all[jj] = tmp
        }
        for (var ii = 0; ii < all.length && candidates.length < 15; ii++) {
            var key = all[ii].x + ',' + all[ii].y
            if (!seen[key]) {
                seen[key] = true
                candidates.push(all[ii])
            }
        }
    }

    // Cap at 15 (shuffle and take first 15)
    if (candidates.length > 15) {
        for (var ii = candidates.length - 1; ii > 0; ii--) {
            var jj = this.rand(ii + 1)
            var tmp = candidates[ii]
            candidates[ii] = candidates[jj]
            candidates[jj] = tmp
        }
        candidates = candidates.slice(0, 15)
    }

    if (candidates.length === 0) {
        return this.getRandWhere(gameData.EDGE_NOT)
    }

    var bestEdge = candidates[0]
    var bestScore = -Infinity

    for (var ii = 0; ii < candidates.length; ii++) {
        var edge = candidates[ii]
        var sim = gameData.clone()
        sim.putxy(edge.x, edge.y)
        var score = this.simulateToEnd(sim, playerId)
        if (score > bestScore) {
            bestScore = score
            bestEdge = edge
        }
    }

    return bestEdge
}

RolloutAI.prototype.simulateToEnd = function(simData, originalPlayerId) {
    var ai = new OffensiveKeeperAI()
    var maxSteps = 200

    for (var step = 0; step < maxSteps; step++) {
        if (simData.winnerId != null) break

        ai.gameData = simData
        ai.playerId = simData.playerId

        var where
        try {
            where = ai.where()
        } catch(e) {
            break
        }

        if (!where || where.x == null || where.y == null) break

        var result = simData.putxy(where.x, where.y)
        if (result === 'win') break
    }

    if (simData.winnerId == null) return 0
    return simData.player[originalPlayerId].score - simData.player[1 - originalPlayerId].score
}

RolloutAI.prototype.rolloutL2 = function(region) {
    var gameData = this.gameData
    var playerId = this.playerId
    var stack = region.block

    var eatEdge = gameData.getOneEdgeFromRegion(region)

    // Find boundary yield edge (same as OK's logic)
    var yieldEdge = null
    var p1 = 1
    if (gameData.xy(stack[0].x, stack[0].y) !== gameData.SCORE_3) {
        p1 = 0
    }
    var directions = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
    for (var ii = 0, d; d = directions[ii]; ii++) {
        var xx = stack[p1].x + d.x, yy = stack[p1].y + d.y
        var xxx = stack[p1].x + 2 * d.x, yyy = stack[p1].y + 2 * d.y
        if (gameData.xy(xx, yy) !== gameData.EDGE_USED && gameData.xy(xxx, yyy) === 'out range') {
            yieldEdge = {x: xx, y: yy}
            break
        }
    }

    if (!yieldEdge) return eatEdge

    var simEat = gameData.clone()
    simEat.putxy(eatEdge.x, eatEdge.y)
    var scoreEat = this.simulateToEnd(simEat, playerId)

    var simYield = gameData.clone()
    simYield.putxy(yieldEdge.x, yieldEdge.y)
    var scoreYield = this.simulateToEnd(simYield, playerId)

    return scoreEat >= scoreYield ? eatEdge : yieldEdge
}

RolloutAI.prototype.rolloutR4 = function(region) {
    var gameData = this.gameData
    var playerId = this.playerId
    var stack = region.block

    var eatEdge = gameData.getOneEdgeFromRegion(region)
    var yieldEdge = {x: (stack[1].x + stack[2].x) / 2, y: (stack[1].y + stack[2].y) / 2}

    var simEat = gameData.clone()
    simEat.putxy(eatEdge.x, eatEdge.y)
    var scoreEat = this.simulateToEnd(simEat, playerId)

    var simYield = gameData.clone()
    simYield.putxy(yieldEdge.x, yieldEdge.y)
    var scoreYield = this.simulateToEnd(simYield, playerId)

    return scoreEat >= scoreYield ? eatEdge : yieldEdge
}
