'use client'

import type { ReactNode } from 'react'

export function VideoTile({
  label,
  children,
  className,
  inactiveVideo,
  fill,
}: {
  label: string
  children: ReactNode
  className?: string
  /** When true, shows a centered “No video” overlay (camera off or unavailable). */
  inactiveVideo?: boolean
  /** Fill the parent flex/grid cell instead of a fixed 4:3 tile (e.g. main remote stage). */
  fill?: boolean
}) {
  return (
    <div
      className={['video-tile', fill ? 'video-tile--fill' : '', className].filter(Boolean).join(' ')}
    >
      <div className="video-tile__media">{children}</div>
      {inactiveVideo ? (
        <div className="video-tile__placeholder" aria-hidden>
          <span className="video-tile__placeholder-icon">📷</span>
          <span>No video</span>
        </div>
      ) : null}
      <span className="video-tile__label">{label}</span>
    </div>
  )
}
