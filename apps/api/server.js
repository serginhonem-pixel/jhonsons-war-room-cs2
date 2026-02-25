import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { parseDemoBuffer } from '../../packages/parser/index.js'
import { buildAnalysisReport } from '../../packages/analytics/index.js'
import { matchSchema } from '../../packages/shared-types/matchSchema.js'
import { askBetininhoPro } from './services/betininho.js'

const require = createRequire(import.meta.url)
const { parseHeader, parseEvents, parseEvent, parseTicks } = require('@laihoe/demoparser2')

const app = express()
const port = Number(process.env.API_PORT || 3001)

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'cs2-war-room-api', now: new Date().toISOString() })
})

app.post('/api/parse', express.raw({ type: 'application/octet-stream', limit: '500mb' }), (req, res) => {
  try {
    if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
      return res.status(400).json({ error: 'Arquivo vazio.' })
    }

    const parsed = parseDemoBuffer(
      req.body,
      { parseHeader, parseEvents, parseEvent, parseTicks },
      {
        fileName: decodeURIComponent(String(req.headers['x-file-name'] ?? '')),
        fileLastModified: Number(req.headers['x-file-lastmodified'] ?? 0),
        matchId: randomUUID(),
      },
    )

    return res.json(parsed)
  } catch (error) {
    return res.status(400).json({ error: error?.message ?? 'Falha ao processar demo.' })
  }
})

app.post('/api/analyze', (req, res) => {
  const parsed = matchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload de partida invalido.', details: parsed.error.flatten() })
  }

  const report = buildAnalysisReport(parsed.data)
  return res.json(report)
})

app.post('/api/betininho-pro', async (req, res) => {
  const parsed = matchSchema.safeParse(req.body?.match)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Payload de partida invalido para Betininho PRO.' })
  }

  const question = String(req.body?.question ?? '').trim()
  if (!question) {
    return res.status(400).json({ error: 'Pergunta vazia.' })
  }

  try {
    const result = await askBetininhoPro(parsed.data, question)
    return res.json(result)
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? 'Falha no Betininho PRO.' })
  }
})

app.listen(port, () => {
  console.log(`API pronta em http://localhost:${port}`)
})
