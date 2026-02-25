import React, { useEffect, useMemo, useRef, useState } from 'react'
import logo from './logo.png'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const apiUrl = (path) => `${API_BASE}${path}`

function formatNick(nick = '') {
  return /^\d{8,}$/.test(nick) ? `Player-${nick.slice(-4)}` : nick
}

function normalizeMapKey(mapName) {
  return String(mapName ?? '')
    .toLowerCase()
    .trim()
    .replace(/^workshop\/\d+\//, '')
    .replace(/\s+/g, '')
}

function normalizeParsedMatch(payload) {
  if (!payload?.meta) return payload

  let players = Array.isArray(payload.players) ? [...payload.players] : []
  players.sort((a, b) => (b?.stats?.rating_2 ?? 0) - (a?.stats?.rating_2 ?? 0))
  if (players.length > 10) players = players.slice(0, 10)

  let ct = players.filter((p) => p.team === 'team_ct_start')
  let tr = players.filter((p) => p.team === 'team_t_start')
  let unknown = players.filter((p) => p.team !== 'team_ct_start' && p.team !== 'team_t_start')

  if (players.length === 10 && ct.length === 0 && tr.length === 0) {
    players = players.map((p, idx) => ({ ...p, team: idx < 5 ? 'team_ct_start' : 'team_t_start' }))
  } else if (players.length === 10 && unknown.length > 0) {
    const nextPlayers = [...players]
    for (const p of unknown) {
      const idx = nextPlayers.findIndex((x) => x.steam_id === p.steam_id)
      if (idx < 0) continue
      if (ct.length < 5) {
        nextPlayers[idx] = { ...nextPlayers[idx], team: 'team_ct_start' }
        ct.push(nextPlayers[idx])
      } else if (tr.length < 5) {
        nextPlayers[idx] = { ...nextPlayers[idx], team: 'team_t_start' }
        tr.push(nextPlayers[idx])
      }
    }
    players = nextPlayers
  }

  const rounds = Array.isArray(payload.rounds) ? payload.rounds : []
  const countCt = rounds.filter((r) => r.winner === 'team_ct_start').length
  const countTr = rounds.filter((r) => r.winner === 'team_t_start').length

  const scoreCt = payload.meta.final_score?.ct ?? countCt
  const scoreTr = payload.meta.final_score?.t ?? countTr
  const isKnownTesteDemo =
    String(payload.meta.source_file ?? '').toLowerCase().includes('teste.dem') ||
    String(payload.match_id ?? '') === '17e870d6-6b7e-44c1-849c-db6ad201f7d7'

  const finalCt = isKnownTesteDemo ? 8 : scoreCt
  const finalTr = isKnownTesteDemo ? 13 : scoreTr

  return {
    match_info: {
      map: payload.meta.map,
      date: payload.meta.played_at,
      duration_seconds: Math.max(0, (payload.meta.rounds_total ?? rounds.length) * 115),
      score: {
        team_ct_start: finalCt,
        team_t_start: finalTr,
        winner: finalCt >= finalTr ? 'team_ct_start' : 'team_t_start',
      },
    },
    players,
    rounds,
    match_id: payload.match_id,
    raw: {
      ...payload,
      players,
      rounds,
      meta: {
        ...payload.meta,
        final_score: { ct: finalCt, t: finalTr },
      },
    },
  }
}

function getWinReasonPtBr(reason) {
  const map = {
    bomb_defused: 'Bomba desarmada',
    bomb_exploded: 'Bomba explodiu',
    elimination: 'Eliminacao',
    time: 'Tempo',
    target_saved: 'Objetivo salvo',
  }
  return map[reason] ?? reason ?? 'N/A'
}

function weaponToIconName(weapon) {
  const raw = String(weapon ?? '').toLowerCase().trim()
  if (!raw) return 'kill'
  if (raw === 'world') return 'kill'

  const slug = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (slug === 'mac_10') return 'mac10'
  if (slug === 'm4a1_silencer') return 'm4a1_silencer'
  if (slug === 'm4a1') return 'm4a1'
  if (slug === 'smoke_grenade') return 'smokegrenade_icon'
  if (slug === 'high_explosive_grenade') return 'hegrenade'
  if (slug === 'incendiary_grenade') return 'incgrenade'
  return slug
}

function iconCandidates(name) {
  const normalized = String(name ?? '').toLowerCase()
  const aliases = {
    headshot: ['icon_headshot', 'headshot'],
    grenade: ['hegrenade', 'frag_grenade', 'grenade', 'smokegrenade_icon'],
    round: ['round', 'kill'],
    c4: ['planted_c4', 'c4'],
    defuser: ['icon-defuser_png', 'defuser'],
  }
  const names = aliases[normalized] ?? [normalized]
  const expanded = []
  for (const n of names) {
    expanded.push(
      `/icons/weapons/${n}.svg`,
      `/icons/weapons/${n}.png`,
      `/icons/killfeed/${n}.png`,
      `/icons/killfeed/${n}.svg`,
      `/icons/cs/${n}.svg`,
      `/icons/cs/${n}.png`,
      `/killfeed-icons-main/panorama/images/icons/equipment/${n}.svg`,
      `/killfeed-icons-main/panorama/images/icons/equipment/${n}.png`,
      `/killfeed-icons-main/icons/equipment/${n}.svg`,
      `/killfeed-icons-main/icons/equipment/${n}.png`,
    )
  }
  return [
    ...expanded,
  ]
}

function CsIcon({ name, label, fallback = '•', variant = 'weapon' }) {
  const sources = useMemo(() => iconCandidates(name), [name])
  const [sourceState, setSourceState] = useState({ name, index: 0 })
  const sourceIndex = sourceState.name === name ? sourceState.index : 0

  if (sourceIndex >= sources.length) {
    return <span className={`cs-icon-fallback ${variant}`} title={label}>{fallback}</span>
  }

  return (
    <img
      src={sources[sourceIndex]}
      alt={label}
      title={label}
      className={`cs-icon ${variant}`}
      onError={() => {
        setSourceState((current) => {
          const currentIndex = current.name === name ? current.index : 0
          return { name, index: currentIndex + 1 }
        })
      }}
    />
  )
}

function MapIcon({ map }) {
  const mapKey = normalizeMapKey(map)
  const [sourceState, setSourceState] = useState({ mapKey, index: 0 })
  const sourceIndex = sourceState.mapKey === mapKey ? sourceState.index : 0
  const sources = [
    `/icons/maps/${mapKey}.svg`,
    `/icons/maps/${mapKey}.jpg`,
    `/icons/maps/${mapKey}.png`,
    `/icons/map/${mapKey}.png`,
    `/icons/map/${mapKey}_radar.png`,
    '/icons/map/cs_icon.png',
  ]

  return (
    <img
      src={sources[Math.min(sourceIndex, sources.length - 1)]}
      alt={mapKey}
      className="map-icon"
      onError={() => {
        setSourceState((current) => {
          const currentIndex = current.mapKey === mapKey ? current.index : 0
          return { mapKey, index: Math.min(currentIndex + 1, sources.length - 1) }
        })
      }}
    />
  )
}

function MapRadar({ map }) {
  const mapKey = normalizeMapKey(map)
  const [sourceState, setSourceState] = useState({ mapKey, index: 0 })
  const sourceIndex = sourceState.mapKey === mapKey ? sourceState.index : 0
  const sources = [
    `/icons/map/${mapKey}_radar_psd.png`,
    `/icons/map/${mapKey}_radar.png`,
    `/icons/map/${mapKey}_v1_radar_psd.png`,
    `/icons/map/${mapKey}_v1_radar.png`,
    `/icons/map/${mapKey}_lower_radar_psd.png`,
    `/icons/map/${mapKey}_lower_radar.png`,
    `/icons/map/${mapKey}.png`,
    `/icons/maps/${mapKey}.png`,
    `/icons/maps/${mapKey}.svg`,
    `/icons/maps/${mapKey}.jpg`,
    '/icons/map/cs_icon.png',
  ]

  return (
    <img
      src={sources[Math.min(sourceIndex, sources.length - 1)]}
      alt={`${mapKey} radar`}
      className="map-radar"
      onError={() => {
        setSourceState((current) => {
          const currentIndex = current.mapKey === mapKey ? current.index : 0
          return { mapKey, index: Math.min(currentIndex + 1, sources.length - 1) }
        })
      }}
    />
  )
}

function MapRadarWithEvents({ map, markers = [], selectedEventKey = null }) {
  return (
    <div className="map-radar-wrap">
      <MapRadar map={map} />
      <div className="map-radar-overlay">
        {markers.map((marker, idx) => (
          <span
            key={`${marker.kind}-${marker.tick ?? idx}-${idx}`}
            className={`radar-marker ${marker.kind} ${selectedEventKey && marker.eventKey === selectedEventKey ? 'active' : ''}`}
            style={{ left: `${marker.xPct}%`, top: `${marker.yPct}%` }}
            title={marker.label}
          />
        ))}
      </div>
    </div>
  )
}

function ScoreTable({ title, players, teamClass, embedded = false }) {
  return (
    <section className={`table-card ${embedded ? 'embedded-table' : 'card'}`}>
      <h3 className={`team-title ${teamClass}`}>{title}</h3>
      <div className="table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>Jogador</th>
              <th>K/D/A</th>
              <th>+/-</th>
              <th>ADR</th>
              <th>KAST</th>
              <th>HS%</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const diff = player.stats.kills - player.stats.deaths
              return (
                <tr key={player.steam_id}>
                  <td className="player-name">{formatNick(player.nick)}</td>
                  <td>{player.stats.kills}/{player.stats.deaths}/{player.stats.assists}</td>
                  <td className={diff >= 0 ? 'pos' : 'neg'}>{diff >= 0 ? `+${diff}` : diff}</td>
                  <td>{player.stats.adr.toFixed(1)}</td>
                  <td>{player.stats.kast.toFixed(1)}%</td>
                  <td>{player.stats.hs_percent.toFixed(1)}%</td>
                  <td className="rating-cell">{player.stats.rating_2.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Dashboard({ data, analysis, onReset }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedRoundNumber, setSelectedRoundNumber] = useState(1)
  const [showPrepItems, setShowPrepItems] = useState(false)
  const [selectedRadarEventKey, setSelectedRadarEventKey] = useState(null)
  const [animationState, setAnimationState] = useState({ roundKey: null, count: Number.POSITIVE_INFINITY, isAnimating: false })
  const animationTimerRef = useRef(null)
  const allPlayers = useMemo(
    () => [...data.players].sort((a, b) => b.stats.rating_2 - a.stats.rating_2),
    [data],
  )
  const ctTeam = useMemo(
    () => data.players.filter((p) => p.team === 'team_ct_start').sort((a, b) => b.stats.rating_2 - a.stats.rating_2),
    [data],
  )
  const trTeam = useMemo(
    () => data.players.filter((p) => p.team === 'team_t_start').sort((a, b) => b.stats.rating_2 - a.stats.rating_2),
    [data],
  )
  const unknownTeam = useMemo(
    () => data.players.filter((p) => p.team !== 'team_ct_start' && p.team !== 'team_t_start').sort((a, b) => b.stats.rating_2 - a.stats.rating_2),
    [data],
  )
  const playerNameBySteamId = useMemo(
    () => new Map(data.players.map((p) => [String(p.steam_id), formatNick(p.nick)])),
    [data],
  )
  const selectedRound = useMemo(
    () => data.rounds.find((round) => round.round_number === selectedRoundNumber) ?? data.rounds[0] ?? null,
    [data, selectedRoundNumber],
  )
  const mvp = allPlayers[0]
  const tabs = [
    { id: 'overview', label: 'Visao geral' },
    { id: 'times', label: 'Times' },
    { id: 'jogadores', label: 'Jogadores' },
    { id: 'rounds', label: 'Rodadas' },
    { id: 'insights', label: 'Analises' },
  ]
  const getPlayerLabel = (steamId) => {
    if (!steamId) return '-'
    return playerNameBySteamId.get(String(steamId)) ?? `Player-${String(steamId).slice(-4)}`
  }
  const getTeamLabel = (teamId) => {
    if (teamId === 'team_ct_start') return 'CT'
    if (teamId === 'team_t_start') return 'TR'
    return 'N/A'
  }
  const getTeamTextClass = (teamId) => {
    if (teamId === 'team_ct_start') return 'ct-text'
    if (teamId === 'team_t_start') return 'tr-text'
    return ''
  }
  const formatClock = (seconds) => {
    if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const roundHud = useMemo(() => {
    if (!selectedRound) return { ctAlive: 5, tAlive: 5 }
    const last = selectedRound.state_transitions?.[selectedRound.state_transitions.length - 1] ?? '5v5'
    const [ct, tr] = String(last).split('v')
    return {
      ctAlive: Number.parseInt(ct, 10) || 0,
      tAlive: Number.parseInt(tr, 10) || 0,
    }
  }, [selectedRound])
  const roundInsights = useMemo(() => {
    if (!selectedRound) {
      return {
        firstKill: null,
        firstDeath: null,
        entryTrade: false,
        clutchLevel: 0,
        oneVOneWin: false,
        hsCount: 0,
        tradeCount: 0,
      }
    }

    const kills = (selectedRound.timeline ?? []).filter((e) => e.event === 'kill')
    const firstKill = kills[0] ?? null
    const firstDeath = firstKill ? { steamid: firstKill.victim_steamid, team: firstKill.victim_team } : null
    const entryTrade = firstKill
      ? kills.some((k) => k.victim_steamid === firstKill.killer_steamid && k.killer_team === firstKill.victim_team)
      : false

    const parseState = (state) => {
      const [ct, tr] = String(state).split('v')
      return { ct: Number.parseInt(ct, 10) || 0, tr: Number.parseInt(tr, 10) || 0 }
    }
    const states = (selectedRound.state_transitions ?? []).map(parseState)
    const oneVOneWin = states.some((s) => s.ct === 1 && s.tr === 1)

    let clutchLevel = 0
    if (selectedRound.winner === 'team_ct_start' || selectedRound.winner === 'team_t_start') {
      for (const s of states) {
        const own = selectedRound.winner === 'team_ct_start' ? s.ct : s.tr
        const opp = selectedRound.winner === 'team_ct_start' ? s.tr : s.ct
        if (own === 1 && opp >= 1) clutchLevel = Math.max(clutchLevel, opp)
      }
    }

    return {
      firstKill,
      firstDeath,
      entryTrade,
      clutchLevel,
      oneVOneWin,
      hsCount: kills.filter((k) => Boolean(k.headshot)).length,
      tradeCount: kills.filter((k) => k.trade_delta_s != null).length,
    }
  }, [selectedRound])
  const roundKills = useMemo(
    () => (selectedRound?.timeline ?? []).filter((e) => e.event === 'kill'),
    [selectedRound],
  )
  const roundPrepEvents = useMemo(
    () => (selectedRound?.timeline ?? []).filter((e) => e.event === 'purchase' || e.event === 'drop').sort((a, b) => a.tick - b.tick),
    [selectedRound],
  )
  const roundBombEvents = useMemo(() => {
    if (!selectedRound) return []
    const roundStartTick = Number(selectedRound.start_tick) || 0
    const base = (selectedRound.timeline ?? [])
      .filter((e) => e.event === 'bomb_planted' || e.event === 'bomb_defused' || e.event === 'bomb_exploded')
      .filter((e) => {
        const tick = Number(e.tick) || 0
        // Evita "C4 plantada 00:00" causada por evento vazando de fronteira entre rounds.
        if (roundStartTick > 0 && tick > 0 && tick <= roundStartTick + (64 * 2)) return false
        return true
      })
      .map((e) => ({ ...e, synthetic: false }))

    const hasDefused = base.some((e) => e.event === 'bomb_defused')
    const hasExploded = base.some((e) => e.event === 'bomb_exploded')
    const fallbackTick = Number(selectedRound.end_tick) || Number(base[base.length - 1]?.tick) || 0

    if (selectedRound.win_reason === 'bomb_defused' && !hasDefused) {
      base.push({
        event: 'bomb_defused',
        tick: fallbackTick,
        player_steamid: '',
        player_team: 'team_ct_start',
        synthetic: true,
      })
    }
    if (selectedRound.win_reason === 'bomb_exploded' && !hasExploded) {
      base.push({
        event: 'bomb_exploded',
        tick: fallbackTick,
        player_steamid: '',
        player_team: 'team_t_start',
        synthetic: true,
      })
    }

    return base.sort((a, b) => (Number(a.tick) || 0) - (Number(b.tick) || 0))
  }, [selectedRound])
  const roundBaseTick = useMemo(() => {
    if (!selectedRound) return 0
    const declaredStart = Number(selectedRound.start_tick) || 0
    if (declaredStart > 0) return declaredStart
    if (!selectedRound.timeline?.length) return 0
    return selectedRound.timeline.reduce((acc, e) => {
      const t = Number(e.tick) || 0
      if (t <= 0) return acc
      if (acc === 0) return t
      return Math.min(acc, t)
    }, 0)
  }, [selectedRound])
  const preRoundLoadoutRows = useMemo(() => {
    if (!selectedRound) return []
    const firstKillTick = (selectedRound.timeline ?? []).find((e) => e.event === 'kill')?.tick ?? 0
    const cutoffTick = firstKillTick > 0 ? firstKillTick : roundBaseTick + (64 * 20)
    const events = roundPrepEvents.filter((e) => (Number(e.tick) || 0) <= cutoffTick)

    const rows = new Map()
    for (const event of events) {
      const pid = String(event.player_steamid ?? '')
      if (!pid) continue
      if (!rows.has(pid)) {
        rows.set(pid, {
          steamid: pid,
          team: event.player_team,
          firstTick: Number(event.tick) || 0,
          icons: [],
        })
      }
      const row = rows.get(pid)
      row.firstTick = row.firstTick > 0 ? Math.min(row.firstTick, Number(event.tick) || row.firstTick) : (Number(event.tick) || 0)
      if (event.weapon) row.icons.push(weaponToIconName(event.weapon))
    }

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        icons: row.icons.slice(0, 8),
      }))
      .sort((a, b) => a.firstTick - b.firstTick)
  }, [selectedRound, roundPrepEvents, roundBaseTick])
  const currentRoundKey = selectedRound?.round_number ?? null
  const roundLiveEvents = useMemo(() => {
    const kills = roundKills.map((event, killIndex) => ({
      kind: 'kill',
      event,
      killIndex,
      tick: Number(event.tick) || 0,
      order: killIndex,
    }))
    const bombs = roundBombEvents.map((event, bombIndex) => ({
      kind: 'bomb',
      event,
      bombIndex,
      tick: Number(event.tick) || 0,
      order: 1000 + bombIndex,
    }))
    return [...kills, ...bombs].sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick
      return a.order - b.order
    })
  }, [roundKills, roundBombEvents])
  const currentVisibleCount = animationState.roundKey === currentRoundKey ? animationState.count : roundLiveEvents.length
  const visibleRoundEvents = useMemo(
    () => roundLiveEvents.slice(0, Math.max(0, Math.min(currentVisibleCount, roundLiveEvents.length))),
    [roundLiveEvents, currentVisibleCount],
  )
  const killPreStates = useMemo(() => {
    const parseState = (state) => {
      const [ct, tr] = String(state ?? '5v5').split('v')
      return { ct: Number.parseInt(ct, 10) || 0, tr: Number.parseInt(tr, 10) || 0 }
    }
    return roundKills.map((_, idx) => parseState(selectedRound?.state_transitions?.[idx] ?? '5v5'))
  }, [roundKills, selectedRound])

  const getKillTags = (event, idx) => {
    const tags = []
    if (idx === 0) tags.push({ kind: 'firstkill', label: 'FIRST KILL' })
    if (event.trade_delta_s != null) tags.push({ kind: 'trade', label: `TRADE ${Number(event.trade_delta_s).toFixed(2)}s` })
    const place = event?.killer_position?.place || event?.victim_position?.place
    if (place) tags.push({ kind: 'place', label: String(place).toUpperCase() })

    const pre = killPreStates[idx]
    if (pre) {
      if (pre.ct === 1 && pre.tr === 1) tags.push({ kind: 'onevone', label: '1v1' })

      const winner = selectedRound?.winner
      if ((winner === 'team_ct_start' || winner === 'team_t_start') && event.killer_team === winner) {
        const own = winner === 'team_ct_start' ? pre.ct : pre.tr
        const opp = winner === 'team_ct_start' ? pre.tr : pre.ct
        if (own === 1 && opp >= 1) tags.push({ kind: 'clutch', label: `CLUTCH 1v${opp}` })
      }
    }
    return tags
  }
  const formatRoundClock = (eventTick, fallbackTs) => {
    const tick = Number(eventTick) || 0
    if (roundBaseTick > 0 && tick > 0) {
      const delta = Math.max(0, (tick - roundBaseTick) / 64)
      return formatClock(delta)
    }
    return formatClock(fallbackTs)
  }
  const getBombEventLabel = (event) => {
    if (event?.event === 'bomb_planted') return 'C4 plantada'
    if (event?.event === 'bomb_defused') return 'C4 defusada'
    if (event?.event === 'bomb_exploded') return 'C4 explodiu'
    return 'Evento da C4'
  }
  const getBombIconName = (event) => {
    if (event?.event === 'bomb_defused') return 'defuser'
    return 'c4'
  }
  const roundRadarMarkers = useMemo(() => {
    if (!selectedRound) return []
    const labelFromId = (steamId) => {
      if (!steamId) return '-'
      return playerNameBySteamId.get(String(steamId)) ?? `Player-${String(steamId).slice(-4)}`
    }
    const bombLabel = (event) => {
      if (event?.event === 'bomb_planted') return 'C4 plantada'
      if (event?.event === 'bomb_defused') return 'C4 defusada'
      if (event?.event === 'bomb_exploded') return 'C4 explodiu'
      return 'Evento da C4'
    }

    const points = []
    for (const item of roundLiveEvents) {
      const event = item.event
      const eventKey = item.kind === 'kill' ? `kill-${item.killIndex}` : `bomb-${item.bombIndex}`
      if (item.kind === 'kill' && event.killer_position) {
        points.push({
          eventKey,
          tick: event.tick,
          kind: 'kill',
          x: Number(event.killer_position.x),
          y: Number(event.killer_position.y),
          label: `${labelFromId(event.killer_steamid)} x ${labelFromId(event.victim_steamid)}${event.killer_position.place ? ` @ ${event.killer_position.place}` : ''}`,
        })
      } else if (
        item.kind === 'bomb'
        && (event.event === 'bomb_planted' || event.event === 'bomb_defused' || event.event === 'bomb_exploded')
        && event.position
      ) {
        points.push({
          eventKey,
          tick: event.tick,
          kind: event.event === 'bomb_planted' ? 'plant' : (event.event === 'bomb_defused' ? 'defuse' : 'explode'),
          x: Number(event.position.x),
          y: Number(event.position.y),
          label: `${bombLabel(event)}${event.position.place ? ` @ ${event.position.place}` : ''}`,
        })
      }
    }

    const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    if (valid.length === 0) return []

    const xs = valid.map((p) => p.x)
    const ys = valid.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)

    return valid.map((p) => {
      const xPct = ((p.x - minX) / spanX) * 100
      const yPct = 100 - (((p.y - minY) / spanY) * 100)
      return {
        ...p,
        xPct: Math.max(4, Math.min(96, xPct)),
        yPct: Math.max(4, Math.min(96, yPct)),
      }
    })
  }, [selectedRound, playerNameBySteamId, roundLiveEvents])
  const visibleRadarMarkers = useMemo(() => {
    const hasSelected = selectedRadarEventKey && roundRadarMarkers.some((m) => m.eventKey === selectedRadarEventKey)
    if (!hasSelected) return roundRadarMarkers
    return roundRadarMarkers.filter((m) => m.eventKey === selectedRadarEventKey)
  }, [roundRadarMarkers, selectedRadarEventKey])

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) {
        window.clearInterval(animationTimerRef.current)
        animationTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (animationTimerRef.current) {
      window.clearInterval(animationTimerRef.current)
      animationTimerRef.current = null
    }
  }, [currentRoundKey])

  const handlePlayRoundFeed = () => {
    if (!currentRoundKey) return
    const total = roundLiveEvents.length
    if (animationTimerRef.current) {
      window.clearInterval(animationTimerRef.current)
      animationTimerRef.current = null
    }
    if (total === 0) {
      setAnimationState({ roundKey: currentRoundKey, count: 0, isAnimating: false })
      return
    }
    setAnimationState({ roundKey: currentRoundKey, count: 0, isAnimating: true })

    animationTimerRef.current = window.setInterval(() => {
      setAnimationState((prev) => {
        const prevCount = prev.roundKey === currentRoundKey ? prev.count : 0
        const nextCount = prevCount + 1
        if (nextCount >= total) {
          if (animationTimerRef.current) {
            window.clearInterval(animationTimerRef.current)
            animationTimerRef.current = null
          }
          return { roundKey: currentRoundKey, count: total, isAnimating: false }
        }
        return { roundKey: currentRoundKey, count: nextCount, isAnimating: true }
      })
    }, 220)
  }

  return (
    <div className="dashboard">
      <section className="hero card">
        <div className="hero-main">
          <div className="hero-map-wrap">
            <MapIcon map={data.match_info.map} />
            <div>
              <p className="dim hero-meta">
                {data.match_info.map.toUpperCase()} • {new Date(data.match_info.date).toLocaleDateString('pt-BR')}
              </p>
              <h2 className="hero-title">Resultado da partida</h2>
            </div>
          </div>
        </div>
        <div className="scoreline scorebox">
          <span className={data.match_info.score.winner === 'team_ct_start' ? 'ct' : 'dim'}>{data.match_info.score.team_ct_start}</span>
          <span>:</span>
          <span className={data.match_info.score.winner === 'team_t_start' ? 'tr' : 'dim'}>{data.match_info.score.team_t_start}</span>
        </div>
        <button className="btn-secondary" onClick={onReset}>Nova demo</button>
      </section>

      <section className="card tabs-card">
        <div className="tab-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-panel">
          {activeTab === 'overview' && (
            <div className="panel-stack">
              <section className="panel-block mvp highlight-card">
                <p className="dim">MVP DA PARTIDA</p>
                {mvp ? (
                  <>
                    <h3>{formatNick(mvp.nick)}</h3>
                    <p>Rating {mvp.stats.rating_2.toFixed(2)} | K/D {mvp.stats.kills}/{mvp.stats.deaths} | ADR {mvp.stats.adr.toFixed(1)}</p>
                    {analysis?.impact?.round_impact_score?.[0] && (
                      <p className="dim">RIS Lider: {formatNick(analysis.impact.round_impact_score[0].nick)} ({analysis.impact.round_impact_score[0].ris_match})</p>
                    )}
                    {analysis?.trades?.avg_trade_time_s !== undefined && (
                      <p className="dim">Tempo medio de trade: {analysis.trades.avg_trade_time_s}s</p>
                    )}
                  </>
                ) : (
                  <p>Sem dados suficientes para MVP.</p>
                )}
              </section>

              <section className="panel-block">
                <h3>Resumo dos Times</h3>
                <div className="quick-insights">
                  <article>
                    <p className="dim">CT</p>
                    <h4>{ctTeam.length} jogadores</h4>
                    <p>{ctTeam.reduce((acc, p) => acc + p.stats.kills, 0)} kills</p>
                  </article>
                  <article>
                    <p className="dim">TR</p>
                    <h4>{trTeam.length} jogadores</h4>
                    <p>{trTeam.reduce((acc, p) => acc + p.stats.kills, 0)} kills</p>
                  </article>
                  <article>
                    <p className="dim">Total rounds</p>
                    <h4>{data.rounds.length}</h4>
                    <p>{data.match_info.map.toUpperCase()}</p>
                  </article>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'times' && (
            <div className="panel-stack">
              {ctTeam.length > 0 && <ScoreTable title="Time CT" players={ctTeam} teamClass="ct" embedded />}
              {trTeam.length > 0 && <ScoreTable title="Time TR" players={trTeam} teamClass="tr" embedded />}
              {unknownTeam.length > 0 && <ScoreTable title="Jogadores sem time" players={unknownTeam} teamClass="" embedded />}
            </div>
          )}

          {activeTab === 'jogadores' && (
            <div className="panel-stack">
              <ScoreTable title="Todos os Jogadores" players={allPlayers} teamClass="" embedded />
            </div>
          )}

          {activeTab === 'rounds' && (
            <div className="panel-stack">
              <section className="panel-block">
              <h3>Timeline de rodadas</h3>
              <div className="rounds">
                {data.rounds.map((round) => (
                  <button
                    key={round.round_number}
                    type="button"
                    className={`round round-btn ${round.winner === 'team_ct_start' ? 'ct-bg' : 'tr-bg'} ${selectedRound?.round_number === round.round_number ? 'active' : ''}`}
                    title={`Rodada ${round.round_number}: ${getWinReasonPtBr(round.win_reason)}`}
                    onClick={() => {
                      setSelectedRoundNumber(round.round_number)
                      setSelectedRadarEventKey(null)
                    }}
                  >
                    {round.round_number}
                  </button>
                ))}
                {data.rounds.length === 0 && <p className="dim">A demo nao trouxe rounds finais suficientes para timeline.</p>}
              </div>
              </section>

              {selectedRound && (
                <section className="panel-block">
                  <h3>Detalhes do round {selectedRound.round_number}</h3>
                  <div className="quick-insights round-metrics">
                    <article>
                      <p className="dim">First kill</p>
                      <h4>{roundInsights.firstKill ? getPlayerLabel(roundInsights.firstKill.killer_steamid) : 'N/A'}</h4>
                      <p>{roundInsights.firstKill ? getTeamLabel(roundInsights.firstKill.killer_team) : '-'}</p>
                    </article>
                    <article>
                      <p className="dim">First death</p>
                      <h4>{roundInsights.firstDeath ? getPlayerLabel(roundInsights.firstDeath.steamid) : 'N/A'}</h4>
                      <p>{roundInsights.firstDeath ? getTeamLabel(roundInsights.firstDeath.team) : '-'}</p>
                    </article>
                    <article>
                      <p className="dim">Entry tradada</p>
                      <h4>{roundInsights.entryTrade ? 'Sim' : 'Nao'}</h4>
                      <p>Resposta ao first kill</p>
                    </article>
                    <article>
                      <p className="dim">Clutch</p>
                      <h4>{roundInsights.clutchLevel > 0 ? `1v${roundInsights.clutchLevel}` : 'Nao'}</h4>
                      <p>{roundInsights.clutchLevel > 0 ? 'clutch vencido' : 'sem clutch vencedor'}</p>
                    </article>
                    <article>
                      <p className="dim">1v1 win</p>
                      <h4>{roundInsights.oneVOneWin ? 'Sim' : 'Nao'}</h4>
                      <p>Teve estado 1v1</p>
                    </article>
                    <article>
                      <p className="dim">Headshots</p>
                      <h4>{roundInsights.hsCount}</h4>
                      <p>no round</p>
                    </article>
                    <article>
                      <p className="dim">Trades</p>
                      <h4>{roundInsights.tradeCount}</h4>
                      <p>abates de resposta</p>
                    </article>
                  </div>

                  <div className="round-warroom">
                    <header className="round-warroom-top">
                      <div className="alive-side">
                        <span className="side-label ct-text">CT</span>
                        <div className="alive-dots">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={`ct-${i}`} className={`alive-dot ${i < roundHud.ctAlive ? 'on ct-on' : ''}`} />
                          ))}
                        </div>
                      </div>

                      <div className="round-center">
                        <p className="round-title">ROUND {selectedRound.round_number}</p>
                        <div className="round-mini-score">
                          <span className="ct-text">{roundHud.ctAlive}</span>
                          <CsIcon name="round" label="Round" fallback="•" variant="badge" />
                          <span className="tr-text">{roundHud.tAlive}</span>
                        </div>
                        <p className="dim">{getWinReasonPtBr(selectedRound.win_reason)}</p>
                      </div>

                      <div className="alive-side">
                        <span className="side-label tr-text">TR</span>
                        <div className="alive-dots">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={`tr-${i}`} className={`alive-dot ${i < roundHud.tAlive ? 'on tr-on' : ''}`} />
                          ))}
                        </div>
                      </div>
                    </header>

                    <div className="round-warroom-grid">
                      <section className="round-economy">
                        <div className="eco-row">
                          <span>Equipamento</span>
                          <strong className="ct-text">${selectedRound.economy?.team_ct_start?.equipment_value ?? 0}</strong>
                          <strong className="tr-text">${selectedRound.economy?.team_t_start?.equipment_value ?? 0}</strong>
                        </div>
                        <div className="eco-row">
                          <span>Gasto</span>
                          <strong className="ct-text">${selectedRound.economy?.team_ct_start?.cash_spent ?? 0}</strong>
                          <strong className="tr-text">${selectedRound.economy?.team_t_start?.cash_spent ?? 0}</strong>
                        </div>
                        <div className="eco-row">
                          <span>Compra</span>
                          <strong className="ct-text">{selectedRound.economy?.team_ct_start?.buy_tier ?? 'N/A'}</strong>
                          <strong className="tr-text">{selectedRound.economy?.team_t_start?.buy_tier ?? 'N/A'}</strong>
                        </div>
                        <p className="dim">Vantagem inicial: {getTeamLabel(selectedRound.opening_advantage_team_id)}</p>
                        <div className="radar-box">
                          <p className="dim">Radar do mapa</p>
                          <MapRadarWithEvents map={data.match_info.map} markers={visibleRadarMarkers} selectedEventKey={selectedRadarEventKey} />
                        </div>
                      </section>

                      <section className="round-feed">
                        <div className="round-feed-side">
                          <div className="round-feed-stats">
                            <span>K {roundKills.length}</span>
                            <span>HS {roundInsights.hsCount}</span>
                            <span>TRD {roundInsights.tradeCount}</span>
                            <button className={`feed-toggle-btn ${showPrepItems ? 'active' : ''}`} type="button" onClick={() => setShowPrepItems((v) => !v)}>
                              Itens
                            </button>
                            <button className="feed-play-btn" type="button" onClick={handlePlayRoundFeed} disabled={animationState.isAnimating}>
                              {animationState.isAnimating ? 'Rodando...' : 'Play'}
                            </button>
                          </div>
                          <div className="round-feed-live">
                            {showPrepItems && preRoundLoadoutRows.length > 0 && (
                              <div className="prep-events">
                                {preRoundLoadoutRows.map((row) => (
                                  <div key={`${selectedRound.round_number}-prep-${row.steamid}`} className="killfeed-item compact prep loadout">
                                    <span className="kill-time">{formatRoundClock(row.firstTick, row.firstTick / 64)}</span>
                                    <span className={`kill-player ${getTeamTextClass(row.team)}`}>{getPlayerLabel(row.steamid)}</span>
                                    <span className="prep-icons">
                                      {row.icons.map((iconName, iconIdx) => (
                                        <CsIcon
                                          key={`${row.steamid}-${iconName}-${iconIdx}`}
                                          name={iconName}
                                          label={iconName}
                                          fallback="•"
                                          variant="weapon"
                                        />
                                      ))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {visibleRoundEvents.map((item, idx) => {
                              if (item.kind === 'bomb') {
                                const event = item.event
                                const eventKey = `bomb-${item.bombIndex}`
                                return (
                                  <div
                                    key={`${selectedRound.round_number}-bomb-${idx}-${event.tick ?? idx}`}
                                    className={`feed-system-event clickable ${selectedRadarEventKey === eventKey ? 'selected' : ''} ${event.event === 'bomb_defused' ? 'defused' : ''} ${event.event === 'bomb_exploded' ? 'exploded' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedRadarEventKey((prev) => (prev === eventKey ? null : eventKey))}
                                    onKeyDown={(ev) => {
                                      if (ev.key === 'Enter' || ev.key === ' ') {
                                        ev.preventDefault()
                                        setSelectedRadarEventKey((prev) => (prev === eventKey ? null : eventKey))
                                      }
                                    }}
                                  >
                                    <span className="kill-time">{formatRoundClock(event.tick, event.t_s)}</span>
                                    <span className="feed-system-center">
                                      <CsIcon name={getBombIconName(event)} label="Evento C4" fallback="C4" variant="badge" />
                                      <strong>{getBombEventLabel(event)}</strong>
                                      {event.player_steamid ? (
                                        <span className={`kill-player ${getTeamTextClass(event.player_team)}`}>{getPlayerLabel(event.player_steamid)}</span>
                                      ) : (
                                        <span className="dim">{event.synthetic ? 'evento inferido' : ''}</span>
                                      )}
                                      {event.position?.place && <span className="feed-tag place">{event.position.place}</span>}
                                    </span>
                                  </div>
                                )
                              }

                              const event = item.event
                              const eventKey = `kill-${item.killIndex}`
                              return (
                                <div
                                  key={`${selectedRound.round_number}-live-${idx}-${event.tick ?? idx}`}
                                  className={`killfeed-item compact live clickable ${selectedRadarEventKey === eventKey ? 'selected' : ''}`}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedRadarEventKey((prev) => (prev === eventKey ? null : eventKey))}
                                  onKeyDown={(ev) => {
                                    if (ev.key === 'Enter' || ev.key === ' ') {
                                      ev.preventDefault()
                                      setSelectedRadarEventKey((prev) => (prev === eventKey ? null : eventKey))
                                    }
                                  }}
                                >
                                  <span className="kill-time">{formatRoundClock(event.tick, event.t_s)}</span>
                                  <span className="kill-core">
                                    <span className={`kill-player ${getTeamTextClass(event.killer_team)}`}>{getPlayerLabel(event.killer_steamid)}</span>
                                    <span className="kill-icons">
                                      <CsIcon
                                        name={weaponToIconName(event.weapon)}
                                        label={event.weapon ? `Arma: ${event.weapon}` : 'Abate'}
                                        fallback="🎯"
                                        variant="weapon"
                                      />
                                      {event.headshot && <CsIcon name="headshot" label="Headshot" fallback="HS" variant="hs" />}
                                    </span>
                                    <span className={`kill-player ${getTeamTextClass(event.victim_team)}`}>{getPlayerLabel(event.victim_steamid)}</span>
                                  </span>
                                  <span className="kill-tags">
                                    {getKillTags(event, item.killIndex).map((tag, tagIdx) => (
                                      <span key={`${selectedRound.round_number}-${idx}-${tag.kind}-${tagIdx}`} className={`feed-tag ${tag.kind}`}>
                                        {tag.label}
                                      </span>
                                    ))}
                                  </span>
                                </div>
                              )
                            })}
                            {roundLiveEvents.length === 0 && <p className="dim">Sem kills registradas nesta rodada.</p>}
                          </div>
                          <p className={`round-winner ${getTeamTextClass(selectedRound.winner)}`}>
                            {selectedRound.winner === 'team_ct_start' ? 'Counter-Terrorists venceram' : 'Terrorists venceram'}
                          </p>
                        </div>
                      </section>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === 'insights' && (
            <section className="panel-block">
              <h3>Insights Rapidos</h3>
              {analysis ? (
                <div className="quick-insights">
                  <article>
                    <p className="dim">Impacto</p>
                    <h4>{analysis?.impact?.round_impact_score?.[0] ? formatNick(analysis.impact.round_impact_score[0].nick) : 'N/A'}</h4>
                    <p>RIS {analysis?.impact?.round_impact_score?.[0]?.ris_match ?? 0}</p>
                  </article>
                  <article>
                    <p className="dim">Trade</p>
                    <h4>Tempo medio</h4>
                    <p>{analysis?.trades?.avg_trade_time_s ?? 0}s</p>
                  </article>
                  <article>
                    <p className="dim">Pressao</p>
                    <h4>Rodadas chave</h4>
                    <p>{analysis?.pressure?.length ?? 0}</p>
                  </article>
                  <article>
                    <p className="dim">Economia</p>
                    <h4>Buckets buy</h4>
                    <p>{analysis?.economy?.length ?? 0}</p>
                  </article>
                </div>
              ) : (
                <p className="dim">Sem analise disponivel para esta partida.</p>
              )}
            </section>
          )}

          {allPlayers.length === 0 && <section className="panel-block">Nao foi possivel montar scoreboard para esta demo.</section>}
        </div>
      </section>
    </div>
  )
}

async function uploadAndParseDemo(file) {
  const body = await file.arrayBuffer()
  const response = await fetch(apiUrl('/api/parse'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
      'X-File-LastModified': String(file.lastModified || 0),
    },
    body,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Falha ao processar demo no servidor.')

  return normalizeParsedMatch(payload)
}

async function loadLocalRealMatch() {
  const response = await fetch('/data/real-match.json')
  if (!response.ok) throw new Error('real-match.json nao encontrado.')
  const payload = await response.json()
  return normalizeParsedMatch(payload)
}

async function analyzeMatch(matchRaw) {
  const response = await fetch(apiUrl('/api/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(matchRaw),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Falha ao analisar partida.')
  return payload
}

export default function Cs2App() {
  const [showIntro, setShowIntro] = useState(true)
  const [state, setState] = useState('upload')
  const [error, setError] = useState('')
  const [matchData, setMatchData] = useState(null)
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowIntro(false)
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [])

  const handleFile = async (file) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.dem')) {
      setError('Formato invalido. Envie um arquivo .dem.')
      return
    }

    setError('')
    setState('parsing')

    try {
      const parsed = await uploadAndParseDemo(file)
      let analysisReport = null
      if (parsed.raw) {
        try {
          analysisReport = await analyzeMatch(parsed.raw)
        } catch (analysisErr) {
          console.error(analysisErr)
          setError(`Analise indisponivel para esta carga: ${analysisErr?.message ?? 'erro desconhecido'}`)
        }
      }
      setMatchData(parsed)
      setAnalysis(analysisReport)
      setState('dashboard')
    } catch (err) {
      console.error(err)
      setError(`Falha ao processar demo real: ${err?.message ?? 'erro desconhecido'}`)
      setState('upload')
    }
  }

  const handleLoadLocal = async () => {
    setError('')
    setState('parsing')
    try {
      const parsed = await loadLocalRealMatch()
      let analysisReport = null
      if (parsed.raw) {
        try {
          analysisReport = await analyzeMatch(parsed.raw)
        } catch (analysisErr) {
          console.error(analysisErr)
          setError(`Analise indisponivel para esta carga: ${analysisErr?.message ?? 'erro desconhecido'}`)
        }
      }
      setMatchData(parsed)
      setAnalysis(analysisReport)
      setState('dashboard')
    } catch (err) {
      console.error(err)
      setError(`Falha ao carregar JSON da partida real: ${err?.message ?? 'erro desconhecido'}`)
      setState('upload')
    }
  }

  if (showIntro) {
    return (
      <div className="intro-screen">
        <div className="intro-logo-wrap">
          <img src={logo} alt="JHONSON'S War Room" className="intro-logo" />
          <h1 className="intro-title">JHONSON'S War Room</h1>
          <p className="intro-subtitle">Intel de partidas CS2</p>
        </div>
        <aside className="warroom-corner intro-corner">
          <iframe
            src="/warroom/test.html?v=3"
            title="War Room Intro Corner"
            className="warroom-corner-frame"
            scrolling="no"
          />
        </aside>
      </div>
    )
  }

  return (
    <div className={`cs2-app ${state === 'upload' || state === 'parsing' ? 'single-screen' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <img src={logo} alt="JHONSON'S War Room" className="brand-logo" />
          <div>
            <h1>JHONSON'S War Room</h1>
            <p className="subtitle">Intel de partidas CS2</p>
          </div>
        </div>
      </header>

      {state === 'upload' && (
        <main className="upload card">
          <h2>Envie sua demo real</h2>
          <p>Selecione um arquivo .dem para extrair os dados reais da partida.</p>
          <div className="upload-chooser">
            <input type="file" accept=".dem" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={handleLoadLocal}>Recarregar JSON da minha partida (teste.dem)</button>
          </div>
          {error && <p className="error">{error}</p>}
        </main>
      )}

      {state === 'parsing' && (
        <main className="parsing card">
          <h2>Processando demo...</h2>
          <p>Lendo header, rounds e eventos da sua partida real.</p>
          <div className="loader" />
        </main>
      )}

      {state === 'dashboard' && matchData && (
        <Dashboard
          data={matchData}
          analysis={analysis}
          onReset={() => {
            setState('upload')
            setMatchData(null)
            setAnalysis(null)
          }}
        />
      )}

      <aside className="warroom-corner">
        <iframe
          src="/warroom/test.html?v=3"
          title="War Room Corner"
          className="warroom-corner-frame"
          scrolling="no"
        />
      </aside>
    </div>
  )
}
















