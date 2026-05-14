import type { SttServerEnv } from '@/lib/env'

import { buildRtcPublisherToken } from '@/lib/agora/token'

/**
 * Agora Real-Time STT REST **v7.x** (`join` / `get` / `leave` / `list`).
 * Uses customer key/secret Basic auth; RTC app id/certificate for bot tokens.
 * @see https://docs.agora.io/en/real-time-stt/reference/migration-guide-6-to-7
 */

const STT_V7_PREFIX = '/api/speech-to-text/v1/projects'

/**
 * Base URL for STT REST calls from `AGORA_STT_REGION`.
 * Supports `global` / `default`, a region segment (e.g. `ap-southeast-1` → `https://api-ap-southeast-1.agora.io`),
 * or a full `https://…` host if your account requires a custom endpoint.
 */
export function sttRestBaseUrl(region: string): string {
  const r = region.trim()
  if (r === '') {
    return 'https://api.agora.io'
  }
  const lower = r.toLowerCase()
  if (lower === 'global' || lower === 'default') {
    return 'https://api.agora.io'
  }
  if (/^https:\/\//i.test(r)) {
    return r.replace(/\/+$/, '')
  }
  return `https://api-${r}.agora.io`
}

/** Builds `Authorization: Basic …` for Agora REST customer credentials. */
function basicAuthHeader(customerKey: string, customerSecret: string): string {
  const token = Buffer.from(`${customerKey}:${customerSecret}`, 'utf8').toString(
    'base64'
  )
  return `Basic ${token}`
}

/** Parses response body as JSON when possible; otherwise returns `{ raw: text }`. */
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

/** Best-effort error string from Agora JSON (v6 `message`, v7 `reason` / `detail`). */
function messageFromAgoraJson(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined
  }
  const o = body as Record<string, unknown>
  if (typeof o.message === 'string') {
    return o.message
  }
  const reason = typeof o.reason === 'string' ? o.reason : ''
  const detail = typeof o.detail === 'string' ? o.detail : ''
  if (reason !== '' || detail !== '') {
    return [reason, detail].filter(Boolean).join(': ')
  }
  if (typeof o.detail === 'string') {
    return o.detail
  }
  return undefined
}

function sttV7ProjectBase(env: SttServerEnv): string {
  const base = sttRestBaseUrl(env.AGORA_STT_REGION)
  return `${base}${STT_V7_PREFIX}/${encodeURIComponent(env.AGORA_APP_ID)}`
}

/** Outcome of starting an STT agent (`join`). Exposes Agora `agent_id` as `taskId` for route compatibility. */
export type JoinSttAgentResult =
  | {
      ok: true
      taskId: string
      createTs: number
      status: string
    }
  | { ok: false; status: number; message: string }

/**
 * Starts Real-Time STT for `channelName` via v7 `join`.
 * v7 expects `subBotUid` and `pubBotUid` to be the same; one RTC user subscribes and publishes captions.
 */
export async function joinSttAgent(
  env: SttServerEnv,
  params: {
    name: string
    channelName: string
    botUid: number
    /** v7: each entry must be a numeric RTC UID string; do not use `"all"`. */
    subscribeRtcUids?: number[]
  }
): Promise<JoinSttAgentResult> {
  const tok = buildRtcPublisherToken(params.channelName, params.botUid)
  const uidStr = String(params.botUid)

  const rtcConfig: Record<string, unknown> = {
    channelName: params.channelName,
    subBotUid: uidStr,
    subBotToken: tok.token,
    pubBotUid: uidStr,
    pubBotToken: tok.token,
  }
  if (
    params.subscribeRtcUids !== undefined &&
    params.subscribeRtcUids.length > 0
  ) {
    rtcConfig.subscribeAudioUids = params.subscribeRtcUids.map(String)
  }

  const url = `${sttV7ProjectBase(env)}/join`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(
        env.AGORA_CUSTOMER_KEY,
        env.AGORA_CUSTOMER_SECRET
      ),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      languages: ['en-US'],
      maxIdleTime: 3600,
      rtcConfig,
    }),
  })

  const body = await readJson(res)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        messageFromAgoraJson(body) ?? `Join STT agent failed (${res.status})`,
    }
  }
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected join STT response shape',
    }
  }
  const b = body as { agent_id?: unknown; create_ts?: unknown; status?: unknown }
  if (typeof b.agent_id !== 'string') {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected join STT response: missing agent_id',
    }
  }
  const createTs =
    typeof b.create_ts === 'number' && Number.isFinite(b.create_ts)
      ? b.create_ts
      : 0
  const status = typeof b.status === 'string' ? b.status : 'UNKNOWN'
  return {
    ok: true,
    taskId: b.agent_id,
    createTs,
    status,
  }
}

/** Current agent status from v7 `get`. */
export type GetSttAgentResult =
  | { ok: true; taskId: string; createTs: number; status: string }
  | { ok: false; status: number; message: string }

export async function getSttAgent(
  env: SttServerEnv,
  agentId: string
): Promise<GetSttAgentResult> {
  const url = `${sttV7ProjectBase(env)}/agents/${encodeURIComponent(agentId)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(
        env.AGORA_CUSTOMER_KEY,
        env.AGORA_CUSTOMER_SECRET
      ),
    },
  })
  const body = await readJson(res)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        messageFromAgoraJson(body) ?? `Get STT agent failed (${res.status})`,
    }
  }
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected get STT agent response shape',
    }
  }
  const b = body as {
    agent_id?: unknown
    create_ts?: unknown
    status?: unknown
  }
  const tid = typeof b.agent_id === 'string' ? b.agent_id : agentId
  if (tid === '') {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected get STT agent response: missing agent_id',
    }
  }
  const createTs =
    typeof b.create_ts === 'number' && Number.isFinite(b.create_ts)
      ? b.create_ts
      : 0
  const status = typeof b.status === 'string' ? b.status : 'UNKNOWN'
  return {
    ok: true,
    taskId: tid,
    createTs,
    status,
  }
}

export type LeaveSttAgentResult =
  | { ok: true }
  | { ok: false; status: number; message: string }

export type ListSttAgentsResult =
  | { ok: true; agentIds: string[] }
  | { ok: false; status: number; message: string }

/**
 * Lists RUNNING STT agents for a channel (v7 `list`, GET `…/agents?channel=&state=2`).
 * Used when this server lost in-memory state but Agora may still have an agent.
 */
export async function listRunningSttAgentIdsForChannel(
  env: SttServerEnv,
  channelName: string
): Promise<ListSttAgentsResult> {
  const qs = new URLSearchParams({
    channel: channelName,
    state: '2',
  })
  const url = `${sttV7ProjectBase(env)}/agents?${qs}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(
        env.AGORA_CUSTOMER_KEY,
        env.AGORA_CUSTOMER_SECRET
      ),
    },
  })
  const body = await readJson(res)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        messageFromAgoraJson(body) ?? `List STT agents failed (${res.status})`,
    }
  }
  if (!body || typeof body !== 'object') {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected list STT agents response shape',
    }
  }
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object') {
    return { ok: true, agentIds: [] }
  }
  const list = (data as { list?: unknown }).list
  if (!Array.isArray(list)) {
    return { ok: true, agentIds: [] }
  }
  const agentIds: string[] = []
  for (const item of list) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { agent_id?: unknown }).agent_id === 'string'
    ) {
      agentIds.push((item as { agent_id: string }).agent_id)
    }
  }
  return { ok: true, agentIds }
}

/**
 * Stops the STT agent (v7 `leave`, POST).
 */
export async function leaveSttAgent(
  env: SttServerEnv,
  agentId: string
): Promise<LeaveSttAgentResult> {
  const url = `${sttV7ProjectBase(env)}/agents/${encodeURIComponent(agentId)}/leave`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(
        env.AGORA_CUSTOMER_KEY,
        env.AGORA_CUSTOMER_SECRET
      ),
    },
  })
  if (!res.ok) {
    const body = await readJson(res)
    return {
      ok: false,
      status: res.status,
      message:
        messageFromAgoraJson(body) ?? `Leave STT agent failed (${res.status})`,
    }
  }
  return { ok: true }
}
