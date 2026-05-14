/**
 * Checkpoint 5: raw Agora Real-Time STT stream-message inspection.
 * Logs shape only; no protobuf/JSON parsing here.
 */

const FIRST_BYTES_HEX_CAP = 64

/** Base64-encodes large payloads in chunks to avoid call-stack limits on huge arrays. */
function uint8ToBase64Chunked(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    return ''
  }
  const chunk = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length))
    parts.push(String.fromCharCode.apply(null, sub as unknown as number[]))
  }
  return btoa(parts.join(''))
}

/** Hex string of the first `maxBytes` bytes (for compact inspection in logs). */
function firstBytesHex(bytes: Uint8Array, maxBytes: number): string {
  const n = Math.min(maxBytes, bytes.byteLength)
  let out = ''
  for (let i = 0; i < n; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0')
  }
  return out
}

/** Serializable snapshot of a stream-message payload for logging or scratch notes. */
export type SttStreamMessageDebugLog = {
  uid: number
  length: number
  firstBytesHex: string
  base64: string
}

/**
 * Builds a debug row for one `stream-message` payload: length, leading bytes as hex, full base64.
 */
export function buildSttStreamMessageDebugLog(
  uid: number,
  payload: Uint8Array
): SttStreamMessageDebugLog {
  return {
    uid,
    length: payload.byteLength,
    firstBytesHex: firstBytesHex(payload, FIRST_BYTES_HEX_CAP),
    base64: uint8ToBase64Chunked(payload),
  }
}

/** Logs {@link buildSttStreamMessageDebugLog} to the console; use `base64` / `firstBytesHex` when designing the parser (CP6). */
export function logSttStreamMessageToConsole(uid: number, payload: Uint8Array): void {
  const row = buildSttStreamMessageDebugLog(uid, payload)
  console.info('[stt stream-message]', row)
}

/**
 * Coerces RTC stream-message UIDs to a number (Agora may deliver string or number).
 * Returns `NaN` if the value cannot be parsed as a finite number.
 */
export function normalizeRtcStreamUid(uid: string | number): number {
  if (typeof uid === 'number' && Number.isFinite(uid)) {
    return uid
  }
  if (typeof uid === 'string') {
    const n = Number(uid)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}
