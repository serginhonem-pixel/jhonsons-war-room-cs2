import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { parseDemoBuffer } from '../packages/parser/index.js'
import { buildAnalysisReport } from '../packages/analytics/index.js'

const require = createRequire(import.meta.url)
const { parseHeader, parseEvents, parseEvent, parseTicks } = require('@laihoe/demoparser2')

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const body = await readRawBody(req)
    if (!body || body.length === 0) {
      return res.status(400).json({ error: 'Arquivo vazio.' })
    }

    const match = parseDemoBuffer(
      body,
      { parseHeader, parseEvents, parseEvent, parseTicks },
      {
        fileName: decodeURIComponent(String(req.headers['x-file-name'] ?? '')),
        fileLastModified: Number(req.headers['x-file-lastmodified'] ?? 0),
        matchId: randomUUID(),
      },
    )
    const analysis = buildAnalysisReport(match)

    return res.status(200).json({ match, analysis })
  } catch (error) {
    return res.status(400).json({ error: error?.message ?? 'Falha ao processar demo.' })
  }
}
