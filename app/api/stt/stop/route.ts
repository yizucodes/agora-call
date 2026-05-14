import { NextResponse } from 'next/server'

import { requireSttServerEnv } from '@/lib/env'
import { stopSttTask } from '@/lib/stt/agora'
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

  const record = getSttAgentForChannel(channel)
  if (record === undefined) {
    return NextResponse.json(
      { error: 'No STT task is running for this channel' },
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

  const stopped = await stopSttTask(env, record.agentId, record.builderToken)
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
