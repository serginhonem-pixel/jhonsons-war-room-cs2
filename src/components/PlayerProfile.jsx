import React, { useMemo, useState } from 'react'

function fmt(value, digits = 2) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '0'
}

function MetricValue({ value, compareName, compareValue }) {
  return (
    <>
      <strong>{value}</strong>
      {compareName ? <small className="dim">vs {compareName}: {compareValue}</small> : null}
    </>
  )
}

export default function PlayerProfile({ profile, compareProfile = null }) {
  const [tab, setTab] = useState('overview')

  const tabs = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'aim', label: 'Aim' },
      { id: 'duels', label: 'Duels' },
      { id: 'utility', label: 'Utility' },
      { id: 'movement', label: 'Movement' },
      { id: 'timeline', label: 'Timeline' },
    ],
    [],
  )

  if (!profile) return <div className="dim">Selecione um jogador.</div>

  return (
    <div className="player-profile">
      <header className="player-profile-head">
        <h3>{profile.name}</h3>
        <p className="dim">{profile.steamId}</p>
        {compareProfile ? <p className="dim">Comparando com {compareProfile.name}</p> : null}
      </header>

      <div className="player-subtabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="player-grid">
          <article><p className="dim">💀 K/D/A</p><MetricValue value={`${profile.summary.kills}/${profile.summary.deaths}/${profile.summary.assists}`} compareName={compareProfile?.name} compareValue={compareProfile ? `${compareProfile.summary.kills}/${compareProfile.summary.deaths}/${compareProfile.summary.assists}` : ''} /></article>
          <article><p className="dim">🎯 ADR</p><MetricValue value={fmt(profile.summary.adr, 1)} compareName={compareProfile?.name} compareValue={compareProfile ? fmt(compareProfile.summary.adr, 1) : ''} /></article>
          <article><p className="dim">🧠 HS%</p><MetricValue value={`${fmt(profile.summary.headshotPct, 1)}%`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.summary.headshotPct, 1)}%` : ''} /></article>
          <article><p className="dim">⚡ Rating</p><MetricValue value={fmt(profile.summary.rating, 2)} compareName={compareProfile?.name} compareValue={compareProfile ? fmt(compareProfile.summary.rating, 2) : ''} /></article>
          <article><p className="dim">🚀 First Kills</p><MetricValue value={profile.summary.firstKills} compareName={compareProfile?.name} compareValue={compareProfile ? compareProfile.summary.firstKills : ''} /></article>
          <article><p className="dim">☠ First Deaths</p><MetricValue value={profile.summary.firstDeaths} compareName={compareProfile?.name} compareValue={compareProfile ? compareProfile.summary.firstDeaths : ''} /></article>
        </div>
      )}

      {tab === 'aim' && (
        <div className="player-grid">
          <article><p className="dim">🎯 Precisão Geral</p><MetricValue value={`${fmt(profile.aim.overallAccuracy * 100, 1)}%`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.aim.overallAccuracy * 100, 1)}%` : ''} /></article>
          <article><p className="dim">🔸 First Bullet</p><MetricValue value={`${fmt(profile.aim.firstBulletAccuracy * 100, 1)}%`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.aim.firstBulletAccuracy * 100, 1)}%` : ''} /></article>
          <article><p className="dim">🧠 Headshot Rate</p><MetricValue value={`${fmt(profile.aim.headshotRate * 100, 1)}%`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.aim.headshotRate * 100, 1)}%` : ''} /></article>
          <article><p className="dim">⏱ Tempo entre tiros</p><MetricValue value={`${fmt(profile.aim.avgTimeBetweenShots, 2)}s`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.aim.avgTimeBetweenShots, 2)}s` : ''} /></article>
          <article><p className="dim">⚡ Reaction time</p><MetricValue value={`${fmt(profile.aim.avgReactionTime, 2)}s`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.aim.avgReactionTime, 2)}s` : ''} /></article>
        </div>
      )}

      {tab === 'duels' && (
        <div className="table-wrap">
          <table className="score-table">
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Duels</th>
                <th>Won</th>
                <th>Lost</th>
                <th>WinRate</th>
                <th>Damage</th>
              </tr>
            </thead>
            <tbody>
              {profile.duels.map((d) => (
                <tr key={d.opponentSteamId}>
                  <td>{d.opponentName}</td>
                  <td>{d.duelsTotal}</td>
                  <td className="pos">{d.duelsWon}</td>
                  <td className="neg">{d.duelsLost}</td>
                  <td>{fmt(d.winRate, 1)}%</td>
                  <td>{d.damageDealt}/{d.damageTaken}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'utility' && (
        <div className="player-grid">
          <article><p className="dim">Flashes lançadas</p><strong>{profile.utility.flashesThrown}</strong></article>
          <article><p className="dim">Jogadores flashados</p><strong>{profile.utility.playersFlashed}</strong></article>
          <article><p className="dim">Flash assists</p><strong>{profile.utility.flashAssists}</strong></article>
          <article><p className="dim">HE damage</p><strong>{profile.utility.heDamage}</strong></article>
          <article><p className="dim">Molotov damage</p><strong>{profile.utility.molotovDamage}</strong></article>
        </div>
      )}

      {tab === 'movement' && (
        <div className="player-grid">
          <article><p className="dim">Tempo parado</p><strong>{fmt(profile.movement.stationarySeconds, 1)}s</strong></article>
          <article><p className="dim">Tempo em movimento</p><strong>{fmt(profile.movement.movingSeconds, 1)}s</strong></article>
          <article><p className="dim">Heatmap points</p><strong>{profile.heatmap?.length ?? 0}</strong></article>
          <article><p className="dim">Path points</p><strong>{profile.movement.pathData?.length ?? 0}</strong></article>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="player-timeline">
          {profile.timeline.slice(0, 200).map((ev, idx) => (
            <div className="player-timeline-item" key={`${ev.tick}-${idx}`}>
              <span className="dim">[{ev.round}] {ev.tick}</span>
              <span>{ev.type}</span>
              <span className="dim">{ev.weapon ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
