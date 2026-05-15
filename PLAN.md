# PLAN.md

Smallest end-to-end Agora RTC + Real-Time STT + AI summary demo. Built in checkpoints. Each checkpoint is shippable on its own.

**STT REST:** This plan targets **Agora Real-Time STT v7.x** (`join` / query `get` / `leave` / `list`) with **HTTP Basic Auth** (`AGORA_CUSTOMER_KEY` / `AGORA_CUSTOMER_SECRET`). There is **no builder token** in v7 for this flow.

---

## Required product behavior (from INSTRUCTIONS.md)

1. Two browser tabs can join the same Agora RTC video call.
2. App can start and stop Agora Real-Time STT for that call.
3. App displays transcript text from the call.
4. App can generate structured meeting notes from the transcript.
5. Deliverables: source code, README, 3–5 min demo video, WRITEUP.md.

## Repo conventions to follow

- Next.js App Router + TypeScript.
- API routes under `app/api/*/route.ts`. Keep them thin.
- Provider/business logic in `lib/` (e.g. `lib/agora`, `lib/stt`, `lib/summary`).
- Local React state for UI. In-memory `Map` on the server for STT agent state.
- All Agora customer key/secret and OpenAI key stay server side via `.env.local`.
- No new dependencies beyond: `agora-rtc-react`, `agora-rtc-sdk-ng`, `agora-token`, `openai`, `zod` (only if needed).

**v7 REST reference (official):** [join](https://docs.agora.io/en/real-time-stt/rest-api/v7.x/join) · [query](https://docs.agora.io/en/real-time-stt/rest-api/v7.x/query) · [leave](https://docs.agora.io/en/real-time-stt/rest-api/v7.x/leave) · [update](https://docs.agora.io/en/real-time-stt/rest-api/v7.x/update) · [list](https://docs.agora.io/en/real-time-stt/rest-api/v7.x/list) — `update` is optional for this demo; not implemented unless late-joiner subscription refresh is required.

## Backend data flow

`Client → GET /api/rtc/token?channel=&uid= → { appId, token, uid, expiresAt }`

`Client → POST /api/stt/start { channel, subscribeRtcUids? } → server POST …/join (v7) with rtcConfig (channelName, bot RTC token for pub+sub same UID), optional subscribeAudioUids → store in memory Map<channel, { agentId, subBotUid, pubBotUid }> → { agentId, status, channel, subBotUid, pubBotUid }`

`Client → GET /api/stt/status?agentId= → server resolves agentId to channel via in-memory map only, then GET …/agents/{agentId} (v7 query) → { agentId, status, createTs, channel, subBotUid, pubBotUid }`

`Client → POST /api/stt/stop { channel } → leave via POST …/agents/{agentId}/leave; if no in-memory row, GET …/agents?channel=&state=2 (list RUNNING) and leave each match → delete row when present`

`Client → POST /api/summary { transcript } → OpenAI structured JSON → return MeetingSummary` *(Checkpoint 7)*

## Frontend data flow

`Lobby form → setMeetingSession → fetch RTC token → AgoraRTCProvider join → publish mic+cam → render local + remote (filter STT bot UIDs)`

`Start Transcription → POST /api/stt/start` with `subscribeRtcUids` (local + remote RTC UIDs as integers; omit empty so Agora defaults apply) `→` on success keep `{ agentId, subBotUid, pubBotUid }` in client state `→` `useClientEvent(..., 'stream-message', …)` only from bot UID(s) `→` `parseSttStreamPayload` (protobuf `Text` / JSON fallback) `→` `useTranscript` merges finals + partials per speaker `→` `TranscriptPanel`

`Generate Summary → POST /api/summary with segments → render MeetingSummary panel` *(Checkpoint 7)*

`Leave → best-effort POST /api/stt/stop { channel } → clear local STT session → unpublish + leave channel`

## Minimum viable scope

- One single page at `/` with lobby → call view → transcript panel → summary panel.
- Two tabs, same channel, join works, audio+video flows, STT shows transcript, summary renders.

## Skip unless time remains

JSON download, polished UI, speaker diarization beyond raw UID, toasts, page-unload cleanup hardening, token refresh, mobile, persistence, auth, deploy, tests beyond smoke, **v7 `update`** (refresh `subscribeAudioUids` when remote users join after STT start).

## Risky assumptions to confirm

1. **STT stream-message payload shape** (protobuf `Text` vs JSON `transcript` wrapper). Confirm via raw log dump in Checkpoint 5 before parsing. **`enableJsonProtocol: true`** on `join` would send gzip-compressed JSON; this app does not set it and the parser assumes protobuf / plain JSON fallback only.
2. **STT bot UIDs**: v7 uses one RTC user for sub+pub; `subBotUid` and `pubBotUid` are the same number. Exclude both from the participant grid and use both in the stream-message filter for SDK quirks.
3. **STT region/endpoint**: Base URL from `AGORA_STT_REGION` (`global` / `default` → `https://api.agora.io`, or `https://api-{region}.agora.io`, or full `https://…` override). Wrong region → REST failures.
4. **subscribeAudioUids**: v7 `join` expects numeric string UIDs when set; `"all"` was rejected in practice on `join` (use explicit UIDs from the browser; optional **`update`** + `["all"]` is documented separately).
5. **RTC token UID type**: int throughout token + join + STT `rtcConfig` string forms of those ints.
6. **Customer key/secret**: STT REST uses **Basic** auth, not bearer.
7. **In-memory store**: `/api/stt/status` and idempotent behaviors assume the same Node process; **`list`** on stop mitigates orphaned agents after dev restart when the map was cleared.

---

## Checkpoint 1 — Scaffold + env

**Goal**: Working Next.js TS app, env wiring, empty page renders.
**Files**: `package.json`, `next.config.ts`, `tsconfig.json`, `app/layout.tsx`, `app/page.tsx`, `.env.local.example`, `.gitignore`, `README.md` (stub), `lib/env.ts`.
**Behavior**: `npm run dev` serves `/`. `lib/env.ts` validates required keys at request time (not module load). STT subset: `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_KEY`, `AGORA_CUSTOMER_SECRET`, `AGORA_STT_REGION`.
**Verify**: `npm run dev` boots; visiting `/` loads; `npm run build` or `tsc --noEmit` clean.

## Checkpoint 2 — RTC token route

**Goal**: `/api/rtc/token` returns valid Agora RTC token.
**Files**: `app/api/rtc/token/route.ts`, `lib/agora/token.ts`.
**Behavior**: GET with `?channel=&uid=` returns `{appId, token, uid, expiresAt}` using `agora-token` `RtcTokenBuilder.buildTokenWithUid`, role publisher, 1h TTL.
**Verify**: `curl /api/rtc/token?channel=test&uid=1234` returns non-empty token; happy path + missing-channel 400 case.

## Checkpoint 3 — Two-tab RTC join/leave

**Goal**: Two browser tabs join same channel, see/hear each other.
**Files**: `app/page.tsx`, `components/Lobby.tsx`, `components/CallRoom.tsx`, `components/VideoTile.tsx`, `lib/agora/client.ts`.
**Behavior**: Lobby collects channel + display name → fetch token → `AgoraRTCProvider` + `useJoin` + `usePublish(localMic, localCamera)` + `useRemoteUsers` grid. Leave button stops tracks + leaves.
**Verify**: Open two tabs (chan = `demo`, uids `1001` and `1002`), confirm bidirectional A/V. Edge: refresh one tab, other tab sees user-left then user-joined.

## Checkpoint 4 — STT start/status/stop routes (v7)

**Goal**: Server can start a Real-Time STT agent (`join`), query status (`GET …/agents/{agentId}`), stop (`leave`), and recover when local state is missing (`list` + `leave`).

**Files**: `app/api/stt/start/route.ts`, `app/api/stt/status/route.ts`, `app/api/stt/stop/route.ts`, `lib/stt/agora.ts` (v7 HTTP client: `joinSttAgent`, `getSttAgent`, `leaveSttAgent`, `listRunningSttAgentIdsForChannel`), `lib/stt/store.ts` (in-memory `Map<channel, { agentId, subBotUid, pubBotUid }>`), `lib/stt/channel.ts` (validate `channel`, optional `subscribeRtcUids`).

**Behavior**:

- `POST /api/stt/start` body: `{ channel: string, subscribeRtcUids?: number[] }`. Server picks random bot UID in `[1, 2^32-1]`, builds RTC publisher token for that UID, calls **`POST …/projects/{appId}/join`** with `rtcConfig` (and `subscribeAudioUids` only when `subscribeRtcUids` is non-empty). Persists `agentId` + bot UIDs keyed by `channel`.
- If a row already exists for `channel`: **`getSttAgent`**; if **404** or status **STOPPED** / **FAILED**, clear row and **join** again; if **RUNNING** (etc.), return existing ids (idempotent). Other **get** errors → non-2xx JSON error.
- `GET /api/stt/status?agentId=` only if `agentId` is known to **this server’s** map (`findChannelByAgentId`); then proxies Agora **get**.
- `POST /api/stt/stop` body: `{ channel }`. **`leave`** using stored `agentId`; if no row, **`list`** `channel` + `state=RUNNING` and **`leave`** each listed `agent_id`.

**Verify**: With a live RTC call, `curl` `POST /api/stt/start` returns 200 + `agentId` + bot UIDs; `GET /api/stt/status?agentId=…` returns status when that agent was started on this process; `POST /api/stt/stop` returns 200 and store row cleared. Edge: second **start** for same channel while agent still healthy returns same agent without a second **join**. Edge: after dev server restart, **stop** can still tear down a RUNNING agent on that channel via **list**.

## Checkpoint 5 — Raw STT stream-message logging (HIGHEST RISK)

**Goal**: Confirm what shape STT messages actually arrive in. No parsing commitment yet.

**Files**: `components/CallRoom.tsx` (`useClientEvent(client, 'stream-message', …)`), `lib/stt/debug.ts`.

**Behavior**: When STT is active, stream-messages from the STT bot UID(s) log payload metadata in **development** (e.g. length / hex / base64 helper). Non-bot UIDs ignored.

**Verify**: Speak in one tab; confirm messages from STT bot UID. Save 2–3 sample payloads for Checkpoint 6. **Stop here and inspect before locking parser details.** Edge: two tabs + bot in channel — only bot payloads are ingested for logging.

## Checkpoint 6 — STT parsing + transcript UI

**Goal**: Render live transcript.

**Files**: `lib/stt/parse.ts`, `components/TranscriptPanel.tsx`, `hooks/useTranscript.ts` (wired from `components/CallRoom.tsx`).

**Behavior**: Parse stream payload into `TranscriptSegment { id, speakerRtcUid, speakerLabel, text, isFinal, timestamp }`. Append finals; replace last partial per `speakerRtcUid`. Scrolling list: `Speaker {uid}: text`.

**Verify**: Two tabs talking → transcript updates in near real time. Edge: partial then final collapses to one final line per utterance pattern. Edge: STT stopped mid-call → transcript freezes, no throw. Optional: `npm test` runs `scripts/stt-parse-smoke.ts` (offline parse smoke).

## Checkpoint 7 — Summary route + notes UI

**Goal**: Generate structured meeting notes.

**Files**: `app/api/summary/route.ts`, `lib/summary/openai.ts`, `components/SummaryPanel.tsx`.

**Behavior**: POST `{segments}` → OpenAI `gpt-4o-mini` with `response_format: json_schema` → returns `MeetingSummary`. UI shows panel with sections.

### Checkpoint 7.1 — Summary contract

**Goal**: Define one stable summary shape used by the API, OpenAI helper, and UI.

**Files**: `lib/summary/types.ts` (or colocated export in `lib/summary/openai.ts` if keeping the footprint small).

**Contract**:

```ts
type MeetingSummary = {
  summary: string
  keyPoints: string[]
  decisions: string[]
  actionItems: {
    owner?: string
    task: string
    dueDate?: string
  }[]
}
```

**Verify**: Empty, successful, and error-adjacent cases all preserve this shape when a summary is returned. No UI code depends on undocumented fields.

### Checkpoint 7.2 — Input validation + transcript normalization

**Goal**: Accept only usable transcript data and send a compact transcript to the model.

**Files**: `app/api/summary/route.ts`, `lib/summary/openai.ts`.

**Behavior**:

- Route accepts `POST { segments }`.
- `segments` must be an array; malformed bodies return `400`.
- Only final lines (`isFinal === true`) are summarized.
- Empty / whitespace-only text is ignored.
- Transcript is normalized to lines like `Speaker 1001: text`.
- Very large transcripts are capped before calling OpenAI.

**Verify**: Malformed request returns `400`; partial-only transcript returns the friendly empty-state object; normal mocked transcript produces normalized input without raw segment noise.

### Checkpoint 7.3 — Empty transcript behavior

**Goal**: Empty input is a valid state, not a server error.

**Files**: `app/api/summary/route.ts`, `lib/summary/openai.ts`, `components/SummaryPanel.tsx`.

**Behavior**: If there are no usable final transcript lines, return:

```json
{
  "summary": "No transcript content is available yet.",
  "keyPoints": [],
  "decisions": [],
  "actionItems": []
}
```

**Verify**: UI renders the empty summary gracefully; no OpenAI call is made for empty normalized transcript.

### Checkpoint 7.4 — OpenAI structured output helper

**Goal**: Keep model-specific logic isolated and deterministic.

**Files**: `lib/summary/openai.ts`.

**Behavior**:

- Uses server-side `OPENAI_API_KEY`.
- Uses `gpt-4o-mini` and structured JSON schema output.
- Prompt says: use only the transcript; do not invent decisions, owners, due dates, or action items.
- Temperature is low.
- Helper normalizes or rejects unexpected model output before returning to the route.

**Verify**: Mocked two-speaker transcript returns non-empty `summary` and useful arrays. Transcript with no explicit decisions/action items returns empty arrays for those sections.

### Checkpoint 7.5 — Route-level API verification

**Goal**: Prove `/api/summary` works without Agora or live STT.

**Files**: `app/api/summary/route.ts`, optional `scripts/summary-smoke.ts`.

**Verify with fixtures**:

- Empty transcript fixture.
- Normal two-speaker meeting fixture with clear decisions/action items.
- Messy transcript fixture with filler, repeats, partials, and no clear owner for at least one task.

**Pass condition**: All responses are valid `MeetingSummary` objects; bad request returns `400`; OpenAI/API errors return useful non-2xx JSON, not an unhandled exception.

### Checkpoint 7.6 — Summary panel UI states

**Goal**: Make summary generation usable and demo-safe.

**Files**: `components/SummaryPanel.tsx`, `components/CallRoom.tsx`.

**Behavior**:

- Idle state before generation.
- Loading state while request is in flight.
- Success state with Summary, Key Points, Decisions, Action Items.
- Error state with retry path.
- Generate button disabled while loading.
- Generate button uses current transcript `displayLines`.

**Verify**: UI behaves correctly with empty transcript, mocked transcript, route error, and successful response.

### Checkpoint 7.7 — End-to-end summary verification

**Goal**: Confirm summary works with the real transcript path.

**Verify**: After a short two-tab call, start STT, speak, confirm transcript lines render, stop STT, click Generate Summary, and get structured notes within ~10s.

**Done definition**:

- `npm run typecheck` passes.
- Any summary smoke script passes if added.
- `/api/summary` works with mocked `curl` payloads.
- UI can generate from current transcript.
- Empty transcript returns the friendly empty-state object.
- Model output does not invent owners/due dates when absent.

## Checkpoint 8 — README, WRITEUP.md, demo video

**Goal**: Submission-ready package.

**Files**: `README.md`, `WRITEUP.md`, `demo.mp4` (or link).

**README**: how to run (`.env.local` keys including v7 STT + RTC, `npm i`, `npm run dev`, two tabs), project structure, what works, known gaps (in-memory store, no `update`, etc.).

**WRITEUP**: implementation approach, AI tools used (Cursor/Claude), 3–5 representative prompts, where AI helped, where it was wrong (likely STT parsing), one major technical issue + debugging process (use Checkpoint 5 story); note **v6 builder token docs vs v7 implementation** if comparing older materials.

**Demo video (3–5 min)**: lobby → two tabs join → start STT → speak → transcript fills → stop STT → generate summary → leave.

**Verify**: Fresh clone + `.env.local` → follow README → full flow works end to end.

---

## Final debrief notes to preserve

- Why in-memory store for STT agent state: demo scope, single server instance, acceptable tradeoff. Production → Redis/DB keyed by channel.
- Why client-side STT parsing: Agora bot publishes via RTC stream-message; server has no socket. Tradeoff: parser logic lives in browser; offset by isolating in `lib/stt/parse.ts`.
- Why filter bot UIDs from participant grid: bots are RTC users too; silently exclude `subBotUid`/`pubBotUid`.
- Why structured JSON via OpenAI `json_schema`: deterministic shape for `SummaryPanel` without runtime validation gymnastics.
- Cleanup order on Leave: stop STT first (server), then unpublish + leave RTC. Otherwise STT bot stays in channel after user leaves.
- Token UIDs: use ints throughout, never mix with strings in app logic (Agora REST still uses string forms in JSON bodies).
- Highest-risk milestone is Checkpoint 5 (payload shape). Time-box and log raw bytes before writing the parser.
- v7 **join** returns `agent_id` (stored as `agentId`); no `builderToken`. REST host and Basic auth must match Agora console project.
