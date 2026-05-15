'use client'

import type { MeetingSummary } from '@/lib/summary/types'

type Props = {
  summary: MeetingSummary | null
  loading: boolean
  error: string | null
  transcriptLineCount: number
  onGenerate: () => void
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="summary-section">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="summary-empty">None captured.</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function SummaryPanel({
  summary,
  loading,
  error,
  transcriptLineCount,
  onGenerate,
}: Props) {
  return (
    <section className="summary-panel" aria-label="Meeting summary">
      <div className="summary-header">
        <div>
          <h2>Notes</h2>
          <p>{transcriptLineCount} final transcript lines</p>
        </div>
        <button
          type="button"
          className="summary-generate-btn"
          onClick={onGenerate}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {error && (
        <p className="summary-error" role="alert">
          {error}
        </p>
      )}

      {!summary && !loading && !error && (
        <p className="summary-empty">
          Generate notes from the current transcript when ready.
        </p>
      )}

      {loading && (
        <p className="summary-empty" role="status">
          Creating structured notes...
        </p>
      )}

      {summary && (
        <div className="summary-content">
          <section className="summary-section">
            <h3>Summary</h3>
            <p>{summary.summary}</p>
          </section>
          <SummaryList title="Key Points" items={summary.keyPoints} />
          <SummaryList title="Decisions" items={summary.decisions} />
          <section className="summary-section">
            <h3>Action Items</h3>
            {summary.actionItems.length === 0 ? (
              <p className="summary-empty">None captured.</p>
            ) : (
              <ul>
                {summary.actionItems.map((item, index) => (
                  <li key={`action-${index}`}>
                    {item.owner ? `${item.owner}: ` : ''}
                    {item.task}
                    {item.dueDate ? ` (${item.dueDate})` : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  )
}
