'use client'

import type { ReactNode } from 'react'

export function VideoTile({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '4 / 3',
        background: '#000',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
      <span
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          padding: '2px 6px',
          fontSize: 12,
          color: '#fff',
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 4,
        }}
      >
        {label}
      </span>
    </div>
  )
}
