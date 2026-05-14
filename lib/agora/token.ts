import { RtcRole, RtcTokenBuilder } from 'agora-token'

/** Publisher token TTL aligned with PLAN (1 hour). */
const RTC_TOKEN_TTL_SECONDS = 3600

export type RtcTokenBundle = {
  appId: string
  token: string
  uid: number
  /** Absolute wall-clock expiry (ISO 8601). */
  expiresAt: string
}

function readAgoraRtcCredentials(): { appId: string; appCertificate: string } {
  const appId = process.env.AGORA_APP_ID?.trim()
  const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim()
  if (!appId || !appCertificate) {
    throw new Error(
      'Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE for RTC token minting'
    )
  }
  return { appId, appCertificate }
}

/**
 * Mint an RTC token for integer UID (publisher). Caller must validate channel + uid.
 */
export function buildRtcPublisherToken(
  channelName: string,
  uid: number
): RtcTokenBundle {
  const { appId, appCertificate } = readAgoraRtcCredentials()
  const tokenExpire = RTC_TOKEN_TTL_SECONDS
  const privilegeExpire = RTC_TOKEN_TTL_SECONDS

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    tokenExpire,
    privilegeExpire
  )

  const expiresAtMs = Date.now() + RTC_TOKEN_TTL_SECONDS * 1000

  return {
    appId,
    token,
    uid,
    expiresAt: new Date(expiresAtMs).toISOString(),
  }
}
