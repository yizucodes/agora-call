'use client'

import AgoraRTC, { type IAgoraRTCClient } from 'agora-rtc-react'

/**
 * Create a fresh RTC client per call session. Always called from the browser
 * via the dynamically-imported {@link CallRoom}; never evaluated on the server.
 * Import `AgoraRTC` from `agora-rtc-react` (not `agora-rtc-sdk-ng`) so the client
 * type matches `AgoraRTCProvider` and avoids duplicate SDK type trees.
 */
export function createRtcClient(): IAgoraRTCClient {
  return AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
}
