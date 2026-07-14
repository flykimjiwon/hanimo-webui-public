# Changelog

All notable changes to hanimo-webui will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

No unreleased changes.

## [0.1.0] - 2026-07-14

First stable core release. Tagged on canonical `4bc7a31` and public export `bfc02be`.
Release gates green on Node 20 CI at the exact release commit: security 91/91,
full suite 146/146, lint 0, audit 0, build 111/111, clean Docker install E2E,
canonical↔public export parity no drift.

### Added
- Nine production appearance skins and a decomposed model configuration form
- Browser-local, per-user community board drafts with restore and storage-failure handling
- Setup-token protected first-administrator flow

### Fixed
- Fresh pinned bootstrap checkout no longer fails its own dirty-worktree guard
- Authentication identity limits remain active without a trusted reverse proxy
- First-administrator creation is serialized and covered by a concurrent transaction/service regression test
- Public email preflight no longer reveals whether an account exists
- OpenAI-compatible credentials consistently resolve endpoint, encrypted global setting, then provider environment
- Provider requests retain long-running model timeouts while caller-specific shorter limits still win
- Stable profile preferences no longer present unsaved controls as working settings
- Signup, profile, and admin surfaces now share one canonical department contract with legacy-value normalization
- Manual chat provider failures no longer hit a temporal-dead-zone error before returning the upstream status
- Retry failover cancels retryable response bodies before switching providers
- Board write now exposes only the general/notice categories that its persistence contract supports
- Legacy board draft categories migrate to the canonical general category on read
- Theme persistence degrades safely when browser storage is blocked
- Signup and profile forms expose standard autocomplete and single-heading accessibility contracts
- Profile labels and password visibility controls expose programmatic accessible names

### Security
- Provider redirects, DNS rebinding, private/reserved IPv6 ranges, and private-LAN opt-in use one outbound policy
- Provider and setup credentials are redacted from diagnostics and never forwarded from callers
- Stable provider connection failures return generic client errors with a correlation ID
- Stable `/v1` authentication errors use one OpenAI-compatible error type and retain CORS headers
- Auth limiter capacity is isolated by route namespace and combines account-wide and trusted-client budgets without evicting active blocks
- Login timing and error copy no longer distinguish missing, password, and SSO-only local accounts

## Planned 0.1.0 baseline

### Added
- Initial open-source release scope for hanimo-webui
- Next.js 15 + React 19 based chat interface
- Multi-model support via OpenAI-compatible API (Ollama, local models)
- PostgreSQL-backed persistent chat history
- JWT authentication with refresh token rotation
- Optional SSO / OAuth integration
- Admin dashboard: user management, model configuration, analytics, logs
- i18n support: Korean and English (locale switcher)
- Dark mode / Light mode toggle (persisted via localStorage)
- PII detection filter for sensitive data
- PowerPoint generation agent
- Community board and notice system
- API key & token management for external integrations
- OpenAI-compatible `/v1/chat/completions` endpoint
- shadcn/ui component library with neutral design system
- `DESIGN_SYSTEM.md` — comprehensive design guidelines
- `.env.example` — documented environment variable template

### Security
- Sensitive default prompts generalized (removed organization-specific references)
- Tesseract OCR binaries excluded from version control via `.gitignore`
- JWT secrets and database credentials must be provided via environment variables

---

## How to Contribute

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
