'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import { Lobby, type CallSession } from '@/components/Lobby'

const CallRoom = dynamic(() => import('@/components/CallRoom'), { ssr: false })

export default function HomePage() {
  const [session, setSession] = useState<CallSession | null>(null)

  if (session) {
    return <CallRoom session={session} onLeave={() => setSession(null)} />
  }

  return <Lobby onJoin={setSession} />
}
