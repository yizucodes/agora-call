'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AgoraRTCProvider,
  LocalUser,
  RemoteUser,
  useClientEvent,
  useJoin,
  useLocalCameraTrack,
  useLocalMicrophoneTrack,
  usePublish,
  useRTCClient,
  useRemoteUsers,
} from 'agora-rtc-react'

import { VideoTile } from '@/components/VideoTile'
import { TranscriptPanel } from '@/components/TranscriptPanel'
import type { CallSession } from '@/components/Lobby'
import { useTranscript } from '@/hooks/useTranscript'
import { createRtcClient } from '@/lib/agora/client'
import { logSttStreamMessageToConsole, normalizeRtcStreamUid } from '@/lib/stt/debug'

import './interview-room.css'

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

  const [sttSession, setSttSession] = useState<SttClientSession | null>(null)
  const [sttBusy, setSttBusy] = useState(false)
  const [sttActionError, setSttActionError] = useState<string | null>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [camEnabled, setCamEnabled] = useState(true)

  const { displayLines, ingestPayload } = useTranscript({
    sttAgentId: sttSession?.agentId ?? null,
  })

  const streamMessageListener = useMemo(() => {
    if (!sttSession) return null
    const { subBotUid, pubBotUid } = sttSession
    return (uid: string | number, payload: Uint8Array) => {
      const n = normalizeRtcStreamUid(uid)
      if (n !== subBotUid && n !== pubBotUid) return
      if (process.env.NODE_ENV === 'development') {
        logSttStreamMessageToConsole(n, payload)
      }
      ingestPayload(payload)
    }
  }, [ingestPayload, sttSession])

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

  const { isConnected, error: joinError } = useJoin(
    joinArgs,
    true
  )

  const { localMicrophoneTrack, error: micError } = useLocalMicrophoneTrack(true)
  const { localCameraTrack, error: camError } = useLocalCameraTrack(true)
  usePublish([localMicrophoneTrack, localCameraTrack], isConnected)

  useEffect(() => {
    if (!localMicrophoneTrack) return
    void localMicrophoneTrack.setEnabled(micEnabled)
  }, [localMicrophoneTrack, micEnabled])

  useEffect(() => {
    if (!localCameraTrack) return
    void localCameraTrack.setEnabled(camEnabled)
  }, [localCameraTrack, camEnabled])

  const remoteUsers = useRemoteUsers()

  const remoteUsersForGrid = useMemo(() => {
    if (!sttSession) return remoteUsers
    const { subBotUid, pubBotUid } = sttSession
    return remoteUsers.filter((user) => {
      const n = normalizeRtcStreamUid(user.uid)
      return n !== subBotUid && n !== pubBotUid
    })
  }, [remoteUsers, sttSession])

  const spotlightRemote = remoteUsersForGrid[0] ?? null
  const otherRemotes = useMemo(
    () => remoteUsersForGrid.slice(1),
    [remoteUsersForGrid]
  )

  const startStt = useCallback(async () => {
    setSttActionError(null)
    setSttBusy(true)
    try {
      const subscribeRtcUids = new Set<number>()
      subscribeRtcUids.add(session.uid)
      for (const u of remoteUsers) {
        const n = normalizeRtcStreamUid(u.uid)
        if (Number.isFinite(n) && n >= 1) {
          subscribeRtcUids.add(n)
        }
      }
      const res = await fetch('/api/stt/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: session.channel,
          subscribeRtcUids: [...subscribeRtcUids],
        }),
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
  }, [remoteUsers, session.channel, session.uid])

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
        setSttSession(null)
        setSttActionError(msg)
        return
      }
      setSttSession(null)
    } catch (err) {
      setSttSession(null)
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
    <div className="interview-root">
      <header className="interview-header">
        <div>
          <h1 className="interview-brand">Agora Call</h1>
          <p className="interview-meta">
            {session.displayName} · channel {session.channel} · uid {session.uid}
          </p>
        </div>
        <div className="interview-header-actions">
          {sttSession ? (
            <button
              type="button"
              className="ir-pill ir-pill--outline-purple"
              onClick={() => void stopStt()}
              disabled={sttBusy}
            >
              Stop transcription
            </button>
          ) : (
            <button
              type="button"
              className="ir-pill ir-pill--purple"
              onClick={() => void startStt()}
              disabled={sttBusy || !isConnected}
            >
              Start transcription
            </button>
          )}
          <button
            type="button"
            className={`ir-pill ir-pill--purple${transcriptOpen ? ' ir-pill--active' : ''}`}
            onClick={() => setTranscriptOpen((v) => !v)}
            aria-pressed={transcriptOpen}
          >
            Transcript
          </button>
          <button type="button" className="ir-pill ir-pill--red" onClick={() => void handleLeave()}>
            End Interview
          </button>
        </div>
      </header>

      {(sttActionError || setupErrorMessage) && (
        <div className="interview-alerts">
          {sttActionError && (
            <p role="alert">
              {sttActionError}
            </p>
          )}
          {setupErrorMessage && (
            <p role="alert">
              {setupErrorMessage}
            </p>
          )}
        </div>
      )}

      {sttSession && process.env.NODE_ENV === 'development' && (
        <aside className="interview-dev-note" role="note" aria-label="Development-only STT debug info">
          <div
            style={{
              padding: '0.5rem 0.65rem',
              fontSize: 12,
              lineHeight: 1.45,
              color: '#333',
              background: '#f0f4f8',
              border: '1px solid #c5d4e0',
              borderRadius: 8,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: '0.35rem 0.5rem',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#fff',
                background: '#5c6bc0',
                padding: '0.15rem 0.4rem',
                borderRadius: 4,
              }}
            >
              Dev
            </span>
            <span>
              STT agent <code style={{ fontSize: '0.95em' }}>{sttSession.agentId}</code>
              {sttSession.subBotUid === sttSession.pubBotUid ? (
                <>
                  {' '}
                  · bot UID <code style={{ fontSize: '0.95em' }}>{sttSession.pubBotUid}</code>
                </>
              ) : (
                <>
                  {' '}
                  · bots{' '}
                  <code style={{ fontSize: '0.95em' }}>{sttSession.subBotUid}</code> /{' '}
                  <code style={{ fontSize: '0.95em' }}>{sttSession.pubBotUid}</code>
                </>
              )}
            </span>
            <span style={{ color: '#555', flex: '1 1 100%' }}>
              Console: filter for <code>[stt stream-message]</code> to inspect raw payloads.
            </span>
          </div>
        </aside>
      )}

      <div className="interview-shell">
        <div className="interview-stage-wrap">
          <div className="interview-stage">
            <div className="interview-col-left">
              <VideoTile
                label="You"
                inactiveVideo={!localCameraTrack || !camEnabled}
              >
                <LocalUser
                  audioTrack={localMicrophoneTrack}
                  videoTrack={localCameraTrack}
                  cameraOn={Boolean(localCameraTrack) && camEnabled}
                  micOn={Boolean(localMicrophoneTrack) && micEnabled}
                  playAudio
                  playVideo
                  style={{ width: '100%', height: '100%' }}
                />
              </VideoTile>
              {otherRemotes.map((user) => (
                <VideoTile
                  key={String(user.uid)}
                  label={`User ${normalizeRtcStreamUid(user.uid)}`}
                  inactiveVideo={!user.videoTrack}
                >
                  <RemoteUser
                    user={user}
                    playVideo
                    playAudio
                    style={{ width: '100%', height: '100%' }}
                  />
                </VideoTile>
              ))}
            </div>

            <div className="interview-col-right">
              {spotlightRemote ? (
                <VideoTile
                  fill
                  label={`User ${normalizeRtcStreamUid(spotlightRemote.uid)}`}
                  inactiveVideo={!spotlightRemote.videoTrack}
                >
                  <RemoteUser
                    user={spotlightRemote}
                    playVideo
                    playAudio
                    style={{ width: '100%', height: '100%' }}
                  />
                </VideoTile>
              ) : (
                <div className="interview-spotlight-empty" role="status">
                  Waiting for someone to join this channel…
                </div>
              )}
            </div>
          </div>

          <div className="interview-device-bar">
            <button
              type="button"
              className="interview-device-btn"
              onClick={() => setMicEnabled((v) => !v)}
              disabled={!localMicrophoneTrack}
            >
              <span className="interview-device-icon" aria-hidden>
                🎤
              </span>
              <span className="interview-device-meta">
                <span className="interview-device-kicker">Your microphone</span>
                <span className={`interview-device-state${micEnabled ? '' : ' is-muted'}`}>
                  {micEnabled ? 'Active' : 'Muted'}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="interview-device-btn"
              onClick={() => setCamEnabled((v) => !v)}
              disabled={!localCameraTrack}
            >
              <span className="interview-device-icon" aria-hidden>
                📷
              </span>
              <span className="interview-device-meta">
                <span className="interview-device-kicker">Your camera</span>
                <span className={`interview-device-state${camEnabled && localCameraTrack ? '' : ' is-muted'}`}>
                  {camEnabled && localCameraTrack ? 'Active' : 'Inactive'}
                </span>
              </span>
            </button>
          </div>

          <div className="interview-footer-bar" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <aside
          className={`interview-transcript-drawer${transcriptOpen ? ' is-open' : ''}`}
          aria-hidden={!transcriptOpen}
        >
          {transcriptOpen ? (
            <div className="interview-transcript-drawer-inner">
              <TranscriptPanel
                lines={displayLines}
                active={Boolean(sttSession)}
                localUid={session.uid}
                variant="drawer"
              />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
