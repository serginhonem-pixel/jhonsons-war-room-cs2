function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeTeam(value) {
  const raw = String(value ?? '').toLowerCase()
  if (raw.includes('ct')) return 'CT'
  if (raw.includes('terror') || raw === 't') return 'TR'
  if (raw === 'team_ct_start') return 'CT'
  if (raw === 'team_t_start') return 'TR'
  return '-'
}

function pickPlayer(match, steamId) {
  return (match?.players ?? []).find((p) => String(p.steam_id) === String(steamId))
}

function playerNameById(match) {
  return new Map((match?.players ?? []).map((p) => [String(p.steam_id), p.nick]))
}

function countRoundsSurvived(match, steamId) {
  let survived = 0
  for (const round of match.rounds ?? []) {
    const died = (round.timeline ?? []).some((e) => e.event === 'kill' && String(e.victim_steamid) === String(steamId))
    if (!died) survived += 1
  }
  return survived
}

function buildDuels(match, steamId, names) {
  const duels = new Map()
  const ensure = (opponentId) => {
    const key = String(opponentId)
    if (!duels.has(key)) {
      duels.set(key, {
        opponentSteamId: key,
        opponentName: names.get(key) ?? `Player-${key.slice(-4)}`,
        duelsTotal: 0,
        duelsWon: 0,
        duelsLost: 0,
        killsAgainst: 0,
        deathsAgainst: 0,
        damageDealt: 0,
        damageTaken: 0,
        headshotsAgainst: 0,
        headshotsTaken: 0,
        winRate: 0,
      })
    }
    return duels.get(key)
  }

  for (const round of match.rounds ?? []) {
    for (const ev of round.timeline ?? []) {
      if (ev.event === 'kill') {
        const killer = String(ev.killer_steamid ?? '')
        const victim = String(ev.victim_steamid ?? '')
        if (!killer || !victim) continue

        if (killer === String(steamId)) {
          const row = ensure(victim)
          row.duelsTotal += 1
          row.duelsWon += 1
          row.killsAgainst += 1
          row.damageDealt += toNumber(ev.damage, 100)
          if (ev.headshot) row.headshotsAgainst += 1
        } else if (victim === String(steamId)) {
          const row = ensure(killer)
          row.duelsTotal += 1
          row.duelsLost += 1
          row.deathsAgainst += 1
          row.damageTaken += toNumber(ev.damage, 100)
          if (ev.headshot) row.headshotsTaken += 1
        }
      } else if (ev.event === 'hurt') {
        const attacker = String(ev.attacker_steamid ?? '')
        const victim = String(ev.victim_steamid ?? '')
        const dmg = toNumber(ev.damage, 0)
        if (!attacker || !victim || dmg <= 0) continue
        if (attacker === String(steamId)) {
          const row = ensure(victim)
          row.duelsTotal += 1
          row.damageDealt += dmg
        } else if (victim === String(steamId)) {
          const row = ensure(attacker)
          row.duelsTotal += 1
          row.damageTaken += dmg
        }
      }
    }
  }

  const rows = Array.from(duels.values()).map((d) => ({
    ...d,
    winRate: d.duelsTotal > 0 ? Number(((d.duelsWon / d.duelsTotal) * 100).toFixed(2)) : 0,
  }))

  rows.sort((a, b) => b.duelsTotal - a.duelsTotal || b.killsAgainst - a.killsAgainst)
  return rows
}

function buildTimeline(match, steamId, names) {
  const rows = []
  for (const round of match.rounds ?? []) {
    for (const ev of round.timeline ?? []) {
      if (ev.event === 'kill') {
        const killer = String(ev.killer_steamid ?? '')
        const victim = String(ev.victim_steamid ?? '')
        if (killer === String(steamId) || victim === String(steamId) || String(ev.assister_steamid ?? '') === String(steamId)) {
          rows.push({
            tick: toNumber(ev.tick, 0),
            round: round.round_number,
            type: ev.event,
            killer: names.get(killer) ?? killer,
            victim: names.get(victim) ?? victim,
            assister: names.get(String(ev.assister_steamid ?? '')) ?? null,
            weapon: ev.weapon ?? '',
            headshot: Boolean(ev.headshot),
          })
        }
      } else if (ev.event === 'purchase' && String(ev.player_steamid ?? '') === String(steamId)) {
        rows.push({
          tick: toNumber(ev.tick, 0),
          round: round.round_number,
          type: 'purchase',
          weapon: ev.weapon ?? '',
        })
      } else if ((ev.event === 'flashbang_detonate' || ev.event === 'smokegrenade_detonate' || ev.event === 'hegrenade_detonate' || ev.event === 'inferno_startburn') && String(ev.player_steamid ?? '') === String(steamId)) {
        rows.push({
          tick: toNumber(ev.tick, 0),
          round: round.round_number,
          type: 'grenade_throw',
          weapon: ev.weapon ?? ev.event,
        })
      } else if (ev.event === 'hurt') {
        const attacker = String(ev.attacker_steamid ?? '')
        const victim = String(ev.victim_steamid ?? '')
        if (attacker === String(steamId) || victim === String(steamId)) {
          rows.push({
            tick: toNumber(ev.tick, 0),
            round: round.round_number,
            type: 'damage',
            attacker: names.get(attacker) ?? attacker,
            victim: names.get(victim) ?? victim,
            damage: toNumber(ev.damage, 0),
          })
        }
      }
    }
    const transitions = Array.isArray(round.state_transitions) ? round.state_transitions : []
    if (transitions.some((s) => String(s) === '1v1' || String(s).includes('1v'))) {
      rows.push({
        tick: toNumber(round.end_tick, 0),
        round: round.round_number,
        type: 'clutch_attempt',
      })
    }
  }
  rows.sort((a, b) => a.tick - b.tick)
  return rows
}

function buildMovement(match, steamId) {
  const points = []
  for (const round of match.rounds ?? []) {
    for (const ev of round.timeline ?? []) {
      if (ev.event === 'kill') {
        if (String(ev.killer_steamid ?? '') === String(steamId) && ev.killer_position) {
          points.push({ tick: ev.tick, x: ev.killer_position.x, y: ev.killer_position.y, z: ev.killer_position.z })
        }
        if (String(ev.victim_steamid ?? '') === String(steamId) && ev.victim_position) {
          points.push({ tick: ev.tick, x: ev.victim_position.x, y: ev.victim_position.y, z: ev.victim_position.z })
        }
      } else if (String(ev.player_steamid ?? '') === String(steamId) && ev.position) {
        points.push({ tick: ev.tick, x: ev.position.x, y: ev.position.y, z: ev.position.z })
      }
    }
  }
  points.sort((a, b) => toNumber(a.tick, 0) - toNumber(b.tick, 0))

  let movingSeconds = 0
  let idleSeconds = 0
  for (let idx = 1; idx < points.length; idx += 1) {
    const prev = points[idx - 1]
    const cur = points[idx]
    const dt = Math.max(0, (toNumber(cur.tick) - toNumber(prev.tick)) / 64)
    const dx = toNumber(cur.x) - toNumber(prev.x)
    const dy = toNumber(cur.y) - toNumber(prev.y)
    const dz = toNumber(cur.z) - toNumber(prev.z)
    const dist = Math.sqrt(dx ** 2 + dy ** 2 + dz ** 2)
    if (dist > 8) movingSeconds += dt
    else idleSeconds += dt
  }

  return {
    heatmapData: points.map((p) => ({ x: p.x, y: p.y, weight: 1 })),
    pathData: points,
    stationarySeconds: Number(idleSeconds.toFixed(2)),
    movingSeconds: Number(movingSeconds.toFixed(2)),
  }
}

function computeAvgReactionSeconds(match, steamId) {
  const samples = []
  for (const round of match.rounds ?? []) {
    const start = toNumber(round.start_tick, 0)
    if (start <= 0) continue
    let firstTick = null
    for (const ev of round.timeline ?? []) {
      const t = toNumber(ev.tick, 0)
      if (t <= 0) continue
      const isAction = (
        (ev.event === 'weapon_fire' && String(ev.player_steamid ?? '') === String(steamId))
        || (ev.event === 'hurt' && String(ev.attacker_steamid ?? '') === String(steamId))
        || (ev.event === 'kill' && String(ev.killer_steamid ?? '') === String(steamId))
      )
      if (!isAction) continue
      if (firstTick == null || t < firstTick) firstTick = t
    }
    if (firstTick != null && firstTick >= start) {
      const sec = (firstTick - start) / 64
      if (sec >= 0 && sec <= 60) samples.push(sec)
    }
  }
  if (samples.length === 0) return null
  return Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3))
}

export function getPlayerProfile(match, steamId) {
  if (!match?.players || !Array.isArray(match.players)) {
    throw new Error('Match inválida para perfil de jogador.')
  }
  const player = pickPlayer(match, steamId)
  if (!player) {
    throw new Error('Jogador não encontrado na partida.')
  }

  const names = playerNameById(match)
  const roundsTotal = Math.max(1, match.rounds?.length ?? 0)
  const roundsSurvived = countRoundsSurvived(match, steamId)
  const duels = buildDuels(match, steamId, names)
  const timeline = buildTimeline(match, steamId, names)
  const movement = buildMovement(match, steamId)
  const shots = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'weapon_fire' && String(e.player_steamid ?? '') === String(steamId)))
  const hurts = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'hurt'))
  const hitEvents = hurts.filter((e) => String(e.attacker_steamid ?? '') === String(steamId))
  const flashDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'flashbang_detonate' && String(e.player_steamid ?? '') === String(steamId)))
  const smokeDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'smokegrenade_detonate' && String(e.player_steamid ?? '') === String(steamId)))
  const heDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'hegrenade_detonate' && String(e.player_steamid ?? '') === String(steamId)))
  const mollyDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'inferno_startburn' && String(e.player_steamid ?? '') === String(steamId)))
  const blindedPlayers = new Set(
    (match.rounds ?? []).flatMap((r) => (r.timeline ?? [])
      .filter((e) => e.event === 'player_blind' && String(e.player_steamid ?? '') === String(steamId))
      .map((e) => String(e.victim_steamid ?? ''))),
  )

  const summary = {
    steamId: String(player.steam_id),
    name: player.nick,
    team: player.team,
    sideStart: normalizeTeam(player.team),
    kills: toNumber(player.stats?.kills, 0),
    deaths: toNumber(player.stats?.deaths, 0),
    assists: toNumber(player.stats?.assists, 0),
    adr: toNumber(player.stats?.adr, 0),
    headshotPct: toNumber(player.stats?.hs_percent, 0),
    kdRatio: toNumber(player.stats?.kills, 0) / Math.max(1, toNumber(player.stats?.deaths, 0)),
    rating: toNumber(player.stats?.rating_2, 0),
    damageTotal: Number((toNumber(player.stats?.adr, 0) * roundsTotal).toFixed(2)),
    roundsPlayed: roundsTotal,
    roundsSurvived,
    firstKills: toNumber(player.stats?.entry_kills, 0),
    firstDeaths: toNumber(player.stats?.entry_deaths, 0),
  }

  const aim = {
    overallAccuracy: shots.length > 0
      ? Number((hitEvents.length / shots.length).toFixed(4))
      : Number((summary.kills / Math.max(1, summary.kills + summary.deaths)).toFixed(4)),
    firstBulletAccuracy: shots.length > 0 ? Number((summary.headshotPct / 100).toFixed(4)) : Number((summary.headshotPct / 100).toFixed(4)),
    headshotRate: Number((summary.headshotPct / 100).toFixed(4)),
    avgTimeBetweenShots: (() => {
      if (shots.length < 2) return 0
      const ordered = [...shots].sort((a, b) => toNumber(a.tick, 0) - toNumber(b.tick, 0))
      let sum = 0
      let count = 0
      for (let idx = 1; idx < ordered.length; idx += 1) {
        const dt = (toNumber(ordered[idx].tick, 0) - toNumber(ordered[idx - 1].tick, 0)) / 64
        if (dt >= 0) {
          sum += dt
          count += 1
        }
      }
      return count > 0 ? Number((sum / count).toFixed(3)) : 0
    })(),
    avgReactionTime: (() => {
      const v = computeAvgReactionSeconds(match, steamId)
      if (v != null) return v
      const fallback = toNumber(player.stats?.time_to_first_action_avg_s, 0)
      if (fallback > 60) return 0
      return fallback
    })(),
  }

  const utility = {
    flashesThrown: flashDet.length || toNumber(player.stats?.util_used?.flash, 0),
    playersFlashed: blindedPlayers.size,
    flashAssists: toNumber(player.stats?.flash_assists, 0),
    heDamage: hurts
      .filter((e) => String(e.attacker_steamid ?? '') === String(steamId) && String(e.weapon ?? '').toLowerCase().includes('he'))
      .reduce((acc, e) => acc + toNumber(e.damage, 0), 0),
    molotovDamage: hurts
      .filter((e) => String(e.attacker_steamid ?? '') === String(steamId) && (String(e.weapon ?? '').toLowerCase().includes('molotov') || String(e.weapon ?? '').toLowerCase().includes('inc')))
      .reduce((acc, e) => acc + toNumber(e.damage, 0), 0),
    smokesThrown: smokeDet.length,
    hesThrown: heDet.length,
    molotovsThrown: mollyDet.length,
  }

  const weaponsMap = new Map()
  for (const row of timeline) {
    if (!row.weapon) continue
    const cur = weaponsMap.get(row.weapon) ?? { weapon: row.weapon, kills: 0, deaths: 0, headshots: 0 }
    if (row.type === 'kill' && row.killer === player.nick) {
      cur.kills += 1
      if (row.headshot) cur.headshots += 1
    }
    if (row.type === 'kill' && row.victim === player.nick) {
      cur.deaths += 1
    }
    weaponsMap.set(row.weapon, cur)
  }

  return {
    steamId: String(player.steam_id),
    name: player.nick,
    summary,
    aim,
    utility,
    movement: {
      stationarySeconds: movement.stationarySeconds,
      movingSeconds: movement.movingSeconds,
      heatmapData: movement.heatmapData,
      pathData: movement.pathData,
    },
    duels,
    timeline,
    heatmap: movement.heatmapData,
    weapons: Array.from(weaponsMap.values()).sort((a, b) => b.kills - a.kills),
  }
}
