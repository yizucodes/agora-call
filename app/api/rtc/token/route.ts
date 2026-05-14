import { NextRequest, NextResponse } from 'next/server'

import { buildRtcPublisherToken } from '@/lib/agora/token'

const MAX_CHANNEL_BYTES = 64
const MAX_UID = 0xffff_ffff

function encodeUtf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

function parseRtcUid(raw: string | null): { ok: true; uid: number } | { ok: false } {
  if (raw === null || raw.trim() === '') {
    return { ok: false }
  }
  const uid = Number(raw)
  if (!Number.isInteger(uid) || uid < 1 || uid > MAX_UID) {
    return { ok: false }
  }
  return { ok: true, uid }
}

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel')?.trim() ?? ''
  if (channel === '') {
    return NextResponse.json(
      { error: 'channel query parameter is required' },
      { status: 400 }
    )
  }
  if (encodeUtf8ByteLength(channel) > MAX_CHANNEL_BYTES) {
    return NextResponse.json(
      { error: 'channel exceeds maximum length (64 bytes UTF-8)' },
      { status: 400 }
    )
  }

  const uidParam = parseRtcUid(req.nextUrl.searchParams.get('uid'))
  if (!uidParam.ok) {
    return NextResponse.json(
      {
        error:
          'uid query parameter is required and must be an integer from 1 to 4294967295',
      },
      { status: 400 }
    )
  }

  try {
    const body = buildRtcPublisherToken(channel, uidParam.uid)
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token generation failed'
    const isConfig = message.includes('Missing AGORA_APP_ID')
    return NextResponse.json(
      { error: isConfig ? 'Server is missing Agora RTC credentials' : message },
      { status: 500 }
    )
  }
}
