/** Align with RTC token route: Agora channel name UTF-8 byte limit. */
const MAX_CHANNEL_BYTES = 64

/** Agora v7 `subscribeAudioUids` max array length. */
const MAX_SUBSCRIBE_RTC_UIDS = 32

const MAX_RTC_UID = 0xffff_ffff

function encodeUtf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/**
 * Validates `body.channel` for STT start/stop JSON bodies: non-empty trim, UTF-8 length ≤ 64 bytes.
 */
export function parseSttChannelFromBody(
  body: unknown
): { ok: true; channel: string } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') {
    return { ok: false, error: 'JSON body is required' }
  }
  const raw = (body as { channel?: unknown }).channel
  if (typeof raw !== 'string') {
    return { ok: false, error: 'channel must be a string' }
  }
  const channel = raw.trim()
  if (channel === '') {
    return { ok: false, error: 'channel must not be empty' }
  }
  if (encodeUtf8ByteLength(channel) > MAX_CHANNEL_BYTES) {
    return {
      ok: false,
      error: 'channel exceeds maximum length (64 bytes UTF-8)',
    }
  }
  return { ok: true, channel }
}

/**
 * Optional `subscribeRtcUids` on STT start: which channel UIDs to transcribe (digit strings server-side).
 * Omitted or empty → do not send `subscribeAudioUids` (Agora default). v7 rejects `["all"]`.
 */
export function parseSubscribeRtcUidsFromBody(
  body: unknown
): { ok: true; uids: number[] } | { ok: false; error: string } {
  if (body === null || typeof body !== 'object') {
    return { ok: true, uids: [] }
  }
  const raw = (body as { subscribeRtcUids?: unknown }).subscribeRtcUids
  if (raw === undefined) {
    return { ok: true, uids: [] }
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'subscribeRtcUids must be an array of integers' }
  }
  if (raw.length > MAX_SUBSCRIBE_RTC_UIDS) {
    return {
      ok: false,
      error: `subscribeRtcUids exceeds maximum length (${MAX_SUBSCRIBE_RTC_UIDS})`,
    }
  }
  const seen = new Set<number>()
  for (const item of raw) {
    const n =
      typeof item === 'number'
        ? item
        : typeof item === 'string'
          ? Number(item)
          : NaN
    if (!Number.isInteger(n) || n < 1 || n > MAX_RTC_UID) {
      return {
        ok: false,
        error:
          'subscribeRtcUids entries must be integers in [1, 4294967295]',
      }
    }
    seen.add(n)
  }
  return { ok: true, uids: [...seen] }
}
