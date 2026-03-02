import { parseDemoBuffer } from '../../packages/parser/index.js'
import { buildAnalysisReport } from '../../packages/analytics/index.js'
import initDemoParserWasm, {
  parseHeader as wasmParseHeader,
  parseEvents as wasmParseEvents,
  parseEvent as wasmParseEvent,
  parseTicks as wasmParseTicks,
} from '@laihoe/demoparser2/wasm/pkg/demoparser2.js'
import demoParserWasmUrl from '@laihoe/demoparser2/wasm/pkg/demoparser2_bg.wasm?url'

let wasmInitPromise = null

function postProgress(percent, stage) {
  self.postMessage({ type: 'progress', percent, stage })
}

function toUint8(bufferLike) {
  if (bufferLike instanceof Uint8Array) return bufferLike
  if (bufferLike instanceof ArrayBuffer) return new Uint8Array(bufferLike)
  if (ArrayBuffer.isView(bufferLike)) {
    return new Uint8Array(bufferLike.buffer, bufferLike.byteOffset, bufferLike.byteLength)
  }
  throw new Error('Formato de buffer invalido para parse local.')
}

async function ensureWasmLoaded() {
  if (!wasmInitPromise) wasmInitPromise = initDemoParserWasm(demoParserWasmUrl)
  await wasmInitPromise
}

async function decompressWithStream(format, inputBytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error(`Browser nao suporta descompressao local de .${format}.`)
  }
  const stream = new Blob([inputBytes]).stream().pipeThrough(new DecompressionStream(format))
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

async function maybeDecompress(inputBytes, fileName) {
  const lower = String(fileName ?? '').toLowerCase()
  if (lower.endsWith('.gz')) {
    return decompressWithStream('gzip', inputBytes)
  }
  if (lower.endsWith('.bz2') || lower.endsWith('.dem.bz2')) {
    try {
      return await decompressWithStream('bzip2', inputBytes)
    } catch {
      try {
        return await decompressWithStream('x-bzip2', inputBytes)
      } catch {
        throw new Error('Descompactacao .dem.bz2 indisponivel neste browser. Use arquivo .dem descompactado.')
      }
    }
  }
  return inputBytes
}

async function readInputBytes(payload) {
  if (payload?.buffer) return toUint8(payload.buffer)
  if (payload?.file && typeof payload.file.arrayBuffer === 'function') {
    const ab = await payload.file.arrayBuffer()
    return new Uint8Array(ab)
  }
  throw new Error('Nenhum arquivo/buffer recebido pelo worker.')
}

self.onmessage = async (event) => {
  const payload = event?.data ?? {}
  if (payload.type !== 'parse') return

  try {
    postProgress(2, 'Inicializando parser WASM...')
    await ensureWasmLoaded()

    postProgress(10, 'Lendo arquivo local...')
    const sourceBytes = await readInputBytes(payload)

    postProgress(22, 'Validando formato do arquivo...')
    const demoBytes = await maybeDecompress(sourceBytes, payload.fileName)

    const parseFns = {
      parseHeader: (buffer) => wasmParseHeader(toUint8(buffer)),
      parseEvents: (buffer, eventNames, wantedPlayerProps, wantedOtherProps) =>
        wasmParseEvents(toUint8(buffer), eventNames, wantedPlayerProps, wantedOtherProps),
      parseEvent: (buffer, eventName, wantedPlayerProps, wantedOtherProps) =>
        wasmParseEvent(toUint8(buffer), eventName, wantedPlayerProps, wantedOtherProps),
      parseTicks: (buffer, wantedProps, wantedTicks, _wantedPlayers, structOfArrays) =>
        wasmParseTicks(toUint8(buffer), wantedProps, wantedTicks, Boolean(structOfArrays)),
    }

    postProgress(45, 'Extraindo eventos da demo...')
    const match = parseDemoBuffer(
      demoBytes,
      parseFns,
      {
        fileName: payload.fileName,
        fileLastModified: Number(payload.fileLastModified ?? 0),
        matchId: typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
    )

    postProgress(86, 'Gerando analise final...')
    const analysis = buildAnalysisReport(match)

    postProgress(100, 'Concluido')
    self.postMessage({ type: 'result', data: match, analysis })
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error?.message ?? error ?? 'Falha no parse local.') })
  }
}
