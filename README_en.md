[한국어](README.md)

# hanimo-webui

hanimo-webui is an **open-source, self-hosted AI chat, admin runtime, and OpenAI-compatible API** built with Next.js 15.

The first public promise is chat, model server settings, user/role management, API tokens, and OpenAI-compatible APIs. Workflow / Screen / RAG / MCP surfaces are Labs or future plugin candidates, not core public-release promises.

> Public-readiness status: P0 RCE/SSRF-class gates are resolved on `main` by code-level checks.
> Before public release, rerun `test:workflow`, `test:screen-security`, API token/JWT checks, admin DB operation checks, and smoke checks. The honest claim is **P0 resolved + operational gates remain**, not "security complete."

---

## Key Features

| Feature | Description |
|---------|-------------|
| Multi-Model Chat | Connect Ollama, OpenAI-compatible, Gemini models simultaneously; select per room |
| Agents / Workflow / Screen | Labs or future plugin candidates. They are not the first stable public core promise |
| Draw (Canvas) | AI generates HTML visualizations with live preview (sandboxed iframe) |
| Custom Instruction | Per-room user-defined system prompts |
| OpenAI-Compatible API | `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/rerank` |
| Admin Panel | Users, models, model servers, logs, settings, analytics dashboard |
| DB Viewer | Admin database browser with search/sort/CRUD + column description tooltips |
| PII / Community / SSO | Labs or operational extension surfaces, not the first stable public core |
| Auth | Local login + JWT refresh tokens. SSO is an operational extension candidate |
| i18n | Full Korean / English support |
| Theming | Presets + custom colors, dark/light mode |

---

## Tech Stack

| Item | Version/Tool |
|------|-------------|
| Framework | Next.js 15.5.9 |
| Runtime | React 19.2.1 |
| Language | JavaScript (`app/` App Router, `jsconfig` aliases) |
| UI | shadcn/ui + Tailwind CSS v4 |
| Database | PostgreSQL 14+ / PostgreSQL 15 by Docker, raw SQL + `pg` |
| Auth | JWT + HttpOnly refresh token cookie |
| Charts | Recharts |
| Package Manager | npm |
| Default deployment | Docker Compose |

---

## Quick Start

### Official path: Docker one-command install

The only prerequisite is **Docker Desktop**. You do not need to install PostgreSQL locally.

```bash
git clone https://github.com/flykimjiwon/hanimo-webui.git
cd hanimo-webui
./scripts/install.sh
```

What the installer does:

| Step | Action |
|------|--------|
| Env file | Creates `.env`, generates a strong `JWT_SECRET`, applies `PORT` |
| Containers | Starts PostgreSQL 15 + the Next.js app with `docker compose up -d --build` |
| Bootstrap | Creates the DB schema and default admin account inside the app container |
| Verification | Runs smoke checks for public pages and protected API boundaries |

Open the app:

```bash
open http://localhost:3000
```

Initial admin account:

| Field | Value |
|-------|-------|
| Email | `HANIMO_ADMIN_EMAIL` in `.env` |
| Password | `HANIMO_ADMIN_PASSWORD` in `.env` |

`./scripts/install.sh` generates a strong initial password when `.env` is missing or still contains placeholder values. Change it after the first login.

Inspect the install:

```bash
./scripts/doctor.sh
./scripts/doctor.sh --json
```

### Local development path

Without Docker, install Node.js 20+ and PostgreSQL 14+. On macOS/Linux you can use the local installer:

```bash
./scripts/install-local.sh --no-start
npm run dev
```

On Windows, install PostgreSQL and Node.js 20+, then use:

```bash
npm install
copy .env.example .env
npm run setup-postgres
npm run create-admin
npm run dev
```

Open `http://localhost:3000` in your browser.

### Production Build

```bash
npm run build
npm run start
```

---

## Docker

```bash
./scripts/install.sh
docker compose logs -f app
docker compose down
```

---

## Useful Scripts

| Command | Description |
|---------|-------------|
| `npm run install:selfhost` | Docker Compose one-command install |
| `npm run install:local` | macOS/Linux local Node + PostgreSQL install path |
| `npm run doctor` | Check Node/Docker/env/app/DB status |
| `npm run scan:public` | Scan a public export for blocked terms and secret patterns |
| `npm run export:public` | Create a clean `git ls-files` based public export |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run setup-postgres` | Initialize DB schema |
| `npm run create-admin` | Create the default admin account |
| `npm run create-admin:interactive` | Create an admin interactively |
| `npm run smoke` | Smoke-check pages and protected API boundaries |

---

## Project Structure

```
hanimo-webui/
├── app/                    # Next.js app routes
│   ├── admin/              # Admin UI pages
│   │   ├── database/       #   DB viewer (table browse/CRUD)
│   │   ├── users/          #   User management (role changes, deletion)
│   │   ├── menus/          #   Menu management
│   │   ├── settings/       #   Site settings (theme, Draw, widgets)
│   │   └── ...             #   Dashboard, logs, analytics, etc.
│   ├── api/                # API routes
│   │   ├── v1/             #   OpenAI-compatible API
│   │   ├── admin/          #   Admin API
│   │   └── webapp-chat/    #   Chat API
│   ├── components/         # Shared UI components
│   │   ├── chat/           #   Chat-related (ChatInput, MessageList, Sidebar, DrawPreviewPanel)
│   │   ├── ui/             #   shadcn/ui primitives
│   │   └── ...             #   PatchNotesModal, NoticePopup, etc.
│   ├── hooks/              # React custom hooks
│   │   ├── useChatSender.js    # Chat message sending logic
│   │   ├── useChat.js          # Chat state management
│   │   └── useTranslation.js   # i18n support
│   └── lib/                # Utility libraries
│       ├── i18n/           #   Translation files (en.json, ko.json)
│       ├── postgres.js     #   DB connection
│       ├── autoMigrate.js  #   Auto schema migration
│       └── modelServers.js #   Model server routing
├── scripts/                # Setup/admin scripts
├── public/                 # Static files
├── docs/                   # Project documentation
└── tests/                  # Test code
```

---

## Feature Guide

### Chat

1. After login, click `+` in the **left sidebar** to create a new chat room
2. Select an AI model from the **model selector** at the top (star icon to set default)
3. Type your message and send — real-time streaming response
4. Image upload supported (drag & drop or clipboard paste)

### Draw (Canvas) Mode

1. Click the **paintbrush icon** on the left side of the chat input to activate Draw mode
2. Request things like "draw a chart", "create a dashboard"
3. When the AI generates HTML code, view it in the **live preview panel**
4. Copy the code or open it in a new tab

> An admin must enable Draw in Settings > Draw first.

### Custom Instruction

1. Click the **person icon** in the chat input area
2. Write your desired system prompt in the modal (max 5,000 characters)
3. Toggle the enable switch and save
4. Automatically applied to all conversations in that chat room

### Admin Panel

Access at `http://localhost:3000/admin` (requires admin role)

| Menu | Features |
|------|----------|
| Dashboard | User/message/token stats, popular model chart, system status |
| User Management | Search/filter, role changes, delete |
| Model Management | Drag & drop sorting, enable/disable, PII settings, categories |
| Agents | Labs or future plugin candidate |
| Settings | Site branding, theme, Draw config, chat widget, endpoints |
| DB Management | DB viewer (table browse/search/CRUD), schema repair, backup/restore |
| Logs | Message logs, external API logs, security logs |

### OpenAI-Compatible API

Use hanimo-webui as an AI server with external tools (Continue, Cursor, etc.):

```bash
# Chat request
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# List models
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

> API tokens can be issued from Admin Panel > Settings.

---

## Database Migration

When upgrading an existing DB to a newer version:

```bash
# Option 1: Via Admin Panel
# Settings > DB Management > Click "Schema Migration" button

# Option 2: Via API
curl -X POST http://localhost:3000/api/admin/migrate-models \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Auto-migration also runs on each login, automatically adding any missing columns.

---

## Running in Different Environments

### Development

```bash
npm run dev                    # Default dev server
npm run dev:turbopack           # Faster dev server with Turbopack
```

### Production

```bash
npm run build                  # Production build
npm run start                  # Production server
```

### Docker

```bash
docker build -t hanimo-webui .
docker run -p 3000:3000 --env-file .env.local hanimo-webui
```

---

## Useful Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run setup-postgres` | Initialize DB schema |
| `npm run create-admin` | Create admin account |
| `npm run create-admin:interactive` | Interactive admin creation |
| `npm run test-postgres` | Test DB connection |
| `npm run test:ollama` | Test Ollama endpoints |
| `npm run lint` | Run ESLint |

---

## Troubleshooting

### DB Connection Failure

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

Make sure PostgreSQL is running:

```bash
# macOS
brew services start postgresql@14

# Linux
sudo systemctl start postgresql
```

### Build Errors with DB

To build without a database connection:

```bash
SKIP_DB_CONNECTION=true npm run build
```

### Model Loading Failure

1. Check that Ollama/OpenAI endpoints are correct in Admin Panel > Settings
2. Verify the model server is running: `curl http://localhost:11434/api/tags`

---

## Contributing

See `CONTRIBUTING.md`.

## License

Apache 2.0. See `LICENSE`.
