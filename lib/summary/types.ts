export type SummaryActionItem = {
  owner?: string
  task: string
  dueDate?: string
}

export type MeetingSummary = {
  summary: string
  keyPoints: string[]
  decisions: string[]
  actionItems: SummaryActionItem[]
}

export type SummarySegmentInput = {
  speakerRtcUid?: number
  speakerLabel?: string
  text: string
  isFinal: boolean
  timestamp?: number
}

export const EMPTY_MEETING_SUMMARY: MeetingSummary = {
  summary: 'No transcript content is available yet.',
  keyPoints: [],
  decisions: [],
  actionItems: [],
}
