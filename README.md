# Onemail

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/justbishwash-ctrl/onemail)


A production-grade Gmail client built on Cloudflare's edge infrastructure.
Connect multiple Google accounts and switch between them on the fly — all
from one clean interface.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Rich editor | Tiptap |
| Backend | Cloudflare Workers + Hono router |
| Database | Cloudflare D1 (SQLite at edge) |
| Sessions | Cloudflare KV |
| Attachments | Cloudflare R2 |
| Email | Gmail API (OAuth 2.0) |
| Deployment | Cloudflare Pages (frontend) + Workers (API) |

## Features

- Sign in with Google — first account becomes primary
- Add unlimited additional Gmail accounts from the same portal
- Switch active account instantly without re-signing in
- Full thread view with expandable messages
- Compose with rich text (bold, italic, lists), attachments, CC/BCC
- Auto-save drafts every 30 seconds
- Archive, trash, star, label threads and messages
- Email open tracking with 1×1 pixel — IP hashed, never stored raw
- Full-text Gmail search
- Keyboard shortcuts (j/k navigate, c compose, e archive, ...)
- Command palette (Cmd+K)
- Light / dark / system theme
- Configurable density

## Local development

### Prerequisites

- Node.js 20+
- A Cloudflare account (free tier works)
- Google Cloud project with Gmail API enabled

### First-time setup

```bash
git clone https://github.com/your-org/onemail
cd onemail

# Provision Cloudflare resources and install deps
bash scripts/setup.sh
```

Then edit `apps/worker/.dev.vars` with your Google OAuth credentials.
See [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md) for the full walkthrough.

### Start dev servers

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Worker API: http://localhost:8787

Vite proxies `/auth`, `/api`, and `/t` to the Worker, so you only open
the frontend URL.

### Run migrations locally

```bash
npm run db:migrate:local
```

## Deployment

### Option A — GitHub (recommended)

1. Fork this repo
2. Add GitHub Actions secrets (see [GOOGLE_OAUTH_SETUP.md](./GOOGLE_OAUTH_SETUP.md))
3. Push to `main` — the workflow deploys automatically

### Option B — manual

```bash
# Set env vars for your secrets, then:
bash scripts/deploy.sh
```

## Project structure

```
onemail/
├── apps/
│   ├── web/               # React frontend (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── compose/     # ComposeWindow
│   │   │   │   ├── inbox/       # ThreadList, MessagePane
│   │   │   │   ├── layout/      # Sidebar, CommandPalette, ToastContainer
│   │   │   │   ├── settings/    # SettingsLayout (account/appearance/privacy/shortcuts)
│   │   │   │   └── tracking/    # TrackingDashboard
│   │   │   ├── hooks/           # useKeyboard, useTheme
│   │   │   ├── pages/           # InboxPage, TrackingPage, SettingsPage, Login, AuthError
│   │   │   ├── services/        # api.ts — typed fetch client
│   │   │   ├── store/           # Zustand global state
│   │   │   ├── types/           # Gmail types
│   │   │   └── utils/           # cn, format
│   │   └── public/
│   │       ├── _headers         # Cloudflare Pages security headers
│   │       └── _redirects       # SPA + API proxy rules
│   └── worker/            # Cloudflare Worker (Hono API)
│       └── src/
│           ├── db/              # D1 query helpers
│           ├── middleware/       # auth, security headers, rate limit
│           ├── routes/          # auth, me, threads, messages, labels, search, tracking
│           ├── services/
│           │   ├── gmail/       # client, mime builder, html sanitizer
│           │   ├── oauth/       # google token exchange, session management
│           │   └── tracking/    # tracking pixel logic
│           ├── types/           # Env bindings, Gmail types
│           └── utils/           # crypto (AES-256-GCM), id generator, response helpers
├── migrations/            # D1 SQL migrations
├── scripts/               # setup.sh, deploy.sh
└── .github/workflows/     # CI/CD deploy.yml
```

## Security

- OAuth tokens encrypted with AES-256-GCM before D1 storage
- Sessions split between KV (fast) + D1 (audit)
- HttpOnly, SameSite=Lax, Secure cookies
- CSRF protection on OAuth state via KV one-time token
- IP addresses hashed (SHA-256) in tracking — never stored raw
- Email HTML sanitized server-side (sanitize-html) + client-side (DOMPurify)
- CSP, HSTS, X-Frame-Options, X-Content-Type-Options headers
- KV-based rate limiting on OAuth callback and tracking pixel endpoints
- Refresh tokens preserved through UPSERT; empty string = keep existing

## Keyboard shortcuts

| Key | Action |
|---|---|
| `c` | Compose new email |
| `/` | Focus search |
| `j` / `k` | Next / previous thread |
| `e` | Archive thread |
| `s` | Star / unstar |
| `r` | Reply |
| `a` | Reply all |
| `f` | Forward |
| `Shift+i` | Mark read |
| `Shift+u` | Mark unread |
| `Escape` | Close pane |
| `Cmd+K` | Command palette |
| `?` | Show shortcuts |

## License

MIT
