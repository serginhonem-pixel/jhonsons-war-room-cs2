import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { parseDemoBuffer } from '../packages/parser/index.js'

const require = createRequire(import.meta.url)
const { parseHeader, parseEvents, parseEvent, parseTicks } = require('@laihoe/demoparser2')

const inputArg = process.argv[2] || 'src/teste.dem'
const outputArg = process.argv[3] || 'public/data/real-match.json'

const inputPath = resolve(inputArg)
const outputPath = resolve(outputArg)

const demoBuffer = readFileSync(inputPath)

const parsed = parseDemoBuffer(
  demoBuffer,
  { parseHeader, parseEvents, parseEvent, parseTicks },
  {
    fileName: inputArg,
    fileLastModified: 0,
    matchId: randomUUID(),
  },
)

writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf8')
console.log(`JSON gerado em: ${outputPath}`)
