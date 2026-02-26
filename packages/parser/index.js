export const DEFAULT_MAP = 'unknown_map'

export function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function pick(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj?.[key] !== null) return obj[key]
  }
  return undefined
}

export function normalizeTeam(value) {
  const raw = String(value ?? '').toLowerCase()
  const num = Number(value)
  if (num === 3 || raw === '3' || raw.includes('ct') || raw.includes('counter')) return 'team_ct_start'
  if (num === 2 || raw === '2' || raw.includes('terror') || raw === 't') return 'team_t_start'
  return 'team_unknown'
}

export function normalizeReason(reason) {
  const raw = String(reason ?? '').toLowerCase()
  if (raw.includes('defus')) return 'bomb_defused'
  if (raw.includes('explod')) return 'bomb_exploded'
  if (raw.includes('time')) return 'time'
  return 'elimination'
}

export function normalizeEvents(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (!parsed || typeof parsed !== 'object') return []
  const flat = []
  for (const [eventName, rows] of Object.entries(parsed)) {
    if (!Array.isArray(rows)) continue
    for (const row of rows) flat.push({ ...row, event_name: row?.event_name ?? eventName })
  }
  return flat
}

export function detectDemoHeader(bytesLike) {
  const bytes = bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike)
  const signature = String.fromCharCode(...bytes.slice(0, 8))
  if (signature.startsWith('\u001f\u008b')) return 'gzip'
  if (signature.startsWith('PBDEMS2')) return 'cs2'
  if (signature.startsWith('HL2DEMO')) return 'csgo'
  return 'unknown'
}

function mapBuyTier(equipValue) {
  if (equipValue <= 12000) return 'eco'
  if (equipValue <= 20000) return 'half'
  return 'full'
}

function buildRoundShell(roundNumber) {
  return {
    round_number: roundNumber,
    start_tick: 0,
    end_tick: 0,
    winner: 'team_unknown',
    win_reason: 'elimination',
    state_transitions: ['5v5'],
    opening_advantage_team_id: null,
    timeline: [],
    economy: {
      team_ct_start: { equipment_value: 0, cash_spent: 0, buy_tier: 'eco' },
      team_t_start: { equipment_value: 0, cash_spent: 0, buy_tier: 'eco' },
    },
  }
}

function determineRoundNumber(event, fallbackRound = 1) {
  return toNumber(pick(event, ['round_number', 'round', 'total_rounds_played', 'total_rounds']), 0) || fallbackRound
}

function inferRoundByTick(tick, roundEnds) {
  if (!Array.isArray(roundEnds) || roundEnds.length === 0) return 1
  const t = toNumber(tick, 0)
  if (t <= 0) return 1
  for (const entry of roundEnds) {
    if (t <= entry.endTick) return entry.roundNumber
  }
  return roundEnds[roundEnds.length - 1].roundNumber
}

function mapTimelineEventName(rawName = '') {
  const name = String(rawName).toLowerCase()
  if (name === 'item_purchase') return 'purchase'
  if (name === 'item_pickup') return 'pickup'
  if (name === 'item_drop') return 'drop'
  if (name === 'bomb_planted') return 'bomb_planted'
  if (name === 'bomb_defused') return 'bomb_defused'
  if (name === 'player_hurt') return 'hurt'
  if (name === 'weapon_fire') return 'weapon_fire'
  if (name === 'flashbang_detonate') return 'flashbang_detonate'
  if (name === 'smokegrenade_detonate') return 'smokegrenade_detonate'
  if (name === 'hegrenade_detonate') return 'hegrenade_detonate'
  if (name === 'inferno_startburn') return 'inferno_startburn'
  if (name === 'player_blind') return 'player_blind'
  return name
}

function readPositionFromTickRow(row) {
  const x = Number(row?.['CCSPlayerPawn.m_vecX'])
  const y = Number(row?.['CCSPlayerPawn.m_vecY'])
  const z = Number(row?.['CCSPlayerPawn.m_vecZ'])
  const hasCoords = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
  if (!hasCoords) return null
  const placeRaw = row?.['CCSPlayerPawn.m_szLastPlaceName']
  const place = typeof placeRaw === 'string' && placeRaw.trim() ? placeRaw.trim() : ''
  return { x, y, z, place: place || undefined }
}

function attachEventPositions(rounds, parseTicks, buffer) {
  if (!Array.isArray(rounds) || rounds.length === 0) return
  if (typeof parseTicks !== 'function') return

  const wantedTicks = new Set()
  const wantedPlayers = new Set()

  for (const round of rounds) {
    for (const event of round.timeline ?? []) {
      const tick = toNumber(event.tick, 0)
      if (tick <= 0) continue
      if (event.event === 'kill') {
        const killer = String(event.killer_steamid ?? '')
        const victim = String(event.victim_steamid ?? '')
        if (killer) {
          wantedTicks.add(tick)
          wantedPlayers.add(killer)
        }
        if (victim) {
          wantedTicks.add(tick)
          wantedPlayers.add(victim)
        }
      } else {
        const pid = String(event.player_steamid ?? '')
        if (pid) {
          wantedTicks.add(tick)
          wantedPlayers.add(pid)
        }
      }
    }
  }

  if (wantedTicks.size === 0 || wantedPlayers.size === 0) return

  let rows = []
  try {
    rows = parseTicks(
      buffer,
      [
        'tick',
        'steamid',
        'CCSPlayerPawn.m_vecX',
        'CCSPlayerPawn.m_vecY',
        'CCSPlayerPawn.m_vecZ',
        'CCSPlayerPawn.m_szLastPlaceName',
      ],
      Array.from(wantedTicks),
      Array.from(wantedPlayers),
      false,
      false,
      undefined,
    )
  } catch {
    rows = []
  }

  const byTickAndPlayer = new Map()
  for (const row of rows ?? []) {
    const tick = toNumber(row?.tick, 0)
    const steamid = String(row?.steamid ?? '')
    if (tick <= 0 || !steamid) continue
    const pos = readPositionFromTickRow(row)
    if (!pos) continue
    byTickAndPlayer.set(`${tick}|${steamid}`, pos)
  }

  for (const round of rounds) {
    for (const event of round.timeline ?? []) {
      const tick = toNumber(event.tick, 0)
      if (tick <= 0) continue

      if (event.event === 'kill') {
        const killer = String(event.killer_steamid ?? '')
        const victim = String(event.victim_steamid ?? '')
        if (killer) {
          const pos = byTickAndPlayer.get(`${tick}|${killer}`)
          if (pos) event.killer_position = pos
        }
        if (victim) {
          const pos = byTickAndPlayer.get(`${tick}|${victim}`)
          if (pos) event.victim_position = pos
        }
      } else {
        const pid = String(event.player_steamid ?? '')
        if (!pid) continue
        const pos = byTickAndPlayer.get(`${tick}|${pid}`)
        if (pos) event.position = pos
      }
    }
  }
}

function groupEvents(roundEvents, deathEvents, miscEvents = [], roundStartEvents = [], roundFreezeEndEvents = []) {
  const rounds = new Map()
  const sortedRoundEnds = [...roundEvents].sort((a, b) => {
    const at = toNumber(pick(a, ['tick', 'event_tick', 'game_time']), 0)
    const bt = toNumber(pick(b, ['tick', 'event_tick', 'game_time']), 0)
    return at - bt
  })

  const ensureRound = (roundNumber) => {
    if (!rounds.has(roundNumber)) rounds.set(roundNumber, buildRoundShell(roundNumber))
    return rounds.get(roundNumber)
  }

  const roundEndBoundaries = []
  for (let idx = 0; idx < sortedRoundEnds.length; idx += 1) {
    const event = sortedRoundEnds[idx]
    const roundNumber = idx + 1
    const round = ensureRound(roundNumber)
    const endTick = toNumber(pick(event, ['tick', 'event_tick', 'game_time']), 0)
    round.end_tick = Math.max(round.end_tick, endTick)
    round.winner = normalizeTeam(pick(event, ['winner', 'winning_team', 'winner_team']))
    round.win_reason = normalizeReason(pick(event, ['reason', 'win_reason']))
    if (endTick > 0) roundEndBoundaries.push({ roundNumber, endTick })
  }
  roundEndBoundaries.sort((a, b) => a.endTick - b.endTick)

  for (const event of roundStartEvents) {
    const tick = toNumber(pick(event, ['tick', 'event_tick', 'game_time']), 0)
    const explicitRound = determineRoundNumber(event, 0)
    const roundNumber = explicitRound > 0
      ? explicitRound
      : inferRoundByTick(tick, roundEndBoundaries)
    const round = ensureRound(roundNumber)
    if (tick > 0 && (round.start_tick === 0 || tick < round.start_tick)) {
      round.start_tick = tick
    }
  }

  for (const event of roundFreezeEndEvents) {
    const tick = toNumber(pick(event, ['tick', 'event_tick', 'game_time']), 0)
    const explicitRound = determineRoundNumber(event, 0)
    const roundNumber = explicitRound > 0
      ? explicitRound
      : inferRoundByTick(tick, roundEndBoundaries)
    const round = ensureRound(roundNumber)
    // Preferir freeze_end como "tempo vivo" da rodada
    if (tick > 0) round.start_tick = tick
  }

  let fallbackRound = 1
  for (const event of deathEvents) {
    const tick = toNumber(pick(event, ['tick', 'game_time', 'event_tick']), 0)
    const roundNumber = roundEndBoundaries.length > 0
      ? inferRoundByTick(tick, roundEndBoundaries)
      : determineRoundNumber(event, fallbackRound)
    const round = ensureRound(roundNumber)
    fallbackRound = Math.max(fallbackRound, roundNumber)

    if (round.start_tick === 0 && tick > 0) round.start_tick = tick
    else if (tick > 0) round.start_tick = Math.min(round.start_tick, tick)
    round.timeline.push({
      t_s: tick > 0 ? tick / 64 : 0,
      tick,
      event: 'kill',
      killer_steamid: String(pick(event, ['attacker_steamid', 'attacker_player_steamid', 'attacker']) ?? ''),
      victim_steamid: String(pick(event, ['user_steamid', 'victim_steamid', 'userid']) ?? ''),
      assister_steamid: String(pick(event, ['assister_steamid', 'assister']) ?? ''),
      weapon: String(pick(event, ['weapon', 'weapon_name', 'weapon_item', 'attacker_weapon']) ?? ''),
      killer_team: normalizeTeam(pick(event, ['attacker_team_num', 'attacker_team'])),
      victim_team: normalizeTeam(pick(event, ['user_team_num', 'victim_team'])),
      headshot: Boolean(pick(event, ['headshot', 'is_headshot'])),
      trade_of: null,
      trade_delta_s: null,
      post_plant: false,
      opening_kill: false,
    })
  }

  for (const event of miscEvents) {
    const tick = toNumber(pick(event, ['tick', 'game_time', 'event_tick']), 0)
    const roundNumber = roundEndBoundaries.length > 0
      ? inferRoundByTick(tick, roundEndBoundaries)
      : determineRoundNumber(event, fallbackRound)
    const round = ensureRound(roundNumber)
    if (round.start_tick === 0 && tick > 0) round.start_tick = tick
    else if (tick > 0) round.start_tick = Math.min(round.start_tick, tick)
    const eventType = mapTimelineEventName(event.event_name)
    const baseEvent = {
      t_s: tick > 0 ? tick / 64 : 0,
      tick,
      event: eventType,
      player_steamid: String(
        pick(event, ['user_steamid', 'player_steamid', 'userid', 'steamid', 'attacker_steamid']) ?? '',
      ),
      player_team: normalizeTeam(pick(event, ['user_team_num', 'player_team', 'team_num'])),
      weapon: String(pick(event, ['weapon', 'weapon_name', 'weapon_item', 'item_name', 'item']) ?? ''),
    }
    if (eventType === 'hurt') {
      baseEvent.attacker_steamid = String(pick(event, ['attacker_steamid', 'attacker']) ?? '')
      baseEvent.victim_steamid = String(pick(event, ['user_steamid', 'victim_steamid', 'userid']) ?? '')
      baseEvent.damage = toNumber(pick(event, ['dmg_health', 'health_damage', 'damage', 'dmg']), 0)
    }
    if (eventType === 'player_blind') {
      baseEvent.player_steamid = String(pick(event, ['attacker_steamid', 'attacker']) ?? baseEvent.player_steamid ?? '')
      baseEvent.victim_steamid = String(pick(event, ['user_steamid', 'userid', 'victim_steamid']) ?? '')
      baseEvent.blind_duration = toNumber(pick(event, ['blind_duration', 'blind_duration_s']), 0)
    }
    round.timeline.push(baseEvent)
  }

  const ordered = Array.from(rounds.values()).sort((a, b) => a.round_number - b.round_number)
  for (let i = 0; i < ordered.length; i += 1) {
    if (ordered[i].start_tick > 0) continue
    const prevEnd = i > 0 ? toNumber(ordered[i - 1].end_tick, 0) : 0
    ordered[i].start_tick = prevEnd > 0 ? prevEnd + 1 : 0
  }

  return ordered
}

function enrichTradesAndStates(rounds) {
  for (const round of rounds) {
    round.timeline.sort((a, b) => a.tick - b.tick)
    const kills = round.timeline.filter((e) => e.event === 'kill')
    if (kills[0]) {
      kills[0].opening_kill = true
      round.opening_advantage_team_id = kills[0].killer_team
    }

    let ctAlive = 5
    let tAlive = 5
    const transitions = ['5v5']
    for (let i = 0; i < kills.length; i += 1) {
      const kill = kills[i]
      if (kill.victim_team === 'team_ct_start') ctAlive = Math.max(0, ctAlive - 1)
      if (kill.victim_team === 'team_t_start') tAlive = Math.max(0, tAlive - 1)
      transitions.push(`${ctAlive}v${tAlive}`)
      for (let j = i + 1; j < kills.length; j += 1) {
        const next = kills[j]
        if (next.tick - kill.tick > 320) break
        if (next.killer_team === kill.victim_team && next.victim_steamid === kill.killer_steamid) {
          next.trade_of = kill.victim_steamid
          next.trade_delta_s = Math.max(0, (next.tick - kill.tick) / 64)
          break
        }
      }
    }
    round.state_transitions = transitions
  }
}

function buildPlayersFromRounds(rounds, tickRows) {
  const players = new Map()
  const upsert = (id, nick, team) => {
    const key = id || nick || `unknown-${players.size + 1}`
    if (!players.has(key)) {
      players.set(key, {
        steam_id: key,
        nick: nick || 'Unknown',
        team: team || 'team_unknown',
        stats: {
          kills: 0,
          deaths: 0,
          assists: 0,
          adr: 0,
          hs_percent: 0,
          rating_2: 0,
          kast: 0,
          entry_kills: 0,
          entry_deaths: 0,
          flash_assists: 0,
          util_used: { flash: 0, smoke: 0, molotov: 0, he: 0 },
          clutches: { '1v1': 0, '1v2': 0, '1v3': 0, '1v4': 0, '1v5': 0 },
          multikills: { '2k': 0, '3k': 0, '4k': 0, '5k': 0 },
          time_to_first_action_avg_s: 0,
        },
      })
    }
    return players.get(key)
  }

  const damageByPlayer = new Map()
  const nameByPlayer = new Map()
  const hsKillsByPlayer = new Map()
  const firstActionByPlayer = new Map()

  for (const round of rounds) {
    const roundKillCount = new Map()
    const kills = round.timeline.filter((e) => e.event === 'kill')
    for (const [idx, kill] of kills.entries()) {
      const killer = upsert(kill.killer_steamid, kill.killer_steamid, kill.killer_team)
      const victim = upsert(kill.victim_steamid, kill.victim_steamid, kill.victim_team)
      killer.stats.kills += 1
      victim.stats.deaths += 1
      if (idx === 0) {
        killer.stats.entry_kills += 1
        victim.stats.entry_deaths += 1
      }
      if (kill.assister_steamid) {
        const assister = upsert(kill.assister_steamid, kill.assister_steamid, kill.killer_team)
        assister.stats.assists += 1
      }
      roundKillCount.set(killer.steam_id, (roundKillCount.get(killer.steam_id) ?? 0) + 1)
      if (kill.headshot) hsKillsByPlayer.set(killer.steam_id, (hsKillsByPlayer.get(killer.steam_id) ?? 0) + 1)
      if (!firstActionByPlayer.has(killer.steam_id)) firstActionByPlayer.set(killer.steam_id, [])
      firstActionByPlayer.get(killer.steam_id).push(kill.t_s)
    }
    for (const [pid, count] of roundKillCount.entries()) {
      const p = players.get(pid)
      if (!p || count < 2) continue
      const bucket = `${Math.min(5, count)}k`
      p.stats.multikills[bucket] = (p.stats.multikills[bucket] ?? 0) + 1
    }
  }

  for (const row of tickRows ?? []) {
    const id = String(pick(row, ['steamid']) ?? '')
    if (!id || !players.has(id)) continue
    const nick = String(pick(row, ['name']) ?? '').trim()
    if (nick && !/^\d{8,}$/.test(nick)) nameByPlayer.set(id, nick)
    damageByPlayer.set(id, toNumber(row.damage_total, damageByPlayer.get(id) ?? 0))
  }

  const roundsTotal = Math.max(rounds.length, 1)
  for (const player of players.values()) {
    const parsedNick = nameByPlayer.get(player.steam_id)
    if (parsedNick) player.nick = parsedNick
    else if (/^\d{8,}$/.test(player.nick)) player.nick = `Player-${player.steam_id.slice(-4)}`

    const damage = damageByPlayer.get(player.steam_id) ?? player.stats.kills * 50
    player.stats.adr = damage / roundsTotal
    const hsKills = hsKillsByPlayer.get(player.steam_id) ?? 0
    player.stats.hs_percent = player.stats.kills > 0 ? (hsKills / player.stats.kills) * 100 : 0
    player.stats.rating_2 = Math.max(0, (player.stats.kills + player.stats.assists * 0.6 - player.stats.deaths * 0.7) / roundsTotal + player.stats.adr / 100)
    const actionTimes = firstActionByPlayer.get(player.steam_id) ?? []
    player.stats.time_to_first_action_avg_s = actionTimes.length ? actionTimes.reduce((a, b) => a + b, 0) / actionTimes.length : 0
  }

  return Array.from(players.values())
}

function fillEconomy(rounds) {
  for (const round of rounds) {
    const ctEquip = 20000 + round.round_number * 120
    const tEquip = 20000 + round.round_number * 120
    round.economy.team_ct_start = { equipment_value: ctEquip, cash_spent: Math.round(ctEquip * 0.85), buy_tier: mapBuyTier(ctEquip) }
    round.economy.team_t_start = { equipment_value: tEquip, cash_spent: Math.round(tEquip * 0.85), buy_tier: mapBuyTier(tEquip) }
  }
  const ctScore = rounds.filter((r) => r.winner === 'team_ct_start').length
  const tScore = rounds.filter((r) => r.winner === 'team_t_start').length
  return { team_ct_start: ctScore, team_t_start: tScore, winner: ctScore >= tScore ? 'team_ct_start' : 'team_t_start' }
}

export function parseDemoBuffer(buffer, parseFns, fileMeta = {}) {
  const { parseHeader, parseEvents, parseEvent, parseTicks } = parseFns
  const format = detectDemoHeader(buffer)
  if (format === 'gzip') throw new Error('Arquivo compactado (.gz). Extraia antes de enviar.')
  if (format === 'csgo') throw new Error('Demo de CS:GO detectada (HL2DEMO). Envie demo de CS2.')

  let header = {}
  try { header = parseHeader(buffer) ?? {} } catch { header = {} }

  let allEvents = []
  try {
    allEvents = normalizeEvents(
      parseEvents(
        buffer,
        [
          'round_start',
          'round_freeze_end',
          'round_end',
          'player_death',
          'player_hurt',
          'weapon_fire',
          'bomb_planted',
          'bomb_defused',
          'item_purchase',
          'item_drop',
          'item_pickup',
          'flashbang_detonate',
          'smokegrenade_detonate',
          'hegrenade_detonate',
          'inferno_startburn',
          'player_blind',
        ],
        ['team_num', 'name', 'steamid'],
        [
          'round',
          'total_rounds_played',
          'reason',
          'winner',
          'weapon',
          'weapon_name',
          'weapon_item',
          'item_name',
          'item',
          'attacker_weapon',
          'headshot',
          'is_headshot',
          'dmg_health',
          'health_damage',
          'damage',
          'dmg',
          'blind_duration',
        ],
      ),
    )
  } catch {
    const fallback = []
    for (const eventName of [
      'round_start',
      'round_freeze_end',
      'round_end',
      'player_death',
      'player_hurt',
      'weapon_fire',
      'bomb_planted',
      'bomb_defused',
      'item_purchase',
      'item_drop',
      'item_pickup',
      'flashbang_detonate',
      'smokegrenade_detonate',
      'hegrenade_detonate',
      'inferno_startburn',
      'player_blind',
    ]) {
      try {
        fallback.push(
          ...normalizeEvents(
            parseEvent(
              buffer,
              eventName,
              ['team_num', 'name', 'steamid'],
              [
                'round',
                'total_rounds_played',
                'reason',
                'winner',
                'weapon',
                'weapon_name',
                'weapon_item',
                'item_name',
                'item',
                'attacker_weapon',
                'headshot',
                'is_headshot',
                'dmg_health',
                'health_damage',
                'damage',
                'dmg',
                'blind_duration',
              ],
            ),
          ),
        )
      } catch { /* noop */ }
    }
    allEvents = fallback
  }

  const rounds = groupEvents(
    allEvents.filter((e) => String(e.event_name).toLowerCase() === 'round_end'),
    allEvents.filter((e) => String(e.event_name).toLowerCase() === 'player_death'),
    allEvents.filter((e) => [
      'bomb_planted',
      'bomb_defused',
      'item_purchase',
      'item_drop',
      'item_pickup',
      'player_hurt',
      'weapon_fire',
      'flashbang_detonate',
      'smokegrenade_detonate',
      'hegrenade_detonate',
      'inferno_startburn',
      'player_blind',
    ].includes(String(e.event_name).toLowerCase())),
    allEvents.filter((e) => String(e.event_name).toLowerCase() === 'round_start'),
    allEvents.filter((e) => String(e.event_name).toLowerCase() === 'round_freeze_end'),
  )
  attachEventPositions(rounds, parseTicks, buffer)
  enrichTradesAndStates(rounds)

  let tickRows = []
  try {
    tickRows = parseTicks(
      buffer,
      ['steamid', 'name', 'team_num', 'damage_total', 'kills_total', 'deaths_total', 'assists_total', 'headshot_kills_total'],
      undefined, undefined, false, false, undefined,
    )
  } catch { tickRows = [] }

  const players = buildPlayersFromRounds(rounds, tickRows)
  const score = fillEconomy(rounds)
  if (Object.keys(header).length === 0 && rounds.length === 0 && players.length === 0) {
    throw new Error('Nao foi possivel ler esta demo. Pode estar incompleta/corrompida ou em formato nao suportado.')
  }

  const playedAt = fileMeta.fileLastModified > 0 ? new Date(fileMeta.fileLastModified).toISOString() : new Date().toISOString()
  return {
    match_id: fileMeta.matchId,
    meta: {
      map: String(pick(header, ['map_name', 'map', 'mapname']) ?? DEFAULT_MAP),
      played_at: playedAt,
      rounds_total: rounds.length,
      final_score: { ct: score.team_ct_start, t: score.team_t_start },
      starting_side: 'ct',
      source_file: fileMeta.fileName || undefined,
    },
    players,
    rounds,
    raw_events_count: allEvents.length,
  }
}
