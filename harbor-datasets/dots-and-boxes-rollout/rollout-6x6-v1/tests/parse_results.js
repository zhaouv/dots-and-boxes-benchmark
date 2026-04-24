#!/usr/bin/env node

const fs = require('fs')

if (process.argv.length < 4) {
    console.error('Usage: node parse_results.js <replay.json> <target_ai>')
    process.exit(1)
}

const replayPath = process.argv[2]
const targetAi = process.argv[3]

const replay = JSON.parse(fs.readFileSync(replayPath, 'utf8'))

if (!replay || !Array.isArray(replay.results) || !replay.config) {
    console.error('Invalid replay JSON:', replayPath)
    process.exit(1)
}

let wins = 0
let losses = 0
let totalGames = 0

for (const result of replay.results) {
    if (!Array.isArray(result.wins) || result.wins.length !== 2) {
        console.error('Invalid result entry in replay JSON')
        process.exit(1)
    }

    totalGames += result.wins[0] + result.wins[1]

    if (result.ai1 === targetAi) {
        wins += result.wins[0]
        losses += result.wins[1]
        continue
    }

    if (result.ai2 === targetAi) {
        wins += result.wins[1]
        losses += result.wins[0]
        continue
    }

    console.error('Target AI not found in replay entry:', targetAi)
    process.exit(1)
}

const winRate = totalGames === 0 ? 0 : wins / totalGames

process.stdout.write(JSON.stringify({
    target_ai: targetAi,
    wins: wins,
    losses: losses,
    total_games: totalGames,
    win_rate: winRate,
    rounds: replay.config.rounds,
    swap: !!replay.config.swap,
    seed: replay.config.seed,
}, null, 2))
