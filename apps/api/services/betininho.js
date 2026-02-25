function toNum(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function summarizeMatch(match) {
  const rounds = Array.isArray(match?.rounds) ? match.rounds : []
  const players = Array.isArray(match?.players) ? match.players : []
  const scoreCt = toNum(match?.meta?.final_score?.ct, rounds.filter((r) => r.winner === 'team_ct_start').length)
  const scoreTr = toNum(match?.meta?.final_score?.t, rounds.filter((r) => r.winner === 'team_t_start').length)
  const top = [...players]
    .sort((a, b) => toNum(b?.stats?.rating_2) - toNum(a?.stats?.rating_2))
    .slice(0, 3)
    .map((p) => ({
      nick: p?.nick ?? 'Unknown',
      k: toNum(p?.stats?.kills),
      d: toNum(p?.stats?.deaths),
      adr: toNum(p?.stats?.adr),
      rating: toNum(p?.stats?.rating_2),
      entryKills: toNum(p?.stats?.entry_kills),
      entryDeaths: toNum(p?.stats?.entry_deaths),
    }))

  const tradeKills = rounds.flatMap((r) => r.timeline ?? []).filter((e) => e.event === 'kill' && e.trade_delta_s != null)
  const avgTrade = tradeKills.length
    ? tradeKills.reduce((acc, e) => acc + toNum(e.trade_delta_s), 0) / tradeKills.length
    : 0

  return {
    map: match?.meta?.map ?? 'unknown_map',
    roundsTotal: rounds.length,
    score: `${scoreCt} x ${scoreTr}`,
    top,
    avgTrade: Number(avgTrade.toFixed(2)),
  }
}

function heuristicAnswer(match, question) {
  const text = String(question ?? '').toLowerCase()
  const s = summarizeMatch(match)

  if (text.includes('entry') || text.includes('first kill')) {
    const best = [...s.top].sort((a, b) => (b.entryKills - b.entryDeaths) - (a.entryKills - a.entryDeaths))[0]
    if (!best) return `No mapa ${s.map}, não encontrei dados suficientes de entry.`
    return `No ${s.map}, foque em abrir com ${best.nick}. Entry saldo dele: ${best.entryKills - best.entryDeaths} (${best.entryKills}/${best.entryDeaths}).`
  }

  if (text.includes('trade')) {
    return `Trade efficiency atual: tempo médio de resposta ${s.avgTrade}s. Objetivo competitivo: abaixo de 2.0s nos execs.`
  }

  if (text.includes('economia') || text.includes('eco') || text.includes('buy')) {
    return `Placar ${s.score} em ${s.map}. Recomendação: revisar rounds perdidos de full buy e rounds de resposta após perda consecutiva.`
  }

  const topLine = s.top
    .map((p, idx) => `${idx + 1}. ${p.nick} (${p.k}/${p.d}, ADR ${p.adr.toFixed(1)}, R ${p.rating.toFixed(2)})`)
    .join(' | ')

  return `Resumo rápido ${s.map} (${s.score}): ${topLine}. Pergunte por entry, trade ou economia para plano tático mais específico.`
}

async function askLangChainIfAvailable(match, question) {
  try {
    const env = globalThis.process?.env ?? {}
    const modelName = env.BETININHO_MODEL || 'llama3.1:8b'
    const baseUrl = env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    const { ChatPromptTemplate } = await import('@langchain/core/prompts')
    const { ChatOllama } = await import('@langchain/ollama')

    const llm = new ChatOllama({ model: modelName, temperature: 0.2, baseUrl })
    const s = summarizeMatch(match)
    const prompt = ChatPromptTemplate.fromTemplate(
      'Você é Betininho PRO, analista tático de CS2. Responda em PT-BR, direto e acionável. ' +
      'Contexto: mapa {map}, placar {score}, rounds {rounds}, trade médio {avgTrade}s, top players {tops}. ' +
      'Pergunta: {question}',
    )
    const chain = prompt.pipe(llm)
    const result = await chain.invoke({
      map: s.map,
      score: s.score,
      rounds: String(s.roundsTotal),
      avgTrade: String(s.avgTrade),
      tops: JSON.stringify(s.top),
      question: String(question ?? ''),
    })
    const content = String(result?.content ?? '').trim()
    return content || null
  } catch {
    return null
  }
}

export async function askBetininhoPro(match, question) {
  const safeQuestion = String(question ?? '').trim()
  if (!safeQuestion) {
    return { mode: 'heuristic', answer: 'Manda a pergunta que eu te devolvo leitura tática da partida.' }
  }

  const aiAnswer = await askLangChainIfAvailable(match, safeQuestion)
  if (aiAnswer) return { mode: 'langchain', answer: aiAnswer }
  return { mode: 'heuristic', answer: heuristicAnswer(match, safeQuestion) }
}

