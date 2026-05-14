import { NextRequest, NextResponse } from 'next/server'

import { requireSttServerEnv } from '@/lib/env'
import { querySttTask } from '@/lib/stt/agora'
import { findChannelByAgentId, getSttAgentForChannel } from '@/lib/stt/store'

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId')?.trim() ?? ''
  if (agentId === '') {
    return NextResponse.json(
      { error: 'agentId query parameter is required' },
      { status: 400 }
    )
  }

  const channel = findChannelByAgentId(agentId)
  if (channel === undefined) {
    return NextResponse.json(
      { error: 'Unknown agentId (no active STT task for this server)' },
      { status: 404 }
    )
  }

  const record = getSttAgentForChannel(channel)
  if (record === undefined) {
    return NextResponse.json(
      { error: 'Unknown agentId (no active STT task for this server)' },
      { status: 404 }
    )
  }

  let env
  try {
    env = requireSttServerEnv()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const q = await querySttTask(env, record.agentId, record.builderToken)
  if (!q.ok) {
    return NextResponse.json(
      { error: q.message, agentId: record.agentId, channel },
      { status: q.status >= 400 && q.status < 600 ? q.status : 502 }
    )
  }

  return NextResponse.json({
    agentId: q.taskId,
    status: q.status,
    createTs: q.createTs,
    channel,
    subBotUid: record.subBotUid,
    pubBotUid: record.pubBotUid,
  })
}
