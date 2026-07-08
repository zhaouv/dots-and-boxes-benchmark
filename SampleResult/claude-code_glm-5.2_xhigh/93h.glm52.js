
////////////////// RolloutAI //////////////////
//
// RolloutAI is a simulation-based AI that extends OffensiveKeeperAI.
//
// Design (see REPORT.md for the full reasoning):
//
//  * Opening (safe moves exist, no free box): for each candidate safe edge,
//    simulate the rest of the game and pick the edge with the best average
//    final score-difference. Variance is slashed with Common Random Numbers
//    (the same random opening sequence is reused across candidates for a given
//    rollout index), so a small R gives a clean ranking.
//
//  * Robust evaluation: each candidate is scored under TWO opponent models and
//    we take the minimum (worst case) -- "me" always uses the strong
//    OffensiveKeeperAI control endgame; the opponent is modelled once as a
//    greedy taker (matches GreedyRandomAI) and once with OffensiveKeeperAI
//    (matches OffensiveKeeperAI). This picks moves that win against both, which
//    is what makes the public gates (100% vs GR, >=95% vs OK) hold together.
//
//  * Endgame: OffensiveKeeperAI's control play, with one surgical fix -- when
//    it would "yield" (decline free boxes to keep the offensive) we instead
//    compare take-vs-yield by a quick rollout, so we never throw boxes away to
//    a greedy opponent that simply takes them.
//
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    this.rolloutSalt=null
    return this
}
RolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
RolloutAI.prototype.constructor = RolloutAI

RolloutAI.prototype.getRolloutSalt=function(){
    if(this.rolloutSalt==null){
        var salt=(Math.random()*4294967296)>>>0
        if(this.playerId!=null){
            salt^=Math.imul(this.playerId+1,1597334677)
        }
        this.rolloutSalt=salt>>>0
    }
    return this.rolloutSalt
}

// ============ fast clone (extend GameData; gamedata.js is protected) ============
// The built-in GameData.clone uses a slow recursive cloneObj. This specialized
// copy knows the exact shape of GameData and avoids instanceof / for-in cost,
// which matters because every rollout forks the position once.
GameData.prototype.fastClone = function(){
    var g = new GameData()
    g.xsize = this.xsize
    g.ysize = this.ysize
    g.winScore = this.winScore
    g.totalScore = this.totalScore
    g.playerId = this.playerId
    g.winnerId = this.winnerId
    g.endImmediately = this.endImmediately
    g.regionNum = this.regionNum
    g.maxIndex = this.maxIndex
    g.player = [
        {score:this.player[0].score, id:0},
        {score:this.player[1].score, id:1}
    ]
    var nrows = this.map.length
    g.map = new Array(nrows)
    for (var y=0;y<nrows;y++){
        var sr=this.map[y], cols=sr.length, dr=new Array(cols)
        for (var x=0;x<cols;x++) dr[x]=sr[x]
        g.map[y]=dr
    }
    if (this.area){
        var ar=this.area.length
        g.area=new Array(ar)
        for (var y=0;y<ar;y++){
            var sr=this.area[y], cols=sr.length, dr=new Array(cols)
            for (var x=0;x<cols;x++) dr[x]=sr[x]
            g.area[y]=dr
        }
    }
    g.edgeCount={}
    for (var k in this.edgeCount) g.edgeCount[k]=this.edgeCount[k]
    g.scoreCount={}
    for (var k in this.scoreCount) g.scoreCount[k]=this.scoreCount[k]
    if (this.scoreRegion) g.scoreRegion=this.scoreRegion.slice()
    g.connectedRegion={}
    for (var idx in this.connectedRegion){
        var r=this.connectedRegion[idx]
        if(!r){ g.connectedRegion[idx]=null; continue }
        var blk=r.block, n=blk.length, nblk=new Array(n)
        for (var i=0;i<n;i++){ var p=blk[i]; nblk[i]={x:p.x,y:p.y} }
        g.connectedRegion[idx]={block:nblk, isRing:r.isRing, index:r.index}
    }
    return g
}

// ============ tunable parameters ============
RolloutAI.prototype.RO_MAX_CANDIDATES = 16   // max safe-move candidates per opening decision
RolloutAI.prototype.RO_ROLLOUTS       = 18   // rollouts per candidate per opponent model
RolloutAI.prototype.RO_THRESH         = 30   // only rollout when EDGE_NOT <= this; earlier -> cheap safe move
RolloutAI.prototype.RO_POLICY         = 'robust'  // 'crn' (asymmetric greedy opp) | 'robust' (min of greedy & OK)
RolloutAI.prototype.RO_YIELD_R        = 8    // rollouts for the take-vs-yield endgame check

// ============ opponent models used inside rollouts ============
// Greedy model: take any free box, else a random safe edge, else sacrifice the
// smallest region. Models GreedyRandomAI's endgame.
RolloutAI.prototype.greedyWhere = function(gd){
    if(gd.edgeCount[gd.EDGE_NOW]>0){
        if(gd.scoreRegion.length>0) return gd.getOneEdgeFromRegionIndex(gd.scoreRegion[0])
        return gd.getAllEdges(gd.EDGE_NOW)[0]
    }
    if(gd.edgeCount[gd.EDGE_NOT]>0) return this.getRandWhere(gd.EDGE_NOT)
    return gd.getOneEdgeFromRegion(gd.getMinConnectedRegion())
}

// cached OffensiveKeeperAI used as the strong endgame model (stateless except gameData)
RolloutAI.prototype._rolloutAI = function(){
    if(!this.__rollAI) this.__rollAI = new OffensiveKeeperAI()
    return this.__rollAI
}

// ---- Common Random Numbers ----
// The rollout's only variance source is the random opening (the endgame is
// deterministic under either model). Driving all random choices from a local
// RNG seeded identically across candidates (for the same rollout index r)
// correlates candidate outcomes and slashes the variance of the ranking,
// preserving the random policy's unbiasedness at a small R.
RolloutAI.prototype._makeRng = function(seed){
    var s = (seed>>>0)||1
    return function(){ s=(s*1664525+1013904223)>>>0; return s/4294967296 }
}
RolloutAI.prototype._saltedRng = function(seed){
    return this._makeRng((seed^this.getRolloutSalt())>>>0)
}
RolloutAI.prototype._randEdge = function(sim, type, rng){
    var count = sim.edgeCount[type]
    if(!count) return null
    var idx = (rng()*count)|0
    if(idx>=count)idx=count-1
    var Y=2*sim.ysize+1, X=2*sim.xsize+1
    for(var y=0;y<Y;y++){ var row=sim.map[y]
        for(var x=0;x<X;x++){ if(row[x]===type){ if(!idx)return {x:x,y:y}; idx-- } }
    }
    return null
}
// Rollout step. Opening/transition moves are random (via rng, for CRN). In the
// endgame, "me" (asymMe) uses the strong OffensiveKeeperAI control play while the
// opponent uses the greedy model; asymMe==null => both use OffensiveKeeperAI.
RolloutAI.prototype.crnWhere = function(sim, rng, asymMe){
    var now=sim.edgeCount[sim.EDGE_NOW], not=sim.edgeCount[sim.EDGE_NOT]
    if(now>0 && not>0) return this._randEdge(sim, sim.EDGE_NOW, rng)   // transition: take the free box
    if(not>0) return this._randEdge(sim, sim.EDGE_NOT, rng)            // opening: random safe edge
    if(asymMe!=null && sim.playerId!==asymMe) return this.greedyWhere(sim)
    var pol=this._rolloutAI(); pol.gameData=sim; return pol.where()
}

// pick diverse safe-edge candidates for an opening decision
RolloutAI.prototype._openingCandidates = function(gd){
    var all = gd.getAllEdges(gd.EDGE_NOT)
    if (all.length <= this.RO_MAX_CANDIDATES) return all
    var rng = this._saltedRng(gd.playerId*2246822519 + all.length*3266489917)
    for (var i=all.length-1;i>0;i--){           // Fisher-Yates (seeded), take cap
        var j=(rng()*(i+1))|0
        var t=all[i]; all[i]=all[j]; all[j]=t
    }
    return all.slice(0, this.RO_MAX_CANDIDATES)
}

// play `sim` out to terminal under the rollout policy (mutates sim)
RolloutAI.prototype._rolloutToEnd = function(sim, policy, rng, asymMe){
    var guard=0
    while (sim.winnerId==null && guard++<400){
        var w
        if(policy==='crn') w = this.crnWhere(sim, rng, asymMe)
        else { var pol=this._rolloutAI(); pol.gameData=sim; w=pol.where() }
        if (!w || w.x==null) break
        sim.putxy(w.x, w.y)
    }
}

// average rollout score-difference for a candidate.
// model: 'greedy' => opponent modelled greedily (asymMe=me); 'ok' => symmetric OK.
RolloutAI.prototype._evalCandidate = function(gd, c, me, R, model){
    var asymMe = (model==='greedy') ? me : null
    var sum = 0
    for (var r=0; r<R; r++){
        var sim = gd.fastClone()
        sim.putxy(c.x, c.y)            // EDGE_NOT: no score, turn flips
        var rng = this._saltedRng(r*2654435761 + 40503)   // CRN: same sequence across candidates
        this._rolloutToEnd(sim, 'crn', rng, asymMe)
        sum += sim.player[me].score - sim.player[1-me].score
    }
    return sum / R
}

// choose the best move among candidates. 'robust' takes the min over the two
// opponent models so the chosen move wins against both a greedy and an OK-style foe.
RolloutAI.prototype._pickMove = function(gd, cands, R, policy){
    if(cands.length===1) return cands[0]
    var me = gd.playerId
    var best = cands[0], bestScore = -1e9
    for (var ci=0; ci<cands.length; ci++){
        var c = cands[ci]
        var score = (policy==='robust')
            ? Math.min(this._evalCandidate(gd,c,me,R,'greedy'), this._evalCandidate(gd,c,me,R,'ok'))
            : this._evalCandidate(gd,c,me,R, policy==='crn'?'greedy':'ok')
        if (score > bestScore + 1e-9){ bestScore = score; best = c }
    }
    return best
}

// Endgame move: OffensiveKeeperAI's control logic, but when it would YIELD
// (decline free boxes to keep the offensive) we instead pick take-vs-yield by
// a quick rollout. This avoids the degenerate case where OK repeatedly yields
// short regions and a greedy opponent simply takes them all.
RolloutAI.prototype.endgameWhere = function(gd){
    var okMove = OffensiveKeeperAI.prototype.where.call(this)
    if(gd.edgeCount[gd.EDGE_NOW]>0 && gd.xy(okMove.x, okMove.y)===gd.EDGE_WILL){
        var cands=[], seen={}
        var push=function(w){ if(w&&w.x!=null){var k=w.x+','+w.y; if(!seen[k]){seen[k]=1;cands.push(w)}} }
        for(var i=0;i<gd.scoreRegion.length;i++)
            push(gd.getOneEdgeFromRegionIndex(gd.scoreRegion[i]))
        push(okMove)  // the yield option
        if(cands.length>=2) return this._pickMove(gd, cands, this.RO_YIELD_R, 'ok')
    }
    return okMove
}

RolloutAI.prototype.where = function(){
    var gd = this.gameData
    var now=gd.edgeCount[gd.EDGE_NOW], not=gd.edgeCount[gd.EDGE_NOT]
    // pure opening: no free box, safe moves remain
    if (now===0 && not>0){
        if (not <= this.RO_THRESH){
            return this._pickMove(gd, this._openingCandidates(gd), this.RO_ROLLOUTS, this.RO_POLICY)
        }
        return this.getRandWhere(gd.EDGE_NOT)   // very early: cheap safe move (still no give-away)
    }
    // scoring / transition / sacrifice
    return this.endgameWhere(gd)
}
