function roundWeight(roundNumber, totalRounds) {
  const criticalRounds = new Set([12, 15, 24, totalRounds])
  return criticalRounds.has(roundNumber) ? 1.25 : 1
}

function streaksByRound(rounds, teamKey = 'team_ct_start') {
  const streakBeforeRound = new Map()
  let lossStreak = 0
  for (const round of rounds) {
    streakBeforeRound.set(round.round_number, lossStreak)
    if (round.winner === teamKey) lossStreak = 0
    else lossStreak += 1
  }
  return streakBeforeRound
}

export function computeRoundImpact(match) {
  const playerScores = new Map()
  const totalRounds = Math.max(match.rounds.length, 1)

  for (const round of match.rounds) {
    const w = roundWeight(round.round_number, totalRounds)
    round.timeline.forEach((event, idx) => {
      const pid = event.killer_steamid
      if (!pid) return
      let score = 0.9
      if (idx === 0) score += 1.8
      if (event.trade_of) score += 1.0
      if (event.post_plant) score += 1.1
      score *= w
      playerScores.set(pid, (playerScores.get(pid) ?? 0) + score)

      const victim = event.victim_steamid
      if (victim) playerScores.set(victim, (playerScores.get(victim) ?? 0) - (0.6 * w))
    })
  }

  const report = match.players.map((player) => {
    const total = playerScores.get(player.steam_id) ?? 0
    const risMatch = (total / totalRounds) * 100
    return {
      steam_id: player.steam_id,
      nick: player.nick,
      ris_match: Number(risMatch.toFixed(2)),
      ris_total: Number(total.toFixed(2)),
    }
  }).sort((a, b) => b.ris_match - a.ris_match)

  return report
}

export function computeTradeEfficiency(match) {
  const trades = []
  const untradedDeaths = new Map()
  const totalDeaths = new Map()
  const entryDeaths = new Map()
  const entryTraded = new Map()

  for (const round of match.rounds) {
    for (const event of round.timeline) {
      const victim = event.victim_steamid
      if (!victim) continue
      totalDeaths.set(victim, (totalDeaths.get(victim) ?? 0) + 1)
      if (event.opening_kill) entryDeaths.set(victim, (entryDeaths.get(victim) ?? 0) + 1)

      if (event.trade_of) {
        trades.push(Math.max(0, Number(event.trade_delta_s ?? 0)))
        const tradedVictim = event.trade_of
        if (entryDeaths.get(tradedVictim)) {
          entryTraded.set(tradedVictim, (entryTraded.get(tradedVictim) ?? 0) + 1)
        }
      } else {
        untradedDeaths.set(victim, (untradedDeaths.get(victim) ?? 0) + 1)
      }
    }
  }

  const avgTradeTime = trades.length ? trades.reduce((a, b) => a + b, 0) / trades.length : 0
  const playerRows = match.players.map((player) => {
    const deaths = totalDeaths.get(player.steam_id) ?? 0
    const untraded = untradedDeaths.get(player.steam_id) ?? 0
    const entries = entryDeaths.get(player.steam_id) ?? 0
    const tradedEntries = entryTraded.get(player.steam_id) ?? 0
    return {
      steam_id: player.steam_id,
      nick: player.nick,
      entry_traded_pct: entries > 0 ? Number(((tradedEntries / entries) * 100).toFixed(2)) : 0,
      deaths_without_support_pct: deaths > 0 ? Number(((untraded / deaths) * 100).toFixed(2)) : 0,
    }
  })

  return {
    avg_trade_time_s: Number(avgTradeTime.toFixed(2)),
    players: playerRows,
  }
}

export function computePressure(match) {
  const ctLossStreakBefore = streaksByRound(match.rounds, 'team_ct_start')
  const pressureRounds = new Set([12, 15, 24, match.rounds.length])
  const rows = []
  for (const round of match.rounds) {
    const isPressure = pressureRounds.has(round.round_number) || (ctLossStreakBefore.get(round.round_number) ?? 0) >= 3
    if (!isPressure) continue
    rows.push({
      round_number: round.round_number,
      winner: round.winner,
      ct_loss_streak_before: ctLossStreakBefore.get(round.round_number) ?? 0,
      tag: pressureRounds.has(round.round_number) ? 'critical' : 'post_3_losses',
    })
  }
  return rows
}

export function computeEconomy(match) {
  const buckets = new Map()
  for (const round of match.rounds) {
    for (const side of ['team_ct_start', 'team_t_start']) {
      const eco = round.economy?.[side]
      if (!eco) continue
      const key = `${side}:${eco.buy_tier}`
      if (!buckets.has(key)) buckets.set(key, { side, buy_tier: eco.buy_tier, rounds: 0, wins: 0, spent: 0, equip: 0 })
      const b = buckets.get(key)
      b.rounds += 1
      b.spent += eco.cash_spent
      b.equip += eco.equipment_value
      if (round.winner === side) b.wins += 1
    }
  }

  return Array.from(buckets.values()).map((b) => ({
    side: b.side,
    buy_tier: b.buy_tier,
    rounds: b.rounds,
    winrate_pct: b.rounds ? Number(((b.wins / b.rounds) * 100).toFixed(2)) : 0,
    roi_per_round: b.spent ? Number((((b.wins * 3250) - b.spent) / b.rounds).toFixed(2)) : 0,
    avg_equipment_value: b.rounds ? Math.round(b.equip / b.rounds) : 0,
  }))
}

export function computeConsistency(match, risRows) {
  const values = risRows.map((x) => x.ris_match)
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const variance = values.length ? values.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / values.length : 0
  const stddev = Math.sqrt(variance)

  const deathsEarly = match.rounds.flatMap((r) => r.timeline.filter((k) => k.victim_steamid && k.t_s <= 20).map((k) => ({
    round_number: r.round_number,
    victim_steamid: k.victim_steamid,
    t_s: k.t_s,
  })))

  return {
    ris_stddev: Number(stddev.toFixed(2)),
    early_deaths: deathsEarly,
  }
}

export function buildAnalysisReport(match) {
  const ris = computeRoundImpact(match)
  const trade = computeTradeEfficiency(match)
  const pressure = computePressure(match)
  const economy = computeEconomy(match)
  const consistency = computeConsistency(match, ris)

  return {
    match_id: match.match_id,
    generated_at: new Date().toISOString(),
    impact: { round_impact_score: ris },
    trades: trade,
    pressure,
    economy,
    consistency,
  }
}
