/** Align with RTC token route: Agora channel name UTF-8 byte limit. */
const MAX_CHANNEL_BYTES = 64

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
