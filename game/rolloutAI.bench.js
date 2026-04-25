
////////////////// BenchRolloutAI //////////////////
////////////////// BenchRolloutAI //////////////////
BenchRolloutAI=function(){
    OffensiveKeeperAI.call(this)
    this.rolloutCandidateMax=15
    this.rolloutSalt=null
    return this
}
BenchRolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
BenchRolloutAI.prototype.constructor = BenchRolloutAI

BenchRolloutAI.prototype.getRolloutSalt=function(){
    if(this.rolloutSalt==null){
        var salt=(Math.random()*4294967296)>>>0
        if(this.playerId!=null){
            salt^=Math.imul(this.playerId+1,1597334677)
        }
        this.rolloutSalt=salt>>>0
    }
    return this.rolloutSalt
}

BenchRolloutAI.prototype.hashGameData=function(gameData){
    var hash=2166136261>>>0
    hash=Math.imul(hash^gameData.playerId,16777619)>>>0
    hash=Math.imul(hash^gameData.player[0].score,16777619)>>>0
    hash=Math.imul(hash^gameData.player[1].score,16777619)>>>0
    for(var jj=0;jj<2*gameData.ysize+1;jj++){
        for(var ii=0;ii<2*gameData.xsize+1;ii++){
            hash=Math.imul(hash^(gameData.xy(ii,jj)+104729),16777619)>>>0
        }
    }
    return hash>>>0
}

BenchRolloutAI.prototype.getRolloutSeedBase=function(gameData){
    return (this.hashGameData(gameData)^this.getRolloutSalt())>>>0
}

BenchRolloutAI.prototype.makeRand=function(seed){
    var state=(seed>>>0)||1
    return function(n){
        state=(Math.imul(state,1664525)+1013904223)>>>0
        if(n==null)return state/4294967296
        if(!n)return 0
        return state%n
    }
}

BenchRolloutAI.prototype.edgeKey=function(edge){
    return edge.x+','+edge.y
}

BenchRolloutAI.prototype.addCandidateEdge=function(edges,seen,edge){
    if(!edge)return
    var key=this.edgeKey(edge)
    if(seen[key])return
    seen[key]=true
    edges.push(edge)
}

BenchRolloutAI.prototype.getCandidateMax=function(gameData){
    if(gameData.totalScore<=25)return 20
    return this.rolloutCandidateMax
}

BenchRolloutAI.prototype.sampleSafeEdges=function(gameData,maxCount,seed){
    var all=gameData.getAllEdges(gameData.EDGE_NOT)
    if(all.length<=maxCount)return all
    var edges=[]
    var seen={}
    var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_NOT)
    for(var ii=0;ii<grouped.length&&edges.length<maxCount;ii++){
        this.addCandidateEdge(edges,seen,grouped[ii])
    }
    var rand=this.makeRand(seed^2654435769)
    var pool=all.slice()
    for(var remain=pool.length;remain>0&&edges.length<maxCount;remain--){
        var index=rand(remain)
        var edge=pool[index]
        pool[index]=pool[remain-1]
        pool[remain-1]=edge
        this.addCandidateEdge(edges,seen,edge)
    }
    return edges
}

BenchRolloutAI.prototype.getRandWhereWithRand=function(gameData,number,rand){
    var count=gameData.edgeCount[number]
    if(!count)return null
    var index=rand(count)
    for(var jj=0;jj<2*gameData.ysize+1;jj++){
        for(var ii=0;ii<2*gameData.xsize+1;ii++){
            if(gameData.xy(ii,jj)===number){
                if(!index)return {'x':ii,'y':jj}
                index--
            }
        }
    }
    return null
}

BenchRolloutAI.prototype.okTryKeepOffensiveMove=function(gameData){
    var eatOne=gameData.getOneEdgeFromRegionIndex(gameData.scoreRegion[0])

    if(gameData.regionNum==1)return eatOne

    var regions={}
    for(var ii in gameData.connectedRegion){
        var region=gameData.connectedRegion[ii]
        if(!region)continue
        var len=region.block.length
        regions[len]=regions[len]||[]
        regions[len].push(region.index)
    }

    if(regions[1]){
        for(var jj=0;jj<regions[1].length;jj++){
            var regionIndex1=regions[1][jj]
            if(gameData.scoreRegion.indexOf(regionIndex1)!==-1){
                return gameData.getOneEdgeFromRegionIndex(regionIndex1)
            }
        }
    }

    if(regions[2]&&gameData.scoreRegion.length>1){
        for(var kk=0;kk<regions[2].length;kk++){
            var regionIndex2=regions[2][kk]
            if(gameData.scoreRegion.indexOf(regionIndex2)!==-1){
                return gameData.getOneEdgeFromRegionIndex(regionIndex2)
            }
        }
    }

    if(gameData.scoreRegion.length>2){
        for(var ll=0;ll<gameData.scoreRegion.length;ll++){
            var region3=gameData.connectedRegion[gameData.scoreRegion[ll]]
            if(region3.isRing)return gameData.getOneEdgeFromRegion(region3)
        }
        return eatOne
    }

    if(gameData.scoreRegion.length===2&&gameData.connectedRegion[gameData.scoreRegion[1]].isRing){
        return gameData.getOneEdgeFromRegionIndex(gameData.scoreRegion[1])
    }
    if(gameData.scoreRegion.length===2)return eatOne

    var region=gameData.connectedRegion[gameData.scoreRegion[0]]

    if(region.isRing&&region.block.length!==4)return eatOne
    if(!region.isRing&&region.block.length!==2)return eatOne

    var yieldEdge=this.getSingleRegionYieldMove(gameData,region)
    return yieldEdge||eatOne
}

BenchRolloutAI.prototype.okWhereWithRand=function(gameData,rand){
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        if(gameData.edgeCount[gameData.EDGE_NOT]===0){
            return this.okTryKeepOffensiveMove(gameData)
        }
        return this.getRandWhereWithRand(gameData,gameData.EDGE_NOW,rand)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this.getRandWhereWithRand(gameData,gameData.EDGE_NOT,rand)
    }
    return gameData.getOneEdgeFromRegion(gameData.getMinConnectedRegion())
}

BenchRolloutAI.prototype.getSingleRegionYieldMove=function(gameData,region){
    if(!region)return null
    var stack=region.block
    if(region.isRing){
        if(region.block.length!==4)return null
        return {'x':(stack[1].x+stack[2].x)/2,'y':(stack[1].y+stack[2].y)/2}
    }
    if(region.block.length!==2)return null
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
        if(gameData.xy(xx,yy)!==gameData.EDGE_USED&&gameData.xy(xxx,yyy)=='out range'){
            return {'x':xx,'y':yy}
        }
    }
    return null
}

BenchRolloutAI.prototype.playoutScore=function(gameData,seed,rootPlayerId){
    var rand=this.makeRand(seed)
    var limit=(2*gameData.xsize+1)*(2*gameData.ysize+1)+8
    while(gameData.winnerId==null&&limit>0){
        limit--
        var where=this.okWhereWithRand(gameData,rand)
        if(!where)break
        gameData.putxy(where.x,where.y)
    }
    var diff=gameData.player[rootPlayerId].score-gameData.player[1-rootPlayerId].score
    if(gameData.winnerId===rootPlayerId)return 10000+diff
    if(gameData.winnerId===1-rootPlayerId)return -10000+diff
    return diff
}

BenchRolloutAI.prototype.getSafeRolloutCount=function(gameData,candidateCount){
    var safeCount=gameData.edgeCount[gameData.EDGE_NOT]
    if(gameData.totalScore<=25){
        if(candidateCount>=12||safeCount>=24)return 2
        if(candidateCount>=6||safeCount>=12)return 3
        return 4
    }
    if(candidateCount>=12||safeCount>=36)return 1
    if(candidateCount>=6||safeCount>=18)return 2
    return 3
}

BenchRolloutAI.prototype.getDuelRolloutCount=function(gameData){
    var region=gameData.connectedRegion[gameData.scoreRegion[0]]
    if(gameData.totalScore<=25){
        if(region&&region.isRing)return 12
        return 10
    }
    if(region&&region.isRing)return 10
    return 8
}

BenchRolloutAI.prototype.scoreCandidate=function(gameData,edge,rolloutCount,seedBase,rootPlayerId){
    var after=gameData.clone()
    after.putxy(edge.x,edge.y)
    var total=0
    var tieBreak=after.edgeCount[after.EDGE_NOT]-after.scoreRegion.length*3-after.edgeCount[after.EDGE_WILL]
    for(var ii=0;ii<rolloutCount;ii++){
        var sim=rolloutCount===1&&ii===0?after:after.clone()
        var seed=seedBase
        seed^=Math.imul(edge.x+17,2246822519)
        seed^=Math.imul(edge.y+31,3266489917)
        seed^=Math.imul(ii+1,668265263)
        total+=this.playoutScore(sim,seed>>>0,rootPlayerId)
    }
    return {
        edge:edge,
        score:total,
        tieBreak:tieBreak,
    }
}

BenchRolloutAI.prototype.pickByRollout=function(gameData,candidates,rolloutCount,seedBase){
    if(candidates.length===1)return candidates[0]
    var rootPlayerId=gameData.playerId
    var best=null
    for(var ii=0;ii<candidates.length;ii++){
        var result=this.scoreCandidate(gameData,candidates[ii],rolloutCount,seedBase,rootPlayerId)
        if(
            best==null||
            result.score>best.score||
            (result.score===best.score&&result.tieBreak>best.tieBreak)
        ){
            best=result
        }
    }
    return best.edge
}

BenchRolloutAI.prototype.where=function(){
    var gameData=this.gameData

    if(!gameData.edgeCount[gameData.EDGE_NOW]&&gameData.edgeCount[gameData.EDGE_NOT]){
        var seedBase=this.getRolloutSeedBase(gameData)
        var candidates=this.sampleSafeEdges(gameData,this.getCandidateMax(gameData),seedBase)
        var rolloutCount=this.getSafeRolloutCount(gameData,candidates.length)
        return this.pickByRollout(gameData,candidates,rolloutCount,seedBase^374761393)
    }

    if(
        gameData.edgeCount[gameData.EDGE_NOW]&&
        gameData.edgeCount[gameData.EDGE_NOT]===0&&
        gameData.scoreRegion.length===1
    ){
        var region=gameData.connectedRegion[gameData.scoreRegion[0]]
        var yieldEdge=this.getSingleRegionYieldMove(gameData,region)
        if(yieldEdge){
            var eatEdge=gameData.getOneEdgeFromRegionIndex(gameData.scoreRegion[0])
            if(eatEdge.x!==yieldEdge.x||eatEdge.y!==yieldEdge.y){
                var duelSeedBase=this.getRolloutSeedBase(gameData)^1103515245
                var duelRolloutCount=this.getDuelRolloutCount(gameData)
                return this.pickByRollout(
                    gameData,
                    [eatEdge,yieldEdge],
                    duelRolloutCount,
                    duelSeedBase
                )
            }
        }
    }

    return GreedyRandomAI.prototype.where.call(this)
}
