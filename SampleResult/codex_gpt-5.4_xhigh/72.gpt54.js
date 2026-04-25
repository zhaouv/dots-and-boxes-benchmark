////////////////// RolloutAI //////////////////
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    this.rolloutPolicy = new OffensiveKeeperAI()
    this.safeCandidateLimit = 15
    this.rolloutSalt = null
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

RolloutAI.prototype.getMoveKey=function(where){
    return where.x+','+where.y
}

RolloutAI.prototype.cloneMove=function(where){
    return {'x':where.x,'y':where.y}
}

RolloutAI.prototype.getOffensiveKeeperWhere=function(gameData){
    this.rolloutPolicy.gameData=gameData
    return this.rolloutPolicy.where()
}

RolloutAI.prototype.getBoardSeedBase=function(gameData){
    var hash=2166136261
    hash^=gameData.playerId
    hash=Math.imul(hash,16777619)
    hash^=gameData.player[0].score
    hash=Math.imul(hash,16777619)
    hash^=gameData.player[1].score
    hash=Math.imul(hash,16777619)
    for(var yy=0;yy<gameData.map.length;yy++){
        var row=gameData.map[yy]
        for(var xx=0;xx<row.length;xx++){
            hash^=(row[xx]+2048)
            hash=Math.imul(hash,16777619)
        }
    }
    return hash>>>0
}

RolloutAI.prototype.getRolloutSeedBase=function(gameData){
    return (this.getBoardSeedBase(gameData)^this.getRolloutSalt())>>>0
}

RolloutAI.prototype.runWithSeed=function(seed, callback){
    var oldRandom=Math.random
    var state=seed>>>0
    Math.random=function(){
        state=(Math.imul(state,1664525)+1013904223)>>>0
        return state/4294967296
    }
    try{
        return callback()
    } finally {
        Math.random=oldRandom
    }
}

RolloutAI.prototype.evaluateTerminal=function(gameData){
    var myScore=gameData.player[this.playerId].score
    var oppScore=gameData.player[1-this.playerId].score
    var diff=myScore-oppScore
    if(gameData.winnerId===this.playerId)return 10000+diff
    if(gameData.winnerId===1-this.playerId)return -10000+diff
    return diff
}

RolloutAI.prototype.simulateToEnd=function(gameData, firstMove){
    var sim=gameData.clone()
    if(firstMove){
        sim.putxy(firstMove.x,firstMove.y)
    }
    var maxStep=(2*sim.xsize+1)*(2*sim.ysize+1)
    var step=0
    while(sim.winnerId==null && step<maxStep){
        var where=this.getOffensiveKeeperWhere(sim)
        if(!where)break
        sim.putxy(where.x,where.y)
        step++
    }
    return this.evaluateTerminal(sim)
}

RolloutAI.prototype.evaluateMoveByRollout=function(gameData, where, seedBase, rolloutCount){
    var total=0
    var self=this
    for(var ii=0;ii<rolloutCount;ii++){
        total+=this.runWithSeed((seedBase+Math.imul(ii+1,2654435761))>>>0,function(){
            return self.simulateToEnd(gameData, where)
        })
    }
    return total/rolloutCount
}

RolloutAI.prototype.getYieldEdgeFromRegion=function(gameData, region){
    if(!region)return null
    if(region.isRing){
        if(region.block.length!==4)return null
        return {
            'x':(region.block[1].x+region.block[2].x)/2,
            'y':(region.block[1].y+region.block[2].y)/2
        }
    }
    if(region.block.length!==2)return null
    var stack=region.block
    var p1=1
    if(gameData.xy(stack[0].x,stack[0].y)!==gameData.SCORE_3){
        p1=0
    }
    var directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
    for(var ii=0,d;d=directions[ii];ii++){
        var xx=stack[p1].x+d.x
        var yy=stack[p1].y+d.y
        var xxx=stack[p1].x+2*d.x
        var yyy=stack[p1].y+2*d.y
        if(gameData.xy(xx,yy)!==gameData.EDGE_USED && gameData.xy(xxx,yyy)==='out range'){
            return {'x':xx,'y':yy}
        }
    }
    return null
}

RolloutAI.prototype.getSafeEdgePriority=function(gameData, where){
    var directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
    var score=0
    for(var ii=0,d;d=directions[ii];ii++){
        var cell=gameData.xy(where.x+d.x,where.y+d.y)
        if(cell===gameData.SCORE_1)score+=10
        else if(cell===gameData.SCORE_0)score+=3
    }
    if(where.x===0 || where.x===2*gameData.xsize || where.y===0 || where.y===2*gameData.ysize){
        score-=1
    }
    score-=(Math.abs(where.x-gameData.xsize)+Math.abs(where.y-gameData.ysize))/1000
    return score
}

RolloutAI.prototype.sampleSafeEdges=function(gameData){
    var edges=gameData.getAllEdges(gameData.EDGE_NOT)
    if(edges.length<=this.safeCandidateLimit)return edges
    var annotated=[]
    for(var ii=0;ii<edges.length;ii++){
        annotated.push({
            where:edges[ii],
            priority:this.getSafeEdgePriority(gameData,edges[ii])
        })
    }
    annotated.sort(function(a,b){
        if(b.priority!==a.priority)return b.priority-a.priority
        if(a.where.y!==b.where.y)return a.where.y-b.where.y
        return a.where.x-b.where.x
    })
    var result=[]
    var seen={}
    var frontCount=Math.min(8,this.safeCandidateLimit,annotated.length)
    for(var jj=0;jj<frontCount;jj++){
        var move=annotated[jj].where
        result.push(move)
        seen[this.getMoveKey(move)]=true
    }
    if(result.length>=this.safeCandidateLimit)return result
    var tailSlots=this.safeCandidateLimit-result.length
    var span=annotated.length-frontCount
    for(var kk=0;kk<tailSlots && span>0;kk++){
        var index=frontCount+Math.floor((kk+0.5)*span/tailSlots)
        if(index>=annotated.length)index=annotated.length-1
        var move=annotated[index].where
        var key=this.getMoveKey(move)
        if(seen[key])continue
        result.push(move)
        seen[key]=true
    }
    for(var mm=0;mm<annotated.length && result.length<this.safeCandidateLimit;mm++){
        var move=annotated[mm].where
        var key=this.getMoveKey(move)
        if(seen[key])continue
        result.push(move)
        seen[key]=true
    }
    return result
}

RolloutAI.prototype.pickSafeEdge=function(gameData){
    var candidates=this.sampleSafeEdges(gameData)
    if(candidates.length===1)return this.cloneMove(candidates[0])
    var remaining=gameData.edgeCount[gameData.EDGE_NOW]+gameData.edgeCount[gameData.EDGE_NOT]+gameData.edgeCount[gameData.EDGE_WILL]
    var rolloutCount=1
    if(remaining<=20 && candidates.length<=10)rolloutCount=2
    if(remaining<=12 && candidates.length<=6)rolloutCount=3
    var seedBase=this.getRolloutSeedBase(gameData)
    var bestWhere=this.cloneMove(candidates[0])
    var bestScore=-Infinity
    var bestPriority=-Infinity
    for(var ii=0;ii<candidates.length;ii++){
        var where=candidates[ii]
        var score=this.evaluateMoveByRollout(gameData,where,seedBase,rolloutCount)
        var priority=this.getSafeEdgePriority(gameData,where)
        if(score>bestScore || (score===bestScore && priority>bestPriority)){
            bestScore=score
            bestPriority=priority
            bestWhere=this.cloneMove(where)
        }
    }
    return bestWhere
}

RolloutAI.prototype.pickSingleRegionMove=function(gameData){
    var region=gameData.connectedRegion[gameData.scoreRegion[0]]
    if(!region)return this.getOffensiveKeeperWhere(gameData)
    var eat=gameData.getOneEdgeFromRegion(region)
    var yieldEdge=this.getYieldEdgeFromRegion(gameData,region)
    if(!yieldEdge)return eat
    var remaining=gameData.edgeCount[gameData.EDGE_NOW]+gameData.edgeCount[gameData.EDGE_WILL]
    var rolloutCount=2
    if(remaining<=6)rolloutCount=3
    var seedBase=this.getRolloutSeedBase(gameData)
    var eatScore=this.evaluateMoveByRollout(gameData,eat,seedBase,rolloutCount)
    var yieldScore=this.evaluateMoveByRollout(gameData,yieldEdge,seedBase,rolloutCount)
    if(yieldScore>eatScore)return yieldEdge
    if(eatScore>yieldScore)return eat
    return this.getOffensiveKeeperWhere(gameData)
}

RolloutAI.prototype.where=function(){
    var gameData=this.gameData
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        if(gameData.edgeCount[gameData.EDGE_NOT]===0 && gameData.scoreRegion.length===1){
            return this.pickSingleRegionMove(gameData)
        }
        return this.getOffensiveKeeperWhere(gameData)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this.pickSafeEdge(gameData)
    }
    return this.getOffensiveKeeperWhere(gameData)
}
