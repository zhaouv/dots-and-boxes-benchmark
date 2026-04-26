
////////////////// RolloutAI //////////////////
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    return this
}
RolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
RolloutAI.prototype.constructor = RolloutAI

// ---- fast simulation policy (OK strategy for endgame) ----

RolloutAI.prototype.simFastWhere = function(gd) {
    var saved = this.gameData
    this.gameData = gd
    var where
    if (gd.edgeCount[gd.EDGE_NOW]) {
        if (gd.edgeCount[gd.EDGE_NOT] || gd.scoreRegion.length === 0) {
            where = this.getRandWhere(gd.EDGE_NOW)
        } else {
            where = OffensiveKeeperAI.prototype.tryKeepOffensive.call(this)
        }
    } else if (gd.edgeCount[gd.EDGE_NOT]) {
        var spread = gd.getEdgeGroupedByRegion(gd.EDGE_NOT)
        if (spread.length > 0) {
            var h = (gd.player[0].score + gd.player[1].score) * 31 + gd.edgeCount[gd.EDGE_USED] * 17
            var r = this.rand()
            var idx = (h + Math.floor(r * 7)) % spread.length
            where = spread[Math.abs(idx) % spread.length]
        } else {
            where = this.getRandWhere(gd.EDGE_NOT)
        }
    } else {
        where = gd.getOneEdgeFromRegion(gd.getMinConnectedRegion())
    }
    this.gameData = saved
    return where
}

RolloutAI.prototype.simToEnd = function(gd) {
    var loopGuard = 0
    while (gd.winnerId == null && loopGuard < 200) {
        var mv = this.simFastWhere(gd)
        if (!mv || mv.x == null) break
        gd.putxy(mv.x, mv.y)
        loopGuard++
    }
}

// ---- yield-edge helpers ----

RolloutAI.prototype.getYieldEdgeForRegion = function(region) {
    var gd = this.gameData
    var blk = region.block
    var L = blk.length
    var dirs = [{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]

    if (region.isRing) {
        if (L === 4) {
            var a = blk[1], b = blk[2]
            var ex = (a.x+b.x)/2, ey = (a.y+b.y)/2
            if (gd.xy(ex, ey) === gd.EDGE_WILL)
                return {x: ex, y: ey}
        }
        for (var i = 0; i < L; i++) {
            var j = (i + 1) % L
            var mx = (blk[i].x + blk[j].x) / 2
            var my = (blk[i].y + blk[j].y) / 2
            if (gd.xy(mx, my) === gd.EDGE_WILL)
                return {x: mx, y: my}
        }
        return null
    }

    if (L <= 1) return null

    var pSCORE3 = 0
    if (gd.xy(blk[0].x, blk[0].y) !== gd.SCORE_3) pSCORE3 = L - 1
    var pSCORE2 = pSCORE3 === 0 ? L - 1 : 0
    var pd = pSCORE3 === 0 ? 1 : -1

    if (L === 2) {
        for (var k = 0; k < 4; k++) {
            var d = dirs[k]
            var ex2 = blk[pSCORE2].x + d.x, ey2 = blk[pSCORE2].y + d.y
            if (gd.xy(ex2, ey2) === gd.EDGE_WILL &&
                gd.xy(blk[pSCORE2].x + 2*d.x, blk[pSCORE2].y + 2*d.y) === 'out range')
                return {x: ex2, y: ey2}
        }
        return null
    }

    if (L >= 4) {
        var splitA = pSCORE3 + (L - 3) * pd
        var splitB = pSCORE3 + (L - 2) * pd
        var mxA = (blk[splitA].x + blk[splitB].x) / 2
        var myA = (blk[splitA].y + blk[splitB].y) / 2
        if (gd.xy(mxA, myA) === gd.EDGE_WILL)
            return {x: mxA, y: myA}
    }

    if (L === 3) {
        var a3 = pSCORE3 + pd, b3 = pSCORE3 + 2*pd
        var mx3 = (blk[a3].x + blk[b3].x) / 2
        var my3 = (blk[a3].y + blk[b3].y) / 2
        if (gd.xy(mx3, my3) === gd.EDGE_WILL)
            return {x: mx3, y: my3}
    }

    return null
}

// ---- main where() ----

RolloutAI.prototype.where = function() {
    var gd = this.gameData

    if (gd.edgeCount[gd.EDGE_NOW]) {
        if (gd.edgeCount[gd.EDGE_NOT]) {
            return this.getRandWhere(gd.EDGE_NOW)
        }
        return this.tryKeepOffensive()
    }

    if (gd.edgeCount[gd.EDGE_NOT]) {
        return this.safePhaseDecision()
    }

    return gd.getOneEdgeFromRegion(gd.getMinConnectedRegion())
}

// ---- safe-phase rollout ----

RolloutAI.prototype.safePhaseDecision = function() {
    var gd = this.gameData
    var myId = gd.playerId
    var remaining = gd.edgeCount[gd.EDGE_NOT]

    // adaptive budget
    var maxC, nRoll
    if (remaining > 20)      { maxC = 5;  nRoll = 1 }
    else if (remaining > 12) { maxC = 8;  nRoll = 2 }
    else if (remaining > 6)  { maxC = 12; nRoll = 3 }
    else if (remaining > 3)  { maxC = 18; nRoll = 4 }
    else                     { maxC = 25; nRoll = 5 }

    var candidates = gd.getEdgeGroupedByRegion(gd.EDGE_NOT)

    if (candidates.length < maxC) {
        var all = gd.getAllEdges(gd.EDGE_NOT)
        var step = Math.max(1, Math.floor(all.length / Math.max(1, maxC - candidates.length + 1)))
        for (var i = 0; i < all.length && candidates.length < maxC; i += step) {
            var dup = false
            for (var j = 0; j < candidates.length; j++) {
                if (candidates[j].x === all[i].x && candidates[j].y === all[i].y) {
                    dup = true; break
                }
            }
            if (!dup) candidates.push(all[i])
        }
    }
    candidates = candidates.slice(0, maxC)
    if (candidates.length <= 1) return candidates[0]

    // precompute notAfter for parity evaluation
    var notAfterCache = []
    for (var i = 0; i < candidates.length; i++) {
        var test = gd.clone()
        test.putxy(candidates[i].x, candidates[i].y)
        notAfterCache.push(test.edgeCount[test.EDGE_NOT])
    }

    var bestEdge = candidates[0]
    var bestScore = -Infinity

    for (var i = 0; i < candidates.length; i++) {
        var total = 0
        for (var j = 0; j < nRoll; j++) {
            var sim = gd.clone()
            sim.putxy(candidates[i].x, candidates[i].y)
            this.simToEnd(sim)
            var diff = sim.player[myId].score - sim.player[1-myId].score

            // strong parity bonus
            var na = notAfterCache[i]
            if (remaining <= 10) {
                if (na === 0) {
                    diff += 12  // we ended the safe phase
                } else if (na % 2 === 0) {
                    diff += 6   // we likely get last safe edge
                } else {
                    diff -= 3   // opponent likely gets it
                }
            } else if (remaining <= 16 && na % 2 === 0) {
                diff += 3
            }

            total += diff
        }
        var avg = total / nRoll
        if (avg > bestScore) {
            bestScore = avg
            bestEdge = candidates[i]
        }
    }

    return bestEdge
}

// ---- endgame: tryKeepOffensive ----

RolloutAI.prototype.tryKeepOffensive = function() {
    var gd = this.gameData
    var myId = gd.playerId

    if (gd.scoreRegion.length === 0) {
        return OffensiveKeeperAI.prototype.tryKeepOffensive.call(this)
    }

    // single scoring region: eat vs yield rollout
    if (gd.scoreRegion.length === 1 && gd.regionNum === 1) {
        var region = gd.connectedRegion[gd.scoreRegion[0]]
        if (!region) return OffensiveKeeperAI.prototype.tryKeepOffensive.call(this)

        var eatEdge = gd.getOneEdgeFromRegion(region)
        var yieldEdge = this.getYieldEdgeForRegion(region)

        if (!yieldEdge || gd.xy(yieldEdge.x, yieldEdge.y) !== gd.EDGE_WILL)
            return eatEdge

        var N = 15
        var eatTotal = 0, yieldTotal = 0
        for (var i = 0; i < N; i++) {
            var simEat = gd.clone()
            simEat.putxy(eatEdge.x, eatEdge.y)
            this.simToEnd(simEat)
            eatTotal += simEat.player[myId].score - simEat.player[1-myId].score
        }
        for (var i = 0; i < N; i++) {
            var simYield = gd.clone()
            simYield.putxy(yieldEdge.x, yieldEdge.y)
            this.simToEnd(simYield)
            yieldTotal += simYield.player[myId].score - simYield.player[1-myId].score
        }

        return eatTotal >= yieldTotal ? eatEdge : yieldEdge
    }

    // multi-region: evaluate via rollout with conservative margin
    var options = this.collectEndgameOptions()
    if (options.length <= 1)
        return OffensiveKeeperAI.prototype.tryKeepOffensive.call(this)

    var N = Math.max(1, Math.floor(24 / options.length))
    var bestEdge = options[0].edge
    var bestScore = -Infinity
    var bestEatEdge = null
    var bestEatScore = -Infinity

    for (var i = 0; i < options.length; i++) {
        var total = 0
        for (var j = 0; j < N; j++) {
            var sim = gd.clone()
            sim.putxy(options[i].edge.x, options[i].edge.y)
            this.simToEnd(sim)
            total += sim.player[myId].score - sim.player[1-myId].score
        }
        var avg = total / N
        if (avg > bestScore) {
            bestScore = avg
            bestEdge = options[i].edge
        }
        if (!options[i].isYield && avg > bestEatScore) {
            bestEatScore = avg
            bestEatEdge = options[i].edge
        }
    }

    // conservative: only yield if clearly better than best eat
    var isBestYield = false
    for (var i = 0; i < options.length; i++) {
        if (options[i].edge.x === bestEdge.x && options[i].edge.y === bestEdge.y) {
            isBestYield = options[i].isYield
            break
        }
    }

    if (isBestYield && bestEatEdge && bestScore <= bestEatScore + 2) {
        return bestEatEdge
    }

    return bestEdge
}

RolloutAI.prototype.collectEndgameOptions = function() {
    var gd = this.gameData
    var result = []
    var seen = {}

    for (var si = 0; si < gd.scoreRegion.length && result.length < 6; si++) {
        var ri = gd.scoreRegion[si]
        var region = gd.connectedRegion[ri]
        if (!region) continue
        var e = gd.getOneEdgeFromRegion(region)
        var key = e.x + ',' + e.y
        if (!seen[key]) {
            seen[key] = true
            result.push({edge: e, regionIndex: ri})
        }
    }

    for (var ii in gd.connectedRegion) {
        if (result.length >= 10) break
        var reg = gd.connectedRegion[ii]
        if (!reg) continue
        var ye = this.getYieldEdgeForRegion(reg)
        if (!ye || gd.xy(ye.x, ye.y) !== gd.EDGE_WILL) continue
        var key = ye.x + ',' + ye.y
        if (!seen[key]) {
            seen[key] = true
            result.push({edge: ye, regionIndex: reg.index, isYield: true})
        }
    }

    return result
}
