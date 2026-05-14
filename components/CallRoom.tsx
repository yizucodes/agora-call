'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useClientEvent,
  useConnectionState,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRTCClient,
  useRemoteUsers,
} from 'agora-rtc-react'

import { VideoTile } from '@/components/VideoTile'
import type { CallSession } from '@/components/Lobby'
import { createRtcClient } from '@/lib/agora/client'
import {
  logSttStreamMessageToConsole,
  normalizeRtcStreamUid,
} from '@/lib/stt/debug'

type SttClientSession = {
  agentId: string
  subBotUid: number
  pubBotUid: number
}

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
  const client = useRTCClient()
  const connectionState = useConnectionState()

  const [sttSession, setSttSession] = useState<SttClientSession | null>(null)
  const [sttBusy, setSttBusy] = useState(false)
  const [sttActionError, setSttActionError] = useState<string | null>(null)

  const streamMessageListener = useMemo(() => {
    if (!sttSession) return null
    const { subBotUid, pubBotUid } = sttSession
    return (uid: string | number, payload: Uint8Array) => {
      const n = normalizeRtcStreamUid(uid)
      if (n !== subBotUid && n !== pubBotUid) return
      logSttStreamMessageToConsole(n, payload)
    }
  }, [sttSession])

  useClientEvent(client, 'stream-message', streamMessageListener)

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

  const remoteUsersForGrid = useMemo(() => {
    if (!sttSession) return remoteUsers
    const { subBotUid, pubBotUid } = sttSession
    return remoteUsers.filter((user) => {
      const n = normalizeRtcStreamUid(user.uid)
      return n !== subBotUid && n !== pubBotUid
    })
  }, [remoteUsers, sttSession])

  const startStt = useCallback(async () => {
    setSttActionError(null)
    setSttBusy(true)
    try {
      const res = await fetch('/api/stt/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: session.channel }),
      })
      const body: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `STT start failed (${res.status})`
        throw new Error(msg)
      }
      const data = body as {
        agentId?: unknown
        subBotUid?: unknown
        pubBotUid?: unknown
      }
      if (
        typeof data.agentId !== 'string' ||
        typeof data.subBotUid !== 'number' ||
        typeof data.pubBotUid !== 'number'
      ) {
        throw new Error('STT start response missing agentId or bot UIDs')
      }
      setSttSession({
        agentId: data.agentId,
        subBotUid: data.subBotUid,
        pubBotUid: data.pubBotUid,
      })
    } catch (err) {
      setSttActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setSttBusy(false)
    }
  }, [session.channel])

  const stopStt = useCallback(async () => {
    setSttActionError(null)
    setSttBusy(true)
    try {
      const res = await fetch('/api/stt/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: session.channel }),
      })
      const body: unknown = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `STT stop failed (${res.status})`
        throw new Error(msg)
      }
      setSttSession(null)
    } catch (err) {
      setSttActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setSttBusy(false)
    }
  }, [session.channel])

  const handleLeave = useCallback(async () => {
    if (sttSession) {
      try {
        await fetch('/api/stt/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: session.channel }),
        })
      } catch {
        /* best-effort cleanup */
      }
      setSttSession(null)
    }
    onLeave()
  }, [onLeave, session.channel, sttSession])

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          {sttSession ? (
            <button
              type="button"
              onClick={() => void stopStt()}
              disabled={sttBusy}
              style={{ padding: '0.5rem 1rem' }}
            >
              Stop transcription
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startStt()}
              disabled={sttBusy || !isConnected}
              style={{ padding: '0.5rem 1rem' }}
            >
              Start transcription (console log)
            </button>
          )}
          <button type="button" onClick={() => void handleLeave()} style={{ padding: '0.5rem 1rem' }}>
            Leave
          </button>
        </div>
      </header>

      {sttSession && (
        <p style={{ margin: '0 0 1rem', color: '#444', fontSize: 13 }}>
          STT agent <code>{sttSession.agentId}</code> · bots{' '}
          <code>{sttSession.subBotUid}</code> / <code>{sttSession.pubBotUid}</code> — open DevTools
          Console for <code>[stt stream-message]</code> rows.
        </p>
      )}

      {sttActionError && (
        <p style={{ color: '#b00020', marginBottom: '1rem' }} role="alert">
          {sttActionError}
        </p>
      )}

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
        {remoteUsersForGrid.map((user) => (
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
