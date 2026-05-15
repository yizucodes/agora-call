'use client'

import type { TranscriptSegment } from '@/lib/stt/parse'

type Props = {
  lines: TranscriptSegment[]
  active: boolean
  variant?: 'inline' | 'drawer'
}

export function TranscriptPanel({ lines, active, variant = 'inline' }: Props) {
  const isDrawer = variant === 'drawer'

  return (
    <section
      className={isDrawer ? 'tp-drawer' : undefined}
      style={
        isDrawer
          ? undefined
          : {
              marginTop: '1.25rem',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              background: '#fafafa',
              minHeight: '12rem',
              maxHeight: '22rem',
              display: 'flex',
              flexDirection: 'column',
            }
      }
      aria-label="Live transcript"
    >
      <h2 style={isDrawer ? undefined : { margin: '0 0 0.5rem', fontSize: '1rem' }}>Transcript</h2>
      <div
        className={isDrawer ? 'tp-body' : undefined}
        style={isDrawer ? undefined : { flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        {!active && lines.length === 0 && (
          <p
            className={isDrawer ? 'tp-empty' : undefined}
            style={isDrawer ? undefined : { margin: 0, color: '#666', fontSize: 13 }}
          >
            Start transcription to see live results here.
          </p>
        )}
        {active && lines.length === 0 && (
          <p
            className={isDrawer ? 'tp-empty' : undefined}
            style={isDrawer ? undefined : { margin: 0, color: '#666', fontSize: 13 }}
          >
            Listening… speak to populate the transcript.
          </p>
        )}
        <ol
          style={
            isDrawer
              ? undefined
              : {
                  margin: 0,
                  padding: '0 0 0 1.1rem',
                  fontSize: 14,
                  lineHeight: 1.45,
                }
          }
        >
          {lines.map((line) => (
            <li
              key={line.id}
              style={{
                marginBottom: '0.35rem',
                color: line.isFinal ? '#111' : '#555',
                fontStyle: line.isFinal ? 'normal' : 'italic',
              }}
            >
              <strong>{line.speakerLabel}</strong>: {line.text}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
