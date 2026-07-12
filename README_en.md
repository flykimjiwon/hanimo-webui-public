[한국어](README.md)

# hanimo-webui

> **Put your models to work.** A self-hosted AI workspace for asking, creating, and deciding in one focused place.

hanimo-webui is an **open-source, self-hosted AI chat, admin runtime, and OpenAI-compatible API** built with Next.js 15.

The public core promise is chat, model server settings, user/admin management, API tokens, and OpenAI-compatible APIs. Workflow / Screen / RAG / MCP surfaces are Labs or future plugin candidates, not core public-release promises.

> Public-readiness status: this release candidate hardens credentials, SSRF, uploads, authentication, and Docker defaults, and passes a standalone E2E from `hmo_` issuance through an authenticated OpenAI-compatible upstream proxy.
> The clean-Docker harness and CI job are ready, but this machine has no Docker runtime, so that local run remains unverified. Re-enter legacy Workflow credentials before enabling Labs. This is **not a security certification claim**.

---

## Public Core

| Feature | Description |
|---------|-------------|
| Chat | Room-based conversations, model selection, streaming responses, image input |
| Model server settings | Ollama, OpenAI-compatible endpoints, Gemini, and model routing controls |
| Users / Admin | Local login, JWT refresh tokens, user management, admin-only management UI |
| API tokens | User token issuing, one-time display, hash storage, OpenAI-compatible API auth |
| OpenAI-compatible API | `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/rerank` |
| Self-host operations | Docker Compose install, local install, doctor, route smoke checks |

## Labs / Future Plugin

| Area | Public-release boundary |
|------|-------------------------|
| Workflow / Agents | Labs or future plugin candidates. Publish separately after manifest, permission, and audit models are explicit |
| Screen / Draw / Canvas | Labs candidates. iframe sandboxing and SSRF guards stay in place, but these are not stable core promises |
| RAG / MCP | Future plugin candidates, outside the first public install/operation scope |
| DB viewer / destructive DB tools | Admin maintenance surface, not an end-user feature or stable public API promise |
| PII / Community / SSO / team extensions | Operational extensions, not public core |
| i18n / theming | UI support for the core app, not a broader platform claim |

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

## Security and Operations Boundary

- Model proxies do not forward arbitrary caller headers; they use only credentials selected from administrator-managed endpoints.
- External API logs do not store prompt bodies by default. Set `HANIMO_LOG_PROMPT_CONTENT=true` only in a controlled development environment when bounded content retention is needed.
- Workflow custom endpoints are experimental and enforce public-network and redirect policies. Credentials are not stored without `HANIMO_CREDENTIAL_ENCRYPTION_KEY`.
- The installer generates a key with at least 32 bytes of entropy. Losing it means stored provider credentials cannot be decrypted.
- Legacy unversioned Workflow plaintext credentials are disabled rather than used automatically; re-enter them after configuring the key.
- Labs pages and APIs return 404 by default. Set `HANIMO_ENABLE_LABS=true` only when the operator accepts their experimental support scope.
- Login, registration, and refresh requests have default rate limits. State-changing browser requests carrying Hanimo cookies must be same-origin.
- Behind a reverse proxy, set `HANIMO_PUBLIC_URL` to the public origin and enable `HANIMO_TRUST_PROXY=true` only when the proxy controls forwarded client IP headers.
- Server-to-server `/api/v1/*` requests using `hmo_` API keys remain separate from browser-cookie CSRF checks so Hanimo Code and the VS Code extension can use the gateway next.

---

## Quick Start

### Official path: Docker one-command install

The only prerequisite is **Docker Desktop**. You do not need to install PostgreSQL locally.

For a first clean-machine verification, follow the [manual Docker QA guide](docs/MANUAL_DOCKER_QA.md). It covers installer integrity, browser login, `hmo_` API-key boundaries, logs, and data-preserving shutdown.

```bash
git clone https://github.com/flykimjiwon/hanimo-webui-public.git hanimo-webui
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

After signing in, open **Admin → AI Providers** to save an Ollama, Novita, OpenRouter, OpenAI, DeepSeek, or Gemini preset, or enter any custom OpenAI-compatible endpoint. Presets only fill connection values; the runtime continues to use the shared compatible adapters.

Inspect the install:

```bash
./scripts/doctor.sh
./scripts/doctor.sh --json
```

Before a release, run the clean Docker install gate:

```bash
npm run test:docker-install
```

It uses an isolated PostgreSQL volume and mock provider to verify admin login, `hmo_` API key issuance, OpenAI-compatible model listing, and chat proxying, then removes only its test resources.

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

## Project Structure

```
hanimo-webui/
├── app/                    # Next.js app routes
│   ├── admin/              # Admin UI pages
│   │   ├── database/       #   DB maintenance/browse (admin operations surface)
│   │   ├── users/          #   User management (role changes, deletion)
│   │   ├── menus/          #   Menu management
│   │   ├── settings/       #   Site/model/chat settings
│   │   └── ...             #   Dashboard, logs, analytics, etc.
│   ├── api/                # API routes
│   │   ├── v1/             #   OpenAI-compatible API
│   │   ├── admin/          #   Admin API
│   │   └── webapp-chat/    #   Chat API
│   ├── components/         # Shared UI components
│   │   ├── chat/           #   Chat-related (ChatInput, MessageList, Sidebar, etc.)
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

## Core Flows

### Chat

1. After login, click `+` in the **left sidebar** to create a new chat room
2. Select an AI model from the **model selector** at the top (star icon to set default)
3. Type your message and send — real-time streaming response
4. Image upload supported (drag & drop or clipboard paste)

### Custom Instruction

1. Click the **person icon** in the chat input area
2. Write your desired system prompt in the modal (max 5,000 characters)
3. Toggle the enable switch and save
4. Automatically applied to all conversations in that chat room

### Labs / Operational Extension Boundary

Workflow, Screen, Draw, RAG, MCP, SSO, community/team extensions, and advanced DB tools may still have routes or UI in the current codebase. They are not stable public-core promises and should be separated behind a plugin/Labs security model before being marketed as product features.

### Admin Panel

Access at `http://localhost:3000/admin` (requires admin role)

| Menu | Public-release boundary |
|------|-------------------------|
| Dashboard | User/message/token stats, model usage, system status |
| User Management | Search/filter, role changes, delete |
| Model Management | Model and model server settings, enable/disable, ordering |
| Settings | Site branding, theme, chat, endpoint settings |
| API Tokens | Token issuing, one-time display, hash-storage based authentication |
| Logs | Message logs, external API logs, security logs |
| Agents / DB Management / Screen | Labs or admin maintenance surfaces, not first public-core promises |

### OpenAI-Compatible API

Use hanimo-webui as an AI server with external tools (Continue, Cursor, etc.):

Hanimo Code and the Hanimo VS Code extension will use this same contract in the
next phase. See the [official client gateway contract](docs/HANIMO_OFFICIAL_CLIENT_GATEWAY.md).

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

> Issue API tokens from `/my-api-keys` after signing in. The plaintext `hmo_` value is shown once.

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
./scripts/install.sh
docker compose logs -f app
docker compose down
```

---

## Useful Scripts

| Command | Description |
|---------|-------------|
| `npm run install:selfhost` | Docker Compose one-command install |
| `npm run install:docker` | Same Docker install path as `install:selfhost` |
| `npm run install:local` | macOS/Linux local Node + PostgreSQL install path |
| `npm run doctor` | Check Node/Docker/env/app/DB status |
| `npm run scan:public` | Scan a public export for blocked terms and secret patterns |
| `npm run export:public` | Create a clean `git ls-files` based public export |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run setup-postgres` | Initialize DB schema |
| `npm run create-admin` | Create admin account |
| `npm run create-admin:interactive` | Interactive admin creation |
| `npm run test-postgres` | Test DB connection |
| `npm run test:ollama` | Test Ollama endpoints |
| `npm run test:workflow` | Workflow condition RCE regression test |
| `npm run test:screen-security` | Screen share/outbound SSRF regression test |
| `npm run test:api-tokens` | API token storage/display security test |
| `npm run test:admin-policy` | Admin policy regression test |
| `npm run smoke` | Smoke-check public pages and protected API boundaries |
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
