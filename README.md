# Agora call demo

Scaffold for a Next.js demo: Agora RTC, Real-Time STT, transcript UI, and AI meeting notes.

## Run locally

```bash
cp .env.local.example .env.local
# Fill in secrets, then:
npm install
npm run dev
```

Open http://localhost:3000 .

## Scripts

| Command           | Purpose              |
|-------------------|----------------------|
| `npm run dev`     | Dev server           |
| `npm run build`   | Production build     |
| `npm run start`   | Serve production build |
| `npm run typecheck` | `tsc --noEmit`   |

## Environment

Server-side configuration is validated on demand via `lib/env.ts` (see PLAN.md checkpoint 2+). Copy `.env.local.example` to `.env.local` and fill values before calling API routes.

## Repo layout (growing)

- `app/` — App Router UI and API routes (added in later checkpoints).
- `lib/` — Providers and helpers (`lib/env.ts` today).
