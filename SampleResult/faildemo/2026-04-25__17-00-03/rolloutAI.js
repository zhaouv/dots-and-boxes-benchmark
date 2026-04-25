
////////////////// RolloutAI //////////////////
RolloutAI=function(){
    OffensiveKeeperAI.call(this)
    this.rolloutSafeLimit=15
    this.rolloutPlayouts=3
    this.deepSafeLimit=0
    return this
}
RolloutAI.prototype = Object.create(OffensiveKeeperAI.prototype)
RolloutAI.prototype.constructor = RolloutAI

RolloutAI.prototype.edgeKey=function(edge){
    return edge.x+','+edge.y
}

RolloutAI.prototype.isOpenEdge=function(gameData, edge){
    if(!edge || edge.x==null || edge.y==null)return false
    var value=gameData.xy(edge.x,edge.y)
    return value===gameData.EDGE_NOW || value===gameData.EDGE_NOT || value===gameData.EDGE_WILL
}

RolloutAI.prototype.scoreForMe=function(gameData){
    var me=this.playerId
    var other=1-me
    var diff=gameData.player[me].score-gameData.player[other].score
    if(gameData.winnerId===me)return 10000+diff
    if(gameData.winnerId===other)return -10000+diff
    return diff
}

RolloutAI.prototype.copyWhere=function(where){
    return {x:where.x,y:where.y}
}

RolloutAI.prototype.allOpenEdges=function(gameData){
    var result=[]
    var types=[gameData.EDGE_NOW,gameData.EDGE_NOT,gameData.EDGE_WILL]
    for(var tt=0;tt<types.length;tt++){
        var edges=gameData.getAllEdges(types[tt])
        for(var ii=0;ii<edges.length;ii++)result.push(edges[ii])
    }
    return result
}

RolloutAI.prototype.regionStats=function(gameData){
    var stats={
        bigChains:0,
        bigRings:0,
        small:0,
        longBoxes:0,
        ringBoxes:0,
        chainBoxes:0,
        controlCount:0,
        scoreRegions:gameData.scoreRegion.length,
    }
    for(var index in gameData.connectedRegion){
        var region=gameData.connectedRegion[index]
        if(!region)continue
        var len=region.block.length
        if(len<=2){
            stats.small++
            continue
        }
        if(region.isRing){
            stats.bigRings++
            stats.ringBoxes+=len
        } else {
            stats.bigChains++
            stats.chainBoxes+=len
        }
        stats.longBoxes+=len
        stats.controlCount++
    }
    return stats
}

RolloutAI.prototype.structuralScore=function(gameData, rootPlayer){
    var me=this.playerId
    var other=1-me
    var diff=gameData.player[me].score-gameData.player[other].score
    if(gameData.winnerId===me)return 100000+diff
    if(gameData.winnerId===other)return -100000+diff

    var stats=this.regionStats(gameData)
    var score=diff*90
    var safe=gameData.edgeCount[gameData.EDGE_NOT]||0

    score += stats.longBoxes*3
    score += stats.bigChains*7
    score += stats.bigRings*9
    score -= stats.small*2

    if(safe===0 && gameData.edgeCount[gameData.EDGE_NOW]===0){
        var opener=gameData.playerId
        var openerIsMe=opener===me
        var hasBig=stats.controlCount>0
        if(hasBig){
            score += openerIsMe ? -180 : 180
            if((stats.controlCount%2)===0)score += openerIsMe ? 35 : -35
        } else {
            var parity=(stats.small%2)
            score += (openerIsMe ? -1 : 1) * (parity ? -18 : 18)
        }
    } else if(safe>0){
        var openerAfterSafe = ((safe%2)===0) ? gameData.playerId : 1-gameData.playerId
        if(stats.controlCount>0){
            score += openerAfterSafe===me ? -45 : 45
        }
        if((safe+stats.small)%2===0)score += 8
        else score -= 8
    }

    if(rootPlayer!==me)score=-score
    return score
}

RolloutAI.prototype.edgeFeatures=function(gameData, edge){
    var dirs=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
    var touchesScore2=0
    var touchesScore1=0
    var touchesRegion=0
    var centerDistance=0
    var cx=gameData.xsize
    var cy=gameData.ysize
    for(var ii=0,d;d=dirs[ii];ii++){
        var v=gameData.xy(edge.x+d.x,edge.y+d.y)
        if(v===gameData.SCORE_2)touchesScore2++
        else if(v===gameData.SCORE_1)touchesScore1++
        if(v===gameData.SCORE_2 || v===gameData.SCORE_3){
            var ax=gameData.areaxy(edge.x+d.x,edge.y+d.y)
            if(ax && ax!=='out range')touchesRegion++
        }
    }
    centerDistance=Math.abs(edge.x-cx)+Math.abs(edge.y-cy)
    return {
        touchesScore2:touchesScore2,
        touchesScore1:touchesScore1,
        touchesRegion:touchesRegion,
        centerDistance:centerDistance,
    }
}

RolloutAI.prototype.orderSafeEdges=function(gameData, edges){
    var scored=[]
    var before=this.regionStats(gameData)
    for(var ii=0;ii<edges.length;ii++){
        var edge=edges[ii]
        var clone=gameData.clone()
        clone.putxy(edge.x,edge.y)
        var after=this.regionStats(clone)
        var f=this.edgeFeatures(gameData,edge)
        var safe=clone.edgeCount[clone.EDGE_NOT]||0
        var deltaControl=after.controlCount-before.controlCount
        var value=this.structuralScore(clone,this.playerId)
        value += deltaControl*35
        value -= f.touchesScore1*7
        value += f.touchesRegion*4
        value -= f.centerDistance*0.3
        if(safe===0 && clone.edgeCount[clone.EDGE_NOW]===0 && clone.playerId!==this.playerId)value += 70
        scored.push({edge:edge,value:value})
    }
    scored.sort(function(a,b){return b.value-a.value})
    var result=[]
    for(var jj=0;jj<scored.length;jj++)result.push(scored[jj].edge)
    return result
}

RolloutAI.prototype.policyWhere=function(gameData){
    var saved=this.gameData
    this.gameData=gameData
    var where=null
    try{
        where=OffensiveKeeperAI.prototype.where.call(this)
    }catch(e){
        var edges=gameData.getAllEdges(gameData.EDGE_NOW)
        if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_NOT)
        if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_WILL)
        where=edges[0]
    }
    this.gameData=saved
    return where
}

RolloutAI.prototype.greedyPolicyWhere=function(gameData){
    var saved=this.gameData
    this.gameData=gameData
    var where=null
    try{
        where=GreedyRandomAI.prototype.where.call(this)
    }catch(e){
        var edges=gameData.getAllEdges(gameData.EDGE_NOW)
        if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_NOT)
        if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_WILL)
        where=edges[0]
    }
    this.gameData=saved
    return where
}

RolloutAI.prototype.playout=function(gameData, maxMoves){
    var gd=gameData.clone()
    var guard=maxMoves||200
    while(gd.winnerId==null && guard-->0){
        var where=this.rolloutWhere(gd)
        if(!where || where.x==null || where.y==null)break
        gd.putxy(where.x,where.y)
    }
    return this.scoreForMe(gd)
}

RolloutAI.prototype.playoutGreedy=function(gameData, maxMoves){
    var gd=gameData.clone()
    var guard=maxMoves||200
    while(gd.winnerId==null && guard-->0){
        var where=this.greedyPolicyWhere(gd)
        if(!where || where.x==null || where.y==null)break
        gd.putxy(where.x,where.y)
    }
    return this.scoreForMe(gd)
}

RolloutAI.prototype.componentList=function(gameData){
    var list=[]
    for(var index in gameData.connectedRegion){
        var region=gameData.connectedRegion[index]
        if(!region)continue
        var len=region.block.length
        var handout=0
        if(region.isRing)handout=4
        else if(len>=2)handout=2
        list.push({n:len,h:handout})
    }
    list.sort(function(a,b){
        if(a.h!==b.h)return a.h-b.h
        return a.n-b.n
    })
    return list
}

RolloutAI.prototype.scoreValue=function(score0, score1){
    var me=this.playerId
    var other=1-me
    var diff=(me===0 ? score0-score1 : score1-score0)
    if(score0>=this.gameData.winScore)return me===0 ? 10000+diff : -10000+diff
    if(score1>=this.gameData.winScore)return me===1 ? 10000+diff : -10000+diff
    return diff
}

RolloutAI.prototype.componentValue=function(gameData){
    var list=this.componentList(gameData)
    if(list.length>8){
        var base=this.scoreValue(gameData.player[0].score,gameData.player[1].score)
        var openerIsMe=gameData.playerId===this.playerId
        var large=0
        var boxes=0
        for(var ii=0;ii<list.length;ii++){
            boxes+=list[ii].n
            if(list[ii].n>list[ii].h)large++
        }
        return base+(openerIsMe?-1:1)*(large*6+boxes)
    }
    var memo={}
    return this.componentSolve(gameData.playerId,gameData.player[0].score,gameData.player[1].score,list,memo)
}

RolloutAI.prototype.componentSolve=function(opener, score0, score1, list, memo){
    var terminal=this.scoreValue(score0,score1)
    if(Math.abs(terminal)>=10000)return terminal
    if(!list.length)return terminal
    var key=opener+'|'+score0+','+score1+'|'
    for(var ii=0;ii<list.length;ii++)key+=list[ii].n+':'+list[ii].h+','
    if(memo[key]!=null)return memo[key]

    var openerIsMe=opener===this.playerId
    var best=openerIsMe ? -100000 : 100000
    for(var jj=0;jj<list.length;jj++){
        var comp=list[jj]
        var rest=list.slice(0,jj).concat(list.slice(jj+1))
        var controller=1-opener

        var take0=score0
        var take1=score1
        if(controller===0)take0+=comp.n
        else take1+=comp.n
        var takeVal=this.componentSolve(controller,take0,take1,rest,memo)

        var chosen=takeVal
        if(comp.h>0){
            var keep0=score0
            var keep1=score1
            if(controller===0)keep0+=Math.max(0,comp.n-comp.h)
            else keep1+=Math.max(0,comp.n-comp.h)
            var keepVal=this.scoreValue(keep0,keep1)
            if(Math.abs(keepVal)<10000){
                if(opener===0)keep0+=comp.h
                else keep1+=comp.h
                keepVal=this.componentSolve(opener,keep0,keep1,rest,memo)
            }
            if(controller===this.playerId){
                if(keepVal>chosen)chosen=keepVal
            } else {
                if(keepVal<chosen)chosen=keepVal
            }
        }

        if(openerIsMe){
            if(chosen>best)best=chosen
        } else {
            if(chosen<best)best=chosen
        }
    }
    memo[key]=best
    return best
}

RolloutAI.prototype.fastSafeCandidates=function(gameData, edges){
    if(edges.length<=8)return edges
    var result=[]
    var seen={}
    var add=function(edge){
        if(!edge)return
        var key=edge.x+','+edge.y
        if(seen[key])return
        seen[key]=true
        result.push(edge)
    }
    var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_NOT)
    for(var ii=0;ii<grouped.length && result.length<8;ii++)add(grouped[ii])
    var step=Math.max(1,~~(edges.length/8))
    for(var jj=0;jj<edges.length && result.length<8;jj+=step)add(edges[jj])
    for(var kk=0;kk<edges.length && result.length<8;kk++)add(edges[kk])
    return result
}

RolloutAI.prototype.fastSafeWhere=function(gameData){
    var edges=gameData.getAllEdges(gameData.EDGE_NOT)
    if(edges.length<=1)return edges[0]
    var candidates=this.fastSafeCandidates(gameData,edges)
    var best=candidates[0]
    var bestScore=-100000000
    for(var ii=0;ii<candidates.length;ii++){
        var gd=gameData.clone()
        gd.putxy(candidates[ii].x,candidates[ii].y)
        var score=this.structuralScore(gd,this.playerId)
        if(score>bestScore){
            bestScore=score
            best=candidates[ii]
        }
    }
    return best
}

RolloutAI.prototype.rolloutWhere=function(gameData){
    return this.policyWhere(gameData)
}

RolloutAI.prototype.evaluateMove=function(gameData, edge){
    var clone=gameData.clone()
    clone.putxy(edge.x,edge.y)
    if(clone.winnerId!=null)return this.scoreForMe(clone)

    var score=this.structuralScore(clone,this.playerId)
    if((clone.edgeCount[clone.EDGE_NOT]||0)<=60){
        score += this.playout(clone,140)
    }

    if(this.deepSafeLimit && gameData.edgeCount[gameData.EDGE_NOT]<=this.deepSafeLimit){
        score += this.searchValue(clone,5,-1000000,1000000)
    }
    return score
}

RolloutAI.prototype.searchMoves=function(gameData){
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        var moves=[]
        var seen={}
        for(var ii=0;ii<gameData.scoreRegion.length;ii++){
            var region=gameData.connectedRegion[gameData.scoreRegion[ii]]
            if(!region)continue
            var eat=gameData.getOneEdgeFromRegion(region)
            if(eat && !seen[this.edgeKey(eat)]){
                seen[this.edgeKey(eat)]=true
                moves.push(eat)
            }
            var all=gameData.getAllEdgesFromRegion(region)
            for(var jj=0;jj<all.length;jj++){
                var key=this.edgeKey(all[jj])
                if(!seen[key] && this.isOpenEdge(gameData,all[jj])){
                    seen[key]=true
                    moves.push(all[jj])
                }
            }
        }
        if(moves.length)return moves
        return gameData.getAllEdges(gameData.EDGE_NOW)
    }
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        var edges=gameData.getAllEdges(gameData.EDGE_NOT)
        edges=this.orderSafeEdges(gameData,edges)
        return edges.slice(0,Math.min(edges.length,12))
    }
    var will=gameData.getEdgeGroupedByRegion(gameData.EDGE_WILL)
    if(will.length)return will
    return gameData.getAllEdges(gameData.EDGE_WILL)
}

RolloutAI.prototype.searchValue=function(gameData, depth, alpha, beta){
    if(gameData.winnerId!=null)return this.scoreForMe(gameData)
    if(depth<=0)return this.structuralScore(gameData,this.playerId)

    var maximizing=gameData.playerId===this.playerId
    var moves=this.searchMoves(gameData)
    if(!moves.length)return this.structuralScore(gameData,this.playerId)

    if(maximizing){
        var best=-1000000
        for(var ii=0;ii<moves.length;ii++){
            var gd=gameData.clone()
            gd.putxy(moves[ii].x,moves[ii].y)
            var val=this.searchValue(gd,depth-1,alpha,beta)
            if(val>best)best=val
            if(best>alpha)alpha=best
            if(alpha>=beta)break
        }
        return best
    } else {
        var worst=1000000
        for(var jj=0;jj<moves.length;jj++){
            var gd2=gameData.clone()
            gd2.putxy(moves[jj].x,moves[jj].y)
            var val2=this.searchValue(gd2,depth-1,alpha,beta)
            if(val2<worst)worst=val2
            if(worst<beta)beta=worst
            if(alpha>=beta)break
        }
        return worst
    }
}

RolloutAI.prototype.chooseBySimulation=function(gameData, edges){
    if(edges.length===1)return edges[0]
    if(gameData.edgeCount[gameData.EDGE_NOT]){
        return this.chooseSafeByRollout(gameData,edges)
    }

    var best=edges[0]
    var bestScore=-100000000
    for(var ii=0;ii<edges.length;ii++){
        var edge=edges[ii]
        var score=this.evaluateMove(gameData,edge)
        if(score>bestScore){
            bestScore=score
            best=edge
        }
    }
    return best
}

RolloutAI.prototype.sampleSafeEdges=function(gameData, edges){
    if(edges.length<=this.rolloutSafeLimit)return edges.slice()

    var result=[]
    var seen={}
    var add=function(edge){
        if(!edge)return
        var key=edge.x+','+edge.y
        if(seen[key])return
        seen[key]=true
        result.push(edge)
    }

    var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_NOT)
    for(var ii=0;ii<grouped.length && result.length<this.rolloutSafeLimit;ii++)add(grouped[ii])

    var ordered=this.orderSafeEdges(gameData,edges)
    for(var jj=0;jj<ordered.length && result.length<this.rolloutSafeLimit;jj++)add(ordered[jj])

    var step=Math.max(1,~~(edges.length/this.rolloutSafeLimit))
    var start=this.rand(step)
    for(var kk=start;kk<edges.length && result.length<this.rolloutSafeLimit;kk+=step)add(edges[kk])

    while(result.length<this.rolloutSafeLimit){
        add(edges[this.rand(edges.length)])
    }
    return result
}

RolloutAI.prototype.chooseSafeByRollout=function(gameData, edges){
    var candidates=this.sampleSafeEdges(gameData,edges)
    var best=candidates[0]
    var bestScore=-100000000
    var memo={}
    for(var ii=0;ii<candidates.length;ii++){
        var edge=candidates[ii]
        var score=0
        var base=null
        var first=gameData.clone()
        first.putxy(edge.x,edge.y)
        if(!first.edgeCount[first.EDGE_NOW] && first.edgeCount[first.EDGE_NOT]<=8){
            score=this.safeTailValue(first,-100000000,100000000,memo)
        } else {
            for(var pp=0;pp<this.rolloutPlayouts;pp++){
                var gd=gameData.clone()
                gd.putxy(edge.x,edge.y)
                if(base==null)base=this.structuralScore(gd,this.playerId)
                score += this.playout(gd,160)*100
            }
            score += base
        }
        if(score>bestScore){
            bestScore=score
            best=edge
        }
    }
    return best
}

RolloutAI.prototype.safeTailValue=function(gameData, alpha, beta, memo){
    if(gameData.winnerId!=null)return this.scoreForMe(gameData)*100
    if(gameData.edgeCount[gameData.EDGE_NOW] || !gameData.edgeCount[gameData.EDGE_NOT]){
        return this.playout(gameData,140)*100+this.structuralScore(gameData,this.playerId)
    }
    var key=this.endgameKey(gameData)
    if(memo[key]!=null)return memo[key]
    var edges=gameData.getAllEdges(gameData.EDGE_NOT)
    var maximizing=gameData.playerId===this.playerId
    var best=maximizing?-100000000:100000000
    for(var ii=0;ii<edges.length;ii++){
        var gd=gameData.clone()
        gd.putxy(edges[ii].x,edges[ii].y)
        var value=this.safeTailValue(gd,alpha,beta,memo)
        if(maximizing){
            if(value>best)best=value
            if(best>alpha)alpha=best
        } else {
            if(value<best)best=value
            if(best<beta)beta=best
        }
        if(alpha>=beta)break
    }
    memo[key]=best
    return best
}

RolloutAI.prototype.chooseOpeningByRollout=function(gameData){
    var edges=gameData.getEdgeGroupedByRegion(gameData.EDGE_WILL)
    if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_WILL)
    if(edges.length<=1)return edges[0]
    var best=edges[0]
    var bestScore=-100000000
    for(var ii=0;ii<edges.length;ii++){
        var gd=gameData.clone()
        gd.putxy(edges[ii].x,edges[ii].y)
        var score=this.playout(gd,120)*100+this.structuralScore(gd,this.playerId)
        if(score>bestScore){
            bestScore=score
            best=edges[ii]
        }
    }
    return best
}

RolloutAI.prototype.endgameCandidates=function(gameData){
    var result=[]
    var seen={}
    var self=this
    var add=function(edge){
        if(!edge || edge.x==null || edge.y==null)return
        var key=edge.x+','+edge.y
        if(seen[key])return
        if(!self.isOpenEdge(gameData,edge))return
        seen[key]=true
        result.push(edge)
    }
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        for(var ii=0;ii<gameData.scoreRegion.length;ii++){
            var region=gameData.connectedRegion[gameData.scoreRegion[ii]]
            if(!region)continue
            add(gameData.getOneEdgeFromRegion(region))
            var all=gameData.getAllEdgesFromRegion(region)
            for(var jj=0;jj<all.length;jj++)add(all[jj])
            if(region.block.length===4 && region.isRing){
                var stack=region.block
                add({x:(stack[1].x+stack[2].x)/2,y:(stack[1].y+stack[2].y)/2})
            }
            if(region.block.length===2 && !region.isRing){
                var stack2=region.block
                var p1=1
                if(gameData.xy(stack2[0].x,stack2[0].y)!==gameData.SCORE_3)p1=0
                var dirs=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
                for(var kk=0,d;d=dirs[kk];kk++){
                    var xx=stack2[p1].x+d.x, yy=stack2[p1].y+d.y
                    if(gameData.xy(xx,yy)!==gameData.EDGE_USED)add({x:xx,y:yy})
                }
            }
        }
        return result
    }
    if(gameData.edgeCount[gameData.EDGE_WILL]){
        var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_WILL)
        for(var gg=0;gg<grouped.length;gg++)add(grouped[gg])
    }
    return result
}

RolloutAI.prototype.chooseEndgame=function(gameData){
    var edges=this.endgameCandidates(gameData)
    if(!edges.length)return null
    if(edges.length===1)return edges[0]
    var best=edges[0]
    var bestScore=-100000000
    for(var ii=0;ii<edges.length;ii++){
        var gd=gameData.clone()
        gd.putxy(edges[ii].x,edges[ii].y)
        var score=this.playout(gd,120)+this.structuralScore(gd,this.playerId)
        if(score>bestScore){
            bestScore=score
            best=edges[ii]
        }
    }
    return best
}

RolloutAI.prototype.endgameKey=function(gameData){
    var s=gameData.playerId+'|'+gameData.player[0].score+','+gameData.player[1].score+'|'
    for(var y=0;y<2*gameData.ysize+1;y++){
        for(var x=(y+1)%2;x<2*gameData.xsize+1;x+=2){
            var v=gameData.xy(x,y)
            if(v===gameData.EDGE_USED)s+='0'
            else if(v===gameData.EDGE_NOW)s+='1'
            else if(v===gameData.EDGE_WILL)s+='2'
            else if(v===gameData.EDGE_NOT)s+='3'
        }
    }
    return s
}

RolloutAI.prototype.addUniqueMove=function(gameData, result, seen, edge){
    if(!this.isOpenEdge(gameData,edge))return
    var key=this.edgeKey(edge)
    if(seen[key])return
    seen[key]=true
    result.push(edge)
}

RolloutAI.prototype.endgameSearchMoves=function(gameData){
    var result=[]
    var seen={}
    if(gameData.edgeCount[gameData.EDGE_NOW]){
        for(var ii=0;ii<gameData.scoreRegion.length;ii++){
            var region=gameData.connectedRegion[gameData.scoreRegion[ii]]
            if(!region)continue
            this.addUniqueMove(gameData,result,seen,gameData.getOneEdgeFromRegion(region))
        }
        if(gameData.scoreRegion.length===1){
            var only=gameData.connectedRegion[gameData.scoreRegion[0]]
            if(only && only.block.length===4 && only.isRing){
                var ring=only.block
                this.addUniqueMove(gameData,result,seen,{x:(ring[1].x+ring[2].x)/2,y:(ring[1].y+ring[2].y)/2})
            }
            if(only && only.block.length===2 && !only.isRing){
                var stack=only.block
                var p1=1
                if(gameData.xy(stack[0].x,stack[0].y)!==gameData.SCORE_3)p1=0
                var dirs=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]
                for(var kk=0,d;d=dirs[kk];kk++){
                    this.addUniqueMove(gameData,result,seen,{x:stack[p1].x+d.x,y:stack[p1].y+d.y})
                }
            }
        }
        if(!result.length){
            var now=gameData.getAllEdges(gameData.EDGE_NOW)
            for(var nn=0;nn<now.length;nn++)this.addUniqueMove(gameData,result,seen,now[nn])
        }
        return result
    }

    var grouped=gameData.getEdgeGroupedByRegion(gameData.EDGE_WILL)
    for(var gg=0;gg<grouped.length;gg++)this.addUniqueMove(gameData,result,seen,grouped[gg])
    if(!result.length){
        var will=gameData.getAllEdges(gameData.EDGE_WILL)
        for(var ww=0;ww<will.length;ww++)this.addUniqueMove(gameData,result,seen,will[ww])
    }
    return result
}

RolloutAI.prototype.endgameLeafScore=function(gameData){
    return this.structuralScore(gameData,this.playerId)
}

RolloutAI.prototype.endgameValue=function(gameData, depth, alpha, beta, memo){
    if(gameData.winnerId!=null)return this.scoreForMe(gameData)*100
    if(depth<=0)return this.endgameLeafScore(gameData)
    var key=this.endgameKey(gameData)+'|'+depth
    if(memo[key]!=null)return memo[key]

    var moves=this.endgameSearchMoves(gameData)
    if(!moves.length)return this.endgameLeafScore(gameData)
    var maximizing=gameData.playerId===this.playerId
    var best=maximizing?-100000000:100000000
    for(var ii=0;ii<moves.length;ii++){
        var gd=gameData.clone()
        gd.putxy(moves[ii].x,moves[ii].y)
        var val=this.endgameValue(gd,depth-1,alpha,beta,memo)
        if(maximizing){
            if(val>best)best=val
            if(best>alpha)alpha=best
        } else {
            if(val<best)best=val
            if(best<beta)beta=best
        }
        if(alpha>=beta)break
    }
    memo[key]=best
    return best
}

RolloutAI.prototype.chooseEndgameSearch=function(gameData){
    var moves=this.endgameSearchMoves(gameData)
    if(!moves.length)return null
    if(moves.length===1)return moves[0]
    var memo={}
    var best=moves[0]
    var bestScore=-100000000
    for(var ii=0;ii<moves.length;ii++){
        var gd=gameData.clone()
        gd.putxy(moves[ii].x,moves[ii].y)
        var score=this.endgameValue(gd,28,-100000000,100000000,memo)
        if(score>bestScore){
            bestScore=score
            best=moves[ii]
        }
    }
    return best
}

RolloutAI.prototype.where=function(){
    var gameData=this.gameData

    if(!gameData.edgeCount[gameData.EDGE_NOW] && gameData.edgeCount[gameData.EDGE_NOT]){
        var safeEdges=gameData.getAllEdges(gameData.EDGE_NOT)
        try{
            return this.chooseBySimulation(gameData,safeEdges)
        }catch(e){
            return safeEdges[0]
        }
    }

    try{
        return OffensiveKeeperAI.prototype.where.call(this)
    }catch(e){
        var edges=gameData.getAllEdges(gameData.EDGE_NOW)
        if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_NOT)
        if(!edges.length)edges=gameData.getAllEdges(gameData.EDGE_WILL)
        return edges[0]
    }
}
