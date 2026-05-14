import { NextResponse } from 'next/server'

import { requireSttServerEnv } from '@/lib/env'
import {
  acquireBuilderToken,
  querySttTask,
  startSttTask,
} from '@/lib/stt/agora'
import { parseSttChannelFromBody } from '@/lib/stt/channel'
import {
  getSttAgentForChannel,
  setSttAgentForChannel,
} from '@/lib/stt/store'

function randomBotUid(): number {
  return Math.floor(Math.random() * 1e9)
}

function pickDistinctBotUids(): { subBotUid: number; pubBotUid: number } {
  let subBotUid = randomBotUid()
  let pubBotUid = randomBotUid()
  while (pubBotUid === subBotUid) {
    pubBotUid = randomBotUid()
  }
  return { subBotUid, pubBotUid }
}

function newBuilderInstanceId(): string {
  const suffix = crypto.randomUUID().replace(/-/g, '')
  return `stt_${suffix}`.slice(0, 64)
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseSttChannelFromBody(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { channel } = parsed

  let env
  try {
    env = requireSttServerEnv()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const existing = getSttAgentForChannel(channel)
  if (existing) {
    const q = await querySttTask(env, existing.agentId, existing.builderToken)
    if (q.ok) {
      return NextResponse.json({
        agentId: q.taskId,
        status: q.status,
        channel,
        subBotUid: existing.subBotUid,
        pubBotUid: existing.pubBotUid,
      })
    }
    return NextResponse.json({
      agentId: existing.agentId,
      status: 'UNKNOWN',
      channel,
      subBotUid: existing.subBotUid,
      pubBotUid: existing.pubBotUid,
      agoraQueryError: q.message,
    })
  }

  const acquired = await acquireBuilderToken(env, newBuilderInstanceId())
  if (!acquired.ok) {
    return NextResponse.json(
      { error: acquired.message },
      { status: acquired.status >= 400 && acquired.status < 600 ? acquired.status : 502 }
    )
  }

  const { subBotUid, pubBotUid } = pickDistinctBotUids()

  const started = await startSttTask(env, acquired.tokenName, {
    channelName: channel,
    subBotUid,
    pubBotUid,
  })

  if (!started.ok) {
    return NextResponse.json(
      { error: started.message },
      { status: started.status >= 400 && started.status < 600 ? started.status : 502 }
    )
  }

  setSttAgentForChannel(channel, {
    agentId: started.taskId,
    builderToken: acquired.tokenName,
    subBotUid,
    pubBotUid,
  })

  return NextResponse.json({
    agentId: started.taskId,
    status: started.status,
    channel,
    subBotUid,
    pubBotUid,
  })
}
