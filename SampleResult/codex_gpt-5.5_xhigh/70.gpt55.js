
////////////////// RolloutAI //////////////////
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    return this
}
RolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
RolloutAI.prototype.constructor = RolloutAI

RolloutAI.prototype.maxRolloutCandidates=15
RolloutAI.prototype.maxScoreCandidates=12
RolloutAI.prototype.rolloutRepeats=2

RolloutAI.prototype.edgeKey=function(edge){
    return edge.x+','+edge.y
}

RolloutAI.prototype.firstEdge=function(gameData,number){
    for(var jj=0;jj<2*gameData.ysize+1;jj++){
        for(var ii=0;ii<2*gameData.xsize+1;ii++){
            if(gameData.xy(ii,jj)===number)return {'x':ii,'y':jj};
        }
    }
    return null
}

RolloutAI.prototype.addCandidate=function(candidates,seen,edge){
    if(!edge || edge.x==null || edge.y==null)return;
    var key=this.edgeKey(edge)
    if(seen[key])return;
    seen[key]=true
    candidates.push({'x':edge.x,'y':edge.y})
}

RolloutAI.prototype.sampleEdges=function(edges,limit){
    if(edges.length<=limit)return edges.slice()
    var result=[]
    var used={}
    var step=edges.length/limit
    for(var ii=0;ii<limit;ii++){
        var index=Math.floor(ii*step)
        if(index>=edges.length)index=edges.length-1;
        var edge=edges[index]
        var key=this.edgeKey(edge)
        if(!used[key]){
            used[key]=true
            result.push(edge)
        }
    }
    for(var guard=0;result.length<limit && guard<edges.length*2;guard++){
        var edge=edges[this.rand(edges.length)]
        var key=this.edgeKey(edge)
        if(!used[key]){
            used[key]=true
            result.push(edge)
        }
    }
    return result
}

RolloutAI.prototype.getSafeCandidates=function(gameData){
    var seen={}
    var candidates=[]
    var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_NOT)
    for(var ii=0;ii<grouped.length;ii++){
        this.addCandidate(candidates,seen,grouped[ii])
    }
    var all=gameData.getAllEdges(gameData.EDGE_NOT)
    var sampled=this.sampleEdges(all,this.maxRolloutCandidates)
    for(var jj=0;jj<sampled.length;jj++){
        this.addCandidate(candidates,seen,sampled[jj])
    }
    if(candidates.length>this.maxRolloutCandidates)candidates=candidates.slice(0,this.maxRolloutCandidates);
    return candidates
}

RolloutAI.prototype.getScoreCandidates=function(gameData){
    var seen={}
    var candidates=[]
    for(var ii=0;ii<gameData.scoreRegion.length;ii++){
        var region=gameData.connectedRegion[gameData.scoreRegion[ii]]
        if(region)this.addCandidate(candidates,seen,gameData.getOneEdgeFromRegion(region));
    }
    var all=gameData.getAllEdges(gameData.EDGE_NOW)
    var sampled=this.sampleEdges(all,this.maxScoreCandidates)
    for(var jj=0;jj<sampled.length;jj++){
        this.addCandidate(candidates,seen,sampled[jj])
    }
    if(candidates.length>this.maxScoreCandidates)candidates=candidates.slice(0,this.maxScoreCandidates);
    return candidates
}

RolloutAI.prototype.tryYieldEdge=function(gameData,region){
    var stack=region.block
    if(region.isRing && region.block.length===4){
        return {'x':(stack[1].x+stack[2].x)/2,'y':(stack[1].y+stack[2].y)/2}
    }
    if(!region.isRing && region.block.length===2){
        var p1=1
        if(gameData.xy(stack[0].x,stack[0].y)!==gameData.SCORE_3){
            p1=0
        }
        var directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
        for(var ii=0,d;d=directions[ii];ii++){
            var xx=stack[p1].x+d.x, yy=stack[p1].y+d.y
            var xxx=stack[p1].x+2*d.x, yyy=stack[p1].y+2*d.y
            if(gameData.xy(xx,yy)!==gameData.EDGE_USED && gameData.xy(xxx,yyy)==='out range'){
                return {'x':xx,'y':yy}
            }
        }
    }
    return null
}

RolloutAI.prototype.getEndgameScoreCandidates=function(gameData){
    var candidates=this.getScoreCandidates(gameData)
    if(gameData.edgeCount[gameData.EDGE_NOT]!==0)return candidates;
    if(gameData.scoreRegion.length!==1)return candidates;
    var region=gameData.connectedRegion[gameData.scoreRegion[0]]
    if(!region)return candidates;
    var isHandout=(region.isRing && region.block.length===4) || (!region.isRing && region.block.length===2)
    if(!isHandout)return candidates;
    var seen={}
    var result=[]
    for(var ii=0;ii<candidates.length;ii++){
        this.addCandidate(result,seen,candidates[ii])
    }
    this.addCandidate(result,seen,this.tryYieldEdge(gameData,region))
    return result
}

RolloutAI.prototype.okRolloutWhere=function(gameData){
    var number=gameData.EDGE_NOW
    if(gameData.edgeCount[gameData.EDGE_NOW])number=gameData.EDGE_NOW;
    else if(gameData.edgeCount[gameData.EDGE_NOT])number=gameData.EDGE_NOT;
    else number=gameData.EDGE_WILL;

    if(number!==gameData.EDGE_WILL){
        if(number===gameData.EDGE_NOW && gameData.edgeCount[gameData.EDGE_NOT]===0){
            return this.okTryKeepOffensive(gameData)
        }
        return this.firstEdge(gameData,number)
    }
    var minRegion=gameData.getMinConnectedRegion()
    if(minRegion)return gameData.getOneEdgeFromRegion(minRegion);
    return this.firstEdge(gameData,gameData.EDGE_WILL)
}

RolloutAI.prototype.okTryKeepOffensive=function(gameData){
    if(!gameData.scoreRegion.length)return this.firstEdge(gameData,gameData.EDGE_NOW);
    var eatOne=gameData.getOneEdgeFromRegionIndex(gameData.scoreRegion[0])
    if(gameData.regionNum===1)return eatOne;

    var regions={}
    for(var ii in gameData.connectedRegion){
        var region=gameData.connectedRegion[ii]
        if(!region)continue;
        var len=region.block.length
        regions[len]=regions[len]||[]
        regions[len].push(region.index)
    }

    if(regions[1]){
        for(var jj=0;jj<regions[1].length;jj++){
            var regionIndex=regions[1][jj]
            if(gameData.scoreRegion.indexOf(regionIndex)!==-1)return gameData.getOneEdgeFromRegionIndex(regionIndex);
        }
    }

    if(regions[2] && gameData.scoreRegion.length>1){
        for(var kk=0;kk<regions[2].length;kk++){
            var regionIndex2=regions[2][kk]
            if(gameData.scoreRegion.indexOf(regionIndex2)!==-1)return gameData.getOneEdgeFromRegionIndex(regionIndex2);
        }
    }

    if(gameData.scoreRegion.length>2){
        for(var aa in gameData.scoreRegion){
            var region3=gameData.connectedRegion[gameData.scoreRegion[aa]]
            if(region3.isRing)return gameData.getOneEdgeFromRegion(region3);
        }
        return eatOne
    }

    if(gameData.scoreRegion.length===2 && gameData.connectedRegion[gameData.scoreRegion[1]].isRing)return gameData.getOneEdgeFromRegionIndex(gameData.scoreRegion[1]);
    if(gameData.scoreRegion.length===2)return eatOne;

    var region4=gameData.connectedRegion[gameData.scoreRegion[0]]
    if(region4.isRing && region4.block.length!==4)return eatOne;
    if(!region4.isRing && region4.block.length!==2)return eatOne;

    return this.tryYieldEdge(gameData,region4) || eatOne
}

RolloutAI.prototype.rolloutScore=function(gameData,myPlayerId,firstMove){
    var total=0
    var rolloutAI=RolloutAI._offensiveKeeperRolloutAI
    if(!rolloutAI){
        rolloutAI=new OffensiveKeeperAI()
        RolloutAI._offensiveKeeperRolloutAI=rolloutAI
    }
    for(var repeat=0;repeat<this.rolloutRepeats;repeat++){
        var sim=gameData.clone()
        sim.putxy(firstMove.x,firstMove.y)
        var guard=0
        while(sim.winnerId==null && guard<300){
            rolloutAI.gameData=sim
            try {
                var where=OffensiveKeeperAI.prototype.where.call(rolloutAI)
            } catch(e) {
                var where=this.okRolloutWhere(sim)
            }
            if(!where || where.x==null || where.y==null)break;
            sim.putxy(where.x,where.y)
            guard++
        }
        var opponentId=1-myPlayerId
        var diff=sim.player[myPlayerId].score-sim.player[opponentId].score
        if(sim.winnerId===myPlayerId)total+=1000+diff;
        else if(sim.winnerId===opponentId)total+=-1000+diff;
        else total+=diff;
    }
    return total
}

RolloutAI.prototype.chooseByRollout=function(candidates){
    if(!candidates.length)return null;
    if(candidates.length===1)return candidates[0];
    var gameData=this.gameData
    var myPlayerId=gameData.playerId
    var best=candidates[0]
    var bestScore=-Infinity
    for(var ii=0;ii<candidates.length;ii++){
        var edge=candidates[ii]
        var score=this.rolloutScore(gameData,myPlayerId,edge)
        if(score>bestScore){
            bestScore=score
            best=edge
        }
    }
    return best
}

RolloutAI.prototype.where=function(){
    var gameData=this.gameData
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        return this.chooseByRollout(this.getEndgameScoreCandidates(gameData)) || OffensiveKeeperAI.prototype.where.call(this)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this.chooseByRollout(this.getSafeCandidates(gameData)) || OffensiveKeeperAI.prototype.where.call(this)
    }
    if(gameData.edgeCount[gameData.EDGE_WILL]){
        return OffensiveKeeperAI.prototype.where.call(this)
    }
    return OffensiveKeeperAI.prototype.where.call(this)
}
