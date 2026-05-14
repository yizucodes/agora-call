'use client'

import { useCallback, useMemo } from 'react'
import {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useConnectionState,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
} from 'agora-rtc-react'

import { VideoTile } from '@/components/VideoTile'
import type { CallSession } from '@/components/Lobby'
import { createRtcClient } from '@/lib/agora/client'

type Props = {
  session: CallSession
  onLeave: () => void
}

export default function CallRoom({ session, onLeave }: Props) {
  const client = useMemo(() => createRtcClient(), [])
  return (
    <AgoraRTCProvider client={client}>
      <CallRoomInner session={session} onLeave={onLeave} />
    </AgoraRTCProvider>
  )
}

function CallRoomInner({ session, onLeave }: Props) {
  const connectionState = useConnectionState()

  const joinArgs = useCallback(async () => {
    const params = new URLSearchParams({
      channel: session.channel,
      uid: String(session.uid),
    })
    const res = await fetch(`/api/rtc/token?${params}`)
    const body: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `Token request failed (${res.status})`
      throw new Error(msg)
    }
    const data = body as { appId: string; token: string }
    return {
      appid: data.appId,
      channel: session.channel,
      token: data.token,
      uid: session.uid,
    }
  }, [session.channel, session.uid])

  const { isConnected, error: joinError, isLoading: joinLoading } = useJoin(
    joinArgs,
    true
  )

  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(true)
  const { localCameraTrack, error: camError } = useLocalCameraTrack(true)
  usePublish([localMicrophoneTrack, localCameraTrack], isConnected)

  const remoteUsers = useRemoteUsers()

  const setupError = joinError ?? micError ?? camError
  const setupErrorMessage =
    setupError == null
      ? null
      : setupError instanceof Error
        ? setupError.message
        : String(setupError)

  return (
    <main style={{ padding: '1.5rem', maxWidth: '72rem', margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>In call</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#444', fontSize: 14 }}>
            {session.displayName} · channel <strong>{session.channel}</strong> ·
            uid <strong>{session.uid}</strong> · RTC{' '}
            <strong>{connectionState}</strong>
            {joinLoading ? ' · joining…' : null}
          </p>
        </div>
        <button type="button" onClick={onLeave} style={{ padding: '0.5rem 1rem' }}>
          Leave
        </button>
      </header>

      {setupErrorMessage && (
        <p style={{ color: '#b00020', marginBottom: '1rem' }} role="alert">
          {setupErrorMessage}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <VideoTile label={`You (${session.displayName})`}>
          <LocalUser
            audioTrack={localMicrophoneTrack}
            videoTrack={localCameraTrack}
            cameraOn={Boolean(localCameraTrack)}
            micOn={Boolean(localMicrophoneTrack)}
            playAudio
            playVideo
            style={{ width: '100%', height: '100%' }}
          />
        </VideoTile>
        {remoteUsers.map((user) => (
          <VideoTile key={String(user.uid)} label={`Remote ${user.uid}`}>
            <RemoteUser
              user={user}
              playVideo
              playAudio
              style={{ width: '100%', height: '100%' }}
            />
          </VideoTile>
        ))}
      </div>
    </main>
  )
}
