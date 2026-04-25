
////////////////// RolloutAI //////////////////
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

RolloutAI.prototype._moveKey=function(move){
    return move.x+','+move.y
}

RolloutAI.prototype._dedupeMoves=function(moves){
    var seen={}
    var result=[]
    for(var ii=0,m;m=moves[ii];ii++){
        if(!m || m.x==null || m.y==null)continue
        var key=this._moveKey(m)
        if(seen[key])continue
        seen[key]=true
        result.push({x:m.x,y:m.y})
    }
    return result
}

RolloutAI.prototype._allPlayableEdges=function(gameData){
    var result=[]
    var types=[gameData.EDGE_NOW,gameData.EDGE_NOT,gameData.EDGE_WILL]
    for(var tt=0;tt<types.length;tt++){
        var edges=gameData.getAllEdges(types[tt])
        for(var ii=0,m;m=edges[ii];ii++)result.push(m)
    }
    return result
}

RolloutAI.prototype._scoreDiff=function(gameData,playerId){
    return gameData.player[playerId].score-gameData.player[1-playerId].score
}

RolloutAI.prototype._terminalValue=function(gameData,rootPlayer){
    if(gameData.winnerId==null)return null
    var diff=this._scoreDiff(gameData,rootPlayer)
    return (gameData.winnerId===rootPlayer?100000:-100000)+diff*100
}

RolloutAI.prototype._edgeStateKey=function(gameData){
    var s=[gameData.playerId,gameData.player[0].score,gameData.player[1].score].join(':')+'|'
    for(var y=0;y<2*gameData.ysize+1;y++){
        for(var x=(y+1)%2;x<2*gameData.xsize+1;x+=2){
            var v=gameData.xy(x,y)
            s+=(v===gameData.EDGE_USED?'1':'0')
        }
    }
    return s
}

RolloutAI.prototype._clonePut=function(gameData,move){
    var g=gameData.clone()
    try{
        g.putxy(move.x,move.y)
    } catch(e) {
        return null
    }
    return g
}

RolloutAI.prototype._regionHasScore=function(gameData,index){
    return gameData.scoreRegion.indexOf(~~index)!==-1 || gameData.scoreRegion.indexOf(String(index))!==-1
}

RolloutAI.prototype._regionEdges=function(gameData,region,edgeType){
    if(!region)return []
    var directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
    var moves=[]
    for(var ii=0,pt;pt=region.block[ii];ii++){
        for(var jj=0,d;d=directions[jj];jj++){
            var x=pt.x+d.x,y=pt.y+d.y
            if(gameData.xy(x,y)===edgeType)moves.push({x:x,y:y})
        }
    }
    return this._dedupeMoves(moves)
}

RolloutAI.prototype._scoreMoves=function(gameData,includeHandout){
    var moves=[]
    for(var ii=0,index;index=gameData.scoreRegion[ii];ii++){
        var region=gameData.connectedRegion[index]
        if(!region)continue
        moves.push(gameData.getOneEdgeFromRegion(region))
        if(gameData.edgeCount[gameData.EDGE_NOW]<=8){
            var nowEdges=this._regionEdges(gameData,region,gameData.EDGE_NOW)
            for(var jj=0,m;m=nowEdges[jj];jj++)moves.push(m)
        }
        if(includeHandout){
            var willEdges=this._regionEdges(gameData,region,gameData.EDGE_WILL)
            for(var kk=0,w;w=willEdges[kk];kk++)moves.push(w)
        }
    }
    if(moves.length===0)moves=gameData.getAllEdges(gameData.EDGE_NOW)
    return this._dedupeMoves(moves)
}

RolloutAI.prototype._openingMoves=function(gameData){
    var moves=[]
    for(var index in gameData.connectedRegion){
        var region=gameData.connectedRegion[index]
        if(!region)continue
        var edges=this._regionEdges(gameData,region,gameData.EDGE_WILL)
        if(edges.length<=8){
            for(var ii=0,m;m=edges[ii];ii++)moves.push(m)
        } else {
            edges.sort(function(a,b){
                return (Math.abs(a.x-gameData.xsize)+Math.abs(a.y-gameData.ysize))-
                    (Math.abs(b.x-gameData.xsize)+Math.abs(b.y-gameData.ysize))
            })
            moves.push(edges[0],edges[~~(edges.length/2)],edges[edges.length-1])
            moves.push(edges[~~(edges.length/3)],edges[~~(edges.length*2/3)])
        }
    }
    if(moves.length===0)moves=gameData.getAllEdges(gameData.EDGE_WILL)
    return this._dedupeMoves(moves)
}

RolloutAI.prototype._lateMoves=function(gameData){
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        return this._scoreMoves(gameData,gameData.edgeCount[gameData.EDGE_NOT]===0)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return gameData.getAllEdges(gameData.EDGE_NOT)
    }
    return this._openingMoves(gameData)
}

RolloutAI.prototype._componentSummary=function(gameData){
    var summary={
        big:0,
        small:0,
        ring:0,
        flexible:0,
        boxes:0,
        scoreRegions:gameData.scoreRegion.length
    }
    for(var index in gameData.connectedRegion){
        var region=gameData.connectedRegion[index]
        if(!region)continue
        var len=region.block.length
        summary.boxes+=len
        if(len<=2)summary.small++
        else summary.big++
        if(region.isRing)summary.ring++
        if(len>=3)summary.flexible++
        if(region.isRing && len>=4)summary.flexible++
    }
    return summary
}

RolloutAI.prototype._openerAfterSafeRuns=function(gameData){
    var safe=gameData.edgeCount[gameData.EDGE_NOT]
    return safe%2===0?gameData.playerId:1-gameData.playerId
}

RolloutAI.prototype._staticEval=function(gameData,rootPlayer){
    var terminal=this._terminalValue(gameData,rootPlayer)
    if(terminal!=null)return terminal
    var diff=this._scoreDiff(gameData,rootPlayer)
    var value=diff*900
    var summary=this._componentSummary(gameData)
    var boxesLeft=gameData.totalScore-gameData.player[0].score-gameData.player[1].score

    if(gameData.edgeCount[gameData.EDGE_NOW]){
        value+=(gameData.playerId===rootPlayer?1:-1)*(120+gameData.edgeCount[gameData.EDGE_NOW]*20)
    }

    if(gameData.edgeCount[gameData.EDGE_NOT]){
        var opener=this._openerAfterSafeRuns(gameData)
        value+=(opener===rootPlayer?-80:80)
        if(summary.flexible===0){
            value+=((gameData.edgeCount[gameData.EDGE_NOT]+summary.small)%2===0?30:-30)*
                (gameData.playerId===rootPlayer?1:-1)
        } else {
            value+=(summary.flexible%2===0?25:-25)*(gameData.playerId===rootPlayer?1:-1)
        }
    } else if(!gameData.edgeCount[gameData.EDGE_NOW]){
        value+=(gameData.playerId===rootPlayer?-70:70)
    }

    value+=(summary.big*18+summary.ring*10-summary.small*6)*(gameData.playerId===rootPlayer?1:-1)
    value+=boxesLeft*(diff>=0?1:-1)
    return value
}

RolloutAI.prototype._orderedMoves=function(gameData,moves,rootPlayer){
    var self=this
    var scored=[]
    for(var ii=0,m;m=moves[ii];ii++){
        var child=self._clonePut(gameData,m)
        if(!child)continue
        scored.push({move:m,score:self._staticEval(child,rootPlayer)})
    }
    scored.sort(function(a,b){return b.score-a.score})
    if(gameData.playerId!==rootPlayer)scored.reverse()
    var result=[]
    for(var jj=0,item;item=scored[jj];jj++)result.push(item.move)
    return result
}

RolloutAI.prototype._lateSearch=function(gameData,rootPlayer,depth,alpha,beta){
    this._searchNodes++
    var terminal=this._terminalValue(gameData,rootPlayer)
    if(terminal!=null)return terminal
    if(depth<=0 || this._searchNodes>this._searchBudget)return this._staticEval(gameData,rootPlayer)

    var key=this._edgeStateKey(gameData)+'|'+depth+'|'+rootPlayer
    if(this._searchMemo[key]!=null)return this._searchMemo[key]

    var moves=this._lateMoves(gameData)
    if(!moves.length)return this._staticEval(gameData,rootPlayer)
    moves=this._orderedMoves(gameData,moves,rootPlayer)
    if(!moves.length)return this._staticEval(gameData,rootPlayer)

    var maximizing=gameData.playerId===rootPlayer
    var best=maximizing?-Infinity:Infinity
    for(var ii=0,m;m=moves[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        var value=this._lateSearch(child,rootPlayer,depth-1,alpha,beta)
        if(maximizing){
            if(value>best)best=value
            if(best>alpha)alpha=best
            if(alpha>=beta)break
        } else {
            if(value<best)best=value
            if(best<beta)beta=best
            if(alpha>=beta)break
        }
    }
    this._searchMemo[key]=best
    return best
}

RolloutAI.prototype._chooseByLateSearch=function(gameData,rootPlayer,budget){
    var moves=this._lateMoves(gameData)
    if(!moves.length)return null
    if(moves.length===1)return moves[0]

    this._searchNodes=0
    this._searchBudget=budget||1600
    this._searchMemo={}

    var depth=gameData.edgeCount[gameData.EDGE_NOW]+gameData.edgeCount[gameData.EDGE_WILL]+gameData.edgeCount[gameData.EDGE_NOT]
    if(depth>34)depth=34
    moves=this._orderedMoves(gameData,moves,rootPlayer)
    if(!moves.length)return null

    var best=moves[0]
    var bestValue=gameData.playerId===rootPlayer?-Infinity:Infinity
    var alpha=-Infinity,beta=Infinity
    for(var ii=0,m;m=moves[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        var value=this._lateSearch(child,rootPlayer,depth-1,alpha,beta)
        if(gameData.playerId===rootPlayer){
            if(value>bestValue){
                bestValue=value
                best=m
            }
            if(value>alpha)alpha=value
        } else {
            if(value<bestValue){
                bestValue=value
                best=m
            }
            if(value<beta)beta=value
        }
    }
    return best
}

RolloutAI.prototype._safeShapeScore=function(gameData,rootPlayer){
    var terminal=this._terminalValue(gameData,rootPlayer)
    if(terminal!=null)return terminal
    if(!gameData.edgeCount[gameData.EDGE_NOT]){
        return this._staticEval(gameData,rootPlayer)
    }
    var summary=this._componentSummary(gameData)
    var value=this._staticEval(gameData,rootPlayer)
    var opener=this._openerAfterSafeRuns(gameData)
    value+=(opener===rootPlayer?-180:180)
    if(summary.flexible===0){
        value+=((gameData.edgeCount[gameData.EDGE_NOT]+summary.small)%2===0?90:-90)
    } else {
        value+=(summary.flexible%2===0?70:-70)
    }
    value-=gameData.edgeCount[gameData.EDGE_WILL]*2
    return value
}

RolloutAI.prototype._safeCandidates=function(gameData,rootPlayer,limit){
    var edges=gameData.getAllEdges(gameData.EDGE_NOT)
    if(edges.length<=limit)return edges
    var self=this
    var scored=[]
    for(var ii=0,m;m=edges[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        scored.push({move:m,score:this._safeShapeScore(child,rootPlayer)})
    }
    scored.sort(function(a,b){return b.score-a.score})
    if(!scored.length)return edges.slice(0,limit)
    var result=[]
    var take=Math.max(1,limit-4)
    for(var jj=0;jj<take && jj<scored.length;jj++)result.push(scored[jj].move)
    var step=Math.max(1,~~(scored.length/4))
    for(var kk=step-1;kk<scored.length && result.length<limit;kk+=step)result.push(scored[kk].move)
    return self._dedupeMoves(result).slice(0,limit)
}

RolloutAI.prototype._rng=function(state,n){
    state.seed=(Math.imul(state.seed,1664525)+1013904223)>>>0
    var v=state.seed/4294967296
    if(n==null)return v
    return ~~(v*n)
}

RolloutAI.prototype._randEdgeOfType=function(gameData,edgeType,state){
    var count=gameData.edgeCount[edgeType]
    if(!count)return null
    var index=this._rng(state,count)
    for(var y=0;y<2*gameData.ysize+1;y++){
        for(var x=0;x<2*gameData.xsize+1;x++){
            if(gameData.xy(x,y)===edgeType){
                if(!index)return {x:x,y:y}
                index--
            }
        }
    }
    return null
}

RolloutAI.prototype._hashGame=function(gameData){
    var h=2166136261
    var s=this._edgeStateKey(gameData)
    for(var ii=0;ii<s.length;ii++){
        h^=s.charCodeAt(ii)
        h=Math.imul(h,16777619)
    }
    return (h^this.getRolloutSalt())>>>0
}

RolloutAI.prototype._fastScoreMove=function(gameData,actor,state){
    if(gameData.edgeCount[gameData.EDGE_NOT]===0){
        try{
            return OffensiveKeeperAI.prototype.tryKeepOffensive.call({gameData:gameData})
        } catch(e) {
            return this._randEdgeOfType(gameData,gameData.EDGE_NOW,state)
        }
    }
    var moves=this._scoreMoves(gameData,gameData.edgeCount[gameData.EDGE_NOT]===0)
    var best=moves[0]
    var bestValue=-Infinity
    for(var ii=0,m;m=moves[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        var value=this._staticEval(child,actor)
        if(value>bestValue){
            bestValue=value
            best=m
        }
    }
    return best
}

RolloutAI.prototype._fastOpeningMove=function(gameData,actor,state){
    var minRegion=gameData.getMinConnectedRegion()
    if(minRegion)return gameData.getOneEdgeFromRegion(minRegion)
    var moves=this._openingMoves(gameData)
    var best=moves[0]
    var bestValue=-Infinity
    for(var ii=0,m;m=moves[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        var value=this._staticEval(child,actor)+this._rng(state)*10
        if(value>bestValue){
            bestValue=value
            best=m
        }
    }
    return best
}

RolloutAI.prototype._fastSafeMove=function(gameData,actor,state){
    var moves=this._safeCandidates(gameData,actor,Math.min(6,gameData.edgeCount[gameData.EDGE_NOT]))
    if(!moves.length)return null
    var scored=[]
    for(var ii=0,m;m=moves[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        scored.push({move:m,score:this._safeShapeScore(child,actor)+this._rng(state)*20})
    }
    scored.sort(function(a,b){return b.score-a.score})
    if(!scored.length)return moves[0]
    var pick=0
    if(scored.length>1 && this._rng(state)<0.18)pick=1+this._rng(state,Math.min(2,scored.length-1))
    return scored[pick].move
}

RolloutAI.prototype._policyMove=function(gameData,state){
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        if(state.opponentPolicy==='gr' && gameData.playerId!==state.rootPlayer){
            return this._randEdgeOfType(gameData,gameData.EDGE_NOW,state)
        }
        if(gameData.edgeCount[gameData.EDGE_NOT]===0){
            try{
                return OffensiveKeeperAI.prototype.tryKeepOffensive.call({gameData:gameData})
            } catch(e) {
                return this._randEdgeOfType(gameData,gameData.EDGE_NOW,state)
            }
        }
        return this._randEdgeOfType(gameData,gameData.EDGE_NOW,state)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this._randEdgeOfType(gameData,gameData.EDGE_NOT,state)
    }
    var minRegion=gameData.getMinConnectedRegion()
    if(minRegion)return gameData.getOneEdgeFromRegion(minRegion)
    return null
}

RolloutAI.prototype._simulate=function(gameData,rootPlayer,seed,policy){
    var state={seed:seed>>>0,rootPlayer:rootPlayer,opponentPolicy:policy||'ok'}
    var guard=0
    while(gameData.winnerId==null && guard<120){
        try{
            var move=this._policyMove(gameData,state)
        } catch(e) {
            break
        }
        if(!move)break
        try{
            gameData.putxy(move.x,move.y)
        } catch(e) {
            break
        }
        guard++
    }
    return this._staticEval(gameData,rootPlayer)
}

RolloutAI.prototype._chooseSafeMove=function(gameData,rootPlayer){
    var safe=gameData.edgeCount[gameData.EDGE_NOT]
    var limit=safe>45?12:(safe>25?16:22)
    var candidates=this._safeCandidates(gameData,rootPlayer,Math.min(limit,safe))
    if(candidates.length===1)return candidates[0]

    var rollouts=safe>45?4:(safe>25?5:(safe>12?8:12))
    var best=candidates[0]
    var bestValue=-Infinity
    var baseSeed=this._hashGame(gameData)
    for(var ii=0,m;m=candidates[ii];ii++){
        var total=0
        var grTotal=0
        var child0=this._clonePut(gameData,m)
        if(!child0)continue
        total+=this._safeShapeScore(child0,rootPlayer)*(rollouts?0.45:1)
        for(var rr=0;rr<rollouts;rr++){
            var child=this._clonePut(gameData,m)
            if(!child)continue
            total+=this._simulate(child,rootPlayer,(baseSeed+ii*977+rr*131071)>>>0)
            if(rr<Math.max(1,~~(rollouts/4))){
                child=this._clonePut(gameData,m)
                if(child)grTotal+=this._simulate(child,rootPlayer,(baseSeed+ii*3571+rr*524287)>>>0,'gr')
            }
        }
        total+=grTotal*0.45
        if(total>bestValue){
            bestValue=total
            best=m
        }
    }
    return best
}

RolloutAI.prototype._chooseScoringMove=function(gameData,rootPlayer){
    if(gameData.edgeCount[gameData.EDGE_NOT]===0){
        try{
            return OffensiveKeeperAI.prototype.tryKeepOffensive.call({gameData:gameData})
        } catch(e) {
            var fallbackNow=gameData.getAllEdges(gameData.EDGE_NOW)
            return fallbackNow[0]
        }
    }
    var moves=this._scoreMoves(gameData,false)
    if(moves.length===1)return moves[0]
    var best=moves[0]
    var bestValue=-Infinity
    for(var ii=0,m;m=moves[ii];ii++){
        var child=this._clonePut(gameData,m)
        if(!child)continue
        var value=this._staticEval(child,rootPlayer)
        if(value>bestValue){
            bestValue=value
            best=m
        }
    }
    return best
}

RolloutAI.prototype._chooseOpeningMove=function(gameData,rootPlayer){
    var moves=this._openingMoves(gameData)
    if(!moves.length)return this._fastOpeningMove(gameData,rootPlayer,{seed:this._hashGame(gameData)})
    if(moves.length===1)return moves[0]
    var baseSeed=this._hashGame(gameData)
    var best=moves[0]
    var bestValue=-Infinity
    var rollouts=gameData.edgeCount[gameData.EDGE_WILL]>30?4:7
    for(var ii=0,m;m=moves[ii];ii++){
        var child0=this._clonePut(gameData,m)
        if(!child0)continue
        var okTotal=0
        var grTotal=0
        for(var rr=0;rr<rollouts;rr++){
            var child=this._clonePut(gameData,m)
            if(child)okTotal+=this._simulate(child,rootPlayer,(baseSeed+ii*4099+rr*65537)>>>0,'ok')
            child=this._clonePut(gameData,m)
            if(child)grTotal+=this._simulate(child,rootPlayer,(baseSeed+ii*9176+rr*31337)>>>0,'gr')
        }
        var value=Math.min(okTotal,grTotal)*0.65+Math.max(okTotal,grTotal)*0.35+this._staticEval(child0,rootPlayer)*0.2
        if(value>bestValue){
            bestValue=value
            best=m
        }
    }
    return best
}

RolloutAI.prototype.where=function(){
    var gameData=this.gameData
    var rootPlayer=gameData.playerId
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        return this._chooseScoringMove(gameData,rootPlayer)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this._chooseSafeMove(gameData,rootPlayer)
    }
    var move=this._chooseOpeningMove(gameData,rootPlayer)
    if(move)return move
    var fallback=this._allPlayableEdges(gameData)
    return fallback[0]
}
