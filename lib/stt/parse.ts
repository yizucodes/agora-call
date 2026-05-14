/**
 * Agora Real-Time STT stream-message parsing (Checkpoint 6).
 * Protobuf layout matches official {@link https://docs.agora.io/en/real-time-stt/develop/parse-data SttMessage.proto}.
 * JSON fallback matches the "Transcribe" JSON example in the same doc.
 *
 * Implemented without new dependencies (wire-format decoder for `Text` + `Word` only).
 */

const utf8 = new TextDecoder('utf-8', { fatal: false })

const WIRE_VARINT = 0
const WIRE_64BIT = 1
const WIRE_LEN = 2
const WIRE_32BIT = 5

export type TranscriptSegment = {
  id: string
  speakerRtcUid: number
  speakerLabel: string
  text: string
  isFinal: boolean
  timestamp: number
}

/** One decoded line from a single stream-message payload (before UI merge rules). */
export type SttParsedUtterance = {
  speakerRtcUid: number
  text: string
  isFinal: boolean
  sentenceId?: number
  serverTimeMs?: number
}

/** Varint decode; Agora uids/timestamps fit Number for this demo. */
function readVarint(bytes: Uint8Array, pos: number): [number, number] {
  let result = 0
  let shift = 0
  let p = pos
  for (let i = 0; i < 12 && p < bytes.length; i += 1) {
    const b = bytes[p]!
    p += 1
    const digit = b & 0x7f
    result += digit * 2 ** shift
    if ((b & 0x80) === 0) {
      return [result, p]
    }
    shift += 7
    if (shift > 52) {
      throw new Error('stt: varint overflow')
    }
  }
  throw new Error('stt: truncated or oversized varint')
}

function skipValue(bytes: Uint8Array, pos: number, wire: number): number {
  if (wire === WIRE_VARINT) {
    return readVarint(bytes, pos)[1]
  }
  if (wire === WIRE_64BIT) {
    return pos + 8
  }
  if (wire === WIRE_32BIT) {
    return pos + 4
  }
  if (wire === WIRE_LEN) {
    const [len, p] = readVarint(bytes, pos)
    return p + len
  }
  throw new Error(`stt: unsupported protobuf wire type ${wire}`)
}

function readStringField(bytes: Uint8Array, pos: number): [string, number] {
  const [len, p] = readVarint(bytes, pos)
  const end = p + len
  const s = utf8.decode(bytes.subarray(p, end))
  return [s, end]
}

export type WordPiece = { text: string; isFinal: boolean }

/** Decodes one `Word` sub-message (field 10 / nested). */
export function decodeSttWordMessage(buf: Uint8Array): WordPiece {
  let text = ''
  let isFinal = false
  let pos = 0
  while (pos < buf.length) {
    const tag = readVarint(buf, pos)
    const fieldNum = tag[0] >>> 3
    const wire = tag[0] & 7
    pos = tag[1]
    if (fieldNum === 1 && wire === WIRE_LEN) {
      const r = readStringField(buf, pos)
      text = r[0]
      pos = r[1]
    } else if (fieldNum === 4 && wire === WIRE_VARINT) {
      const v = readVarint(buf, pos)
      isFinal = v[0] !== 0
      pos = v[1]
    } else {
      pos = skipValue(buf, pos, wire)
    }
  }
  return { text, isFinal }
}

function decodeOriginalTranscript(buf: Uint8Array): WordPiece[] {
  const out: WordPiece[] = []
  let pos = 0
  while (pos < buf.length) {
    const tag = readVarint(buf, pos)
    const fieldNum = tag[0] >>> 3
    const wire = tag[0] & 7
    pos = tag[1]
    if (fieldNum === 2 && wire === WIRE_LEN) {
      const [len, p] = readVarint(buf, pos)
      const end = p + len
      out.push(decodeSttWordMessage(buf.subarray(p, end)))
      pos = end
    } else {
      pos = skipValue(buf, pos, wire)
    }
  }
  return out
}

function mergeWordPieces(pieces: WordPiece[]): { text: string; isFinal: boolean } {
  if (pieces.length === 0) {
    return { text: '', isFinal: false }
  }
  const text = pieces.map((w) => w.text).join(pieces.length > 1 ? ' ' : '')
  const isFinal = pieces.every((w) => w.isFinal)
  return { text, isFinal }
}

/**
 * Decodes top-level `Text` protobuf (Agora.SpeechToText.Text).
 */
export function decodeSttTextProtobuf(payload: Uint8Array): SttParsedUtterance | null {
  let uid = 0
  let timeMs = 0
  let sentenceId: number | undefined
  const wordPieces: WordPiece[] = []
  let originalPieces: WordPiece[] = []
  let dataType = ''

  let pos = 0
  try {
    while (pos < payload.length) {
      const t = readVarint(payload, pos)
      const fieldNum = t[0] >>> 3
      const wire = t[0] & 7
      pos = t[1]

      if (wire === WIRE_LEN) {
        const [len, p0] = readVarint(payload, pos)
        const end = p0 + len
        const chunk = payload.subarray(p0, end)
        pos = end
        if (fieldNum === 10) {
          wordPieces.push(decodeSttWordMessage(chunk))
        } else if (fieldNum === 13) {
          /* `string data_type` — chunk is raw UTF-8 payload (not a nested length prefix). */
          dataType = utf8.decode(chunk)
        } else if (fieldNum === 14 || fieldNum === 15) {
          /* translation / culture — skip chunk */
        } else if (fieldNum === 18) {
          originalPieces = decodeOriginalTranscript(chunk)
        } else {
          /* unknown length-delimited */
        }
      } else if (wire === WIRE_VARINT) {
        const v = readVarint(payload, pos)
        pos = v[1]
        if (fieldNum === 4) {
          uid = v[0]
        } else if (fieldNum === 6) {
          timeMs = v[0]
        } else if (fieldNum === 16) {
          /* text_ts */
        } else if (fieldNum === 19) {
          sentenceId = v[0]
        }
      } else {
        pos = skipValue(payload, pos, wire)
      }
    }
  } catch {
    return null
  }

  const pieces =
    dataType === 'translate' && originalPieces.length > 0
      ? originalPieces
      : wordPieces.length > 0
        ? wordPieces
        : originalPieces
  const merged = mergeWordPieces(pieces)
  if (!merged.text.trim()) {
    return null
  }

  const serverTimeMs =
    timeMs > 0 && timeMs <= Number.MAX_SAFE_INTEGER ? timeMs : undefined

  return {
    speakerRtcUid: uid,
    text: merged.text.trim(),
    isFinal: merged.isFinal,
    sentenceId,
    serverTimeMs,
  }
}

function tryParseJsonTranscript(payload: Uint8Array): SttParsedUtterance | null {
  const s = utf8.decode(payload).trim()
  if (!s.startsWith('{')) {
    return null
  }
  try {
    const root = JSON.parse(s) as Record<string, unknown>
    const tr = root.transcript
    const t =
      tr && typeof tr === 'object' ? (tr as Record<string, unknown>) : root
    const uidRaw = t.uid
    const uid =
      typeof uidRaw === 'number'
        ? uidRaw
        : typeof uidRaw === 'string'
          ? Number(uidRaw)
          : NaN

    const words = t.words
    const wordText =
      Array.isArray(words)
        ? words
            .map((w) =>
              w && typeof w === 'object' && typeof (w as { text?: unknown }).text === 'string'
                ? (w as { text: string }).text
                : ''
            )
            .join('')
        : ''
    const text = typeof t.text === 'string' ? t.text : wordText

    const isFinalRaw = t.isFinal ?? t.is_final
    const isFinal =
      typeof isFinalRaw === 'boolean'
        ? isFinalRaw
        : Array.isArray(words) && words.length > 0
          ? words.every((w) => {
              if (!w || typeof w !== 'object') return false
              const v = (w as { isFinal?: unknown; is_final?: unknown }).isFinal ??
                (w as { isFinal?: unknown; is_final?: unknown }).is_final
              return v === true
            })
          : false

    const offset = t.offset
    const serverTimeMs =
      typeof offset === 'number' && Number.isFinite(offset) ? offset : undefined
    if (!Number.isFinite(uid) || !text.trim()) {
      return null
    }
    return {
      speakerRtcUid: uid,
      text: text.trim(),
      isFinal,
      serverTimeMs,
    }
  } catch {
    return null
  }
}

let segmentCounter = 0
function nextSegmentId(): string {
  segmentCounter += 1
  return `seg_${Date.now()}_${segmentCounter}`
}

/** Maps a parsed utterance into a UI segment row. */
export function utteranceToSegment(u: SttParsedUtterance): TranscriptSegment {
  const ts = u.serverTimeMs ?? Date.now()
  return {
    id: nextSegmentId(),
    speakerRtcUid: u.speakerRtcUid,
    speakerLabel: `Speaker ${u.speakerRtcUid}`,
    text: u.text,
    isFinal: u.isFinal,
    timestamp: ts,
  }
}

/**
 * Parses one `stream-message` payload from the STT publisher bot.
 * Tries JSON first, then protobuf `Text`.
 */
export function parseSttStreamPayload(payload: Uint8Array): SttParsedUtterance | null {
  const json = tryParseJsonTranscript(payload)
  if (json) {
    return json
  }
  return decodeSttTextProtobuf(payload)
}
