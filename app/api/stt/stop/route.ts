import { NextResponse } from 'next/server'

import { requireSttServerEnv } from '@/lib/env'
import { leaveSttAgent, listRunningSttAgentIdsForChannel } from '@/lib/stt/agora'
import { parseSttChannelFromBody } from '@/lib/stt/channel'
import { deleteSttAgentForChannel, getSttAgentForChannel } from '@/lib/stt/store'

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

  const record = getSttAgentForChannel(channel)
  if (record !== undefined) {
    const stopped = await leaveSttAgent(env, record.agentId)
    if (!stopped.ok) {
      return NextResponse.json(
        { error: stopped.message, agentId: record.agentId, channel },
        {
          status:
            stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
        }
      )
    }
    deleteSttAgentForChannel(channel)
    return NextResponse.json({ ok: true, channel })
  }

  const listed = await listRunningSttAgentIdsForChannel(env, channel)
  if (!listed.ok) {
    return NextResponse.json(
      { error: listed.message },
      {
        status:
          listed.status >= 400 && listed.status < 600 ? listed.status : 502,
      }
    )
  }
  if (listed.agentIds.length === 0) {
    return NextResponse.json(
      { error: 'No STT task is running for this channel' },
      { status: 404 }
    )
  }

  for (const agentId of listed.agentIds) {
    const stopped = await leaveSttAgent(env, agentId)
    if (!stopped.ok) {
      return NextResponse.json(
        { error: stopped.message, agentId, channel },
        {
          status:
            stopped.status >= 400 && stopped.status < 600 ? stopped.status : 502,
        }
      )
    }
  }

  return NextResponse.json({ ok: true, channel })
}
