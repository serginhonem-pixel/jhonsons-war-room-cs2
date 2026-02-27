import React, { useMemo, useState } from 'react'

function fmt(value, digits = 2) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : '0'
}

function fmtMs(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '-'
  return `${Math.round(n)}ms`
}

function clampPct(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function getShotEdgeLabel(row) {
  const p = Number(row?.playerFirstShotAfterContactMs ?? 0)
  const o = Number(row?.opponentFirstShotAfterContactMs ?? 0)
  if (p <= 0 && o <= 0) return '-'
  if (p > 0 && o <= 0) return 'Voce iniciou'
  if (o > 0 && p <= 0) return 'Oponente iniciou'
  if (p === o) return 'Simultaneo'
  if (p < o) return `Voce abriu +${o - p}ms`
  return `Oponente abriu +${p - o}ms`
}

function getTimelineTypeLabel(ev) {
  const type = String(ev?.type ?? ev?.event ?? 'event').toLowerCase()
  if (type === 'kill') return 'kill'
  if (type === 'damage' || type === 'hurt') return 'damage'
  if (type === 'purchase') return 'purchase'
  if (type === 'grenade_throw') return 'utility'
  if (type === 'clutch_attempt') return 'clutch'
  return type || 'event'
}

function getTimelineCategory(ev) {
  const type = String(ev?.type ?? ev?.event ?? '').toLowerCase()
  if (type === 'kill') return 'kills'
  if (type === 'damage' || type === 'hurt') return 'damage'
  if (type === 'grenade_throw') return 'utility'
  if (type === 'purchase') return 'economy'
  return 'other'
}

function getTimelineMain(ev) {
  const type = String(ev?.type ?? ev?.event ?? '').toLowerCase()
  if (type === 'kill') return `${ev?.killer ?? '-'} -> ${ev?.victim ?? '-'}`
  if (type === 'damage' || type === 'hurt') return `${ev?.attacker ?? '-'} -> ${ev?.victim ?? '-'}`
  if (type === 'purchase') return ev?.weapon ? `Comprou ${ev.weapon}` : 'Compra'
  if (type === 'grenade_throw') return ev?.weapon ? `Util: ${ev.weapon}` : 'Uso de util'
  if (type === 'clutch_attempt') return 'Tentativa de clutch'
  return ev?.weapon || '-'
}

function getTimelineExtra(ev) {
  const parts = []
  const dmg = Number(ev?.damage ?? 0)
  if (dmg > 0) parts.push(`Dano ${dmg}`)
  if (ev?.weapon && String(ev?.type ?? '').toLowerCase() !== 'purchase') parts.push(String(ev.weapon))
  if (ev?.headshot) parts.push('HS')
  if (ev?.assister) parts.push(`Assist ${ev.assister}`)
  return parts.join(' | ')
}

function MetricValue({ value, compareName, compareValue }) {
  return (
    <>
      <strong>{value}</strong>
      {compareName ? <small className="dim">vs {compareName}: {compareValue}</small> : null}
    </>
  )
}

function hasInsightsVolume(insights) {
  if (!insights) return false
  const checks = [
    insights?.tradeability?.deathsTotal,
    insights?.clutchProfile?.attempts,
    insights?.postPlantValue?.atk?.rounds,
    insights?.postPlantValue?.def?.rounds,
    insights?.consistencyByHalf?.h1?.rounds,
    insights?.consistencyByHalf?.h2?.rounds,
    insights?.entryScore?.atkKills,
    insights?.entryScore?.defKills,
  ]
  return checks.some((v) => Number(v ?? 0) > 0)
}

export default function PlayerProfile({ profile, compareProfile = null }) {
  const [tab, setTab] = useState('overview')
  const [timelineFilter, setTimelineFilter] = useState('all')
  const [aimRoundFilter, setAimRoundFilter] = useState('all')

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

  const timelineCounts = useMemo(() => {
    const sourceTimeline = Array.isArray(profile?.timeline) ? profile.timeline : []
    const counts = {
      all: sourceTimeline.length,
      kills: 0,
      damage: 0,
      utility: 0,
      economy: 0,
      other: 0,
    }
    for (const ev of sourceTimeline) {
      const cat = getTimelineCategory(ev)
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return counts
  }, [profile])

  const filteredTimeline = useMemo(() => {
    const timeline = Array.isArray(profile?.timeline) ? profile.timeline : []
    if (timelineFilter === 'all') return timeline
    return timeline.filter((ev) => getTimelineCategory(ev) === timelineFilter)
  }, [profile, timelineFilter])

  const aimRows = useMemo(
    () => (Array.isArray(profile?.aimRoundInsights) ? profile.aimRoundInsights : []),
    [profile],
  )

  const aimRowsFiltered = useMemo(() => {
    if (aimRoundFilter === 'all') return aimRows
    const target = Number(aimRoundFilter)
    return aimRows.filter((r) => Number(r.round) === target)
  }, [aimRows, aimRoundFilter])

  const aimSummary = useMemo(() => {
    const rows = aimRowsFiltered
    const playerFirstShotRows = rows.filter((r) => Number(r.playerFirstShotTick) > 0)
    const oppFirstShotRows = rows.filter((r) => Number(r.opponentFirstShotTick) > 0)
    const playerFirstBulletHits = playerFirstShotRows.filter((r) => Boolean(r.playerFirstBulletHit)).length
    const oppFirstBulletHits = oppFirstShotRows.filter((r) => Boolean(r.opponentFirstBulletHit)).length
    const bothFirstShotRows = rows.filter((r) => Number(r.playerFirstShotTick) > 0 && Number(r.opponentFirstShotTick) > 0)
    const playerShotFirst = bothFirstShotRows.filter((r) => Number(r.playerFirstShotTick) < Number(r.opponentFirstShotTick)).length
    const oppShotFirst = bothFirstShotRows.filter((r) => Number(r.opponentFirstShotTick) < Number(r.playerFirstShotTick)).length
    const duelRows = rows.filter((r) => r.firstKillBy === 'player' || r.firstKillBy === 'opponent')
    const firstKillPlayer = duelRows.filter((r) => r.firstKillBy === 'player').length
    const firstKillOpp = duelRows.filter((r) => r.firstKillBy === 'opponent').length
    const playerShots = rows.reduce((acc, r) => acc + Number(r.playerShots ?? 0), 0)
    const playerHits = rows.reduce((acc, r) => acc + Number(r.playerHits ?? 0), 0)
    const oppShots = rows.reduce((acc, r) => acc + Number(r.opponentShots ?? 0), 0)
    const oppHits = rows.reduce((acc, r) => acc + Number(r.opponentHits ?? 0), 0)
    const avgFirstShotAdvMs = bothFirstShotRows.length > 0
      ? Number((bothFirstShotRows.reduce((acc, r) => acc + Number(r.firstShotAdvantageMs ?? 0), 0) / bothFirstShotRows.length).toFixed(0))
      : 0
    return {
      playerShotFirst,
      oppShotFirst,
      firstShotTotal: bothFirstShotRows.length,
      firstShotDelta: playerShotFirst - oppShotFirst,
      firstKillPlayer,
      firstKillOpp,
      duelTotal: duelRows.length,
      duelDelta: firstKillPlayer - firstKillOpp,
      playerFirstBulletPct: playerFirstShotRows.length > 0 ? Number(((playerFirstBulletHits / playerFirstShotRows.length) * 100).toFixed(1)) : 0,
      oppFirstBulletPct: oppFirstShotRows.length > 0 ? Number(((oppFirstBulletHits / oppFirstShotRows.length) * 100).toFixed(1)) : 0,
      firstBulletDeltaPct: Number((((playerFirstShotRows.length > 0 ? (playerFirstBulletHits / playerFirstShotRows.length) * 100 : 0) - (oppFirstShotRows.length > 0 ? (oppFirstBulletHits / oppFirstShotRows.length) * 100 : 0))).toFixed(1)),
      playerFirstBulletHits,
      oppFirstBulletHits,
      playerFirstBulletBase: playerFirstShotRows.length,
      oppFirstBulletBase: oppFirstShotRows.length,
      playerPrecisionPct: playerShots > 0 ? Number(clampPct((playerHits / playerShots) * 100).toFixed(1)) : 0,
      oppPrecisionPct: oppShots > 0 ? Number(clampPct((oppHits / oppShots) * 100).toFixed(1)) : 0,
      precisionDeltaPct: Number((((playerShots > 0 ? (playerHits / playerShots) * 100 : 0) - (oppShots > 0 ? (oppHits / oppShots) * 100 : 0))).toFixed(1)),
      playerShots,
      playerHits,
      oppShots,
      oppHits,
      avgFirstShotAdvMs,
      rounds: rows.length,
    }
  }, [aimRowsFiltered])

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
        <>
          <div className="aim-summary-grid">
            <article><p className="dim">K/D/A</p><MetricValue value={`${profile.summary.kills}/${profile.summary.deaths}/${profile.summary.assists}`} compareName={compareProfile?.name} compareValue={compareProfile ? `${compareProfile.summary.kills}/${compareProfile.summary.deaths}/${compareProfile.summary.assists}` : ''} /></article>
            <article><p className="dim">ADR</p><MetricValue value={fmt(profile.summary.adr, 1)} compareName={compareProfile?.name} compareValue={compareProfile ? fmt(compareProfile.summary.adr, 1) : ''} /></article>
            <article><p className="dim">HS%</p><MetricValue value={`${fmt(profile.summary.headshotPct, 1)}%`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.summary.headshotPct, 1)}%` : ''} /></article>
            <article><p className="dim">Rating</p><MetricValue value={fmt(profile.summary.rating, 2)} compareName={compareProfile?.name} compareValue={compareProfile ? fmt(compareProfile.summary.rating, 2) : ''} /></article>
            <article><p className="dim">First Kills</p><MetricValue value={profile.summary.firstKills} compareName={compareProfile?.name} compareValue={compareProfile ? compareProfile.summary.firstKills : ''} /></article>
            <article><p className="dim">First Deaths</p><MetricValue value={profile.summary.firstDeaths} compareName={compareProfile?.name} compareValue={compareProfile ? compareProfile.summary.firstDeaths : ''} /></article>
          </div>

          <div className="player-insights-grid">
            <article className="player-insight-card" data-tip="Quantidade de first deaths no lado atacante em bombsite (A/B) sem trade da equipe em ate 5 segundos.">
              <p className="dim">Mortes solo de entrada TR</p>
              <strong className="player-insight-value">{profile.insights?.soloEntryTrDeaths ?? 0}</strong>
              <small className="dim">First death no bomb sem trade em 5s</small>
            </article>
            <article className="player-insight-card" data-tip="Saldo de entrada por lado: entry kills menos entry deaths em rounds de ataque e defesa.">
              <p className="dim">Entry Score por lado</p>
              <strong className="player-insight-value">ATK {(profile.insights?.entryScore?.atk ?? 0) >= 0 ? '+' : ''}{profile.insights?.entryScore?.atk ?? 0} | DEF {(profile.insights?.entryScore?.def ?? 0) >= 0 ? '+' : ''}{profile.insights?.entryScore?.def ?? 0}</strong>
              <small className="dim">ATK {profile.insights?.entryScore?.atkKills ?? 0}/{profile.insights?.entryScore?.atkDeaths ?? 0} | DEF {profile.insights?.entryScore?.defKills ?? 0}/{profile.insights?.entryScore?.defDeaths ?? 0}</small>
            </article>
            <article className="player-insight-card" data-tip="Percentual de mortes do jogador que foram tradadas pela equipe e tempo medio ate o trade.">
              <p className="dim">Tradeability</p>
              <strong className="player-insight-value">{fmt(profile.insights?.tradeability?.tradedDeathsPct ?? 0, 1)}%</strong>
              <small className="dim">mortes tradadas | tempo medio {fmt(profile.insights?.tradeability?.avgTradeTimeS ?? 0, 2)}s</small>
            </article>
            <article className="player-insight-card" data-tip="Tentativas de clutch (1vX), vitorias, taxa de conversao e melhor clutch convertido na partida.">
              <p className="dim">Clutch profile</p>
              <strong className="player-insight-value">{profile.insights?.clutchProfile?.wins ?? 0}/{profile.insights?.clutchProfile?.attempts ?? 0}</strong>
              <small className="dim">conv {fmt(profile.insights?.clutchProfile?.conversionPct ?? 0, 1)}% | melhor 1v{profile.insights?.clutchProfile?.best ?? 0}</small>
            </article>
            <article className="player-insight-card" data-tip="Impacto apos plant: kills/deaths e uso de util no ataque e defesa; inclui defuses do jogador.">
              <p className="dim">Post-plant value</p>
              <strong className="player-insight-value">ATK {profile.insights?.postPlantValue?.atk?.kills ?? 0}/{profile.insights?.postPlantValue?.atk?.deaths ?? 0} | DEF {profile.insights?.postPlantValue?.def?.kills ?? 0}/{profile.insights?.postPlantValue?.def?.deaths ?? 0}</strong>
              <small className="dim">util ATK {profile.insights?.postPlantValue?.atk?.utility ?? 0} | DEF {profile.insights?.postPlantValue?.def?.utility ?? 0} | defuses {profile.insights?.postPlantValue?.def?.defuses ?? 0}</small>
            </article>
            <article className="player-insight-card" data-tip="Comparativo entre 1o e 2o half em rating, ADR e HS%, para medir estabilidade de performance.">
              <p className="dim">Consistencia por metade</p>
              <strong className="player-insight-value">1H R{fmt(profile.insights?.consistencyByHalf?.h1?.rating ?? 0, 2)} ADR {fmt(profile.insights?.consistencyByHalf?.h1?.adr ?? 0, 1)} | 2H R{fmt(profile.insights?.consistencyByHalf?.h2?.rating ?? 0, 2)} ADR {fmt(profile.insights?.consistencyByHalf?.h2?.adr ?? 0, 1)}</strong>
              <small className="dim">HS 1H {fmt(profile.insights?.consistencyByHalf?.h1?.hsPct ?? 0, 1)}% | HS 2H {fmt(profile.insights?.consistencyByHalf?.h2?.hsPct ?? 0, 1)}%</small>
            </article>
            <article className="player-insight-card" data-tip="Compara probabilidade estimada de morte por round (modelo heuristico) com a taxa real de mortes do jogador na demo.">
              <p className="dim">Prob. de morte x morte</p>
              <strong className="player-insight-value">Esperado {fmt(profile.insights?.deathRisk?.expectedRatePct ?? 0, 1)}% | Real {fmt(profile.insights?.deathRisk?.actualRatePct ?? 0, 1)}%</strong>
              <small className="dim">mortes risco alto {profile.insights?.deathRisk?.highRiskDeaths ?? 0} ({fmt(profile.insights?.deathRisk?.highRiskDeathPct ?? 0, 1)}%) | indice {fmt(profile.insights?.deathRisk?.riskIndex ?? 0, 2)}</small>
            </article>
          </div>
          {!hasInsightsVolume(profile.insights) && (
            <p className="dim" style={{ marginTop: 10 }}>Sem volume suficiente de eventos para alguns insights avancados nesta demo.</p>
          )}
        </>
      )}

      {tab === 'aim' && (
        <>
          <div className="aim-filter-bar">
            <label className="dim" htmlFor="aim-round-filter">Round</label>
            <select
              id="aim-round-filter"
              className="aim-round-select"
              value={aimRoundFilter}
              onChange={(e) => setAimRoundFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {aimRows.map((r) => (
                <option key={`aim-round-${r.round}`} value={String(r.round)}>
                  Round {r.round}
                </option>
              ))}
            </select>
          </div>

          <div className="player-grid">
            <article title="Conta rounds onde os dois (voce e oponente do duelo) tiveram primeiro tiro detectado na janela do duelo.">
              <p className="dim">Primeiro tiro</p>
              <strong>{profile.name}: {aimSummary.playerShotFirst}/{aimSummary.firstShotTotal}</strong>
              <small className="dim">Oponente: {aimSummary.oppShotFirst}/{aimSummary.firstShotTotal}</small>
              <small className={aimSummary.firstShotDelta > 0 ? 'pos' : aimSummary.firstShotDelta < 0 ? 'neg' : 'dim'}>
                Saldo: {aimSummary.firstShotDelta > 0 ? '+' : ''}{aimSummary.firstShotDelta}
              </small>
            </article>
            <article title="Conta rounds com kill do duelo (voce matou ou morreu para o oponente do duelo). Pode ter base diferente de Primeiro tiro.">
              <p className="dim">Vencedor do duelo</p>
              <strong>{profile.name}: {aimSummary.firstKillPlayer}/{aimSummary.duelTotal}</strong>
              <small className="dim">Oponente: {aimSummary.firstKillOpp}/{aimSummary.duelTotal}</small>
              <small className={aimSummary.duelDelta > 0 ? 'pos' : aimSummary.duelDelta < 0 ? 'neg' : 'dim'}>
                Saldo: {aimSummary.duelDelta > 0 ? '+' : ''}{aimSummary.duelDelta}
              </small>
            </article>
            <article title="Taxa de acerto da primeira bala de cada lado: hits da primeira bala dividido por rounds com primeiro tiro detectado para aquele lado.">
              <p className="dim">Primeira bala (Hit)</p>
              <strong>{profile.name}: {fmt(clampPct(aimSummary.playerFirstBulletPct), 1)}% ({aimSummary.playerFirstBulletHits}/{aimSummary.playerFirstBulletBase})</strong>
              <small className="dim">Oponente: {fmt(clampPct(aimSummary.oppFirstBulletPct), 1)}% ({aimSummary.oppFirstBulletHits}/{aimSummary.oppFirstBulletBase})</small>
              <small className={aimSummary.firstBulletDeltaPct > 0 ? 'pos' : aimSummary.firstBulletDeltaPct < 0 ? 'neg' : 'dim'}>
                Delta: {aimSummary.firstBulletDeltaPct > 0 ? '+' : ''}{fmt(aimSummary.firstBulletDeltaPct, 1)}pp
              </small>
            </article>
            <article title="Precisao no recorte do duelo: total de hits dividido por total de tiros de cada lado.">
              <p className="dim">Precisao</p>
              <strong>{profile.name}: {fmt(clampPct(aimSummary.playerPrecisionPct), 1)}% ({aimSummary.playerHits}/{aimSummary.playerShots})</strong>
              <small className="dim">Oponente: {fmt(clampPct(aimSummary.oppPrecisionPct), 1)}% ({aimSummary.oppHits}/{aimSummary.oppShots})</small>
              <small className={aimSummary.precisionDeltaPct > 0 ? 'pos' : aimSummary.precisionDeltaPct < 0 ? 'neg' : 'dim'}>
                Delta: {aimSummary.precisionDeltaPct > 0 ? '+' : ''}{fmt(aimSummary.precisionDeltaPct, 1)}pp
              </small>
            </article>
            <article><p className="dim">Vantagem media no 1o tiro</p><strong>{fmtMs(aimSummary.avgFirstShotAdvMs)}</strong></article>
            <article><p className="dim">Headshot Rate</p><MetricValue value={`${fmt(profile.aim.headshotRate * 100, 1)}%`} compareName={compareProfile?.name} compareValue={compareProfile ? `${fmt(compareProfile.aim.headshotRate * 100, 1)}%` : ''} /></article>
          </div>

          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="score-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Oponente</th>
                  <th>Primeiro tiro</th>
                  <th>Vantagem</th>
                  <th>Primeira bala</th>
                  <th>Precisao</th>
                  <th>Vencedor do duelo</th>
                </tr>
              </thead>
              <tbody>
                {aimRowsFiltered.map((r) => (
                  <tr key={`aim-row-${r.round}-${r.firstShotTick}`}>
                    <td>{r.round}</td>
                    <td>
                      {r.opponentName ?? '-'}{' '}
                      {r.opponentIsTeammate ? <span className="tk-badge">TK</span> : null}
                    </td>
                    <td>{`${fmtMs(r.playerFirstShotAfterContactMs)} | ${fmtMs(r.opponentFirstShotAfterContactMs)}`}</td>
                    <td>{getShotEdgeLabel(r)}</td>
                    <td>{`${r.playerFirstShotTick > 0 ? (r.playerFirstBulletHit ? 'Hit' : 'Miss') : '-'} | ${r.opponentFirstShotTick > 0 ? (r.opponentFirstBulletHit ? 'Hit' : 'Miss') : '-'}`}</td>
                    <td>{`${fmt(clampPct(r.playerPrecisionPct ?? 0), 1)}% | ${fmt(clampPct(r.opponentPrecisionPct ?? 0), 1)}%`}</td>
                    <td>
                      {r.firstKillBy === 'player' || r.firstKillBy === 'opponent'
                        ? (
                          <>
                            {`${r.duelWinnerName ?? '-'} aos ${fmt(r.firstKillTimeS ?? 0, 2)}s`}
                            {r.firstKillWasTeamKill ? <span className="tk-badge" style={{ marginLeft: 8 }}>TK</span> : null}
                          </>
                        )
                        : '-'}
                    </td>
                  </tr>
                ))}
                {aimRowsFiltered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="dim">Sem dados de aim para o recorte selecionado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
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
          <article><p className="dim">Flashes lancadas</p><strong>{profile.utility.flashesThrown}</strong></article>
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
        <>
          <div className="timeline-filter-bar">
            {[
              { id: 'all', label: `Todos (${timelineCounts.all})` },
              { id: 'kills', label: `Kills (${timelineCounts.kills})` },
              { id: 'damage', label: `Damage (${timelineCounts.damage})` },
              { id: 'utility', label: `Utility (${timelineCounts.utility})` },
              { id: 'economy', label: `Economia (${timelineCounts.economy})` },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`timeline-filter-btn ${timelineFilter === filter.id ? 'active' : ''}`}
                onClick={() => setTimelineFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="player-timeline">
            {filteredTimeline.slice(0, 200).map((ev, idx) => (
              <div className="player-timeline-item" key={`${ev.tick}-${idx}`}>
                <span className="dim timeline-meta">[{ev.round}] {ev.tick}</span>
                <span className="timeline-type">{getTimelineTypeLabel(ev)}</span>
                <span className="timeline-main">{getTimelineMain(ev)}</span>
                <span className="dim timeline-extra">{getTimelineExtra(ev)}</span>
              </div>
            ))}
            {filteredTimeline.length === 0 && <p className="dim">Sem eventos para esse filtro.</p>}
          </div>
        </>
      )}
    </div>
  )
}
