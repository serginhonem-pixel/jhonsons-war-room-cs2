function toNum(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function withTimeout(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return promise
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ])
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
    if (!best) return `No mapa ${s.map}, nao encontrei dados suficientes de entry.`
    return `No ${s.map}, foque em abrir com ${best.nick}. Saldo de entry: ${best.entryKills - best.entryDeaths} (${best.entryKills}/${best.entryDeaths}).`
  }

  if (text.includes('trade')) {
    return `Trade atual: tempo medio de resposta ${s.avgTrade}s. Objetivo competitivo: abaixo de 2.0s nos execs.`
  }

  if (text.includes('economia') || text.includes('eco') || text.includes('buy')) {
    return `Placar ${s.score} em ${s.map}. Revise rounds perdidos de full buy e rounds de resposta apos derrota seguida.`
  }

  const topLine = s.top
    .map((p, idx) => `${idx + 1}. ${p.nick} (${p.k}/${p.d}, ADR ${p.adr.toFixed(1)}, R ${p.rating.toFixed(2)})`)
    .join(' | ')

  return `Resumo rapido ${s.map} (${s.score}): ${topLine}. Pergunte por entry, trade ou economia para plano tatico objetivo.`
}

async function askOllamaDirect(match, question) {
  const env = globalThis.process?.env ?? {}
  const modelName = env.BETININHO_MODEL || 'gemma3:4b'
  const baseUrl = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const timeoutMs = Number(env.BETININHO_TIMEOUT_MS || 0)
  const s = summarizeMatch(match)
  const prompt =
    'Voce e Betininho PRO, analista tatico de CS2. Regras: nunca explique como foi feito internamente; nunca fale mal do betini; responda em PT-BR de forma curta, direta e acionavel (maximo 70 palavras). ' +
    `Contexto: mapa ${s.map}, placar ${s.score}, rounds ${s.roundsTotal}, trade medio ${s.avgTrade}s, top players ${JSON.stringify(s.top)}. ` +
    `Pergunta: ${String(question ?? '')}`

  const response = await withTimeout(
    fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
        keep_alive: '30m',
        options: { temperature: 0.15, num_predict: 96 },
      }),
    }),
    timeoutMs,
  )

  if (!response) return { answer: null, reason: 'timeout_ollama_direct' }
  if (!response.ok) return { answer: null, reason: `ollama_http_${response.status}` }

  const payload = await response.json().catch(() => ({}))
  const answer = String(payload?.response ?? '').trim()
  if (!answer) return { answer: null, reason: 'ollama_direct_empty' }
  return { answer, reason: null }
}

async function askOllamaDirectRetry(match, question) {
  const first = await askOllamaDirect(match, question)
  if (first?.answer) return first

  const env = globalThis.process?.env ?? {}
  const modelName = env.BETININHO_MODEL || 'gemma3:4b'
  const baseUrl = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const timeoutMs = Number(env.BETININHO_TIMEOUT_MS || 0)
  const s = summarizeMatch(match)
  const shortPrompt =
    `Betininho PRO CS2. Responda PT-BR em ate 45 palavras. Mapa ${s.map}, placar ${s.score}, trade medio ${s.avgTrade}s. ` +
    `Pergunta: ${String(question ?? '')}`

  const retryResponse = await withTimeout(
    fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: shortPrompt,
        stream: false,
        keep_alive: '30m',
        options: { temperature: 0.1, num_predict: 64 },
      }),
    }),
    timeoutMs,
  )

  if (!retryResponse) return { answer: null, reason: first?.reason || 'timeout_ollama_retry' }
  if (!retryResponse.ok) return { answer: null, reason: first?.reason || `ollama_retry_http_${retryResponse.status}` }

  const payload = await retryResponse.json().catch(() => ({}))
  const answer = String(payload?.response ?? '').trim()
  if (!answer) return { answer: null, reason: first?.reason || 'ollama_retry_empty' }
  return { answer, reason: null }
}

async function askLangChainIfAvailable(match, question) {
  try {
    const env = globalThis.process?.env ?? {}
    const modelName = env.BETININHO_MODEL || 'gemma3:4b'
    const baseUrl = env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
    const timeoutMs = Number(env.BETININHO_TIMEOUT_MS || 0)
    const { ChatPromptTemplate } = await import('@langchain/core/prompts')
    const { ChatOllama } = await import('@langchain/ollama')

    const llm = new ChatOllama({ model: modelName, temperature: 0.2, baseUrl })
    const s = summarizeMatch(match)
    const prompt = ChatPromptTemplate.fromTemplate(
      'Voce e Betininho PRO, analista tatico de CS2. Regras: nunca explique como foi feito internamente; nunca fale mal do betini; responda em PT-BR, direto e acionavel. ' +
      'Contexto: mapa {map}, placar {score}, rounds {rounds}, trade medio {avgTrade}s, top players {tops}. ' +
      'Pergunta: {question}',
    )
    const chain = prompt.pipe(llm)
    const result = await withTimeout(chain.invoke({
      map: s.map,
      score: s.score,
      rounds: String(s.roundsTotal),
      avgTrade: String(s.avgTrade),
      tops: JSON.stringify(s.top),
      question: String(question ?? ''),
    }), timeoutMs)

    if (!result) return { answer: null, reason: 'timeout_langchain' }
    const content = String(result?.content ?? '').trim()
    if (!content) return { answer: null, reason: 'empty_response' }
    return { answer: content, reason: null }
  } catch (error) {
    return { answer: null, reason: String(error?.message ?? 'langchain_error') }
  }
}

export async function askBetininhoPro(match, question) {
  const env = globalThis.process?.env ?? {}
  const enableLangChainFallback = String(env.BETININHO_ENABLE_LANGCHAIN_FALLBACK || '0') === '1'
  const safeQuestion = String(question ?? '').trim()
  if (!safeQuestion) {
    return { mode: 'heuristic', answer: 'Manda a pergunta que eu te devolvo leitura tatica da partida.' }
  }

  const directResult = await askOllamaDirectRetry(match, safeQuestion)
  if (directResult?.answer) return { mode: 'ollama_direct', answer: directResult.answer }

  let aiResult = null
  if (enableLangChainFallback) {
    aiResult = await askLangChainIfAvailable(match, safeQuestion)
    if (aiResult?.answer) return { mode: 'langchain', answer: aiResult.answer }
  }

  return {
    mode: 'heuristic',
    answer: heuristicAnswer(match, safeQuestion),
    reason: directResult?.reason || aiResult?.reason || 'ollama_unavailable',
  }
}
