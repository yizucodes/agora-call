'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { TranscriptSegment } from '@/lib/stt/parse'
import { parseSttStreamPayload, utteranceToSegment } from '@/lib/stt/parse'

export type UseTranscriptOptions = {
  /** Clears transcript only when this switches to a new non-null agent id (new STT run). */
  sttAgentId: string | null
}

export type UseTranscriptResult = {
  /** Final rows in order, then at most one partial row per speaker (stable sort by uid). */
  displayLines: TranscriptSegment[]
  /** Feed one raw stream-message payload while STT is active. */
  ingestPayload: (payload: Uint8Array) => void
}

/**
 * Maintains final transcript lines plus one replaceable partial line per `speakerRtcUid`.
 */
export function useTranscript({ sttAgentId }: UseTranscriptOptions): UseTranscriptResult {
  const [finals, setFinals] = useState<TranscriptSegment[]>([])
  const [partials, setPartials] = useState<Map<number, TranscriptSegment>>(() => new Map())
  const lastAgentRef = useRef<string | null>(null)

  useEffect(() => {
    if (sttAgentId == null) {
      lastAgentRef.current = null
      return
    }
    if (lastAgentRef.current !== sttAgentId) {
      setFinals([])
      setPartials(new Map())
      lastAgentRef.current = sttAgentId
    }
  }, [sttAgentId])

  const ingestPayload = useCallback((payload: Uint8Array) => {
    const utter = parseSttStreamPayload(payload)
    if (!utter) {
      return
    }
    const row = utteranceToSegment(utter)
    if (row.isFinal) {
      setFinals((prev) => [...prev, row])
      setPartials((prev) => {
        const next = new Map(prev)
        next.delete(row.speakerRtcUid)
        return next
      })
    } else {
      setPartials((prev) => {
        const next = new Map(prev)
        next.set(row.speakerRtcUid, { ...row, id: `partial_${row.speakerRtcUid}` })
        return next
      })
    }
  }, [])

  const displayLines = useMemo(() => {
    const partialList = [...partials.values()].sort(
      (a, b) => a.speakerRtcUid - b.speakerRtcUid
    )
    return [...finals, ...partialList]
  }, [finals, partials])

  return { displayLines, ingestPayload }
}
