# hanimo-webui Project Audit

**Date**: 2026-03-12  
**Scope**: Full codebase audit — architecture, security, quality, maintainability  
**Codebase**: 207 source files, ~72K lines of code, 77 API routes

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Strengths](#strengths)
4. [Security Findings](#security-findings)
5. [Code Quality Hotspots](#code-quality-hotspots)
6. [Best Practices Checklist](#best-practices-checklist)
7. [Recommended Roadmap](#recommended-roadmap)

---

## Executive Summary

hanimo-webui is a self-hosted AI chat platform built on Next.js 15 (App Router) with PostgreSQL. The codebase is functional and feature-rich — supporting multi-model chat, admin dashboards, API key management, PII detection, i18n, and SSO authentication. However, it has accumulated technical debt typical of rapid product development: no test coverage, duplicated modules, hardcoded values, and oversized components.

**Overall Health**: Functional but fragile. Good feature coverage, weak infrastructure.

| Area | Rating | Notes |
|------|--------|-------|
| Feature completeness | ★★★★☆ | Rich feature set, well-structured pages |
| Security | ★★☆☆☆ | Auth works but lacks defense-in-depth |
| Code quality | ★★★☆☆ | Consistent patterns, but large files and duplication |
| Testability | ★☆☆☆☆ | Zero test files exist |
| Maintainability | ★★☆☆☆ | Schema triplication, 800+ line components |
| Documentation | ★★★★☆ | README, CONTRIBUTING, DESIGN_SYSTEM, i18n all present |
| DevOps | ★★☆☆☆ | CI workflow exists but is non-functional (no test files) |

---

## Architecture Overview

### Stack
- **Framework**: Next.js 15.5.9 (App Router, Webpack)
- **Database**: PostgreSQL (via `pg` pool, no ORM)
- **Auth**: JWT (local) + OAuth 2.0 (SSO)
- **Icons**: @phosphor-icons/react (SSR)
- **UI**: shadcn/ui components + Tailwind CSS
- **i18n**: Custom LanguageContext + JSON dictionaries (ko/en)

### Module Structure

```
app/
├── api/              # 77 route handlers (direct DB queries)
│   ├── admin/        # Admin CRUD (users, settings, models, tokens)
│   ├── auth/         # Login, SSO, token refresh, first-admin bootstrap
│   ├── user/         # User profile, preferences, API tokens
│   ├── chat/         # Chat CRUD, streaming, history
│   ├── model-servers/ # LLM proxy (OpenAI-compatible)
│   └── v1/           # External API (OpenAI-compatible endpoints)
├── admin/            # Admin dashboard pages
├── components/       # Shared UI components
├── contexts/         # React contexts (Language, Theme)
├── lib/              # Utilities (auth, DB, error handling, PII)
├── locales/          # i18n JSON files (ko.json, en.json)
└── ui/               # shadcn/ui primitives
```

### Key Architectural Patterns

1. **No middleware.ts** — Auth is checked per-route via `verifyToken(req)` / `requireAuth(req)` calls. There is no centralized route protection.

2. **Direct DB access** — All 77 API routes import `query` from `@/lib/postgres` and write raw SQL. No repository/service layer exists.

3. **Dual auth modules** — `app/lib/auth.js` and `app/lib/adminAuth.js` provide overlapping but inconsistent auth verification functions.

4. **Unused API wrapper** — `app/lib/apiWrapper.js` defines `withApiHandler`, `withAuth`, `withAdmin` HOF wrappers, but 0 routes use them.

5. **Schema triplication** — Table definitions exist in 3 separate files:
   - `scripts/create-postgres-schema.js` (1,256 lines)
   - `app/lib/autoMigrate.js` (451 lines)
   - `app/api/admin/init-schema/route.js` (665 lines)

---

## Strengths

### Well-Implemented Features
- **i18n system**: Full Korean/English support with `useTranslation` hook — 4,182 `t()` usages across 173 files
- **PII detection**: Local regex-based engine (`piiDetector.js`) with Korean PII types, integrated via `piiFilter.js`
- **Model server proxy**: OpenAI-compatible API with streaming support, retry logic, and configurable timeouts
- **Error handling framework**: Custom error classes (`AppError`, `AuthError`, `ValidationError`) with standardized JSON responses in `errorHandler.js`
- **Design system**: shadcn/ui migration complete with oklch monochrome palette, documented in `DESIGN_SYSTEM.md`
- **Icon system**: Phosphor Icons with weight strategy (light/duotone/regular) and lucide-compatible aliases

### Good Practices Already in Place
- Environment-driven DB timezone with input validation (`postgres.js`)
- JWT secret enforcement at module load (`config.js`)
- `.env.example` with all required variables documented
- Git-ignored sensitive files (`.env`, credentials)
- Standalone Next.js output for Docker deployment
- `serverExternalPackages` for Node-native modules (tesseract.js, winston)

---

## Security Findings

### HIGH Priority

| # | Finding | Location | Risk | Status |
|---|---------|----------|------|--------|
| S1 | ~~Hardcoded fallback JWT secrets~~ | `db-reset`, `api-tokens` | Credential exposure | **FIXED** |
| S2 | No rate limiting on auth endpoints | `auth/login`, `auth/sso`, `auth/create-first-admin` | Brute force | Open |
| S3 | No middleware.ts for route protection | Project-wide | Auth bypass if route forgets check | Open |
| S4 | SQL template literals (controlled) | `db-reset/route.js` lines 76, 111 | SQL injection (mitigated by allowlist) | Open |

### MEDIUM Priority

| # | Finding | Location | Risk | Status |
|---|---------|----------|------|--------|
| S5 | `dangerouslySetInnerHTML` usage | `layout.js` (dark mode), `PPTMaker.js` (slides) | XSS (controlled context) | Open |
| S6 | No CSRF protection on mutations | All POST/PUT/DELETE routes | CSRF attacks | Open |
| S7 | Admin bootstrap has no rate limit | `create-first-admin/route.js` | Abuse (has admin-exists guard) | Open |
| S8 | ~~SSO error reveals vendor name~~ | `auth/login/route.js` line 33 | Information leak | **FIXED** |

### LOW Priority

| # | Finding | Location | Risk | Status |
|---|---------|----------|------|--------|
| S9 | `Element.prototype.className` monkey-patch | `app/layout.js` lines 10-121 | Prototype pollution side effects | Open |
| S10 | No Content-Security-Policy headers | Project-wide | XSS amplification | Open |

---

## Code Quality Hotspots

### Critical (Refactor Soon)

| # | Issue | Location | Lines | Impact |
|---|-------|----------|-------|--------|
| Q1 | Admin layout is a god component | `app/admin/layout.js` | 863 | Auth, routing, drag-drop, permissions all in one file |
| Q2 | Schema defined in 3 places | `create-postgres-schema.js`, `autoMigrate.js`, `init-schema/route.js` | 2,372 total | Schema drift risk — any change requires 3 edits |
| Q3 | Dual auth modules | `auth.js` + `adminAuth.js` | ~200 | Inconsistent return types, confusing API |
| Q4 | Zero test coverage | Project-wide | 0 | No regression safety net |

### High (Plan to Address)

| # | Issue | Location | Lines | Impact |
|---|-------|----------|-------|--------|
| Q5 | `className` monkey-patch in layout | `app/layout.js` | 112 | Global prototype modification, hard to debug |
| Q6 | `apiWrapper.js` is dead code | `app/lib/apiWrapper.js` | ~80 | Misleading — appears to be the standard but isn't used |
| Q7 | Asia/Seoul hardcoded in 24 files | Various date formatting | — | Non-portable for global deployment |
| Q8 | `db-reset` creates its own pg Pool | `admin/db-reset/route.js` line 5 | — | Bypasses the shared pool in `postgres.js` |

### Medium (Improve When Touching)

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| Q9 | No repository/service layer | All 77 API routes | SQL scattered, hard to test/mock |
| Q10 | Console.log in production code | Various | Noise in production logs |
| Q11 | Inconsistent error response shapes | Some routes return `{error}`, others `{message}` | Client-side handling complexity |

---

## Best Practices Checklist

### Next.js App Router

| Practice | Status | Notes |
|----------|--------|-------|
| App Router (not Pages) | ✅ | Full App Router |
| Server Components where possible | ⚠️ | Most components are client-side (`'use client'`) |
| `loading.js` / `error.js` boundaries | ❌ | Not implemented |
| Route groups for layout organization | ❌ | Flat route structure |
| Metadata API for SEO | ⚠️ | Basic — no per-page metadata |
| `middleware.ts` for auth | ❌ | Auth is per-route |

### Database

| Practice | Status | Notes |
|----------|--------|-------|
| Parameterized queries | ✅ | Used consistently (except db-reset) |
| Connection pooling | ✅ | `pg.Pool` in `postgres.js` |
| Migrations framework | ❌ | Manual schema scripts, triplicated |
| Index optimization | ⚠️ | Some indexes, not systematically reviewed |
| Transaction support | ⚠️ | Used in some routes, not all multi-step operations |

### Authentication

| Practice | Status | Notes |
|----------|--------|-------|
| JWT token verification | ✅ | Consistent across routes |
| Password hashing (bcrypt) | ✅ | bcrypt with salt rounds |
| Token refresh mechanism | ✅ | Refresh token rotation |
| Rate limiting | ❌ | No rate limiting anywhere |
| RBAC (role-based access) | ✅ | admin/user roles enforced |

### Frontend

| Practice | Status | Notes |
|----------|--------|-------|
| Component library (shadcn/ui) | ✅ | Fully migrated |
| Design tokens | ✅ | oklch monochrome palette |
| Responsive design | ✅ | Mobile-first layouts |
| Accessibility (a11y) | ⚠️ | shadcn/ui provides base, not audited |
| Bundle optimization | ✅ | `optimizePackageImports`, standalone output |
| i18n | ✅ | Full ko/en support |

### DevOps

| Practice | Status | Notes |
|----------|--------|-------|
| CI pipeline | ⚠️ | Playwright workflow exists, no tests |
| Linting | ✅ | ESLint configured (16 warnings, 0 errors) |
| Formatting | ⚠️ | No Prettier config found |
| Docker support | ✅ | Standalone output mode |
| Environment management | ✅ | `.env.example` with docs |

---

## Recommended Roadmap

### Phase 1: Foundation (1-2 weeks)

> Goal: Make the codebase safe and testable

1. **Add `middleware.ts`** for centralized auth — eliminate per-route auth boilerplate and prevent auth-bypass bugs
2. **Merge `auth.js` + `adminAuth.js`** into a single module with consistent return types
3. **Add rate limiting** on `/api/auth/*` endpoints (use `next-rate-limit` or custom token bucket)
4. **Remove dead code** — delete `apiWrapper.js` or adopt it project-wide
5. **Set up testing** — add Vitest for unit tests, configure the existing Playwright workflow

### Phase 2: Quality (2-4 weeks)

> Goal: Reduce maintenance burden

6. **Consolidate schema** — single source of truth for table definitions, generate migrations from it
7. **Break up admin layout** — extract auth, navigation, and drag-drop into separate components (<200 lines each)
8. **Remove `className` monkey-patch** — use Tailwind's `dark:` variant or a proper class management solution
9. **Refactor `db-reset`** — use the shared pool from `postgres.js`, parameterize table operations
10. **Add `error.js` / `loading.js`** boundaries for better UX

### Phase 3: Hardening (4-6 weeks)

> Goal: Production-ready for external users

11. **Replace hardcoded `Asia/Seoul`** — use env-driven or user-preference timezone
12. **Add CSP headers** via `next.config.mjs` or middleware
13. **Standardize error responses** — all routes return `{ error: string, code?: string }`
14. **Add API documentation** — OpenAPI spec for the v1 endpoints
15. **Accessibility audit** — test with screen reader, add ARIA labels where missing

### Phase 4: Scale (6+ weeks)

> Goal: Community-ready open source

16. **Repository/service layer** — extract SQL into domain-specific modules
17. **Add server components** — reduce client-side JS bundle
18. **Performance monitoring** — add observability (OpenTelemetry or similar)
19. **Contributor tooling** — add Prettier, husky pre-commit hooks, PR templates
20. **Plugin system** — formalize the agent plugin architecture documented in `AGENT_PLUGIN_SYSTEM.md`

---

## Appendix: File Inventory

### Largest Files (by line count)

| File | Lines | Concern |
|------|-------|---------|
| `scripts/create-postgres-schema.js` | 1,256 | Schema definition (1 of 3) |
| `app/admin/layout.js` | 863 | God component |
| `app/api/admin/init-schema/route.js` | 665 | Schema definition (3 of 3) |
| `app/lib/autoMigrate.js` | 451 | Schema definition (2 of 3) |
| `app/api/admin/api-tokens/route.js` | 408 | CRUD for admin API tokens |
| `app/api/user/api-tokens/route.js` | 354 | CRUD for user API tokens |

### Dependency Summary

- **Production dependencies**: 27 packages
- **Dev dependencies**: 9 packages
- **Key dependencies**: next, react, pg, jsonwebtoken, bcrypt, tailwindcss, @phosphor-icons/react, tesseract.js, winston
- **Vulnerabilities**: 3 (1 moderate, 2 high) — run `npm audit` for details
