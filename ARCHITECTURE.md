# Architecture

This app is intentionally small: one Next.js App Router page, thin API routes, and provider logic isolated under `lib/`.

## System Overview

```mermaid
flowchart TB
  subgraph Client["Browser client"]
    Lobby["Lobby form"]
    RtcUi["CallRoom<br/>Agora RTC provider"]
    TranscriptUi["TranscriptPanel"]
    SummaryUi["SummaryPanel"]
    TranscriptState["useTranscript<br/>finals + partials"]
  end

  subgraph Api["Next.js API routes"]
    RtcToken["/api/rtc/token"]
    SttStart["/api/stt/start"]
    SttStatus["/api/stt/status"]
    SttStop["/api/stt/stop"]
    SummaryRoute["/api/summary"]
  end

  subgraph Lib["Server and shared libraries"]
    Token["lib/agora/token.ts"]
    SttHttp["lib/stt/agora.ts"]
    SttStore["lib/stt/store.ts"]
    SttParser["lib/stt/parse.ts"]
    SummaryHelper["lib/summary/openai.ts"]
  end

  AgoraRtc["Agora RTC channel"]
  AgoraStt["Agora Real-Time STT v7"]
  OpenAI["OpenAI structured summary"]

  Lobby --> RtcUi
  RtcUi --> RtcToken --> Token
  RtcUi <--> AgoraRtc
  RtcUi --> SttStart --> SttHttp --> AgoraStt
  SttStart --> SttStore
  RtcUi --> SttStatus --> SttHttp
  RtcUi --> SttStop --> SttHttp
  SttStop --> SttStore
  AgoraStt --> AgoraRtc
  AgoraRtc -- "stream-message" --> RtcUi
  RtcUi --> SttParser --> TranscriptState --> TranscriptUi
  TranscriptState --> SummaryUi --> SummaryRoute --> SummaryHelper --> OpenAI
```

## Runtime Data Flow

```mermaid
sequenceDiagram
  participant Browser as Browser tab
  participant TokenAPI as /api/rtc/token
  participant AgoraRTC as Agora RTC
  participant SttAPI as /api/stt/start
  participant SttREST as Agora STT v7 REST
  participant Parser as lib/stt/parse.ts
  participant SummaryAPI as /api/summary
  participant OpenAI as OpenAI

  Browser->>TokenAPI: Request RTC token for channel + uid
  TokenAPI-->>Browser: appId, token, uid, expiresAt
  Browser->>AgoraRTC: Join channel and publish mic/camera
  Browser->>SttAPI: Start STT with channel + subscribed RTC UIDs
  SttAPI->>SttREST: POST /join with bot RTC token
  SttREST-->>SttAPI: agent_id
  SttREST->>AgoraRTC: STT bot subscribes and publishes transcript messages
  AgoraRTC-->>Browser: stream-message payloads from STT bot UID
  Browser->>Parser: Decode protobuf or JSON payload
  Parser-->>Browser: TranscriptSegment
  Browser->>SummaryAPI: POST final transcript segments
  SummaryAPI->>OpenAI: Structured JSON schema summary request
  OpenAI-->>SummaryAPI: MeetingSummary JSON
  SummaryAPI-->>Browser: MeetingSummary
```

## Server State

```mermaid
flowchart LR
  Start["POST /api/stt/start"] --> Store["Map channel -> agentId, subBotUid, pubBotUid"]
  Status["GET /api/stt/status"] --> Lookup["findChannelByAgentId"]
  Stop["POST /api/stt/stop"] --> Stored{"Stored row?"}
  Stored -- yes --> LeaveStored["leave stored agent"]
  Stored -- no --> ListRunning["list running agents by channel"]
  ListRunning --> LeaveListed["leave each listed agent"]
  LeaveStored --> Delete["delete local row"]
  LeaveListed --> Done["return ok"]
  Lookup --> Store
```

The in-memory store is acceptable for a local demo because the app runs in one Node process. In production it should move to Redis or a database and include ownership/expiration semantics.

## Summary Contract

```mermaid
classDiagram
  class MeetingSummary {
    string summary
    string keyPoints
    string decisions
    SummaryActionItem actionItems
  }

  class SummaryActionItem {
    string owner
    string task
    string dueDate
  }

  MeetingSummary --> SummaryActionItem
```

The API returns the same shape for normal and empty transcript cases. Malformed requests return non-2xx JSON with an `error` field.
