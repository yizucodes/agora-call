/**
 * In-memory STT agent state (single Node process). Keyed by RTC channel name.
 * Production would use Redis/DB keyed by channel.
 */
export type SttAgentRecord = {
  /** Agora v7 `agent_id` from `join`; exposed to clients as `agentId`. */
  agentId: string
  /** Single STT bot UID (v7: subscriber and publisher are the same user). */
  subBotUid: number
  pubBotUid: number
}

const channelToAgent = new Map<string, SttAgentRecord>()

/** Returns the in-memory STT record for a channel, if any. */
export function getSttAgentForChannel(channel: string): SttAgentRecord | undefined {
  return channelToAgent.get(channel)
}

/** Persists or replaces the STT record for a channel (single agent per channel in this demo). */
export function setSttAgentForChannel(channel: string, record: SttAgentRecord): void {
  channelToAgent.set(channel, record)
}

/** Removes the STT record for a channel (e.g. after a successful stop). */
export function deleteSttAgentForChannel(channel: string): void {
  channelToAgent.delete(channel)
}

/**
 * Finds the channel name whose current STT agent id matches `agentId`.
 * Linear scan; fine for demo-scale state.
 */
export function findChannelByAgentId(agentId: string): string | undefined {
  for (const [ch, rec] of channelToAgent) {
    if (rec.agentId === agentId) {
      return ch
    }
  }
  return undefined
}
