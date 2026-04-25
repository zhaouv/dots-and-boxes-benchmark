////////////////// RolloutAI //////////////////
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    this.rolloutHelper=new OffensiveKeeperAI()
    return this
}
RolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
RolloutAI.prototype.constructor = RolloutAI

RolloutAI.prototype.cloneGameData=function(gameData){
    var cloned = new GameData()
    for(var name in gameData){
        if(!gameData.hasOwnProperty(name))continue
        cloned[name]=cloned.cloneObj(gameData[name])
    }
    return cloned
}

RolloutAI.prototype.rebuildGameData=function(gameData){
    var game=new Game().init(gameData.xsize,gameData.ysize)
    game.playerId=gameData.playerId
    game.winnerId=gameData.winnerId
    game.player[0].score=gameData.player[0].score
    game.player[1].score=gameData.player[1].score
    for(var yy=0;yy<2*gameData.ysize+1;yy++){
        for(var xx=0;xx<2*gameData.xsize+1;xx++){
            if((xx+yy)%2!==1)continue
            game.xy(xx,yy,gameData.xy(xx,yy)===gameData.EDGE_USED?game.EDGE_USED:game.EDGE)
        }
    }
    return new GameData().fromGame(game)
}

RolloutAI.prototype.normalizeGameData=function(gameData){
    if(gameData.edgeCount[gameData.EDGE_NOW] && (!gameData.scoreRegion || !gameData.scoreRegion.length)){
        return this.rebuildGameData(gameData)
    }
    if(!gameData.edgeCount[gameData.EDGE_NOW] && !gameData.edgeCount[gameData.EDGE_NOT] && gameData.edgeCount[gameData.EDGE_WILL]){
        if(!gameData.getMinConnectedRegion())return this.rebuildGameData(gameData)
    }
    return gameData
}

RolloutAI.prototype.getHandoutMove=function(gameData){
    if(gameData.edgeCount[gameData.EDGE_NOT])return null
    if(gameData.scoreRegion.length!==1)return null
    if(gameData.regionNum<=1)return null
    var region=gameData.connectedRegion[gameData.scoreRegion[0]]
    if(!region)return null
    var stack=region.block
    if(region.isRing){
        if(region.block.length!==4)return null
        return {'x':(stack[1].x+stack[2].x)/2,'y':(stack[1].y+stack[2].y)/2}
    }
    if(region.block.length!==2)return null
    var p1=1
    if(gameData.xy(stack[0].x,stack[0].y)!==gameData.SCORE_3)p1=0
    var directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
    for(var ii=0,d;d=directions[ii];ii++){
        var xx=stack[p1].x+d.x, yy=stack[p1].y+d.y
        var xxx=stack[p1].x+2*d.x, yyy=stack[p1].y+2*d.y
        if(gameData.xy(xx,yy)!==gameData.EDGE_USED && gameData.xy(xxx,yyy)==='out range'){
            return {'x':xx,'y':yy}
        }
    }
    return null
}

RolloutAI.prototype.getPolicyMove=function(gameData){
    gameData=this.normalizeGameData(gameData)
    this.rolloutHelper.gameData=gameData
    try{
        return this.rolloutHelper.where()
    } catch(e){
        gameData=this.rebuildGameData(gameData)
        this.rolloutHelper.gameData=gameData
        try{
            return this.rolloutHelper.where()
        } catch(ee){
            if(gameData.edgeCount[gameData.EDGE_NOW]){
                var nowEdges=gameData.getAllEdges(gameData.EDGE_NOW)
                if(nowEdges.length)return nowEdges[0]
            }
            if(gameData.edgeCount[gameData.EDGE_NOT]){
                var notEdges=gameData.getAllEdges(gameData.EDGE_NOT)
                if(notEdges.length)return notEdges[0]
            }
            var willEdges=gameData.getAllEdges(gameData.EDGE_WILL)
            return willEdges[0]
        }
    }
}

RolloutAI.prototype.rolloutValue=function(gameData,perspectivePlayerId){
    var state=this.cloneGameData(gameData)
    while(state.winnerId==null){
        state=this.normalizeGameData(state)
        var move=this.getPolicyMove(state)
        state.putxy(move.x,move.y)
    }
    return state.player[perspectivePlayerId].score-state.player[1-perspectivePlayerId].score
}

RolloutAI.prototype.evaluateMove=function(gameData,move){
    var next=this.cloneGameData(gameData)
    next.putxy(move.x,move.y)
    next=this.normalizeGameData(next)
    return this.rolloutValue(next,gameData.playerId)
}

RolloutAI.prototype.pushUniqueMove=function(moves,seen,move){
    if(!move)return
    var key=move.x+','+move.y
    if(seen[key])return
    seen[key]=true
    moves.push(move)
}

RolloutAI.prototype.sampleSafeMoves=function(gameData){
    var allMoves=gameData.getAllEdges(gameData.EDGE_NOT)
    var limit=15
    if(allMoves.length>30)limit=8
    else if(allMoves.length>18)limit=12
    if(allMoves.length<=limit)return allMoves

    var moves=[]
    var seen={}
    var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_NOT)
    for(var ii=0;ii<grouped.length && moves.length<limit;ii++){
        this.pushUniqueMove(moves,seen,grouped[ii])
    }
    var step=Math.max(1,~~(allMoves.length/limit))
    var offset=this.rand(step)
    for(var jj=offset;jj<allMoves.length && moves.length<limit;jj+=step){
        this.pushUniqueMove(moves,seen,allMoves[jj])
    }
    while(moves.length<limit){
        this.pushUniqueMove(moves,seen,allMoves[this.rand(allMoves.length)])
    }
    return moves
}

RolloutAI.prototype.chooseBestMove=function(gameData,moves){
    if(moves.length===1)return moves[0]
    var repeat=1
    if(gameData.edgeCount[gameData.EDGE_NOT] && gameData.edgeCount[gameData.EDGE_NOT]<=6){
        repeat=3
    } else if(gameData.edgeCount[gameData.EDGE_NOT] && gameData.edgeCount[gameData.EDGE_NOT]<=12){
        repeat=2
    }
    var bestMove=moves[0]
    var bestValue=-Infinity
    for(var ii=0;ii<moves.length;ii++){
        var value=0
        for(var rr=0;rr<repeat;rr++){
            value+=this.evaluateMove(gameData,moves[ii])
        }
        value/=repeat
        if(value>bestValue || (value===bestValue && this.rand(2)===0)){
            bestValue=value
            bestMove=moves[ii]
        }
    }
    return bestMove
}

RolloutAI.prototype.where=function(){
    var gameData=this.normalizeGameData(this.gameData)

    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this.chooseBestMove(gameData,this.sampleSafeMoves(gameData))
    }

    if(gameData.scoreRegion.length===1){
        var eatMove=gameData.getOneEdgeFromRegionIndex(gameData.scoreRegion[0])
        var yieldMove=this.getHandoutMove(gameData)
        if(yieldMove){
            var eatValue=this.evaluateMove(gameData,eatMove)
            var yieldValue=this.evaluateMove(gameData,yieldMove)
            return yieldValue>eatValue?yieldMove:eatMove
        }
    }

    return this.getPolicyMove(gameData)
}
