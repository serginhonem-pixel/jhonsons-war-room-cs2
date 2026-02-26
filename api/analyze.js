import { buildAnalysisReport } from '../packages/analytics/index.js'
import { matchSchema } from '../packages/shared-types/matchSchema.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const parsed = matchSchema.safeParse(payload)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Payload de partida invalido.', details: parsed.error.flatten() })
    }
    const report = buildAnalysisReport(parsed.data)
    return res.status(200).json(report)
  } catch {
    return res.status(400).json({ error: 'Payload JSON invalido.' })
  }
}
