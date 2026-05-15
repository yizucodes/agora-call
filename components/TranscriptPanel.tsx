'use client'

import type { TranscriptSegment } from '@/lib/stt/parse'
import { normalizeRtcStreamUid } from '@/lib/stt/debug'

type Props = {
  lines: TranscriptSegment[]
  active: boolean
  /** RTC uid of this client; used to color YOU (green) vs SPEAKER (blue). */
  localUid: number
  variant?: 'inline' | 'drawer'
}

export function TranscriptPanel({ lines, active, localUid, variant = 'inline' }: Props) {
  const isDrawer = variant === 'drawer'
  const rootClass = ['tp-transcript', isDrawer ? 'tp-transcript--drawer' : 'tp-transcript--inline'].join(
    ' '
  )

  return (
    <section className={rootClass} aria-label="Live transcript">
      <h2 className="tp-transcript-title">Transcript</h2>
      <div className="tp-transcript-body">
        {!active && lines.length === 0 && (
          <p className="tp-empty">Start transcription to see live results here.</p>
        )}
        {active && lines.length === 0 && (
          <p className="tp-empty">Listening… speak to populate the transcript.</p>
        )}
        <div className="tp-messages" role="list">
          {lines.map((line) => {
            const isLocal =
              normalizeRtcStreamUid(line.speakerRtcUid) === normalizeRtcStreamUid(localUid)
            const tone = isLocal ? 'green' : 'blue'
            return (
              <article
                key={line.id}
                role="listitem"
                className={[
                  'tp-msg',
                  `tp-msg--${tone}`,
                  line.isFinal ? '' : 'tp-msg--partial',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <p className="tp-msg-role">{isLocal ? 'YOU' : 'SPEAKER'}</p>
                <p className="tp-msg-text">{line.text}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
