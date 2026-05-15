import { NextResponse } from 'next/server'

import { requireOpenAiServerEnv } from '@/lib/env'
import {
  generateMeetingSummary,
  normalizeTranscriptForSummary,
  SummaryGenerationError,
} from '@/lib/summary/openai'
import {
  EMPTY_MEETING_SUMMARY,
  type SummarySegmentInput,
} from '@/lib/summary/types'

const MAX_RTC_UID = 0xffff_ffff

type ParseSegmentsResult =
  | { ok: true; segments: SummarySegmentInput[] }
  | { ok: false; error: string }

function parseOptionalUid(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_RTC_UID
  ) {
    return value
  }
  return undefined
}

function parseSummarySegments(body: unknown): ParseSegmentsResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'JSON body must be an object' }
  }

  const segments = (body as { segments?: unknown }).segments
  if (!Array.isArray(segments)) {
    return { ok: false, error: 'segments must be an array' }
  }

  const parsed: SummarySegmentInput[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const item = segments[i]
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `segments[${i}] must be an object` }
    }
    const o = item as Record<string, unknown>
    if (typeof o.text !== 'string') {
      return { ok: false, error: `segments[${i}].text must be a string` }
    }
    if (typeof o.isFinal !== 'boolean') {
      return { ok: false, error: `segments[${i}].isFinal must be a boolean` }
    }

    const segment: SummarySegmentInput = {
      text: o.text,
      isFinal: o.isFinal,
    }

    const uid = parseOptionalUid(o.speakerRtcUid)
    if (uid !== undefined) {
      segment.speakerRtcUid = uid
    }
    if (typeof o.speakerLabel === 'string') {
      segment.speakerLabel = o.speakerLabel
    }
    if (typeof o.timestamp === 'number' && Number.isFinite(o.timestamp)) {
      segment.timestamp = o.timestamp
    }
    parsed.push(segment)
  }

  return { ok: true, segments: parsed }
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseSummarySegments(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const transcript = normalizeTranscriptForSummary(parsed.segments)
  if (transcript.lineCount === 0) {
    return NextResponse.json(EMPTY_MEETING_SUMMARY)
  }

  let env
  try {
    env = requireOpenAiServerEnv()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  try {
    const summary = await generateMeetingSummary(env, transcript)
    return NextResponse.json(summary)
  } catch (err) {
    if (err instanceof SummaryGenerationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    const message =
      err instanceof Error ? err.message : 'Summary generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
