import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PlayerProfile from './PlayerProfile.jsx'
import { computeAimRoundInsights, computePlayerInsights } from '../../packages/player-profile/index.js'

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const apiUrl = (path) => `${API_BASE}${path}`

function toNumber(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

function computeAvgReactionSecondsLocal(match, steamId) {
  const samples = []
  for (const round of match?.rounds ?? []) {
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
  if (!samples.length) return 0
  return Number((samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3))
}

function buildLocalPlayerProfile(match, steamId) {
  if (!match?.players) return null
  const player = match.players.find((p) => String(p.steam_id) === String(steamId))
  if (!player) return null

  const names = new Map((match.players ?? []).map((p) => [String(p.steam_id), p.nick]))
  const duelsMap = new Map()
  const ensure = (opId) => {
    const key = String(opId)
    if (!duelsMap.has(key)) {
      duelsMap.set(key, {
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
    return duelsMap.get(key)
  }

  const timeline = []
  let survived = 0
  for (const round of match.rounds ?? []) {
    let diedInRound = false
    for (const ev of round.timeline ?? []) {
      if (ev.event === 'kill') {
        const killer = String(ev.killer_steamid ?? '')
        const victim = String(ev.victim_steamid ?? '')
        if (killer === String(steamId) || victim === String(steamId)) {
          timeline.push({
            tick: toNumber(ev.tick, 0),
            round: round.round_number,
            type: 'kill',
            killer: names.get(killer) ?? killer,
            victim: names.get(victim) ?? victim,
            weapon: ev.weapon ?? '',
            headshot: Boolean(ev.headshot),
            damage: 100,
          })
        }
        if (killer === String(steamId)) {
          const row = ensure(victim)
          row.duelsTotal += 1
          row.duelsWon += 1
          row.killsAgainst += 1
          if (ev.headshot) row.headshotsAgainst += 1
          row.damageDealt += 100
        } else if (victim === String(steamId)) {
          const row = ensure(killer)
          row.duelsTotal += 1
          row.duelsLost += 1
          row.deathsAgainst += 1
          if (ev.headshot) row.headshotsTaken += 1
          row.damageTaken += 100
          diedInRound = true
        }
      } else if (ev.event === 'hurt') {
        const attacker = String(ev.attacker_steamid ?? '')
        const victim = String(ev.victim_steamid ?? '')
        const dmg = toNumber(ev.damage, 0)
        if (attacker === String(steamId) || victim === String(steamId)) {
          timeline.push({
            tick: toNumber(ev.tick, 0),
            round: round.round_number,
            type: 'damage',
            attacker: names.get(attacker) ?? attacker,
            victim: names.get(victim) ?? victim,
            damage: dmg,
            weapon: ev.weapon ?? '',
          })
        }
        if (attacker === String(steamId)) {
          const row = ensure(victim)
          row.duelsTotal += 1
          row.damageDealt += dmg
        } else if (victim === String(steamId)) {
          const row = ensure(attacker)
          row.duelsTotal += 1
          row.damageTaken += dmg
        }
      } else if (ev.event === 'purchase' && String(ev.player_steamid ?? '') === String(steamId)) {
        timeline.push({
          tick: toNumber(ev.tick, 0),
          round: round.round_number,
          type: 'purchase',
          weapon: ev.weapon ?? '',
        })
      }
    }
    if (!diedInRound) survived += 1
  }

  const duels = Array.from(duelsMap.values()).map((d) => ({
    ...d,
    winRate: d.duelsTotal > 0 ? Number(((d.duelsWon / d.duelsTotal) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.duelsTotal - a.duelsTotal)

  return {
    steamId: String(player.steam_id),
    name: player.nick,
    summary: {
      steamId: String(player.steam_id),
      name: player.nick,
      team: player.team,
      sideStart: String(player.team ?? ''),
      kills: toNumber(player.stats?.kills, 0),
      deaths: toNumber(player.stats?.deaths, 0),
      assists: toNumber(player.stats?.assists, 0),
      adr: toNumber(player.stats?.adr, 0),
      headshotPct: toNumber(player.stats?.hs_percent, 0),
      kdRatio: toNumber(player.stats?.kills, 0) / Math.max(1, toNumber(player.stats?.deaths, 0)),
      rating: toNumber(player.stats?.rating_2, 0),
      damageTotal: Number((toNumber(player.stats?.adr, 0) * Math.max(1, match.rounds?.length ?? 1)).toFixed(2)),
      roundsPlayed: Math.max(1, match.rounds?.length ?? 1),
      roundsSurvived: survived,
      firstKills: toNumber(player.stats?.entry_kills, 0),
      firstDeaths: toNumber(player.stats?.entry_deaths, 0),
    },
    aim: {
      overallAccuracy: Number((toNumber(player.stats?.kills, 0) / Math.max(1, toNumber(player.stats?.kills, 0) + toNumber(player.stats?.deaths, 0))).toFixed(4)),
      firstBulletAccuracy: Number((toNumber(player.stats?.hs_percent, 0) / 100).toFixed(4)),
      headshotRate: toNumber(player.stats?.hs_percent, 0) / 100,
      avgTimeBetweenShots: 0,
      avgReactionTime: computeAvgReactionSecondsLocal(match, steamId),
    },
    aimRoundInsights: computeAimRoundInsights(match, steamId),
    utility: {
      flashesThrown: toNumber(player.stats?.util_used?.flash, 0),
      playersFlashed: 0,
      flashAssists: toNumber(player.stats?.flash_assists, 0),
      heDamage: 0,
      molotovDamage: 0,
    },
    movement: {
      stationarySeconds: 0,
      movingSeconds: 0,
      heatmapData: [],
      pathData: [],
    },
    duels,
    insights: computePlayerInsights(match, player, steamId),
    timeline: timeline.sort((a, b) => a.tick - b.tick),
    heatmap: [],
    weapons: [],
  }
}

function mergeProfileWithLocal(apiProfile, localProfile) {
  if (!localProfile) return apiProfile
  if (!apiProfile) return localProfile
  return {
    ...localProfile,
    ...apiProfile,
    summary: { ...(localProfile.summary ?? {}), ...(apiProfile.summary ?? {}) },
    aim: { ...(localProfile.aim ?? {}), ...(apiProfile.aim ?? {}) },
    utility: { ...(localProfile.utility ?? {}), ...(apiProfile.utility ?? {}) },
    movement: { ...(localProfile.movement ?? {}), ...(apiProfile.movement ?? {}) },
    insights: (apiProfile.insights && Object.keys(apiProfile.insights).length > 0)
      ? apiProfile.insights
      : localProfile.insights,
    timeline: Array.isArray(apiProfile.timeline) && apiProfile.timeline.length > 0
      ? apiProfile.timeline
      : localProfile.timeline,
    duels: Array.isArray(apiProfile.duels) && apiProfile.duels.length > 0
      ? apiProfile.duels
      : localProfile.duels,
  }
}

export default function PlayersPage({ players = [], matchId, matchData = null }) {
  const ordered = useMemo(() => [...players].sort((a, b) => (b?.stats?.rating_2 ?? 0) - (a?.stats?.rating_2 ?? 0)), [players])
  const [selectedIds, setSelectedIds] = useState(ordered[0]?.steam_id ? [String(ordered[0].steam_id)] : [])
  const [profilesById, setProfilesById] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selected = selectedIds[0] ?? ''
  const profile = selected ? profilesById[selected] ?? null : null
  const compareProfile = selectedIds.length > 1 ? (profilesById[selectedIds[1]] ?? null) : null

  useEffect(() => {
    if (selectedIds.length === 0 && ordered[0]?.steam_id) {
      setSelectedIds([String(ordered[0].steam_id)])
    }
  }, [ordered, selectedIds.length])

  const loadProfileForSteamId = useCallback(async (sid) => {
    if (!sid) return null
    const local = buildLocalPlayerProfile(matchData, sid)
    try {
      if (matchId) {
        const res = await fetch(apiUrl(`/api/player/${matchId}/${sid}`))
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload?.error || 'Falha ao carregar perfil do jogador.')
        return mergeProfileWithLocal(payload, local)
      }
      if (!local) throw new Error('Falha ao montar perfil local do jogador.')
      return local
    } catch {
      return local
    }
  }, [matchId, matchData])

  useEffect(() => {
    const load = async () => {
      if (!selectedIds.length) {
        setProfilesById({})
        return
      }
      setLoading(true)
      setError('')
      try {
        const next = {}
        for (const sid of selectedIds) {
          const pf = await loadProfileForSteamId(sid)
          if (pf) next[String(sid)] = pf
        }
        setProfilesById(next)
        if (!next[selectedIds[0]]) {
          setError('Falha ao carregar perfil do jogador.')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedIds, loadProfileForSteamId])

  const handlePlayerClick = (event, sid) => {
    const key = String(sid)
    const multi = event.ctrlKey || event.metaKey
    if (!multi) {
      setSelectedIds([key])
      return
    }
    setSelectedIds((prev) => {
      const exists = prev.includes(key)
      if (exists) return prev.filter((id) => id !== key)
      const next = [...prev, key]
      return next.slice(-3)
    })
  }

  return (
    <div className="players-layout">
      <aside className="players-list">
        <h3>Jogadores</h3>
        <p className="dim">Ctrl + clique para comparar</p>
        {ordered.map((p) => (
          <button
            key={p.steam_id}
            type="button"
            className={`player-list-item ${selectedIds.includes(String(p.steam_id)) ? 'active' : ''}`}
            onClick={(event) => handlePlayerClick(event, p.steam_id)}
          >
            <span>{p.nick}</span>
            <small className="dim">R {Number(p?.stats?.rating_2 ?? 0).toFixed(2)}</small>
          </button>
        ))}
      </aside>

      <section className="players-profile-card">
        {loading && <p className="dim">Carregando perfil...</p>}
        {!loading && error && <p className="error">{error}</p>}
        {!loading && !error && profile && <PlayerProfile profile={profile} compareProfile={compareProfile} />}
      </section>
    </div>
  )
}
