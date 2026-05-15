Input → Output → Entities → Flow → What to skip

INPUT

From user:
Channel name
Display name
Join
Leave
Start transcription
Stop transcription
Generate summary

From browser:
Microphone stream
Camera stream

From server env:
AGORA_APP_ID
AGORA_APP_CERTIFICATE
AGORA_CUSTOMER_KEY
AGORA_CUSTOMER_SECRET
AGORA_STT_REGION or STT endpoint
OPENAI_API_KEY

OUTPUT

Core app:
A local web demo where two browser tabs can join the same Agora RTC video call.
The app can start and stop Agora Real Time STT for the call.
The app can display transcript text from the call.
The app can generate structured meeting notes from the transcript.

Required deliverables:
Source code
README
3 to 5 minute demo video
WRITEUP.md covering implementation approach, AI tools used, representative prompts, where AI helped, where AI was wrong or incomplete, and one major technical issue with debugging process.

Bonus only if core flow works:
Download transcript and summary as JSON.
Better timestamps.
Better speaker labels.
Extra failure toasts.

ENTITIES

MeetingSession:
channelName, localUid, displayName, joined, startedAt

SDK managed RTC users:
LocalUser and RemoteUser are handled through Agora React SDK hooks, not custom domain models.

AgoraRtcToken:
appId, channelName, uid, token, expiresAt

SttAgent:
agentId, builderToken, channelName, status, regionOrEndpoint, subBotUid, pubBotUid

TranscriptSegment:
id, speakerRtcUid, speakerLabel, text, isFinal, timestamp

MeetingSummary:
summary, keyPoints, decisions, actionItems

FLOW

1. User enters channel name and display name.

2. Client calls Next.js API route to request an Agora RTC token.

3. Server generates the RTC token using Agora App ID and App Certificate.

4. Client joins the Agora RTC channel using Agora React SDK.

5. Client publishes microphone and camera.

6. Client renders local video and remote users. STT bot UIDs are filtered out from participant UI.

7. User clicks Start Transcription.

8. Client calls Next.js API route to start Agora Real Time STT.

9. Server follows Agora STT REST lifecycle:
   acquire builder token
   start STT agent for the current channel
   configure STT bot UIDs and language settings according to Agora docs
   store agent id and builder token in memory for the demo

10. Client shows STT status as starting, running, failed, or stopped.

11. STT bot joins the same Agora channel and publishes transcript messages according to the configured STT mode.

12. Client listens for Agora stream messages.

13. Client parses STT transcript messages using the official Agora STT parse data docs. This is the highest risk milestone.

14. Client appends final transcript segments to local transcript state and handles partial messages minimally.

15. User clicks Generate Summary.

16. Client sends transcript to Next.js summary API route.

17. Server calls OpenAI through a TypeScript summary service and requests structured JSON.

18. UI renders structured meeting notes:
summary
key points
decisions
action items

19. User leaves the call.

20. Client first calls the server to stop the STT agent, then stops local tracks and leaves the Agora channel. Add best effort cleanup on page unload if time allows.

WHAT TO SKIP

Skip auth.
Skip accounts.
Skip database persistence.
Skip deployment.
Skip advanced participant management.
Skip perfect speaker diarization.
Skip mobile support.
Skip cloud recording.
Skip token refresh.
Skip full test suite.
Skip complex UI polish.
Skip download JSON unless core flow works first.
Skip open questions in the summary for v1.

ASSUMPTIONS

Use Next.js App Router and TypeScript.
Use Agora React SDK for the browser video call.
Use Next.js API routes for token generation and STT lifecycle.
Use local React state for transcript and summary.
Use in memory server storage for STT agent id and builder token, and document this as a demo tradeoff.
Use OpenAI gpt 4o mini or similar small model for structured summary JSON.
Optimize for a working two tab local demo.