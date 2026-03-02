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

function normalizeTeamKey(value) {
  const raw = String(value ?? '').toLowerCase()
  if (raw.includes('team_ct_start') || raw === 'ct') return 'team_ct_start'
  if (raw.includes('team_t_start') || raw === 'tr' || raw === 't') return 'team_t_start'
  return 'team_unknown'
}

function sideForRound(startTeam, roundNumber) {
  const start = normalizeTeamKey(startTeam)
  const r = toNumber(roundNumber, 0)
  if (start === 'team_unknown') return 'team_unknown'
  if (r <= 12) return start
  return start === 'team_ct_start' ? 'team_t_start' : 'team_ct_start'
}

function isLowBuyTier(tier) {
  const t = String(tier ?? '').toLowerCase()
  return t.includes('eco') || t.includes('half') || t.includes('force')
}

function parseState(state) {
  const [ctRaw, trRaw] = String(state ?? '5v5').split('v')
  return { ct: Number.parseInt(ctRaw, 10) || 0, tr: Number.parseInt(trRaw, 10) || 0 }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x))
}

function normalizePlace(place) {
  return String(place ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function isBombsitePlace(place) {
  const p = normalizePlace(place)
  return p.includes('bombsitea') || p.includes('bombsiteb') || p === 'a' || p === 'b'
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

export function computeAimRoundInsights(match, steamId, names = playerNameById(match)) {
  const id = String(steamId)
  const playerName = names.get(id) ?? `Player-${id.slice(-4)}`
  const teamStartById = new Map((match?.players ?? []).map((p) => [String(p.steam_id), normalizeTeamKey(p.team)]))
  const rows = []

  for (const round of match.rounds ?? []) {
    const playerRoundSide = sideForRound(teamStartById.get(id), round.round_number)
    const isTeammateOnRound = (otherId) => {
      const oid = String(otherId ?? '')
      if (!oid) return false
      const otherSide = sideForRound(teamStartById.get(oid), round.round_number)
      if (playerRoundSide === 'team_unknown' || otherSide === 'team_unknown') return false
      return otherSide === playerRoundSide
    }

    const timeline = [...(round.timeline ?? [])].sort((a, b) => toNumber(a.tick, 0) - toNumber(b.tick, 0))
    const shotsAll = timeline.filter((ev) => ev.event === 'weapon_fire' && String(ev.player_steamid ?? '') === id)
    const hurtsByPlayerAll = timeline.filter((ev) => ev.event === 'hurt' && String(ev.attacker_steamid ?? '') === id)
    const killsByPlayerAll = timeline.filter((ev) => ev.event === 'kill' && String(ev.killer_steamid ?? '') === id)
    const killsOnPlayerAll = timeline.filter((ev) => ev.event === 'kill' && String(ev.victim_steamid ?? '') === id)
    const firstShotTick = shotsAll.length > 0 ? toNumber(shotsAll[0].tick, 0) : 0

    const contactEvents = timeline.filter((ev) => {
      if (ev.event === 'hurt') {
        const attackerId = String(ev.attacker_steamid ?? '')
        const victimId = String(ev.victim_steamid ?? '')
        if (attackerId === id) return Boolean(victimId) && victimId !== id
        if (victimId === id) return Boolean(attackerId) && attackerId !== id
        return false
      }
      if (ev.event === 'kill') {
        const killerId = String(ev.killer_steamid ?? '')
        const victimId = String(ev.victim_steamid ?? '')
        if (killerId === id) return Boolean(victimId) && victimId !== id
        if (victimId === id) return Boolean(killerId) && killerId !== id
        return false
      }
      return false
    })
    const firstContact = contactEvents[0] ?? null
    let firstContactBy = 'none'
    let firstContactWith = '-'
    let firstContactTimeS = 0
    let opponentSteamId = ''
    let opponentName = '-'
    if (firstContact) {
      const attackerId = String(firstContact.attacker_steamid ?? firstContact.killer_steamid ?? '')
      const victimId = String(firstContact.victim_steamid ?? '')
      const startTick = toNumber(round.start_tick, 0)
      const eventTick = toNumber(firstContact.tick, 0)
      if (startTick > 0 && eventTick >= startTick) {
        firstContactTimeS = Number(((eventTick - startTick) / 64).toFixed(2))
      }
      if (attackerId === id) {
        firstContactBy = 'player'
        firstContactWith = names.get(victimId) ?? `Player-${victimId.slice(-4)}`
        opponentSteamId = victimId
      } else {
        firstContactBy = 'opponent'
        firstContactWith = names.get(attackerId) ?? `Player-${attackerId.slice(-4)}`
        opponentSteamId = attackerId
      }
      opponentName = names.get(opponentSteamId) ?? (opponentSteamId ? `Player-${opponentSteamId.slice(-4)}` : '-')
    }

    const firstKillInvolvingPlayer = timeline.find((ev) => {
      if (ev.event !== 'kill') return false
      const killerId = String(ev.killer_steamid ?? '')
      const victimId = String(ev.victim_steamid ?? '')
      if (killerId === id) return Boolean(victimId) && victimId !== id
      if (victimId === id) return Boolean(killerId) && killerId !== id
      return false
    }) ?? null

    let firstKillBy = 'none'
    let firstKillLabel = 'Sem kill'
    let duelWinnerName = '-'
    let firstKillTimeS = 0
    let firstKillWasTeamKill = false
    if (firstKillInvolvingPlayer) {
      const killerId = String(firstKillInvolvingPlayer.killer_steamid ?? '')
      const victimId = String(firstKillInvolvingPlayer.victim_steamid ?? '')
      const otherId = killerId === id ? victimId : killerId
      firstKillWasTeamKill = isTeammateOnRound(otherId)
      const startTick = toNumber(round.start_tick, 0)
      const killTick = toNumber(firstKillInvolvingPlayer.tick, 0)
      if (startTick > 0 && killTick >= startTick) {
        firstKillTimeS = Number(((killTick - startTick) / 64).toFixed(2))
      }
      duelWinnerName = names.get(killerId) ?? `Player-${killerId.slice(-4)}`
      if (killerId === id) {
        firstKillBy = 'player'
        firstKillLabel = `${playerName} venceu`
      } else {
        firstKillBy = 'opponent'
        firstKillLabel = `${duelWinnerName} venceu`
      }
    }

    if (!opponentSteamId && firstKillInvolvingPlayer) {
      const killerId = String(firstKillInvolvingPlayer.killer_steamid ?? '')
      const victimId = String(firstKillInvolvingPlayer.victim_steamid ?? '')
      opponentSteamId = killerId === id ? victimId : killerId
      opponentName = names.get(opponentSteamId) ?? (opponentSteamId ? `Player-${opponentSteamId.slice(-4)}` : '-')
    }
    const opponentIsTeammate = opponentSteamId ? isTeammateOnRound(opponentSteamId) : false

    const duelStartTick = firstContact ? toNumber(firstContact.tick, 0) : toNumber(round.start_tick, 0)
    const firstDuelKill = timeline.find((ev) => (
      ev.event === 'kill'
      && opponentSteamId
      && (
        (String(ev.killer_steamid ?? '') === id && String(ev.victim_steamid ?? '') === opponentSteamId)
        || (String(ev.killer_steamid ?? '') === opponentSteamId && String(ev.victim_steamid ?? '') === id)
      )
    )) ?? null
    const duelEndTick = firstDuelKill ? toNumber(firstDuelKill.tick, 0) : toNumber(round.end_tick, Number.MAX_SAFE_INTEGER)

    const duelShotsPlayer = timeline.filter((ev) => (
      ev.event === 'weapon_fire'
      && String(ev.player_steamid ?? '') === id
      && toNumber(ev.tick, 0) >= duelStartTick
      && toNumber(ev.tick, 0) <= duelEndTick
    ))
    const duelShotsOpp = timeline.filter((ev) => (
      ev.event === 'weapon_fire'
      && opponentSteamId
      && String(ev.player_steamid ?? '') === opponentSteamId
      && toNumber(ev.tick, 0) >= duelStartTick
      && toNumber(ev.tick, 0) <= duelEndTick
    ))
    const duelHitsPlayer = timeline.filter((ev) => (
      ev.event === 'hurt'
      && String(ev.attacker_steamid ?? '') === id
      && String(ev.victim_steamid ?? '') === opponentSteamId
      && toNumber(ev.tick, 0) >= duelStartTick
      && toNumber(ev.tick, 0) <= duelEndTick
    ))
    const duelHitsOpp = timeline.filter((ev) => (
      ev.event === 'hurt'
      && String(ev.attacker_steamid ?? '') === opponentSteamId
      && String(ev.victim_steamid ?? '') === id
      && toNumber(ev.tick, 0) >= duelStartTick
      && toNumber(ev.tick, 0) <= duelEndTick
    ))
    const duelKillByPlayer = timeline.filter((ev) => (
      ev.event === 'kill'
      && String(ev.killer_steamid ?? '') === id
      && String(ev.victim_steamid ?? '') === opponentSteamId
      && toNumber(ev.tick, 0) >= duelStartTick
      && toNumber(ev.tick, 0) <= duelEndTick
    )).length
    const duelKillByOpp = timeline.filter((ev) => (
      ev.event === 'kill'
      && String(ev.killer_steamid ?? '') === opponentSteamId
      && String(ev.victim_steamid ?? '') === id
      && toNumber(ev.tick, 0) >= duelStartTick
      && toNumber(ev.tick, 0) <= duelEndTick
    )).length

    const playerFirstShot = duelShotsPlayer[0] ?? null
    const opponentFirstShot = duelShotsOpp[0] ?? null
    const playerFirstShotTick = playerFirstShot ? toNumber(playerFirstShot.tick, 0) : 0
    const opponentFirstShotTick = opponentFirstShot ? toNumber(opponentFirstShot.tick, 0) : 0
    const playerFirstShotAfterContactMs = playerFirstShotTick > 0
      ? Number((((playerFirstShotTick - duelStartTick) / 64) * 1000).toFixed(0))
      : 0
    const opponentFirstShotAfterContactMs = opponentFirstShotTick > 0
      ? Number((((opponentFirstShotTick - duelStartTick) / 64) * 1000).toFixed(0))
      : 0

    const playerFirstBulletHit = playerFirstShotTick > 0 && Boolean(timeline.find((ev) => (
      ((ev.event === 'hurt' && String(ev.attacker_steamid ?? '') === id && String(ev.victim_steamid ?? '') === opponentSteamId)
      || (ev.event === 'kill' && String(ev.killer_steamid ?? '') === id && String(ev.victim_steamid ?? '') === opponentSteamId))
      && toNumber(ev.tick, 0) >= playerFirstShotTick
      && toNumber(ev.tick, 0) <= playerFirstShotTick + 24
    )))
    const opponentFirstBulletHit = opponentFirstShotTick > 0 && Boolean(timeline.find((ev) => (
      ((ev.event === 'hurt' && String(ev.attacker_steamid ?? '') === opponentSteamId && String(ev.victim_steamid ?? '') === id)
      || (ev.event === 'kill' && String(ev.killer_steamid ?? '') === opponentSteamId && String(ev.victim_steamid ?? '') === id))
      && toNumber(ev.tick, 0) >= opponentFirstShotTick
      && toNumber(ev.tick, 0) <= opponentFirstShotTick + 24
    )))

    const playerShots = duelShotsPlayer.length
    const opponentShots = duelShotsOpp.length
    const playerHits = duelHitsPlayer.length + duelKillByPlayer
    const opponentHits = duelHitsOpp.length + duelKillByOpp
    const playerPrecisionPct = playerShots > 0 ? Number(Math.min(100, (playerHits / playerShots) * 100).toFixed(1)) : 0
    const opponentPrecisionPct = opponentShots > 0 ? Number(Math.min(100, (opponentHits / opponentShots) * 100).toFixed(1)) : 0

    const firstShotAdvantageMs = playerFirstShotTick > 0 && opponentFirstShotTick > 0
      ? Number((((opponentFirstShotTick - playerFirstShotTick) / 64) * 1000).toFixed(0))
      : 0

    rows.push({
      round: round.round_number,
      shots: shotsAll.length,
      hits: hurtsByPlayerAll.length > 0 ? hurtsByPlayerAll.length : killsByPlayerAll.length,
      precisionPct: shotsAll.length > 0 ? Number((((hurtsByPlayerAll.length > 0 ? hurtsByPlayerAll.length : killsByPlayerAll.length) / shotsAll.length) * 100).toFixed(1)) : 0,
      firstShotTick,
      firstBulletHit: playerFirstBulletHit,
      firstContactBy,
      firstContactWith,
      firstContactTimeS,
      opponentSteamId,
      opponentName,
      opponentIsTeammate,
      firstKillBy,
      firstKillLabel,
      duelWinnerName,
      firstKillTimeS,
      firstKillWasTeamKill,
      kills: killsByPlayerAll.length,
      deaths: killsOnPlayerAll.length,
      duelStartTick,
      duelEndTick,
      playerFirstShotTick,
      opponentFirstShotTick,
      playerFirstShotAfterContactMs,
      opponentFirstShotAfterContactMs,
      firstShotAdvantageMs,
      playerFirstBulletHit,
      opponentFirstBulletHit,
      playerShots,
      playerHits,
      playerPrecisionPct,
      opponentShots,
      opponentHits,
      opponentPrecisionPct,
    })
  }

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

export function computePlayerInsights(match, player, steamId) {
  const id = String(steamId)
  const startTeam = normalizeTeamKey(player?.team)
  const utilityEvents = new Set(['flashbang_detonate', 'smokegrenade_detonate', 'hegrenade_detonate', 'inferno_startburn', 'bomb_planted', 'bomb_defused', 'bomb_exploded'])
  const entryTendency = toNumber(player?.stats?.entry_deaths, 0) - toNumber(player?.stats?.entry_kills, 0)
  const entry = {
    atk: { kills: 0, deaths: 0 },
    def: { kills: 0, deaths: 0 },
  }
  let soloEntryTrDeaths = 0
  let deathsTotal = 0
  let deathsTraded = 0
  let tradeDeltaSum = 0
  let isolatedBombsiteDeaths = 0
  let isolatedSoloBombsiteDeaths = 0
  let wonRoundsKills = 0
  let wonRoundsDeaths = 0
  let wonRoundsDamage = 0
  let wonRoundsCount = 0
  let antiEcoRounds = 0
  let antiEcoKills = 0
  let antiEcoDeaths = 0
  let antiEcoDamage = 0
  let clutchAttempts = 0
  let clutchWins = 0
  let bestClutch = 0
  const postPlant = {
    atk: { rounds: 0, kills: 0, deaths: 0, utility: 0 },
    def: { rounds: 0, kills: 0, deaths: 0, utility: 0, defuses: 0 },
  }
  const pacing = {
    atk: { sum: 0, count: 0 },
    def: { sum: 0, count: 0 },
  }
  const deathRiskAgg = {
    rounds: 0,
    expectedDeathSum: 0,
    actualDeaths: 0,
    riskOnDeathsSum: 0,
    riskOnSurviveSum: 0,
    deathRounds: 0,
    surviveRounds: 0,
    highRiskDeaths: 0,
  }
  const half = {
    h1: { rounds: 0, kills: 0, deaths: 0, assists: 0, hs: 0, damage: 0 },
    h2: { rounds: 0, kills: 0, deaths: 0, assists: 0, hs: 0, damage: 0 },
  }

  for (const round of match.rounds ?? []) {
    const playerSide = sideForRound(startTeam, round.round_number)
    if (playerSide !== 'team_ct_start' && playerSide !== 'team_t_start') continue
    const role = playerSide === 'team_t_start' ? 'atk' : 'def'
    const opponentSide = playerSide === 'team_t_start' ? 'team_ct_start' : 'team_t_start'
    const timeline = [...(round.timeline ?? [])].sort((a, b) => toNumber(a.tick, 0) - toNumber(b.tick, 0))
    const kills = (round.timeline ?? [])
      .filter((ev) => ev.event === 'kill')
      .sort((a, b) => toNumber(a.tick, 0) - toNumber(b.tick, 0))
    const hurts = (round.timeline ?? []).filter((ev) => ev.event === 'hurt')
    const firstKill = kills[0] ?? null
    const deathEvents = kills.filter((k) => String(k.victim_steamid ?? '') === id)
    const killEvents = kills.filter((k) => String(k.killer_steamid ?? '') === id)
    const damageDealtRound = hurts
      .filter((h) => String(h.attacker_steamid ?? '') === id)
      .reduce((acc, h) => acc + toNumber(h.damage, 0), 0)
    const states = (round.state_transitions ?? []).map(parseState)
    const stateSamples = states.length > 0 ? states : [parseState('5v5')]
    const ownOppFromState = (s) => {
      const own = playerSide === 'team_ct_start' ? s.ct : s.tr
      const opp = playerSide === 'team_ct_start' ? s.tr : s.ct
      return { own, opp }
    }
    const startState = ownOppFromState(stateSamples[0])
    const startDiff = startState.opp - startState.own
    const maxOppAdv = stateSamples.reduce((acc, s) => {
      const cur = ownOppFromState(s)
      return Math.max(acc, cur.opp - cur.own)
    }, -5)
    const lowManDisadv = stateSamples.some((s) => {
      const cur = ownOppFromState(s)
      return cur.own <= 2 && cur.opp >= 3
    })

    const firstContact = timeline.find((ev) => (
      (ev.event === 'hurt' && (String(ev.attacker_steamid ?? '') === id || String(ev.victim_steamid ?? '') === id))
      || (ev.event === 'kill' && (String(ev.killer_steamid ?? '') === id || String(ev.victim_steamid ?? '') === id))
    )) ?? null
    const firstContactByOpponent = (() => {
      if (!firstContact) return false
      if (firstContact.event === 'hurt') return String(firstContact.attacker_steamid ?? '') !== id
      return String(firstContact.killer_steamid ?? '') !== id
    })()
    const firstContactPlace = firstContact?.victim_position?.place ?? firstContact?.killer_position?.place ?? ''
    const attackBombsiteContact = role === 'atk' && isBombsitePlace(firstContactPlace)
    const entryPressureDeath = Boolean(firstKill && String(firstKill.victim_steamid ?? '') === id)
    const diedThisRound = deathEvents.length > 0

    let riskScore = -1.35
    riskScore += clamp(startDiff, 0, 3) * 0.55
    riskScore += clamp(maxOppAdv, 0, 4) * 0.45
    if (firstContactByOpponent) riskScore += 0.85
    if (lowManDisadv) riskScore += 0.75
    if (entryPressureDeath) riskScore += 0.7
    if (attackBombsiteContact) riskScore += 0.35
    if (role === 'atk') riskScore += 0.2
    if (entryTendency > 0) riskScore += clamp(entryTendency, 0, 5) * 0.05
    const deathRiskProb = Number(sigmoid(riskScore).toFixed(4))

    deathRiskAgg.rounds += 1
    deathRiskAgg.expectedDeathSum += deathRiskProb
    if (diedThisRound) {
      deathRiskAgg.actualDeaths += 1
      deathRiskAgg.deathRounds += 1
      deathRiskAgg.riskOnDeathsSum += deathRiskProb
      if (deathRiskProb >= 0.6) deathRiskAgg.highRiskDeaths += 1
    } else {
      deathRiskAgg.surviveRounds += 1
      deathRiskAgg.riskOnSurviveSum += deathRiskProb
    }

    const halfKey = Number(round.round_number) <= 12 ? 'h1' : 'h2'
    half[halfKey].rounds += 1
    half[halfKey].kills += killEvents.length
    half[halfKey].deaths += deathEvents.length
    half[halfKey].hs += killEvents.filter((k) => Boolean(k.headshot)).length
    half[halfKey].damage += damageDealtRound
    half[halfKey].assists += kills.filter((k) => String(k.assister_steamid ?? '') === id).length

    if (firstKill) {
      if (String(firstKill.killer_steamid ?? '') === id) entry[role].kills += 1
      if (String(firstKill.victim_steamid ?? '') === id) {
        entry[role].deaths += 1
        const place = firstKill?.victim_position?.place ?? firstKill?.killer_position?.place ?? ''
        const tradeBack = kills.some((k) => (
          toNumber(k.tick, 0) > toNumber(firstKill.tick, 0)
          && toNumber(k.tick, 0) - toNumber(firstKill.tick, 0) <= 320
          && String(k.killer_team ?? '') === String(firstKill.victim_team ?? '')
          && String(k.victim_steamid ?? '') === String(firstKill.killer_steamid ?? '')
        ))
        if (role === 'atk' && isBombsitePlace(place) && !tradeBack) {
          soloEntryTrDeaths += 1
        }
      }
    }

    for (const death of deathEvents) {
      deathsTotal += 1
      const trade = kills.find((k) => (
        toNumber(k.tick, 0) > toNumber(death.tick, 0)
        && toNumber(k.tick, 0) - toNumber(death.tick, 0) <= 320
        && String(k.killer_team ?? '') === String(death.victim_team ?? '')
        && String(k.victim_steamid ?? '') === String(death.killer_steamid ?? '')
      ))
      if (trade) {
        deathsTraded += 1
        tradeDeltaSum += Math.max(0, (toNumber(trade.tick, 0) - toNumber(death.tick, 0)) / 64)
      }

      const idx = kills.findIndex((k) => toNumber(k.tick, 0) === toNumber(death.tick, 0) && String(k.victim_steamid ?? '') === id)
      const pre = states[idx] ?? parseState('5v5')
      const own = playerSide === 'team_ct_start' ? pre.ct : pre.tr
      const opp = playerSide === 'team_ct_start' ? pre.tr : pre.ct
      const place = death?.victim_position?.place ?? death?.killer_position?.place ?? ''
      if (isBombsitePlace(place) && own <= 2 && opp >= 1) {
        isolatedBombsiteDeaths += 1
        if (own === 1) isolatedSoloBombsiteDeaths += 1
      }
    }

    if (String(round.winner ?? '') === playerSide) {
      wonRoundsCount += 1
      wonRoundsKills += killEvents.length
      wonRoundsDeaths += deathEvents.length
      wonRoundsDamage += damageDealtRound
    }

    const oppBuy = round?.economy?.[opponentSide]?.buy_tier
    if (isLowBuyTier(oppBuy)) {
      antiEcoRounds += 1
      antiEcoKills += killEvents.length
      antiEcoDeaths += deathEvents.length
      antiEcoDamage += damageDealtRound
    }

    const plantTick = (round.timeline ?? [])
      .filter((ev) => ev.event === 'bomb_planted')
      .map((ev) => toNumber(ev.tick, 0))
      .find((tick) => tick > 0) ?? 0
    if (plantTick > 0) {
      postPlant[role].rounds += 1
      postPlant[role].kills += killEvents.filter((k) => toNumber(k.tick, 0) >= plantTick).length
      postPlant[role].deaths += deathEvents.filter((k) => toNumber(k.tick, 0) >= plantTick).length
      postPlant[role].utility += (round.timeline ?? []).filter((ev) => (
        utilityEvents.has(String(ev.event ?? ''))
        && String(ev.player_steamid ?? '') === id
        && toNumber(ev.tick, 0) >= plantTick
      )).length
      if (role === 'def') {
        postPlant.def.defuses += (round.timeline ?? []).filter((ev) => (
          ev.event === 'bomb_defused'
          && String(ev.player_steamid ?? '') === id
          && toNumber(ev.tick, 0) >= plantTick
        )).length
      }
    }

    const roundStart = toNumber(round.start_tick, 0)
    if (roundStart > 0) {
      let firstActionTick = 0
      for (const ev of (round.timeline ?? [])) {
        const tick = toNumber(ev.tick, 0)
        if (tick <= 0) continue
        const useful = (
          (ev.event === 'kill' && String(ev.killer_steamid ?? '') === id)
          || (ev.event === 'hurt' && String(ev.attacker_steamid ?? '') === id)
          || (utilityEvents.has(String(ev.event ?? '')) && String(ev.player_steamid ?? '') === id)
        )
        if (!useful) continue
        if (firstActionTick === 0 || tick < firstActionTick) firstActionTick = tick
      }
      if (firstActionTick > 0 && firstActionTick >= roundStart) {
        const sec = (firstActionTick - roundStart) / 64
        pacing[role].sum += sec
        pacing[role].count += 1
      }
    }

    const deathTick = deathEvents.length > 0 ? toNumber(deathEvents[0].tick, 0) : null
    let clutchOpp = 0
    if (deathTick == null) {
      for (const state of states) {
        const own = playerSide === 'team_ct_start' ? state.ct : state.tr
        const opp = playerSide === 'team_ct_start' ? state.tr : state.ct
        if (own === 1 && opp >= 1) clutchOpp = Math.max(clutchOpp, opp)
      }
    } else {
      for (let idx = 0; idx < kills.length; idx += 1) {
        const tick = toNumber(kills[idx].tick, 0)
        if (tick > deathTick) break
        const state = states[idx] ?? parseState('5v5')
        const own = playerSide === 'team_ct_start' ? state.ct : state.tr
        const opp = playerSide === 'team_ct_start' ? state.tr : state.ct
        if (own === 1 && opp >= 1) clutchOpp = Math.max(clutchOpp, opp)
      }
    }
    if (clutchOpp > 0) {
      clutchAttempts += 1
      if (String(round.winner ?? '') === playerSide && (deathTick == null || deathTick >= toNumber(round.end_tick, Number.MAX_SAFE_INTEGER))) {
        clutchWins += 1
        bestClutch = Math.max(bestClutch, clutchOpp)
      }
    }
  }

  const entryScore = {
    atk: entry.atk.kills - entry.atk.deaths,
    def: entry.def.kills - entry.def.deaths,
    atkKills: entry.atk.kills,
    atkDeaths: entry.atk.deaths,
    defKills: entry.def.kills,
    defDeaths: entry.def.deaths,
  }
  const tradeability = {
    tradedDeathsPct: deathsTotal > 0 ? Number(((deathsTraded / deathsTotal) * 100).toFixed(2)) : 0,
    avgTradeTimeS: deathsTraded > 0 ? Number((tradeDeltaSum / deathsTraded).toFixed(2)) : 0,
    deathsTotal,
    deathsTraded,
  }
  const impactWonRounds = {
    rounds: wonRoundsCount,
    kills: wonRoundsKills,
    deaths: wonRoundsDeaths,
    kd: Number((wonRoundsKills / Math.max(1, wonRoundsDeaths)).toFixed(2)),
    adr: wonRoundsCount > 0 ? Number((wonRoundsDamage / wonRoundsCount).toFixed(1)) : 0,
  }
  const antiEcoDiscipline = {
    rounds: antiEcoRounds,
    kills: antiEcoKills,
    deaths: antiEcoDeaths,
    kd: Number((antiEcoKills / Math.max(1, antiEcoDeaths)).toFixed(2)),
    adr: antiEcoRounds > 0 ? Number((antiEcoDamage / antiEcoRounds).toFixed(1)) : 0,
  }
  const clutchProfile = {
    attempts: clutchAttempts,
    wins: clutchWins,
    conversionPct: clutchAttempts > 0 ? Number(((clutchWins / clutchAttempts) * 100).toFixed(2)) : 0,
    best: bestClutch,
  }
  const pacingBySide = {
    atkAvgS: pacing.atk.count > 0 ? Number((pacing.atk.sum / pacing.atk.count).toFixed(2)) : 0,
    defAvgS: pacing.def.count > 0 ? Number((pacing.def.sum / pacing.def.count).toFixed(2)) : 0,
  }
  const consistencyByHalf = (() => {
    const calc = (bucket) => {
      const rounds = Math.max(1, bucket.rounds)
      const adr = bucket.damage / rounds
      const hsPct = bucket.kills > 0 ? (bucket.hs / bucket.kills) * 100 : 0
      const rating = ((bucket.kills + (bucket.assists * 0.6) - (bucket.deaths * 0.7)) / rounds) + (adr / 100)
      return {
        rounds: bucket.rounds,
        kills: bucket.kills,
        deaths: bucket.deaths,
        adr: Number(adr.toFixed(1)),
        hsPct: Number(hsPct.toFixed(1)),
        rating: Number(Math.max(0, rating).toFixed(2)),
      }
    }
    return {
      h1: calc(half.h1),
      h2: calc(half.h2),
    }
  })()
  const deathRisk = (() => {
    const rounds = Math.max(1, deathRiskAgg.rounds)
    const expectedRatePct = (deathRiskAgg.expectedDeathSum / rounds) * 100
    const actualRatePct = (deathRiskAgg.actualDeaths / rounds) * 100
    const avgRiskOnDeathsPct = deathRiskAgg.deathRounds > 0
      ? (deathRiskAgg.riskOnDeathsSum / deathRiskAgg.deathRounds) * 100
      : 0
    const avgRiskOnSurvivePct = deathRiskAgg.surviveRounds > 0
      ? (deathRiskAgg.riskOnSurviveSum / deathRiskAgg.surviveRounds) * 100
      : 0
    const highRiskDeathPct = deathRiskAgg.actualDeaths > 0
      ? (deathRiskAgg.highRiskDeaths / deathRiskAgg.actualDeaths) * 100
      : 0
    const riskIndex = expectedRatePct > 0 ? actualRatePct / expectedRatePct : 0
    return {
      expectedRatePct: Number(expectedRatePct.toFixed(1)),
      actualRatePct: Number(actualRatePct.toFixed(1)),
      avgRiskOnDeathsPct: Number(avgRiskOnDeathsPct.toFixed(1)),
      avgRiskOnSurvivePct: Number(avgRiskOnSurvivePct.toFixed(1)),
      highRiskDeaths: deathRiskAgg.highRiskDeaths,
      highRiskDeathPct: Number(highRiskDeathPct.toFixed(1)),
      riskIndex: Number(riskIndex.toFixed(2)),
      rounds: deathRiskAgg.rounds,
      model: 'heuristic_v1',
    }
  })()

  return {
    soloEntryTrDeaths,
    entryScore,
    tradeability,
    isolatedBombsiteDeaths,
    isolatedSoloBombsiteDeaths,
    impactWonRounds,
    antiEcoDiscipline,
    clutchProfile,
    postPlantValue: postPlant,
    pacingBySide,
    consistencyByHalf,
    deathRisk,
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
  const aimRoundInsights = computeAimRoundInsights(match, steamId, names)
  const movement = buildMovement(match, steamId)
  const shots = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'weapon_fire' && String(e.player_steamid ?? '') === String(steamId)))
  const hurts = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'hurt'))
  const hitEvents = hurts.filter((e) => String(e.attacker_steamid ?? '') === String(steamId))
  const flashDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'flashbang_detonate' && String(e.player_steamid ?? '') === String(steamId)))
  const smokeDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'smokegrenade_detonate' && String(e.player_steamid ?? '') === String(steamId)))
  const heDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'hegrenade_detonate' && String(e.player_steamid ?? '') === String(steamId)))
  const mollyDet = (match.rounds ?? []).flatMap((r) => (r.timeline ?? []).filter((e) => e.event === 'inferno_startburn' && String(e.player_steamid ?? '') === String(steamId)))
  const teamStartById = new Map((match?.players ?? []).map((p) => [String(p.steam_id), normalizeTeamKey(p.team)]))
  const blindedPlayers = new Set()
  const enemyBlindedPlayers = new Set()
  const friendlyBlindedPlayers = new Set()
  for (const round of (match.rounds ?? [])) {
    const roundTeamById = new Map()
    for (const ev of (round.timeline ?? [])) {
      if (ev.event === 'kill') {
        const killerId = String(ev.killer_steamid ?? '')
        const victimId = String(ev.victim_steamid ?? '')
        const killerTeam = normalizeTeamKey(ev.killer_team)
        const victimTeam = normalizeTeamKey(ev.victim_team)
        if (killerId && killerTeam !== 'team_unknown') roundTeamById.set(killerId, killerTeam)
        if (victimId && victimTeam !== 'team_unknown') roundTeamById.set(victimId, victimTeam)
      }
      if (ev.event === 'hurt' || ev.event === 'player_blind') {
        const attackerId = String(ev.attacker_steamid ?? ev.player_steamid ?? '')
        const victimId = String(ev.victim_steamid ?? '')
        const attackerTeam = normalizeTeamKey(ev.attacker_team)
        const victimTeam = normalizeTeamKey(ev.victim_team)
        if (attackerId && attackerTeam !== 'team_unknown') roundTeamById.set(attackerId, attackerTeam)
        if (victimId && victimTeam !== 'team_unknown') roundTeamById.set(victimId, victimTeam)
      }
    }

    for (const ev of (round.timeline ?? [])) {
      if (ev.event !== 'player_blind') continue
      if (String(ev.player_steamid ?? '') !== String(steamId)) continue
      const victimId = String(ev.victim_steamid ?? '')
      if (!victimId) continue
      blindedPlayers.add(victimId)

      const throwerSideFromEvent = normalizeTeamKey(ev.attacker_team)
      const victimSideFromEvent = normalizeTeamKey(ev.victim_team)
      const throwerSide = throwerSideFromEvent !== 'team_unknown'
        ? throwerSideFromEvent
        : (roundTeamById.get(String(steamId)) ?? 'team_unknown')
      const throwerSideResolved = throwerSide !== 'team_unknown'
        ? throwerSide
        : sideForRound(player.team, round.round_number)
      const victimStart = teamStartById.get(victimId)
      const victimSide = victimSideFromEvent !== 'team_unknown'
        ? victimSideFromEvent
        : (roundTeamById.get(victimId) ?? 'team_unknown')
      const victimSideResolved = victimSide !== 'team_unknown'
        ? victimSide
        : sideForRound(victimStart, round.round_number)
      if (victimSideResolved === 'team_unknown') continue
      if (throwerSideResolved === 'team_unknown') continue
      if (victimSideResolved === throwerSideResolved) friendlyBlindedPlayers.add(victimId)
      else enemyBlindedPlayers.add(victimId)
    }
  }

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
    enemiesFlashed: enemyBlindedPlayers.size,
    teammatesFlashed: friendlyBlindedPlayers.size,
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
  const insights = computePlayerInsights(match, player, steamId)

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
    insights,
    aimRoundInsights,
    timeline,
    heatmap: movement.heatmapData,
    weapons: Array.from(weaponsMap.values()).sort((a, b) => b.kills - a.kills),
  }
}
