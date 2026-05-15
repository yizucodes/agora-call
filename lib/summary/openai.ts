import type { OpenAiServerEnv } from '@/lib/env'
import type {
  MeetingSummary,
  SummaryActionItem,
  SummarySegmentInput,
} from '@/lib/summary/types'

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_TRANSCRIPT_CHARS = 12000

export type NormalizedTranscript = {
  text: string
  lineCount: number
  truncated: boolean
}

export class SummaryGenerationError extends Error {
  status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'SummaryGenerationError'
    this.status = status
  }
}

function compactWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function speakerLabel(segment: SummarySegmentInput): string {
  const explicit = compactWhitespace(segment.speakerLabel ?? '')
  if (explicit !== '') {
    return explicit.slice(0, 80)
  }
  if (
    typeof segment.speakerRtcUid === 'number' &&
    Number.isFinite(segment.speakerRtcUid)
  ) {
    return `Speaker ${segment.speakerRtcUid}`
  }
  return 'Speaker'
}

export function normalizeTranscriptForSummary(
  segments: SummarySegmentInput[]
): NormalizedTranscript {
  const lines: string[] = []
  let totalChars = 0
  let truncated = false

  for (const segment of segments) {
    if (segment.isFinal !== true) {
      continue
    }
    const text = compactWhitespace(segment.text)
    if (text === '') {
      continue
    }

    const line = `${speakerLabel(segment)}: ${text}`
    const nextChars = totalChars + line.length + (lines.length > 0 ? 1 : 0)
    if (nextChars > MAX_TRANSCRIPT_CHARS) {
      truncated = true
      break
    }
    lines.push(line)
    totalChars = nextChars
  }

  return {
    text: lines.join('\n'),
    lineCount: lines.length,
    truncated,
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(compactWhitespace)
    .filter(Boolean)
}

function normalizeActionItems(value: unknown): SummaryActionItem[] {
  if (!Array.isArray(value)) {
    return []
  }

  const out: SummaryActionItem[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const o = item as Record<string, unknown>
    const task = typeof o.task === 'string' ? compactWhitespace(o.task) : ''
    if (task === '') {
      continue
    }

    const actionItem: SummaryActionItem = { task }
    if (typeof o.owner === 'string') {
      const owner = compactWhitespace(o.owner)
      if (owner !== '') {
        actionItem.owner = owner
      }
    }
    if (typeof o.dueDate === 'string') {
      const dueDate = compactWhitespace(o.dueDate)
      if (dueDate !== '') {
        actionItem.dueDate = dueDate
      }
    }
    out.push(actionItem)
  }
  return out
}

function normalizeMeetingSummary(value: unknown): MeetingSummary {
  if (!value || typeof value !== 'object') {
    throw new SummaryGenerationError('OpenAI returned an invalid summary shape')
  }
  const o = value as Record<string, unknown>
  const summary =
    typeof o.summary === 'string' ? compactWhitespace(o.summary) : ''

  return {
    summary: summary || 'No concise summary was generated.',
    keyPoints: asStringArray(o.keyPoints),
    decisions: asStringArray(o.decisions),
    actionItems: normalizeActionItems(o.actionItems),
  }
}

function summaryJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'keyPoints', 'decisions', 'actionItems'],
    properties: {
      summary: { type: 'string' },
      keyPoints: {
        type: 'array',
        items: { type: 'string' },
      },
      decisions: {
        type: 'array',
        items: { type: 'string' },
      },
      actionItems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['task', 'owner', 'dueDate'],
          properties: {
            task: { type: 'string' },
            owner: { type: ['string', 'null'] },
            dueDate: { type: ['string', 'null'] },
          },
        },
      },
    },
  }
}

function openAiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined
  }
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== 'object') {
    return undefined
  }
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (text === '') {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

export async function generateMeetingSummary(
  env: OpenAiServerEnv,
  transcript: NormalizedTranscript
): Promise<MeetingSummary> {
  const res = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'meeting_summary',
          strict: true,
          schema: summaryJsonSchema(),
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You create concise meeting notes from a transcript. Use only the transcript. For any non-empty transcript, write a non-empty one or two sentence summary. Do not invent decisions, action owners, due dates, or action items. Only create action items from explicit commitment language such as "I will", "we need to", "please", "can you", or an assigned task. Do not convert risks, observations, or discussion topics into action items unless someone explicitly commits to doing work. If a section has no explicit evidence, return an empty array for that section. For action item owner or dueDate, return null unless the transcript clearly states it.',
        },
        {
          role: 'user',
          content: `Transcript:\n${transcript.text}`,
        },
      ],
    }),
  })

  const body = await readJson(res)
  if (!res.ok) {
    throw new SummaryGenerationError(
      openAiErrorMessage(body) ?? `OpenAI summary request failed (${res.status})`,
      res.status >= 400 && res.status < 600 ? res.status : 502
    )
  }

  if (!body || typeof body !== 'object') {
    throw new SummaryGenerationError('OpenAI returned an empty response')
  }

  const choices = (body as { choices?: unknown }).choices
  const firstChoice = Array.isArray(choices) ? choices[0] : undefined
  const message =
    firstChoice && typeof firstChoice === 'object'
      ? (firstChoice as { message?: unknown }).message
      : undefined
  const content =
    message && typeof message === 'object'
      ? (message as { content?: unknown }).content
      : undefined

  if (typeof content !== 'string' || content.trim() === '') {
    throw new SummaryGenerationError('OpenAI response did not include summary JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content) as unknown
  } catch {
    throw new SummaryGenerationError('OpenAI summary JSON could not be parsed')
  }

  return normalizeMeetingSummary(parsed)
}
