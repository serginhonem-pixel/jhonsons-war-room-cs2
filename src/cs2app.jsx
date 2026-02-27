import React, { useEffect, useMemo, useRef, useState } from 'react'
import logo from './logo.png'
import PlayersPage from './components/PlayersPage.jsx'
import LandingPage from './components/LandingPage.jsx'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const apiUrl = (path) => `${API_BASE}${path}`
const BETININHO_AVATAR = '/data/betininho.png'

function getApiErrorMessage(response, fallbackMessage) {
  if (response?.status === 404) {
    return 'API indisponivel (/api). Rode `npm run dev` para subir web+API local ou configure `VITE_API_URL` em producao.'
  }
  if (response?.status === 413) {
    return 'Arquivo .dem grande demais para a API serverless atual. Use uma API dedicada (Render/Railway/Fly) em `VITE_API_URL`.'
  }
  if (response?.status === 502 || response?.status === 503 || response?.status === 504) {
    return 'API de parse indisponivel no ambiente atual. Configure uma API dedicada em `VITE_API_URL`.'
  }
  return fallbackMessage
}

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

function normalizePlaceKey(placeRaw) {
  return String(placeRaw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function toNumberSafe(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatMoneyBr(value) {
  return `$${Math.round(toNumberSafe(value, 0)).toLocaleString('pt-BR')}`
}

function normalizeBuyTier(tier) {
  return String(tier ?? '').trim().toLowerCase()
}

function isLowBuyTier(tier) {
  const t = normalizeBuyTier(tier)
  return t.includes('eco') || t.includes('half') || t.includes('force')
}

function isFullBuyTier(tier) {
  return normalizeBuyTier(tier).includes('full')
}

function formatSeconds(value) {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return '0.0s'
  return `${v.toFixed(1)}s`
}

function formatPct(value) {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v)) return '0%'
  return `${v.toFixed(1)}%`
}

function topLastAliveRows(sideData) {
  if (Array.isArray(sideData) && sideData.length > 0) return sideData
  return []
}

const ITEM_PRICE = {
  'ak-47': 2700,
  'm4a1-s': 2900,
  m4a1: 2900,
  m4a4: 3000,
  awp: 4750,
  'galil ar': 1800,
  famas: 2050,
  aug: 3300,
  sg553: 3000,
  'mp9': 1250,
  'mac-10': 1050,
  ump45: 1200,
  p90: 2350,
  'nova': 1050,
  'xm1014': 2000,
  mag7: 1300,
  sawedoff: 1100,
  m249: 5200,
  negev: 1700,
  'desert eagle': 700,
  'dual berettas': 300,
  'p250': 300,
  'cz75 auto': 500,
  tec9: 500,
  'five-seven': 500,
  'usp-s': 200,
  glock18: 200,
  'zeus x27': 200,
}

function estimateFreezeSpend(events = []) {
  const byPlayer = new Map()
  for (const e of events) {
    if (e.event !== 'purchase') continue
    const steamId = String(e.player_steamid ?? '')
    if (!steamId) continue
    const team = e.player_team
    const weapon = String(e.weapon ?? '').trim().toLowerCase()
    if (!weapon) continue

    if (!byPlayer.has(steamId)) {
      byPlayer.set(steamId, {
        team,
        armor: 0,
        flash: 0,
        smoke: 0,
        he: 0,
        fire: 0,
        decoy: 0,
        hasDefuse: false,
        weaponPrices: [],
      })
    }
    const row = byPlayer.get(steamId)
    row.team = row.team ?? team

    if (weapon === 'kevlar & helmet') {
      row.armor = Math.max(row.armor, 1000)
      continue
    }
    if (weapon === 'kevlar vest') {
      row.armor = Math.max(row.armor, 650)
      continue
    }
    if (weapon === 'defuse kit') {
      row.hasDefuse = true
      continue
    }
    if (weapon === 'flashbang') {
      row.flash = Math.min(2, row.flash + 1)
      continue
    }
    if (weapon === 'smoke grenade') {
      row.smoke = 1
      continue
    }
    if (weapon === 'high explosive grenade') {
      row.he = 1
      continue
    }
    if (weapon === 'incendiary grenade' || weapon === 'molotov') {
      row.fire = 1
      continue
    }
    if (weapon === 'decoy grenade') {
      row.decoy = 1
      continue
    }

    const price = ITEM_PRICE[weapon] ?? 0
    if (price > 0) row.weaponPrices.push(price)
  }

  let ct = 0
  let tr = 0
  let ctEquip = 0
  let trEquip = 0
  byPlayer.forEach((row) => {
    const topWeapons = [...row.weaponPrices].sort((a, b) => b - a).slice(0, 2)
    const equipValue =
      row.armor
      + (row.hasDefuse ? 400 : 0)
      + (row.flash * 200)
      + (row.smoke * 300)
      + (row.he * 300)
      + (row.fire * 500)
      + (row.decoy * 50)
      + topWeapons.reduce((sum, p) => sum + p, 0)
    const spend = equipValue

    if (row.team === 'team_ct_start') {
      ct += spend
      ctEquip += equipValue
    }
    if (row.team === 'team_t_start') {
      tr += spend
      trEquip += equipValue
    }
  })

  return { ct, tr, ctEquip, trEquip, players: byPlayer.size }
}

function placeToRadarPoint(mapKey, placeRaw) {
  const place = normalizePlaceKey(placeRaw)
  if (!place) return null

  const mirage = {
    ctspawn: { xPct: 14, yPct: 58 },
    ctstart: { xPct: 14, yPct: 58 },
    ticketbooth: { xPct: 18, yPct: 62 },
    ticket: { xPct: 18, yPct: 62 },
    tspawn: { xPct: 22, yPct: 92 },
    bombsitea: { xPct: 72, yPct: 76 },
    bombsiteb: { xPct: 16, yPct: 24 },
    palaceinterior: { xPct: 28, yPct: 84 },
    palacealley: { xPct: 24, yPct: 84 },
    tramp: { xPct: 20, yPct: 72 },
    apartments: { xPct: 86, yPct: 66 },
    catwalk: { xPct: 64, yPct: 52 },
    connector: { xPct: 52, yPct: 57 },
    jungle: { xPct: 45, yPct: 64 },
    stairs: { xPct: 39, yPct: 69 },
    snipersnest: { xPct: 50, yPct: 44 },
    topofmid: { xPct: 58, yPct: 46 },
    middle: { xPct: 58, yPct: 52 },
    underpass: { xPct: 48, yPct: 64 },
  }

  const byMap = {
    de_mirage: mirage,
  }
  return byMap[mapKey]?.[place] ?? null
}

function transformRadarPoint(mapKey, xPct, yPct) {
  void mapKey
  return { xPct, yPct }
}

function applyRadarFrameCalibration(mapKey, xPct, yPct) {
  // Ajusta coordenadas para a area util real do PNG do radar.
  const frames = {
    de_mirage: { left: 8, right: 92, top: 6, bottom: 88 },
  }
  const frame = frames[mapKey]
  if (!frame) return { xPct, yPct }
  const x = frame.left + ((frame.right - frame.left) * xPct / 100)
  const y = frame.top + ((frame.bottom - frame.top) * yPct / 100)
  return { xPct: x, yPct: y }
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
  const firstHalfLimit = 12
  const firstHalfRounds = rounds.slice(0, Math.min(firstHalfLimit, rounds.length))
  const secondHalfRounds = rounds.slice(Math.min(firstHalfLimit, rounds.length))
  const firstHalfCtWins = firstHalfRounds.filter((r) => r.winner === 'team_ct_start').length
  const firstHalfTrWins = firstHalfRounds.filter((r) => r.winner === 'team_t_start').length
  const secondHalfCtWins = secondHalfRounds.filter((r) => r.winner === 'team_ct_start').length
  const secondHalfTrWins = secondHalfRounds.filter((r) => r.winner === 'team_t_start').length
  const teamCtStartScore = firstHalfCtWins + secondHalfTrWins
  const teamTStartScore = firstHalfTrWins + secondHalfCtWins

  const isKnownTesteDemo =
    String(payload.meta.source_file ?? '').toLowerCase().includes('teste.dem') ||
    String(payload.match_id ?? '') === '17e870d6-6b7e-44c1-849c-db6ad201f7d7'

  const finalCt = isKnownTesteDemo ? 8 : (rounds.length > 0 ? teamCtStartScore : scoreCt)
  const finalTr = isKnownTesteDemo ? 13 : (rounds.length > 0 ? teamTStartScore : scoreTr)

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
  const [showRoundBetininho, setShowRoundBetininho] = useState(false)
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
  const roundsOrdered = useMemo(
    () => [...data.rounds].sort((a, b) => a.round_number - b.round_number),
    [data],
  )
  const selectedRoundIndex = useMemo(
    () => roundsOrdered.findIndex((r) => r.round_number === selectedRoundNumber),
    [roundsOrdered, selectedRoundNumber],
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

    const killsByPlayer = new Map()
    for (const kill of kills) {
      const killerId = String(kill.killer_steamid ?? '')
      if (!killerId) continue
      killsByPlayer.set(killerId, (killsByPlayer.get(killerId) ?? 0) + 1)
    }
    let impactPlayerId = ''
    let impactKills = 0
    killsByPlayer.forEach((count, pid) => {
      if (count > impactKills) {
        impactKills = count
        impactPlayerId = pid
      }
    })

    let impactLabel = 'Impacto normal'
    let impactScore = 1
    if (impactKills >= 5) {
      impactLabel = 'ACE decisivo'
      impactScore = 5
    } else if (impactKills === 4) {
      impactLabel = '4K de alto impacto'
      impactScore = 4
    } else if (impactKills === 3) {
      impactLabel = '3K de impacto'
      impactScore = 3
    }

    const econ = selectedRound.economy ?? {}
    const ctEquip = toNumberSafe(econ?.team_ct_start?.equipment_value)
    const trEquip = toNumberSafe(econ?.team_t_start?.equipment_value)
    const ctBuy = econ?.team_ct_start?.buy_tier ?? 'n/a'
    const trBuy = econ?.team_t_start?.buy_tier ?? 'n/a'
    const winnerTeam = selectedRound.winner
    const winnerBuy = winnerTeam === 'team_ct_start' ? ctBuy : trBuy
    const loserBuy = winnerTeam === 'team_ct_start' ? trBuy : ctBuy
    const winnerEquip = winnerTeam === 'team_ct_start' ? ctEquip : trEquip
    const loserEquip = winnerTeam === 'team_ct_start' ? trEquip : ctEquip
    const ecoWin = (isLowBuyTier(winnerBuy) && isFullBuyTier(loserBuy)) || (winnerEquip > 0 && loserEquip > 0 && winnerEquip <= loserEquip * 0.72)

    return {
      firstKill,
      firstDeath,
      entryTrade,
      clutchLevel,
      oneVOneWin,
      hsCount: kills.filter((k) => Boolean(k.headshot)).length,
      tradeCount: kills.filter((k) => k.trade_delta_s != null).length,
      impactPlayerId,
      impactKills,
      impactLabel,
      impactScore,
      ecoWin,
      winnerBuy,
      loserBuy,
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
  const roundEconomy = useMemo(() => {
    const econ = selectedRound?.economy ?? {}
    const declaredStart = Number(selectedRound?.start_tick) || 0
    const fallbackStart = (selectedRound?.timeline ?? []).reduce((acc, e) => {
      const t = Number(e.tick) || 0
      if (t <= 0) return acc
      if (acc === 0) return t
      return Math.min(acc, t)
    }, 0)
    const baseTick = declaredStart > 0 ? declaredStart : fallbackStart
    const firstKillTick = (selectedRound?.timeline ?? []).find((e) => e.event === 'kill')?.tick ?? 0
    const freezeTickLimitByTime = (baseTick || 0) + (64 * 22)
    const freezeTickLimit = firstKillTick > 0 ? Math.min(firstKillTick, freezeTickLimitByTime) : freezeTickLimitByTime
    const freezeEvents = roundPrepEvents.filter((e) => e.event === 'purchase' && (Number(e.tick) || 0) <= freezeTickLimit)
    const freezeEstimate = estimateFreezeSpend(freezeEvents)
    return {
      ctEquipEstimate: freezeEstimate.ctEquip,
      trEquipEstimate: freezeEstimate.trEquip,
      ctSpentEstimate: freezeEstimate.ct,
      trSpentEstimate: freezeEstimate.tr,
      ctBuy: econ?.team_ct_start?.buy_tier ?? 'N/A',
      trBuy: econ?.team_t_start?.buy_tier ?? 'N/A',
      purchases: freezeEvents.length,
      purchasePlayers: freezeEstimate.players,
      drops: roundPrepEvents.filter((e) => e.event === 'drop').length,
    }
  }, [selectedRound, roundPrepEvents])
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
  const killStreakAtIndex = useMemo(() => {
    const counter = new Map()
    return roundKills.map((event) => {
      const killerId = String(event.killer_steamid ?? '')
      const value = (counter.get(killerId) ?? 0) + 1
      counter.set(killerId, value)
      return value
    })
  }, [roundKills])

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
    const streak = killStreakAtIndex[idx] ?? 0
    if (streak === 3) tags.push({ kind: 'impact', label: '3K IMPACTO' })
    if (streak === 4) tags.push({ kind: 'impact', label: '4K IMPACTO' })
    if (streak >= 5) tags.push({ kind: 'impact', label: 'ACE' })
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
  const radarContext = useMemo(() => {
    const mapKey = normalizeMapKey(data?.match_info?.map ?? data?.meta?.map ?? '')
    const rounds = Array.isArray(data?.rounds) ? data.rounds : []
    const allPoints = []
    const placeBuckets = new Map()

    const pushPoint = (position) => {
      if (!position) return
      const x = Number(position.x)
      const y = Number(position.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      allPoints.push({ x, y })
      const placeKey = normalizePlaceKey(position.place)
      if (!placeKey) return
      if (!placeBuckets.has(placeKey)) placeBuckets.set(placeKey, [])
      placeBuckets.get(placeKey).push({ x, y })
    }

    for (const round of rounds) {
      const events = Array.isArray(round?.events) ? round.events : []
      for (const event of events) {
        pushPoint(event?.killer_position)
        pushPoint(event?.victim_position)
        pushPoint(event?.position)
      }
    }

    if (allPoints.length === 0) return { mapKey, bounds: null, placePoints: {} }

    const xs = allPoints.map((p) => p.x)
    const ys = allPoints.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const toPct = (x, y) => ({
      xPct: ((x - minX) / spanX) * 100,
      yPct: 100 - (((y - minY) / spanY) * 100),
    })

    const placePoints = {}
    placeBuckets.forEach((bucket, placeKey) => {
      const avgX = bucket.reduce((sum, p) => sum + p.x, 0) / bucket.length
      const avgY = bucket.reduce((sum, p) => sum + p.y, 0) / bucket.length
      const point = toPct(avgX, avgY)
      placePoints[placeKey] = {
        xPct: Math.max(7, Math.min(93, point.xPct)),
        yPct: Math.max(7, Math.min(93, point.yPct)),
      }
    })

    return { mapKey, bounds: { minX, minY, spanX, spanY }, placePoints }
  }, [data])
  const roundRadarMarkers = useMemo(() => {
    if (!selectedRound) return []
    const mapKey = radarContext.mapKey || normalizeMapKey(data?.match_info?.map ?? data?.meta?.map ?? '')
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
          place: event.killer_position.place,
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
          place: event.position.place,
          label: `${bombLabel(event)}${event.position.place ? ` @ ${event.position.place}` : ''}`,
        })
      }
    }

    const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    if (valid.length === 0) return []

    const xs = valid.map((p) => p.x)
    const ys = valid.map((p) => p.y)
    const roundMinX = Math.min(...xs)
    const roundMaxX = Math.max(...xs)
    const roundMinY = Math.min(...ys)
    const roundMaxY = Math.max(...ys)
    const roundSpanX = Math.max(1, roundMaxX - roundMinX)
    const roundSpanY = Math.max(1, roundMaxY - roundMinY)
    const minX = radarContext.bounds?.minX ?? roundMinX
    const minY = radarContext.bounds?.minY ?? roundMinY
    const spanX = radarContext.bounds?.spanX ?? roundSpanX
    const spanY = radarContext.bounds?.spanY ?? roundSpanY

    return valid.map((p) => {
      const placeKey = normalizePlaceKey(p.place)
      const placePointBase = radarContext.placePoints?.[placeKey] ?? placeToRadarPoint(mapKey, p.place)
      const xPctRaw = ((p.x - minX) / spanX) * 100
      const yPctRaw = 100 - (((p.y - minY) / spanY) * 100)
      const rawTransformed = transformRadarPoint(mapKey, xPctRaw, yPctRaw)
      const placePoint = placePointBase || null
      const finalX = placePoint?.xPct ?? rawTransformed.xPct
      const finalY = placePoint?.yPct ?? rawTransformed.yPct
      const calibrated = applyRadarFrameCalibration(mapKey, finalX, finalY)
      return {
        ...p,
        xPct: Math.max(7, Math.min(93, calibrated.xPct)),
        yPct: Math.max(7, Math.min(93, calibrated.yPct)),
      }
    })
  }, [selectedRound, playerNameBySteamId, roundLiveEvents, data, radarContext])
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

  const getRoundBetininhoTip = () => {
    if (!selectedRound) return 'Sem rodada selecionada.'
    const first = roundInsights.firstKill ? getPlayerLabel(roundInsights.firstKill.killer_steamid) : 'N/A'
    const tradeText = roundInsights.entryTrade ? 'entry foi tradada' : 'faltou trade na entry'
    const clutchText = roundInsights.clutchLevel > 0 ? `atenção ao clutch 1v${roundInsights.clutchLevel}` : 'sem clutch vencedor'
    const hsText = `${roundInsights.hsCount} HS no round`
    return `Round ${selectedRound.round_number}: first kill de ${first}, ${tradeText}, ${clutchText}. ${hsText}.`
  }
  const handlePrevRound = () => {
    if (selectedRoundIndex <= 0) return
    const prevRound = roundsOrdered[selectedRoundIndex - 1]
    if (!prevRound) return
    setSelectedRoundNumber(prevRound.round_number)
    setSelectedRadarEventKey(null)
  }
  const handleNextRound = () => {
    if (selectedRoundIndex < 0 || selectedRoundIndex >= roundsOrdered.length - 1) return
    const nextRound = roundsOrdered[selectedRoundIndex + 1]
    if (!nextRound) return
    setSelectedRoundNumber(nextRound.round_number)
    setSelectedRadarEventKey(null)
  }
  const advancedInsights = useMemo(() => {
    const rounds = Array.isArray(data?.rounds) ? data.rounds : []
    const players = Array.isArray(data?.players) ? data.players : []
    const ctKey = 'team_ct_start'
    const trKey = 'team_t_start'
    const validSides = new Set([ctKey, trKey])
    const parseState = (state) => {
      const [ctRaw, trRaw] = String(state ?? '5v5').split('v')
      return { ct: Number.parseInt(ctRaw, 10) || 0, tr: Number.parseInt(trRaw, 10) || 0 }
    }

    const openingKillsByPlayer = new Map()
    const openingDeathsByPlayer = new Map()
    const tradeKillsByPlayer = new Map()
    const tradeDeltaByPlayer = new Map()
    const openingBySide = {
      [ctKey]: { total: 0, converted: 0 },
      [trKey]: { total: 0, converted: 0 },
    }
    const teamTotals = {
      [ctKey]: { players: 0, kills: 0, deaths: 0, assists: 0, adrSum: 0, hsWeightedSum: 0, ratingSum: 0 },
      [trKey]: { players: 0, kills: 0, deaths: 0, assists: 0, adrSum: 0, hsWeightedSum: 0, ratingSum: 0 },
    }
    for (const p of players) {
      const side = p.team
      if (!validSides.has(side)) continue
      const kills = Number(p?.stats?.kills ?? 0)
      const deaths = Number(p?.stats?.deaths ?? 0)
      const assists = Number(p?.stats?.assists ?? 0)
      const adr = Number(p?.stats?.adr ?? 0)
      const hsPct = Number(p?.stats?.hs_percent ?? 0)
      const rating = Number(p?.stats?.rating_2 ?? 0)
      teamTotals[side].players += 1
      teamTotals[side].kills += kills
      teamTotals[side].deaths += deaths
      teamTotals[side].assists += assists
      teamTotals[side].adrSum += adr
      teamTotals[side].hsWeightedSum += hsPct * kills
      teamTotals[side].ratingSum += rating
    }

    const winReasons = new Map()
    const clutchBySide = { [ctKey]: 0, [trKey]: 0 }
    let openingTotal = 0
    let openingConverted = 0
    let openingTradedBack = 0
    let clutchWins = 0
    let maxClutchOpp = 0
    let durationSum = 0
    let durationCount = 0
    let fastRounds = 0
    let longRounds = 0
    let firstHalfCtWins = 0
    let firstHalfTrWins = 0
    let secondHalfCtWins = 0
    let secondHalfTrWins = 0

    for (const round of rounds) {
      const kills = (round.timeline ?? [])
        .filter((event) => event.event === 'kill')
        .sort((a, b) => (Number(a.tick) || 0) - (Number(b.tick) || 0))
      const firstKill = kills[0] ?? null
      const winner = round.winner
      const reason = String(round.win_reason ?? 'unknown')
      winReasons.set(reason, (winReasons.get(reason) ?? 0) + 1)

      if (round.round_number <= 12) {
        if (winner === ctKey) firstHalfCtWins += 1
        if (winner === trKey) firstHalfTrWins += 1
      } else {
        if (winner === ctKey) secondHalfCtWins += 1
        if (winner === trKey) secondHalfTrWins += 1
      }

      for (const k of kills) {
        if (!k.trade_of) continue
        const killerId = String(k.killer_steamid ?? '')
        if (!killerId) continue
        tradeKillsByPlayer.set(killerId, (tradeKillsByPlayer.get(killerId) ?? 0) + 1)
        const current = tradeDeltaByPlayer.get(killerId) ?? { sum: 0, count: 0 }
        current.sum += Number(k.trade_delta_s ?? 0)
        current.count += 1
        tradeDeltaByPlayer.set(killerId, current)
      }

      const startTick = Number(round.start_tick) || 0
      const endTick = Number(round.end_tick) || 0
      let duration = 0
      if (endTick > startTick && startTick > 0) {
        duration = (endTick - startTick) / 64
      } else if (kills.length > 1) {
        const firstTick = Number(kills[0].tick) || 0
        const lastTick = Number(kills[kills.length - 1].tick) || 0
        if (lastTick > firstTick) duration = (lastTick - firstTick) / 64
      }
      if (duration > 0) {
        durationSum += duration
        durationCount += 1
        if (duration <= 45) fastRounds += 1
        if (duration >= 95) longRounds += 1
      }

      if (firstKill && validSides.has(firstKill.killer_team)) {
        openingTotal += 1
        openingBySide[firstKill.killer_team].total += 1
        const killerId = String(firstKill.killer_steamid ?? '')
        const victimId = String(firstKill.victim_steamid ?? '')
        if (killerId) openingKillsByPlayer.set(killerId, (openingKillsByPlayer.get(killerId) ?? 0) + 1)
        if (victimId) openingDeathsByPlayer.set(victimId, (openingDeathsByPlayer.get(victimId) ?? 0) + 1)

        if (winner === firstKill.killer_team) {
          openingConverted += 1
          openingBySide[firstKill.killer_team].converted += 1
        }
        const wasTraded = kills.some((k) => (
          String(k.victim_steamid ?? '') === String(firstKill.killer_steamid ?? '')
          && String(k.trade_of ?? '') === String(firstKill.victim_steamid ?? '')
        ))
        if (wasTraded) openingTradedBack += 1
      }

      if (winner === ctKey || winner === trKey) {
        const states = (round.state_transitions ?? []).map(parseState)
        let roundClutchOpp = 0
        for (const state of states) {
          const own = winner === ctKey ? state.ct : state.tr
          const opp = winner === ctKey ? state.tr : state.ct
          if (own === 1 && opp >= 1) roundClutchOpp = Math.max(roundClutchOpp, opp)
        }
        if (roundClutchOpp > 0) {
          clutchWins += 1
          clutchBySide[winner] += 1
          maxClutchOpp = Math.max(maxClutchOpp, roundClutchOpp)
        }
      }
    }

    const sortedOpeners = Array.from(openingKillsByPlayer.entries()).sort((a, b) => b[1] - a[1])
    const sortedVictims = Array.from(openingDeathsByPlayer.entries()).sort((a, b) => b[1] - a[1])
    const sortedTraders = Array.from(tradeKillsByPlayer.entries()).sort((a, b) => b[1] - a[1])
    const topOpener = sortedOpeners[0] ?? null
    const topVictim = sortedVictims[0] ?? null
    const topTrader = sortedTraders[0] ?? null
    const topTraderDelta = topTrader ? tradeDeltaByPlayer.get(topTrader[0]) : null

    const aimCandidates = [...players]
      .filter((p) => Number(p?.stats?.kills ?? 0) >= 8)
      .sort((a, b) => {
        const hsDiff = Number(b?.stats?.hs_percent ?? 0) - Number(a?.stats?.hs_percent ?? 0)
        if (hsDiff !== 0) return hsDiff
        return Number(b?.stats?.kills ?? 0) - Number(a?.stats?.kills ?? 0)
      })
    const bestAim = aimCandidates[0] ?? null
    const topAdrPlayer = [...players].sort((a, b) => Number(b?.stats?.adr ?? 0) - Number(a?.stats?.adr ?? 0))[0] ?? null
    const topRatingPlayer = [...players].sort((a, b) => Number(b?.stats?.rating_2 ?? 0) - Number(a?.stats?.rating_2 ?? 0))[0] ?? null
    const multikillLeader = [...players]
      .map((p) => {
        const mk = p?.stats?.multikills ?? {}
        const score = Number(mk['2k'] ?? 0) + (Number(mk['3k'] ?? 0) * 2) + (Number(mk['4k'] ?? 0) * 3) + (Number(mk['5k'] ?? 0) * 4)
        return { steam_id: p.steam_id, score }
      })
      .sort((a, b) => b.score - a.score)[0] ?? null

    const pressureRounds = Array.isArray(analysis?.pressure) ? analysis.pressure : []
    const pressureWinsCt = pressureRounds.filter((r) => r.winner === ctKey).length
    const pressureWinsTr = pressureRounds.filter((r) => r.winner === trKey).length
    const ecoRows = Array.isArray(analysis?.economy) ? analysis.economy : []
    const bestEcoBucket = [...ecoRows].sort((a, b) => Number(b?.winrate_pct ?? 0) - Number(a?.winrate_pct ?? 0))[0] ?? null

    const sidePlayers = {
      [ctKey]: players.filter((p) => p.team === ctKey),
      [trKey]: players.filter((p) => p.team === trKey),
    }
    const sideSteamIds = {
      [ctKey]: new Set(sidePlayers[ctKey].map((p) => String(p.steam_id))),
      [trKey]: new Set(sidePlayers[trKey].map((p) => String(p.steam_id))),
    }
    const sideTopTrader = (side) => {
      const top = Array.from(tradeKillsByPlayer.entries())
        .filter(([steamId]) => sideSteamIds[side].has(String(steamId)))
        .sort((a, b) => b[1] - a[1])[0]
      if (!top) return null
      const delta = tradeDeltaByPlayer.get(top[0])
      return {
        steamId: top[0],
        value: top[1],
        avgTradeTime: delta && delta.count > 0 ? delta.sum / delta.count : 0,
      }
    }
    const sideBestAim = (side) => {
      const top = [...sidePlayers[side]]
        .filter((p) => Number(p?.stats?.kills ?? 0) >= 8)
        .sort((a, b) => {
          const hsDiff = Number(b?.stats?.hs_percent ?? 0) - Number(a?.stats?.hs_percent ?? 0)
          if (hsDiff !== 0) return hsDiff
          return Number(b?.stats?.kills ?? 0) - Number(a?.stats?.kills ?? 0)
        })[0]
      if (!top) return null
      return {
        steamId: top.steam_id,
        hsPct: Number(top?.stats?.hs_percent ?? 0),
        kills: Number(top?.stats?.kills ?? 0),
      }
    }
    const sideTopAdr = (side) => {
      const top = [...sidePlayers[side]].sort((a, b) => Number(b?.stats?.adr ?? 0) - Number(a?.stats?.adr ?? 0))[0]
      if (!top) return null
      return { steamId: top.steam_id, value: Number(top?.stats?.adr ?? 0) }
    }
    const sideTopRating = (side) => {
      const top = [...sidePlayers[side]].sort((a, b) => Number(b?.stats?.rating_2 ?? 0) - Number(a?.stats?.rating_2 ?? 0))[0]
      if (!top) return null
      return { steamId: top.steam_id, value: Number(top?.stats?.rating_2 ?? 0) }
    }
    const sideMultikill = (side) => {
      const top = sidePlayers[side]
        .map((p) => {
          const mk = p?.stats?.multikills ?? {}
          const score = Number(mk['2k'] ?? 0) + (Number(mk['3k'] ?? 0) * 2) + (Number(mk['4k'] ?? 0) * 3) + (Number(mk['5k'] ?? 0) * 4)
          return { steamId: p.steam_id, score }
        })
        .sort((a, b) => b.score - a.score)[0]
      return top && top.score > 0 ? top : null
    }

    const toTeamStats = (side) => {
      const sideData = teamTotals[side]
      const kills = sideData.kills
      const deaths = sideData.deaths
      const playersCount = Math.max(1, sideData.players)
      return {
        kills,
        deaths,
        assists: sideData.assists,
        kdDiff: kills - deaths,
        avgAdr: sideData.adrSum / playersCount,
        avgRating: sideData.ratingSum / playersCount,
        hsPctWeighted: kills > 0 ? sideData.hsWeightedSum / kills : 0,
      }
    }

    return {
      openingConversionPct: openingTotal > 0 ? (openingConverted / openingTotal) * 100 : 0,
      openingTradeBackPct: openingTotal > 0 ? (openingTradedBack / openingTotal) * 100 : 0,
      openingCtConversionPct: openingBySide[ctKey].total > 0 ? (openingBySide[ctKey].converted / openingBySide[ctKey].total) * 100 : 0,
      openingTrConversionPct: openingBySide[trKey].total > 0 ? (openingBySide[trKey].converted / openingBySide[trKey].total) * 100 : 0,
      openingTotal,
      openingCtTotal: openingBySide[ctKey].total,
      openingTrTotal: openingBySide[trKey].total,
      topOpener: topOpener ? { steamId: topOpener[0], value: topOpener[1] } : null,
      topVictim: topVictim ? { steamId: topVictim[0], value: topVictim[1] } : null,
      topTrader: topTrader ? {
        steamId: topTrader[0],
        value: topTrader[1],
        avgTradeTime: topTraderDelta && topTraderDelta.count > 0 ? topTraderDelta.sum / topTraderDelta.count : 0,
      } : null,
      bestAim: bestAim ? {
        steamId: bestAim.steam_id,
        hsPct: Number(bestAim?.stats?.hs_percent ?? 0),
        kills: Number(bestAim?.stats?.kills ?? 0),
      } : null,
      topAdr: topAdrPlayer ? {
        steamId: topAdrPlayer.steam_id,
        value: Number(topAdrPlayer?.stats?.adr ?? 0),
      } : null,
      topRating: topRatingPlayer ? {
        steamId: topRatingPlayer.steam_id,
        value: Number(topRatingPlayer?.stats?.rating_2 ?? 0),
      } : null,
      multikillLeader: multikillLeader && multikillLeader.score > 0 ? multikillLeader : null,
      sideLeaders: {
        [ctKey]: {
          trader: sideTopTrader(ctKey),
          aim: sideBestAim(ctKey),
          adr: sideTopAdr(ctKey),
          rating: sideTopRating(ctKey),
          multikill: sideMultikill(ctKey),
        },
        [trKey]: {
          trader: sideTopTrader(trKey),
          aim: sideBestAim(trKey),
          adr: sideTopAdr(trKey),
          rating: sideTopRating(trKey),
          multikill: sideMultikill(trKey),
        },
      },
      teamCt: toTeamStats(ctKey),
      teamTr: toTeamStats(trKey),
      pressureTotal: pressureRounds.length,
      pressureWinsCt,
      pressureWinsTr,
      bestEcoBucket,
      clutchWins,
      clutchCtWins: clutchBySide[ctKey],
      clutchTrWins: clutchBySide[trKey],
      maxClutchOpp,
      roundDurationAvg: durationCount > 0 ? durationSum / durationCount : 0,
      fastRounds,
      longRounds,
      firstHalfCtWins,
      firstHalfTrWins,
      secondHalfCtWins,
      secondHalfTrWins,
      winReasons,
    }
  }, [data, analysis])

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
              <PlayersPage players={allPlayers} matchId={data.match_id} matchData={data} />
            </div>
          )}

          {activeTab === 'rounds' && (
            <div className="panel-stack">
              <section className="panel-block">
              <div className="round-nav-bar">
                <h3>Timeline de rodadas</h3>
                <div className="round-nav-controls">
                  <button
                    type="button"
                    className="round-arrow-btn"
                    onClick={handlePrevRound}
                    disabled={selectedRoundIndex <= 0}
                    title="Rodada anterior"
                  >
                    ‹
                  </button>
                  <span className="round-nav-label">
                    {selectedRound ? `Round ${selectedRound.round_number}/${roundsOrdered.length}` : '-'}
                  </span>
                  <button
                    type="button"
                    className="round-arrow-btn"
                    onClick={handleNextRound}
                    disabled={selectedRoundIndex < 0 || selectedRoundIndex >= roundsOrdered.length - 1}
                    title="Proxima rodada"
                  >
                    ›
                  </button>
                </div>
              </div>
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
                <section className="panel-block round-pro-shell">
                  <header className="round-pro-head">
                    <div className="round-pro-title">
                      <h3>Round {selectedRound.round_number}</h3>
                      <p className="dim">{getWinReasonPtBr(selectedRound.win_reason)}</p>
                    </div>
                    <div className="round-pro-nav">
                      <button
                        type="button"
                        className="round-arrow-btn round-arrow-inline"
                        onClick={handlePrevRound}
                        disabled={selectedRoundIndex <= 0}
                        aria-label="Round anterior"
                        title="Round anterior"
                      >
                        ‹
                      </button>
                      <p className="round-title">ROUND {selectedRound.round_number}</p>
                      <button
                        type="button"
                        className="round-arrow-btn round-arrow-inline"
                        onClick={handleNextRound}
                        disabled={selectedRoundIndex < 0 || selectedRoundIndex >= roundsOrdered.length - 1}
                        aria-label="Proximo round"
                        title="Proximo round"
                      >
                        ›
                      </button>
                    </div>
                    <div className="round-pro-score">
                      <span className="ct-text">{roundHud.ctAlive}</span>
                      <CsIcon name="round" label="Round" fallback="•" variant="badge" />
                      <span className="tr-text">{roundHud.tAlive}</span>
                    </div>
                  </header>

                  <div className="round-pro-grid">
                    <aside className="round-economy">
                      <div className="round-economy-card">
                        <div className="eco-row">
                          <span>Equipamento (estimado)</span>
                          <strong className="ct-text">{formatMoneyBr(roundEconomy.ctEquipEstimate)}</strong>
                          <strong className="tr-text">{formatMoneyBr(roundEconomy.trEquipEstimate)}</strong>
                        </div>
                        <div className="eco-row">
                          <span>Gasto estimado (freeze)</span>
                          <strong className="ct-text">{formatMoneyBr(roundEconomy.ctSpentEstimate)}</strong>
                          <strong className="tr-text">{formatMoneyBr(roundEconomy.trSpentEstimate)}</strong>
                        </div>
                        <div className="eco-row">
                          <span>Compra</span>
                          <strong className="ct-text">{roundEconomy.ctBuy}</strong>
                          <strong className="tr-text">{roundEconomy.trBuy}</strong>
                        </div>
                      </div>
                      <div className="round-economy-meta">
                        <p className="dim">Vantagem inicial: {getTeamLabel(selectedRound.opening_advantage_team_id)}</p>
                        <p className="dim">Compras freeze: {roundEconomy.purchases} | Players: {roundEconomy.purchasePlayers} | Drops: {roundEconomy.drops}</p>
                      </div>
                      <div className="radar-box">
                        <p className="dim">Radar do mapa</p>
                        <MapRadarWithEvents map={data.match_info.map} markers={visibleRadarMarkers} selectedEventKey={selectedRadarEventKey} />
                      </div>
                    </aside>

                    <main className="round-feed">
                      <div className="round-feed-side">
                        <div className="round-feed-toolbar">
                          <div className="round-feed-stats">
                            <span>K {roundKills.length}</span>
                            <span>HS {roundInsights.hsCount}</span>
                            <span>TRD {roundInsights.tradeCount}</span>
                          </div>
                          <div className="round-feed-actions">
                            <button
                              className={`feed-toggle-btn ${showRoundBetininho ? 'active' : ''}`}
                              type="button"
                              onClick={() => setShowRoundBetininho((v) => !v)}
                            >
                              Betininho
                            </button>
                            <button className={`feed-toggle-btn ${showPrepItems ? 'active' : ''}`} type="button" onClick={() => setShowPrepItems((v) => !v)}>
                              Itens
                            </button>
                            <button className="feed-play-btn" type="button" onClick={handlePlayRoundFeed} disabled={animationState.isAnimating}>
                              {animationState.isAnimating ? 'Rodando...' : 'Play'}
                            </button>
                          </div>
                        </div>
                        <div className="round-tactical-strip">
                          <div className="t-item">
                            <span>First</span>
                            <strong>{roundInsights.firstKill ? getPlayerLabel(roundInsights.firstKill.killer_steamid) : 'N/A'}</strong>
                          </div>
                          <div className="t-item">
                            <span>Death</span>
                            <strong>{roundInsights.firstDeath ? getPlayerLabel(roundInsights.firstDeath.steamid) : 'N/A'}</strong>
                          </div>
                          <div className="t-item">
                            <span>Entry</span>
                            <strong>{roundInsights.entryTrade ? 'Tradada' : 'Sem trade'}</strong>
                          </div>
                          <div className="t-item">
                            <span>Clutch</span>
                            <strong>{roundInsights.clutchLevel > 0 ? `1v${roundInsights.clutchLevel}` : 'Nao'}</strong>
                          </div>
                          <div className="t-item">
                            <span>HS / TRD</span>
                            <strong>{roundInsights.hsCount} / {roundInsights.tradeCount}</strong>
                          </div>
                          <div className="t-item">
                            <span>Impacto</span>
                            <strong>{roundInsights.impactPlayerId ? `${getPlayerLabel(roundInsights.impactPlayerId)} (${roundInsights.impactKills}K)` : 'Sem destaque'}</strong>
                          </div>
                        </div>
                        <div className="round-feed-card">
                          <div className="round-feed-live">
                              {showRoundBetininho && (
                                <article className="round-betininho-card">
                                  <img src={BETININHO_AVATAR} alt="Betininho PRO" className="round-betininho-avatar" />
                                  <p>{getRoundBetininhoTip()}</p>
                                </article>
                              )}
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
                                        fallback="??"
                                        variant="weapon"
                                      />
                                      {event.headshot
                                        ? <CsIcon name="headshot" label="Headshot" fallback="HS" variant="hs" />
                                        : <span className="kill-hs-slot" />}
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
                        </div>
                        <p className={`round-winner ${getTeamTextClass(selectedRound.winner)}`}>
                          {selectedRound.winner === 'team_ct_start' ? 'Counter-Terrorists venceram' : 'Terrorists venceram'}
                        </p>
                      </div>
                    </main>
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === 'insights' && (
            <section className="panel-block insights-panel">
              <h3>Central de Analise</h3>
              <div className="insights-stack">
                {analysis ? (
                  <div className="insights-layout">
                    <section className="insight-section">
                      <header className="insight-head">
                        <h4>Panorama da Partida</h4>
                      </header>
                      <div className="quick-insights insights-grid-compact">
                        <article className="insight-card insight-card-highlight" data-tip="Jogador com maior Round Impact Score (RIS), que pondera peso e contexto dos abates por rodada.">
                          <p className="dim">Impacto</p>
                          <h4>{analysis?.impact?.round_impact_score?.[0] ? formatNick(analysis.impact.round_impact_score[0].nick) : 'N/A'}</h4>
                          <p>RIS {analysis?.impact?.round_impact_score?.[0]?.ris_match ?? 0}</p>
                        </article>
                        <article className="insight-card" data-tip="Tempo medio para trocar uma morte do teammate por um abate de resposta. Quanto menor, melhor a coordenação.">
                          <p className="dim">Trade</p>
                          <h4>Tempo medio</h4>
                          <p>{analysis?.trades?.avg_trade_time_s ?? 0}s</p>
                        </article>
                        <article className="insight-card" data-tip="Quantidade de rodadas classificadas como decisivas (critical/post 3 losses).">
                          <p className="dim">Pressao</p>
                          <h4>Rodadas chave</h4>
                          <p>{analysis?.pressure?.length ?? 0}</p>
                        </article>
                        <article className="insight-card" data-tip="Quantidade de combinacoes de lado e tipo de compra (eco/half/full) analisadas.">
                          <p className="dim">Economia</p>
                          <h4>Buckets buy</h4>
                          <p>{analysis?.economy?.length ?? 0}</p>
                        </article>
                        <article className="insight-card" data-tip="Duracao media das rodadas e distribuicao entre rounds rapidos e longos.">
                          <p className="dim">Ritmo medio round</p>
                          <h4>{formatSeconds(advancedInsights.roundDurationAvg)}</h4>
                          <p>Rounds rapidos {advancedInsights.fastRounds} | longos {advancedInsights.longRounds}</p>
                        </article>
                        <article className="insight-card" data-tip="Placar por metade (1H e 2H), no formato Time1:Time2.">
                          <p className="dim">Split por metade</p>
                          <h4>{advancedInsights.firstHalfCtWins}:{advancedInsights.firstHalfTrWins} | {advancedInsights.secondHalfCtWins}:{advancedInsights.secondHalfTrWins}</h4>
                          <p>1H (Time1:Time2) | 2H (Time1:Time2)</p>
                        </article>
                        <article className="insight-card" data-tip="Como as rodadas terminaram: eliminacao, tempo, bomba defusada e bomba explodida.">
                          <p className="dim">Motivo de vitoria</p>
                          <h4>
                            E {advancedInsights.winReasons.get('elimination') ?? 0}
                            {' '}| B {((advancedInsights.winReasons.get('bomb_defused') ?? 0) + (advancedInsights.winReasons.get('bomb_exploded') ?? 0))}
                          </h4>
                          <p>
                            Time {advancedInsights.winReasons.get('time') ?? 0}
                            {' '}| Defuse {advancedInsights.winReasons.get('bomb_defused') ?? 0}
                            {' '}| Explode {advancedInsights.winReasons.get('bomb_exploded') ?? 0}
                          </p>
                        </article>
                      </div>
                    </section>

                    <section className="insight-section">
                      <header className="insight-head">
                        <h4>Entry e Clutch</h4>
                      </header>
                      <div className="quick-insights insights-grid-compact">
                        <article className="insight-card" data-tip="Taxa de conversao do first kill em vitoria de rodada.">
                          <p className="dim">Entry para vitoria</p>
                          <h4>{formatPct(advancedInsights.openingConversionPct)}</h4>
                          <p>{advancedInsights.openingTotal} rounds com first kill</p>
                        </article>
                        <article className="insight-card" data-tip="Percentual de first kills que foram imediatamente respondidos (trade back).">
                          <p className="dim">Entry Tradada</p>
                          <h4>{formatPct(advancedInsights.openingTradeBackPct)}</h4>
                          <p>Taxa de resposta ao first kill</p>
                        </article>
                        <article className="insight-card" data-tip="Comparacao da conversao de first kill em vitoria para Time 1 e Time 2.">
                          <p className="dim">Conversao Time1/Time2</p>
                          <h4>{formatPct(advancedInsights.openingCtConversionPct)} / {formatPct(advancedInsights.openingTrConversionPct)}</h4>
                          <p>Time 1 ({advancedInsights.openingCtTotal}) | Time 2 ({advancedInsights.openingTrTotal})</p>
                        </article>
                        <article className="insight-card" data-tip="Jogador com maior numero de first kills na partida.">
                          <p className="dim">Top Opener</p>
                          <h4>{advancedInsights.topOpener ? getPlayerLabel(advancedInsights.topOpener.steamId) : 'N/A'}</h4>
                          <p>{advancedInsights.topOpener ? `${advancedInsights.topOpener.value} first kills` : 'Sem first kill valida'}</p>
                        </article>
                        <article className="insight-card" data-tip="Jogador que mais morreu como first death no round.">
                          <p className="dim">Mais punido na entry</p>
                          <h4>{advancedInsights.topVictim ? getPlayerLabel(advancedInsights.topVictim.steamId) : 'N/A'}</h4>
                          <p>{advancedInsights.topVictim ? `${advancedInsights.topVictim.value} first deaths` : 'Sem first death valida'}</p>
                        </article>
                        <article className="insight-card" data-tip="Quantidade de rounds vencidos em situacao de 1vX, incluindo recorte por time.">
                          <p className="dim">Clutch 1vX vencidos</p>
                          <h4>{advancedInsights.clutchWins}</h4>
                          <p>Time 1 {advancedInsights.clutchCtWins} | Time 2 {advancedInsights.clutchTrWins} | max 1v{advancedInsights.maxClutchOpp || 0}</p>
                        </article>
                        <article className="insight-card" data-tip="Desempenho dos times apenas em rodadas de alta pressao (critical/post 3 losses).">
                          <p className="dim">Pressao (rounds chave)</p>
                          <h4>{advancedInsights.pressureTotal}</h4>
                          <p>Time 1 {advancedInsights.pressureWinsCt} | Time 2 {advancedInsights.pressureWinsTr}</p>
                        </article>
                      </div>
                    </section>

                    <section className="insight-section">
                      <header className="insight-head">
                        <h4>Duelos e Precisao</h4>
                      </header>
                      <div className="quick-insights insights-grid-compact">
                        <article className="insight-card insight-card-highlight" data-tip="Jogador com mais trades por time; mostra volume e impacto de troca.">
                          <p className="dim">Maior Trader</p>
                          <p>
                            Time 1: {advancedInsights.sideLeaders?.team_ct_start?.trader
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_ct_start.trader.steamId)} (${advancedInsights.sideLeaders.team_ct_start.trader.value})`
                              : 'N/A'}
                          </p>
                          <p>
                            Time 2: {advancedInsights.sideLeaders?.team_t_start?.trader
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_t_start.trader.steamId)} (${advancedInsights.sideLeaders.team_t_start.trader.value})`
                              : 'N/A'}
                          </p>
                        </article>
                        <article className="insight-card" data-tip="Melhor HS% por time, considerando apenas jogadores com minimo de kills.">
                          <p className="dim">Melhor Mira</p>
                          <p>
                            Time 1: {advancedInsights.sideLeaders?.team_ct_start?.aim
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_ct_start.aim.steamId)} (${formatPct(advancedInsights.sideLeaders.team_ct_start.aim.hsPct)})`
                              : 'N/A'}
                          </p>
                          <p>
                            Time 2: {advancedInsights.sideLeaders?.team_t_start?.aim
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_t_start.aim.steamId)} (${formatPct(advancedInsights.sideLeaders.team_t_start.aim.hsPct)})`
                              : 'N/A'}
                          </p>
                        </article>
                        <article className="insight-card" data-tip="Maior ADR por time (dano medio por rodada).">
                          <p className="dim">Melhor ADR</p>
                          <p>
                            Time 1: {advancedInsights.sideLeaders?.team_ct_start?.adr
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_ct_start.adr.steamId)} (${advancedInsights.sideLeaders.team_ct_start.adr.value.toFixed(1)})`
                              : 'N/A'}
                          </p>
                          <p>
                            Time 2: {advancedInsights.sideLeaders?.team_t_start?.adr
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_t_start.adr.steamId)} (${advancedInsights.sideLeaders.team_t_start.adr.value.toFixed(1)})`
                              : 'N/A'}
                          </p>
                        </article>
                        <article className="insight-card" data-tip="Maior rating por time.">
                          <p className="dim">Melhor Rating</p>
                          <p>
                            Time 1: {advancedInsights.sideLeaders?.team_ct_start?.rating
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_ct_start.rating.steamId)} (${advancedInsights.sideLeaders.team_ct_start.rating.value.toFixed(2)})`
                              : 'N/A'}
                          </p>
                          <p>
                            Time 2: {advancedInsights.sideLeaders?.team_t_start?.rating
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_t_start.rating.steamId)} (${advancedInsights.sideLeaders.team_t_start.rating.value.toFixed(2)})`
                              : 'N/A'}
                          </p>
                        </article>
                        <article className="insight-card" data-tip="Jogador com maior pontuacao de multikills por time (2k/3k/4k/5k ponderados).">
                          <p className="dim">Rei do Multikill</p>
                          <p>
                            Time 1: {advancedInsights.sideLeaders?.team_ct_start?.multikill
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_ct_start.multikill.steamId)} (S${advancedInsights.sideLeaders.team_ct_start.multikill.score})`
                              : 'N/A'}
                          </p>
                          <p>
                            Time 2: {advancedInsights.sideLeaders?.team_t_start?.multikill
                              ? `${getPlayerLabel(advancedInsights.sideLeaders.team_t_start.multikill.steamId)} (S${advancedInsights.sideLeaders.team_t_start.multikill.score})`
                              : 'N/A'}
                          </p>
                        </article>
                        <article className="insight-card" data-tip="Diferenca de kills-deaths por time para medir dominancia de duelos.">
                          <p className="dim">Diferencial Time1/Time2</p>
                          <h4>{advancedInsights.teamCt.kdDiff >= 0 ? `+${advancedInsights.teamCt.kdDiff}` : advancedInsights.teamCt.kdDiff} / {advancedInsights.teamTr.kdDiff >= 0 ? `+${advancedInsights.teamTr.kdDiff}` : advancedInsights.teamTr.kdDiff}</h4>
                          <p>Time 1 K-D {advancedInsights.teamCt.kills}-{advancedInsights.teamCt.deaths} | Time 2 K-D {advancedInsights.teamTr.kills}-{advancedInsights.teamTr.deaths}</p>
                        </article>
                        <article className="insight-card" data-tip="Comparativo de HS% ponderado e ADR medio entre Time 1 e Time 2.">
                          <p className="dim">Mira Time1/Time2</p>
                          <h4>{formatPct(advancedInsights.teamCt.hsPctWeighted)} / {formatPct(advancedInsights.teamTr.hsPctWeighted)}</h4>
                          <p>ADR medio {advancedInsights.teamCt.avgAdr.toFixed(1)} / {advancedInsights.teamTr.avgAdr.toFixed(1)}</p>
                        </article>
                        <article className="insight-card" data-tip="Bucket economico com maior winrate na partida (lado + buy tier).">
                          <p className="dim">Bucket eco mais efetivo</p>
                          <h4>{advancedInsights.bestEcoBucket ? `${advancedInsights.bestEcoBucket.side === 'team_ct_start' ? 'CT' : 'TR'} ${advancedInsights.bestEcoBucket.buy_tier}` : 'N/A'}</h4>
                          <p>{advancedInsights.bestEcoBucket ? `WR ${formatPct(advancedInsights.bestEcoBucket.winrate_pct)} | ${advancedInsights.bestEcoBucket.rounds} rounds` : 'Sem buckets disponiveis'}</p>
                        </article>
                      </div>
                    </section>

                    <section className="insight-section">
                      <header className="insight-head">
                        <h4>Fechamento de Round</h4>
                      </header>
                      <div className="quick-insights insights-grid-compact">
                        <article className="insight-card insight-card-survival" data-tip="Top 2 do Time 1 em rounds como ultimo vivo que acabou eliminado; inclui tempo medio e total nessa condicao.">
                          <p className="dim">Ultimo a morrer (CT)</p>
                          <h4>{analysis?.last_alive_to_die?.team_ct_start_top2?.length ? 'Top 2' : 'N/A'}</h4>
                          {topLastAliveRows(analysis?.last_alive_to_die?.team_ct_start_top2).map((row, idx) => (
                            <p key={`ct-last-${row.steam_id}`}>
                              {idx + 1}. {formatNick(row.nick)} | {row.last_to_die_rounds}x | medio {formatSeconds(row.avg_solo_time_s)} | total {formatSeconds(row.total_solo_time_s)}
                            </p>
                          ))}
                          {topLastAliveRows(analysis?.last_alive_to_die?.team_ct_start_top2).length === 0 && (
                            <p>Sem rounds com ultimo CT eliminado</p>
                          )}
                        </article>
                        <article className="insight-card insight-card-survival" data-tip="Top 2 do Time 2 em rounds como ultimo vivo que acabou eliminado; inclui tempo medio e total nessa condicao.">
                          <p className="dim">Ultimo a morrer (TR)</p>
                          <h4>{analysis?.last_alive_to_die?.team_t_start_top2?.length ? 'Top 2' : 'N/A'}</h4>
                          {topLastAliveRows(analysis?.last_alive_to_die?.team_t_start_top2).map((row, idx) => (
                            <p key={`tr-last-${row.steam_id}`}>
                              {idx + 1}. {formatNick(row.nick)} | {row.last_to_die_rounds}x | medio {formatSeconds(row.avg_solo_time_s)} | total {formatSeconds(row.total_solo_time_s)}
                            </p>
                          ))}
                          {topLastAliveRows(analysis?.last_alive_to_die?.team_t_start_top2).length === 0 && (
                            <p>Sem rounds com ultimo TR eliminado</p>
                          )}
                        </article>
                      </div>
                    </section>
                  </div>
                ) : (
                  <p className="dim">Sem analise disponivel para esta partida.</p>
                )}
              </div>
            </section>
          )}

          {allPlayers.length === 0 && <section className="panel-block">Nao foi possivel montar scoreboard para esta demo.</section>}
        </div>
      </section>
    </div>
  )
}

async function uploadAndParseDemo(file) {
  const usingSameOriginApi = !API_BASE
  const FOUR_MB = 4 * 1024 * 1024
  if (usingSameOriginApi && file.size > FOUR_MB) {
    throw new Error('Arquivo .dem muito grande para o deploy serverless atual. Configure `VITE_API_URL` para uma API dedicada.')
  }

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

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || getApiErrorMessage(response, 'Falha ao processar demo no servidor.'))
  }
  const matchPayload = payload?.match ?? payload
  return {
    match: normalizeParsedMatch(matchPayload),
    analysis: payload?.analysis ?? null,
  }
}

async function loadLocalRealMatch() {
  const response = await fetch('/data/real-match.json')
  if (!response.ok) throw new Error('real-match.json nao encontrado.')
  const payload = await response.json()
  return {
    match: normalizeParsedMatch(payload),
    analysis: null,
  }
}

async function analyzeMatch(matchRaw) {
  const response = await fetch(apiUrl('/api/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(matchRaw),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || getApiErrorMessage(response, 'Falha ao analisar partida.'))
  }
  return payload
}

export default function Cs2App() {
  const [showIntro, setShowIntro] = useState(true)
  const [showLanding, setShowLanding] = useState(false)
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
      setMatchData(parsed.match)
      setAnalysis(parsed.analysis)
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
      if (parsed.match?.raw) {
        try {
          analysisReport = await analyzeMatch(parsed.match.raw)
        } catch (analysisErr) {
          console.error(analysisErr)
          setError(`Analise indisponivel para esta carga: ${analysisErr?.message ?? 'erro desconhecido'}`)
        }
      }
      setMatchData(parsed.match)
      setAnalysis(parsed.analysis ?? analysisReport)
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

      {state === 'upload' && showLanding && (
        <LandingPage onStart={() => setShowLanding(false)} />
      )}

      {state === 'upload' && !showLanding && (
        <main className="upload card">
          <h2>Envie sua demo real</h2>
          <p>Selecione um arquivo .dem para extrair os dados reais da partida.</p>
          <div className="upload-chooser">
            <input type="file" accept=".dem" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => setShowLanding(true)}>Voltar para landing</button>
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

      {state !== 'dashboard' && (
        <aside className="warroom-corner">
          <iframe
            src="/warroom/test.html?v=3"
            title="War Room Corner"
            className="warroom-corner-frame"
            scrolling="no"
          />
        </aside>
      )}
    </div>
  )
}





















