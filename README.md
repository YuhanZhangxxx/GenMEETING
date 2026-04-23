# MeetAI

AI-powered meeting scheduling assistant. Three-surface system: **Next.js web app**, **Expo (React Native) iOS app**, and **two interchangeable backends** (Next.js API routes and a parallel FastAPI service) sharing a single SQLite database.

---

## Architecture overview

```
                          ┌─────────────────────────────────────┐
                          │              SQLite                 │
                          │      prisma/prisma/dev.db           │
                          └─────▲───────────────────────┬───────┘
                                │                       │
                                │ (shared schema)       │
                                │                       │
               ┌────────────────┴────────┐   ┌──────────┴──────────┐
               │  Next.js 14 (port 3000) │   │  FastAPI (port 8000)│
               │  src/app/api/*          │   │  backend-py/routes/ │
               │  NextAuth + Prisma (TS) │   │  Prisma Python      │
               └──────────┬──────────────┘   └──────────┬──────────┘
                          │                             │
                cookie session                  Bearer JWT (jose)
                          │                             │
                          ▼                             ▼
                  ┌───────────────┐             ┌───────────────┐
                  │   Web UI      │             │   iOS app     │
                  │   (Next.js)   │             │   (Expo)      │
                  └───────────────┘             └───────────────┘
```

Web app authenticates with NextAuth cookies. Mobile app authenticates with a Bearer JWT signed using the **same `NEXTAUTH_SECRET`** — tokens are interchangeable between the two backends. The backend choice is a mobile env-var flip (`EXPO_PUBLIC_API_URL` → `:3000` or `:8000`).

---

## Tech stack — what each piece does

### Web front-end (`src/`)
| Tech | Version | Role |
|---|---|---|
| **Next.js** | 14 (App Router) | Full-stack framework. Serves the web UI (`src/app/*/page.tsx`) and exposes the backend API routes (`src/app/api/*/route.ts`) from the same process. |
| **React** | 18 | UI components. |
| **TypeScript** | 5, `strict: true` | Types for the whole codebase. |
| **Tailwind CSS** | 3.4 | Styling. Utility classes only; no CSS modules. |
| **NextAuth** | 4.24 | Web OAuth flow against Google + Microsoft; database-backed sessions stored in `User`/`Account`/`Session` tables. |
| **@auth/prisma-adapter** | 2.x | Wires NextAuth persistence into Prisma. |

### Mobile app (`mobile/`)
| Tech | Version | Role |
|---|---|---|
| **Expo SDK** | 54 | Managed RN workflow — runs in Expo Go without a native build step. |
| **React Native** | 0.81 + React 19 | Native rendering layer. |
| **Expo Router** | 6 | File-based routing (`mobile/app/`). Matches Next.js App Router convention. Tabs: Home, Calendar, Find Time, Settings. |
| **expo-auth-session** | 7 | OAuth flow for Google (iOS client ID) and Microsoft. |
| **expo-secure-store** | 15 | Encrypted storage for the app's JWT + user profile. |
| **@react-native-community/datetimepicker** | 8.4.4 | Native date / time picker for the "New Meeting" modal. |
| **@expo/vector-icons** (Ionicons) | 15 | Icon set. |
| **date-fns** | 3 | Date arithmetic, timezone-aware formatting. |

### Backend — option A: Next.js API routes (`src/app/api/`)
| Tech | Role |
|---|---|
| **Next.js Route Handlers** | `async function GET/POST(req)` for every endpoint. |
| **Prisma Client** (JS, v5.22) | Typed DB access for Node runtime. |
| **jose** | Signs & verifies the mobile Bearer JWT (`src/lib/mobile-auth.ts`). |
| **googleapis** | Google Calendar v3 client (`src/lib/google-calendar.ts`). |
| **@microsoft/microsoft-graph-client** | Outlook calendar via Graph API (`src/lib/microsoft-calendar.ts`). |
| **openai** (Node SDK) | `gpt-4o-mini` only, for the AI advisor (`src/app/api/ai-advisor/route.ts`). |

A helper `getAnySession(req)` in `src/lib/get-session.ts` accepts either the NextAuth cookie OR a Bearer JWT — every API route uses it so both web and mobile can call it.

### Backend — option B: FastAPI (`backend-py/`)
| Tech | Version | Role |
|---|---|---|
| **FastAPI** | 0.115 | ASGI web framework. Pydantic-based request/response validation, auto-generated Swagger at `/docs`. |
| **Uvicorn** | 0.32 | ASGI server. |
| **Prisma Client Python** | 0.15 | Connects to the **same `prisma/prisma/dev.db`** file Next.js uses. Schema at `backend-py/prisma/schema.prisma` mirrors the main one. |
| **python-jose** | 3.3 | JWT sign/verify with the same HS256 secret as the Next.js side — tokens issued by either backend work on both. |
| **httpx** | 0.27 | Async HTTP client — used for Microsoft Graph REST calls and Google userinfo lookup. |
| **google-api-python-client** + **google-auth** | Official Google libs for Calendar v3 operations. |
| **openai** (Python SDK) | 1.54 | Same `gpt-4o-mini` prompt as Node side. |
| **python-dotenv** | For loading `.env`. |
| **tzdata** | IANA timezone database for Windows (Python stdlib relies on it for `ZoneInfo`). |

Layout:
```
backend-py/
├── main.py              # FastAPI app + CORS + global exception handler
├── db.py                # Prisma singleton + lifespan hook
├── auth/
│   ├── jwt_utils.py     # sign_mobile_jwt / verify_mobile_jwt
│   └── deps.py          # require_user / optional_user (FastAPI Depends)
├── services/
│   ├── google_calendar.py     # list / create / patch / rsvp / delete
│   ├── microsoft_calendar.py  # Graph REST equivalents
│   └── scheduling_engine.py   # pure-function slot scorer (port of scheduling-engine.ts)
├── routes/
│   ├── auth.py                # POST /mobile-token, GET /connected-accounts
│   ├── calendar.py            # GET /events (with 5 min cache), POST /create-event
│   ├── meetings.py            # /{id}/respond, /cancel, /reschedule
│   ├── recommendations.py     # GET /recommendations?duration=N
│   ├── ai_advisor.py          # GET /ai-advisor (gpt-4o-mini)
│   ├── preferences.py         # GET / POST user preferences
│   ├── notifications.py       # GET list / PATCH mark read
│   └── contacts.py            # GET favorites
└── prisma/schema.prisma       # duplicate of root schema with Python generator
```

### Data layer — `prisma/`
| Tech | Role |
|---|---|
| **Prisma** | ORM + migrations tool. Schema in `prisma/schema.prisma`. |
| **SQLite** | Embedded DB at `prisma/prisma/dev.db`. Zero-config for dev; both backends read/write the same file. |

Key models: `User`, `Account`, `Session`, `CalendarEventCache` (5-min TTL of Google/Outlook data), `MeetingPreference`, `RescheduleHistory`, `ChangeRequest`, `FavoriteContact`, `Notification`.

### AI
| Tech | Role |
|---|---|
| **OpenAI `gpt-4o-mini`** | Used only by the AI Advisor endpoint. Returns JSON-formatted reschedule / RSVP / cancel / conflict / info suggestions. **Cost constraint: do not upgrade the model.** |

### External integrations
- **Google Calendar** — OAuth2 (web + iOS client IDs). Reads/writes user's primary calendar; auto-adds Google Meet links.
- **Microsoft Graph** (Outlook) — OAuth2 delegated scopes (`Calendars.ReadWrite`). Creates Teams online meetings.

### Dev tooling
| Tech | Role |
|---|---|
| **ESLint** | Linting (Next.js preset). |
| **PostCSS** | Tailwind build. |
| **Babel** | Expo transpiler. |
| **TypeScript `tsc --noEmit`** | Type-checks both `src/` (root tsconfig excludes `mobile/`) and `mobile/` (own tsconfig). |

---

## Repository layout

```
AImeeting/
├── src/                          # Next.js web app + API routes
│   ├── app/
│   │   ├── api/                  # 13 route handlers (web + mobile via getAnySession)
│   │   ├── dashboard/            # Web dashboard UI
│   │   ├── settings/             # Web settings UI
│   │   └── login/
│   ├── components/               # 16 React components (CalendarView, WeekCalendarView,
│   │                             # MonthCalendarView, AIAdvisor, RecommendationList, …)
│   ├── lib/                      # auth, prisma, google-calendar, microsoft-calendar,
│   │                             # scheduling-engine, get-session, mobile-auth
│   └── types.ts
├── mobile/                       # Expo iOS app
│   ├── app/                      # Expo Router screens
│   │   ├── (tabs)/               # Home, Calendar (list/week/month), Find Time, Settings
│   │   ├── event/[id].tsx        # Event detail
│   │   ├── login.tsx
│   │   └── _layout.tsx           # Auth gate + providers
│   ├── components/               # CreateEventModal with date/time picker + attendees
│   ├── store/                    # AuthProvider, EventsProvider (React Context)
│   ├── lib/api.ts                # Bearer-JWT HTTP client
│   └── constants/colors.ts
├── backend-py/                   # FastAPI — see layout above
├── prisma/
│   ├── schema.prisma             # Source of truth
│   └── prisma/dev.db             # SQLite file (shared by both backends)
├── .claude/CLAUDE.md             # Project rules for Claude Code
└── README.md
```

---

## Running locally

You need **three terminals** to run the full stack (web + mobile + FastAPI).

### Prereqs
- Node 20+, Python 3.12+, Expo Go on your phone (same WiFi).
- `.env.local` at the repo root with OAuth client IDs + `NEXTAUTH_SECRET` + `OPENAI_API_KEY`.
- `backend-py/.env` with the same `NEXTAUTH_SECRET` (required — JWT interop) and provider credentials.
- `mobile/.env.local` with `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:<port>`, Google iOS client ID.

### Terminal 1 — Next.js (web + its API)
```bash
npm install
npx prisma generate
npx prisma db push          # creates prisma/prisma/dev.db if missing
npm run dev                 # :3000
```

### Terminal 2 — FastAPI (optional parallel Python backend)
```bash
cd backend-py
python -m venv .venv
.venv\Scripts\activate       # or source .venv/bin/activate on macOS
pip install -r requirements.txt
PYTHONUTF8=1 PATH="$PWD/.venv/Scripts:$PATH" \
  python -m prisma generate --schema=prisma/schema.prisma
python -m uvicorn main:app --port 8000 --host 0.0.0.0
```
Visit [http://localhost:8000/docs](http://localhost:8000/docs) for Swagger.

### Terminal 3 — Expo (mobile)
```bash
cd mobile
npm install --legacy-peer-deps
npx expo start --lan
```
Scan the QR with Expo Go on your phone.

Point the mobile app at whichever backend you want by editing `mobile/.env.local`:
- `EXPO_PUBLIC_API_URL=http://<LAN-IP>:3000` → Next.js backend
- `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000` → FastAPI backend

Both serve the same JWTs, same data, same behaviour.

---

## API surface (both backends)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/mobile-token` | Exchange a Google / Microsoft access token for an app JWT |
| GET | `/api/auth/connected-accounts` | Which providers the user has linked |
| GET | `/api/calendar/events` | List next-14-day events (Google + Outlook), 5-min cache |
| POST | `/api/calendar/create-event` | Create event (optionally with Google Meet / Teams link) |
| POST | `/api/meetings/{id}/respond` | RSVP accepted / declined / tentative |
| POST | `/api/meetings/{id}/cancel` | Cancel meeting |
| POST | `/api/meetings/{id}/reschedule` | Move to new time + fan-out notifications |
| GET | `/api/recommendations?duration=N` | Scored available slots |
| GET | `/api/ai-advisor` | GPT-4o-mini suggestions |
| GET / POST | `/api/preferences` | Scheduling preferences |
| GET / PATCH | `/api/notifications` | List / mark read |
| GET | `/api/contacts` | Favorite contacts |

---

## Notes / known limits

- Google access tokens expire in 1 hour. Web OAuth and iOS OAuth clients issue separate refresh tokens that cannot be refreshed with each other's credentials — if only the mobile login is used, the user re-signs-in hourly. Browser-side login via Next.js issues a refresh-token the backend can use for continuous refresh.
- `/api/stats` is a DB smoke-test endpoint with no auth — for dev only.
- Two Next.js API routes (`calendar/update-event`, `change-requests/[id]/respond`, `meetings/[id]/request-change`) still use `getServerSession` directly and are not ported to the FastAPI side yet; the mobile app doesn't call them.
- `.env.local`, `backend-py/.env`, `mobile/.env.local` and any `*.apps.googleusercontent.com.json` must never be committed.
