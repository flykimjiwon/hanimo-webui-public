# CLAUDE.md — hanimo-webui

> Sub-repo of kimjiwon workspace ([flykimjiwon/kimjiwon](https://github.com/flykimjiwon/kimjiwon))
> Category: `hanimo/`

## 워크스페이스 진입점
- 마스터 가이드: `~/Desktop/kimjiwon/WORKSPACE_MASTER_2026-05-07.md`
- 트리/원격 매핑: `~/Desktop/kimjiwon/WORKSPACE.md`

---

# hanimo-webui — AI Assistant Guide

## Project Overview

hanimo-webui는 Next.js 15 기반 **오픈소스 셀프호스팅 AI 챗 및 OpenAI-compatible gateway**다.
첫 공개 Core는 채팅, 모델/provider 설정, 사용자·관리자, `hmo_` API Key, `/v1` API, 셀프호스팅 운영이다. Workflow, Screen, RAG, MCP, Agents는 `HANIMO_ENABLE_LABS=true`에서만 여는 Labs이며 stable claim이 아니다. 별도 FastAPI 서비스나 멀티에이전트 오케스트레이션 계층은 없다.

## Tech Stack

- **Framework**: Next.js 15.5.20 (App Router, no `src/` directory)
- **Language**: JavaScript (no TypeScript — `jsconfig.json` with path aliases)
- **UI**: shadcn/ui + Tailwind CSS v4 + Lucide/Phosphor icons
- **Database**: PostgreSQL 14+ via `pg` (raw SQL, parameterized queries)
- **Auth**: JWT (jsonwebtoken) + HttpOnly refresh token cookies + bcryptjs
- **State**: React 19.2.1, no external state manager (useState/useContext)
- **Charts**: Recharts
- **Markdown**: @uiw/react-md-editor, @uiw/react-markdown-preview + rehype-sanitize
- **DnD**: @dnd-kit (core, sortable, utilities)
- **Logging**: Winston (server-side)
- **Package manager**: npm

## Architecture

```
app/
├── page.js                 # Home (chat)
├── layout.js               # Root layout (global)
├── chat/ chat1/ chat2/ chat3/  # Chat variants (TODO: consolidate)
├── admin/                  # Admin panel (22 pages, own layout.js)
│   ├── layout.js           # Admin layout
│   └── [agents|users|models|settings|database|...]/
├── api/                    # ~100 API routes
│   ├── auth/               # login, register, refresh, validate, sso
│   ├── admin/              # 46 admin endpoints
│   ├── v1/                 # OpenAI-compatible (chat/completions, models, embeddings, rerank)
│   ├── webapp-chat/        # Chat rooms, history, feedback
│   ├── webapp-*/           # Feature endpoints (generate, ppt, chart, code-convert, etc.)
│   ├── board/ notice/      # Community CRUD
│   ├── workflows/          # Workflow engine
│   ├── screens/            # Screen builder
│   └── user/               # Profile, settings, api-keys, api-tokens, memory
├── components/
│   ├── chat/               # ChatInput, MessageList, Sidebar, DrawPreviewPanel
│   ├── ui/                 # shadcn/ui (19 active, 7 unused)
│   └── [PPTMaker|VirtualMeeting|ChartMaker|CodeConverter|TextToSql|...]
├── hooks/                  # 11 custom hooks (useChat, useChatSender, useTranslation, etc.)
├── lib/
│   ├── postgres.js         # DB connection pool
│   ├── auth.js             # verifyToken, verifyAdmin, verifyAdminWithResult
│   ├── modelServers.js     # Model server routing & load balancing
│   ├── autoMigrate.js      # Auto schema migration
│   ├── i18n/               # ko.json, en.json
│   └── agent-data/         # Agent prompt templates
└── [board|notice|workflow|screen-builder|agent|...]/  # Feature pages
```

## Key Patterns

### Authentication
- Login returns JWT access token (short-lived) + HttpOnly refresh token cookie
- API routes use `verifyToken(request)` or `verifyAdmin(request)` from `@/lib/auth`
- Client-side: token stored in localStorage, decoded via `@/lib/jwtUtils.js` (decode only, no verification)
- Refresh flow: `/api/auth/refresh` rotates refresh token, returns new access token

### Database
- Raw SQL with parameterized queries via `pg` — NO ORM
- Connection: `@/lib/postgres.js` exports `query(sql, params)` and `getPool()`
- Schema auto-migration on startup via `autoMigrate.js`
- Manual migration: `npm run setup-postgres`

### API Route Pattern
```js
import { NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { verifyToken, verifyAdmin } from '@/lib/auth';

export async function GET(request) {
  const tokenPayload = verifyToken(request);
  if (!tokenPayload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await query('SELECT * FROM table WHERE id = $1', [id]);
  return NextResponse.json(result.rows);
}
```

### i18n
- `useTranslation()` hook returns `t(key)` function
- Translation files: `app/lib/i18n/ko.json`, `app/lib/i18n/en.json`
- Language preference stored in localStorage

### Path Aliases (jsconfig.json)
- `@/components/*` → `app/components/*`
- `@/hooks/*` → `app/hooks/*`
- `@/lib/*` → `app/lib/*`
- `@/models/*` → `app/models/*`
- `@/contexts/*` → `app/contexts/*`

## Commands

```bash
npm run dev              # Dev server (with safe startup)
npm run dev:turbopack    # Dev with Turbopack
npm run build            # Production build (SKIP_DB_CONNECTION=true)
npm run start            # Production server
npm run lint             # ESLint
npm run audit:dependencies # npm advisory gate
npm run setup-postgres   # Initialize DB schema
npm run create-admin     # Create admin account
npm run test-postgres    # Test DB connection
npm run test:ollama      # Test Ollama endpoints
npm run test:security    # Security and release-contract regression tests
npm run test:parity      # Canonical/public security parity
npm run verify:public    # Full deterministic public-export parity
npm run check:production # Standalone auth + proxy E2E
npm run test:docker-install # Clean Docker install E2E
```

## Development Rules

### Do
- Use parameterized SQL queries (`$1`, `$2`) — never concatenate user input
- Use `verifyToken` or `verifyAdmin` on every API route
- Use the project's Winston logger (`@/lib/logger.js`) instead of `console.log`
- Keep components under 500 lines — extract sub-components and custom hooks
- Use `@/lib/utils.js` `cn()` for className merging (clsx + tailwind-merge)
- Run `npm run lint` before committing

### Don't
- Don't add TypeScript — this is a JS project with jsconfig path aliases
- Don't add an ORM — raw SQL with `pg` is intentional
- Don't use `dangerouslySetInnerHTML` without sanitization (use rehype-sanitize or DOMPurify)
- Don't store secrets in source code — use environment variables
- Don't add new chat page variants — consolidate into existing ones

## Known Issues

- `middleware.js` owns Labs and cookie-origin boundaries, but route authorization is still explicit. Every protected API route must continue to call the shared user/admin verifier.
- `chat1/`, `chat2/`, `chat3/` redirect to `chat/`; do not add another chat variant.
- Remaining large modules include `admin/models/components/ModelForm.jsx` (727 lines), `admin/models/hooks/useModelConfig.js` (653 lines), and the legacy generate route.
- App code still has 98 console calls across 9 files and lint has 12 warnings; migrate deliberately to Winston without hiding user-visible errors.
- New API keys are opaque `hmo_` values stored as full SHA-256 hashes. Do not reintroduce JWT-coupled tokens, token previews, or static salts.
- Access tokens remain in localStorage in legacy client paths. Cookie-only access-token migration is a P2 security improvement.
- The clean-Docker harness exists, but the 2026-07-11 local verification machine had no Docker runtime. Require its CI pass before tagging.
