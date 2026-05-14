import { NextResponse } from 'next/server'

import { requireSttServerEnv } from '@/lib/env'
import { getSttAgent, joinSttAgent } from '@/lib/stt/agora'
import {
  parseSttChannelFromBody,
  parseSubscribeRtcUidsFromBody,
} from '@/lib/stt/channel'
import {
  deleteSttAgentForChannel,
  getSttAgentForChannel,
  setSttAgentForChannel,
} from '@/lib/stt/store'

/** Agora RTC UID range [1, 2^32-1]; avoid 0 (auto-assign / invalid for our token flow). */
const MAX_RTC_UID = 0xffff_ffff

function randomBotUid(): number {
  return 1 + Math.floor(Math.random() * (MAX_RTC_UID - 1))
}

const STALE_STT_AGENT_STATUSES = new Set(['STOPPED', 'FAILED'])

function newSttAgentName(): string {
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

  const subs = parseSubscribeRtcUidsFromBody(body)
  if (!subs.ok) {
    return NextResponse.json({ error: subs.error }, { status: 400 })
  }

  let env
  try {
    env = requireSttServerEnv()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const existing = getSttAgentForChannel(channel)
  if (existing) {
    const q = await getSttAgent(env, existing.agentId)
    const goneFromAgora = !q.ok && q.status === 404
    const terminalOnAgora =
      q.ok && STALE_STT_AGENT_STATUSES.has(q.status)
    if (goneFromAgora || terminalOnAgora) {
      deleteSttAgentForChannel(channel)
    } else if (q.ok) {
      return NextResponse.json({
        agentId: q.taskId,
        status: q.status,
        channel,
        subBotUid: existing.subBotUid,
        pubBotUid: existing.pubBotUid,
      })
    } else {
      return NextResponse.json(
        { error: q.message },
        {
          status:
            q.status >= 400 && q.status < 600 ? q.status : 502,
        }
      )
    }
  }

  const botUid = randomBotUid()

  const started = await joinSttAgent(env, {
    name: newSttAgentName(),
    channelName: channel,
    botUid,
    subscribeRtcUids: subs.uids.length > 0 ? subs.uids : undefined,
  })

  if (!started.ok) {
    return NextResponse.json(
      { error: started.message },
      { status: started.status >= 400 && started.status < 600 ? started.status : 502 }
    )
  }

  setSttAgentForChannel(channel, {
    agentId: started.taskId,
    subBotUid: botUid,
    pubBotUid: botUid,
  })

  return NextResponse.json({
    agentId: started.taskId,
    status: started.status,
    channel,
    subBotUid: botUid,
    pubBotUid: botUid,
  })
}
