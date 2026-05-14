'use client'

import { useState, type FormEvent } from 'react'

export type CallSession = {
  channel: string
  uid: number
  displayName: string
}

const MAX_UID = 0xffff_ffff

export function Lobby({ onJoin }: { onJoin: (session: CallSession) => void }) {
  const [channel, setChannel] = useState('demo')
  const [uid, setUid] = useState('1001')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const channelTrim = channel.trim()
    if (channelTrim === '') {
      setError('Channel is required.')
      return
    }
    const uidNum = Number(uid)
    if (!Number.isInteger(uidNum) || uidNum < 1 || uidNum > MAX_UID) {
      setError('UID must be an integer between 1 and 4294967295.')
      return
    }
    setError(null)
    onJoin({
      channel: channelTrim,
      uid: uidNum,
      displayName: displayName.trim() || `User ${uidNum}`,
    })
  }

  return (
    <section
      style={{
        padding: '2rem',
        maxWidth: '32rem',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <h1 style={{ margin: 0 }}>Agora call demo</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Open this page in two tabs with different UIDs and the same channel to
        start a call.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Channel</span>
          <input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>UID (integer)</span>
          <input
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Display name (optional)</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
          />
        </label>
        {error && <p style={{ margin: 0, color: '#b00020' }}>{error}</p>}
        <button type="submit" style={{ padding: '0.5rem 1rem', alignSelf: 'flex-start' }}>
          Join channel
        </button>
      </form>
    </section>
  )
}
