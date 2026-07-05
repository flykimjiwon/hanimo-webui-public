# Changelog

All notable changes to hanimo-webui will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-03-11

### Added
- Initial open-source release of hanimo-webui
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
