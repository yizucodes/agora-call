import type { SttServerEnv } from '@/lib/env'

import { buildRtcPublisherToken } from '@/lib/agora/token'

/**
 * Agora Real-Time STT REST **v6.x** (builder token + tasks).
 * Uses customer key/secret Basic auth; RTC app id/certificate for bot tokens.
 */
const BUILDER_TOKENS_PATH = '/v1/projects'
const SPEECH_PREFIX = '/rtsc/speech-to-text'

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

/** Best-effort error string from Agora JSON error bodies (`message`, `detail`, `reason`). */
function messageFromAgoraJson(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>
    if (typeof o.message === 'string') {
      return o.message
    }
    if (typeof o.detail === 'string') {
      return o.detail
    }
    if (typeof o.reason === 'string') {
      return o.reason
    }
  }
  return undefined
}

/** Result of requesting a short-lived builder token (`tokenName`) before starting a task. */
export type AcquireBuilderTokenResult =
  | { ok: true; tokenName: string; createTs: number; instanceId: string }
  | { ok: false; status: number; message: string }

/**
 * Acquires a builder token (`tokenName`) used as `builderToken` on start/query/stop.
 * Must call {@link startSttTask} within the token validity window (Agora: ~5 minutes).
 */
export async function acquireBuilderToken(
  env: SttServerEnv,
  instanceId: string
): Promise<AcquireBuilderTokenResult> {
  const base = sttRestBaseUrl(env.AGORA_STT_REGION)
  const url = `${base}${BUILDER_TOKENS_PATH}/${encodeURIComponent(env.AGORA_APP_ID)}${SPEECH_PREFIX}/builderTokens`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(
        env.AGORA_CUSTOMER_KEY,
        env.AGORA_CUSTOMER_SECRET
      ),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ instanceId }),
  })
  const body = await readJson(res)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        messageFromAgoraJson(body) ??
        `Acquire builder token failed (${res.status})`,
    }
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { tokenName?: unknown }).tokenName !== 'string'
  ) {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected acquire builder token response shape',
    }
  }
  const b = body as {
    tokenName: string
    createTs?: number
    instanceId?: string
  }
  return {
    ok: true,
    tokenName: b.tokenName,
    createTs: typeof b.createTs === 'number' ? b.createTs : 0,
    instanceId: typeof b.instanceId === 'string' ? b.instanceId : instanceId,
  }
}

/** Outcome of starting an STT task; on success includes Agora `taskId` (we expose it as `agentId` in HTTP APIs). */
export type StartSttTaskResult =
  | {
      ok: true
      taskId: string
      createTs: number
      status: string
    }
  | { ok: false; status: number; message: string }

/**
 * Starts Real-Time STT for `channelName`: mints RTC publisher tokens for sub/pub bots,
 * posts to Agora `…/tasks?builderToken=…`, and subscribes to all channel audio (`subscribeAudioUids: ["all"]`).
 */
export async function startSttTask(
  env: SttServerEnv,
  builderToken: string,
  params: {
    channelName: string
    subBotUid: number
    pubBotUid: number
  }
): Promise<StartSttTaskResult> {
  const sub = buildRtcPublisherToken(params.channelName, params.subBotUid)
  const pub = buildRtcPublisherToken(params.channelName, params.pubBotUid)

  const base = sttRestBaseUrl(env.AGORA_STT_REGION)
  const url = new URL(
    `${base}${BUILDER_TOKENS_PATH}/${encodeURIComponent(env.AGORA_APP_ID)}${SPEECH_PREFIX}/tasks`
  )
  url.searchParams.set('builderToken', builderToken)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(
        env.AGORA_CUSTOMER_KEY,
        env.AGORA_CUSTOMER_SECRET
      ),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      languages: ['en-US'],
      maxIdleTime: 3600,
      rtcConfig: {
        channelName: params.channelName,
        subBotUid: String(params.subBotUid),
        subBotToken: sub.token,
        pubBotUid: String(params.pubBotUid),
        pubBotToken: pub.token,
        subscribeAudioUids: ['all'],
      },
    }),
  })

  const body = await readJson(res)
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message:
        messageFromAgoraJson(body) ?? `Start STT task failed (${res.status})`,
    }
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { taskId?: unknown }).taskId !== 'string'
  ) {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected start STT task response shape',
    }
  }
  const b = body as { taskId: string; createTs?: number; status?: string }
  return {
    ok: true,
    taskId: b.taskId,
    createTs: typeof b.createTs === 'number' ? b.createTs : 0,
    status: typeof b.status === 'string' ? b.status : 'UNKNOWN',
  }
}

/** Current task status from Agora’s query endpoint. */
export type QuerySttTaskResult =
  | { ok: true; taskId: string; createTs: number; status: string }
  | { ok: false; status: number; message: string }

/**
 * Queries STT task status. Requires the same `builderToken` used when the task was started.
 */
export async function querySttTask(
  env: SttServerEnv,
  taskId: string,
  builderToken: string
): Promise<QuerySttTaskResult> {
  const base = sttRestBaseUrl(env.AGORA_STT_REGION)
  const url = new URL(
    `${base}${BUILDER_TOKENS_PATH}/${encodeURIComponent(env.AGORA_APP_ID)}${SPEECH_PREFIX}/tasks/${encodeURIComponent(taskId)}`
  )
  url.searchParams.set('builderToken', builderToken)

  const res = await fetch(url.toString(), {
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
        messageFromAgoraJson(body) ?? `Query STT task failed (${res.status})`,
    }
  }
  if (
    !body ||
    typeof body !== 'object' ||
    typeof (body as { taskId?: unknown }).taskId !== 'string'
  ) {
    return {
      ok: false,
      status: 502,
      message: 'Unexpected query STT task response shape',
    }
  }
  const b = body as { taskId: string; createTs?: number; status?: string }
  return {
    ok: true,
    taskId: b.taskId,
    createTs: typeof b.createTs === 'number' ? b.createTs : 0,
    status: typeof b.status === 'string' ? b.status : 'UNKNOWN',
  }
}

/** Result of asking Agora to stop a running STT task. */
export type StopSttTaskResult =
  | { ok: true }
  | { ok: false; status: number; message: string }

/**
 * Stops the STT task on Agora. Requires the same `builderToken` used at start.
 * After a successful stop, acquire a **new** builder token before starting again.
 */
export async function stopSttTask(
  env: SttServerEnv,
  taskId: string,
  builderToken: string
): Promise<StopSttTaskResult> {
  const base = sttRestBaseUrl(env.AGORA_STT_REGION)
  const url = new URL(
    `${base}${BUILDER_TOKENS_PATH}/${encodeURIComponent(env.AGORA_APP_ID)}${SPEECH_PREFIX}/tasks/${encodeURIComponent(taskId)}`
  )
  url.searchParams.set('builderToken', builderToken)

  const res = await fetch(url.toString(), {
    method: 'DELETE',
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
        messageFromAgoraJson(body) ?? `Stop STT task failed (${res.status})`,
    }
  }
  return { ok: true }
}
