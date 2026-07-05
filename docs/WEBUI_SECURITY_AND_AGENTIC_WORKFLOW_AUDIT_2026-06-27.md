# hanimo-webui Security and Agentic Workflow Audit - 2026-06-27

Status: Session C audit for public self-hosted agent/workflow positioning. Session 1 backend/security/admin runtime update appended.

Verdict: **not public-ready yet**. The product has a credible workflow/chat/admin base, but public release must be blocked until the P0 security gates below are closed on `main` and re-verified.

Session 3 workflow/tools detail is tracked separately in [`WEBUI_AGENTIC_WORKFLOW_BACKLOG_2026-06-27.md`](WEBUI_AGENTIC_WORKFLOW_BACKLOG_2026-06-27.md).

## Scope

- Repo: `hanimo/hanimo-webui`
- Branch inspected: `main` / `origin/main` at `84e1ca002c39a128376166fa9c17f98111e64d5a`
- Hardening branch inspected: `origin/security/p0-hardening` at `3f64ba8e8d2389eeca1182c47cc5873ee204ce35`
- Official references checked:
  - Open WebUI Tools: https://docs.openwebui.com/features/extensibility/plugin/tools/
  - Open WebUI native MCP: https://docs.openwebui.com/features/extensibility/mcp/
  - Open WebUI MCP/OpenAPI proxy: https://docs.openwebui.com/features/extensibility/plugin/tools/openapi-servers/mcp/
  - Dify Workflow & Chatflow: https://docs.dify.ai/en/use-dify/build/workflow-chatflow
  - Dify Orchestration Logic: https://docs.dify.ai/en/use-dify/build/orchestrate-node
  - LibreChat agents: https://www.librechat.ai/docs/features/agents
  - LibreChat artifacts: https://www.librechat.ai/docs/features/artifacts
  - LibreChat MCP server config: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers
  - Model Context Protocol docs: https://modelcontextprotocol.io/docs/getting-started/intro
  - MCP tool safety notes: https://modelcontextprotocol.io/docs/concepts/tools

## Public Release Gate

The current release gate is **closed**.

| Gate | Current state | Code evidence | Required release condition |
|---|---|---|---|
| Workflow Function RCE | Mitigated after follow-up | `app/lib/workflow-engine.js` now delegates condition nodes to `app/lib/workflow-condition.mjs`, which evaluates a constrained expression/operator subset without `new Function`. `scripts/test-workflow-condition.js` proves function-call payloads are rejected without executing. | Keep the safe evaluator covered by regression tests and continue to prefer explicit condition operators in the public palette. |
| Public screen custom endpoint SSRF | Mitigated after follow-up | `app/api/screens/[id]/execute/route.js` now requires bearer auth before DB lookup, limits non-published/non-public execution to owner/admin, forwards bearer auth for workflow execution, and calls `app/lib/screen-security.mjs` before custom endpoint fetch. The guard allows only http/https, supports `HANIMO_SCREEN_ENDPOINT_ALLOWLIST`, blocks localhost/private/link-local/metadata IPs and private DNS resolutions, disables redirects, adds timeout, and caps response size. `scripts/test-screen-security.js` covers redaction and SSRF cases; `scripts/smoke-routes.js` checks unauthenticated screen execute returns 401. | Add audit logging for denied/executed screen endpoints and keep production allowlists explicit when public execution is enabled. |
| Public screen definition leak | Mitigated after follow-up | `app/api/screens/share/[shareId]/route.js` now returns `redactScreenForShare(screen)` for public/password/authenticated/restricted shared reads. `app/lib/screen-security.mjs` removes endpoint configs, API keys, auth headers, URLs, workflow IDs, and mapping metadata from shared definitions. | Keep builder-owner APIs as the only route that can return full executable screen definitions. Add a regression route test when DB-backed API tests are introduced. |
| API token recoverable storage | Mitigated after follow-up | User/admin token APIs no longer decrypt or return `originalToken`, and new issuance returns the token only in the POST response. `app/my-api-tokens/page.js` and `app/admin/api-tokens/page.js` no longer render original-token copy branches after list/detail fetches. `scripts/test-api-token-security.js` blocks regression. | Keep `encrypted_token` as a deprecated nullable legacy column only until a deliberate DB cleanup migration is written. Consider HMAC hashing if server-side pepper rotation becomes a release requirement. |
| Short token hash | Mitigated after follow-up | New user/admin token issuance uses full SHA-256 via `hashApiToken(token)`. `verifyApiToken()` checks full hash first and legacy 16-char hash second, so existing tokens keep working during migration. `/v1/models`, `/v1/completions`, and `/v1/chat/completions` now use the shared verifier. | Add DB-backed integration tests for new full-hash tokens, legacy 16-char tokens, inactive tokens, and expired tokens. |
| `JWT_SECRET` fallback | Mitigated in Session 1 | `middleware.js` now rejects missing or short secrets for protected routes and no longer falls back to `dev-secret-change-me`. | Add regression tests and keep production env validation in the release checklist. Build-time DB skips must not create runtime auth fallback. |
| Admin destructive route guard | Partially mitigated in Session 1 | `app/api/admin/db-reset/route.js` and `app/api/admin/db-restore/route.js` now require `HANIMO_ENABLE_DESTRUCTIVE_ADMIN=true` after admin auth and before destructive parsing/execution. | Still add second confirmation/re-auth, backup requirement, dry-run, event audit log, table denylist/allowlist, and restore SQL restrictions. |
| `security/p0-hardening` merge state | Not merged | `origin/security/p0-hardening` is not an ancestor of `main` (`merge-base --is-ancestor` failed). Diff contains the expected security files plus a broad unrelated UI/docs/design surface. | Do not blind-merge the branch. Split or cherry-pick the minimal P0 fixes, then rerun lint/build/security tests. |

## Agentic Platform Positioning

The public message should be:

> hanimo-webui is a self-hosted AI chat, tool, and workflow platform. hanimo-rag is one engine/SDK card inside that platform, not a separate platform promise.

The benchmark from current public docs is clear:

- Open WebUI positions Tools/Functions as server-side callable capabilities and warns that tool code runs with backend privileges. It also exposes MCP via OpenAPI Tool Servers.
- Dify's differentiation is visual workflow orchestration: typed nodes, knowledge/tool/HTTP/code nodes, debugging, logs, and published apps.
- LibreChat emphasizes agents, tools, MCP server configuration, and artifacts for generated outputs.
- MCP standardizes tools/resources/prompts, but the host must enforce access control, rate limits, timeouts, audit logs, and human confirmation for sensitive operations.

## Current Product Surface

| Area | Current state | Public gap |
|---|---|---|
| Functions/tools | Partial. Workflows can call custom endpoints and workflow endpoints. | No first-class tool registry, capability schema, per-tool permissions, secret scoping, approval policy, or tool audit model. |
| MCP integration | Not present in code search. | Need MCP connector model: server registry, tool discovery, per-tool allowlist, resource exposure policy, and audit logs. |
| Workflow builder | Partial and useful. `app/api/workflows/[id]/execute/route.js:53-59` creates execution records, `:61-158` supports SSE node events, and `:109-126` stores outputs/node states/tokens/time. | Condition node RCE blocks release. Need typed node contracts, tool node model, retry/error policies, import/export, and publish permissions. |
| Artifacts/replay/logs | Partial. Workflow executions store outputs and node state; TestPanel shows run result/duration/token usage. | No productized replay view, immutable run transcript, artifact registry, downloadable outputs, or run diff. |
| Admin/observability | Broad admin area exists: analytics, external API logs, error logs, system status, model server status, DB tools. | Observability is mixed with destructive admin features. Need tool/workflow audit log, security events, rate-limit metrics, and a separate locked maintenance mode for DB reset/restore. |

## RAG Integration Points

Use hanimo-rag as a platform capability, not a separate product lane.

1. **RAG engine as webui tool**
   - Register a server-side `rag.search` / `rag.ask` tool in hanimo-webui.
   - The webui tool should call either the Python SDK (`HanimoRAG`) through a local service boundary or the optional FastAPI endpoints (`/search`, `/ask`) exposed by hanimo-rag.
   - Tool input schema should include `query`, `top_k`, optional `collection`, and `max_rounds`. It should not accept arbitrary file paths from public users.

2. **MCP data connector**
   - Expose hanimo-rag as an MCP server with tools such as `rag.search`, `rag.ask`, `rag.index_text`, and `rag.stats`.
   - Treat document ingestion as an admin or trusted-workspace action. Public workflow users should get read/search capabilities only unless explicitly granted.
   - Store MCP server credentials in a scoped secret store, never inside shared screen definitions.

3. **SDK quickstart card**
   - Webui docs can show hanimo-rag as an SDK card:

```python
from hanimo_rag import HanimoRAG

rag = HanimoRAG(store_type="json", store_path="./hanimo_rag_data")
await rag.index("./docs")
results = await rag.search("How do I deploy this workflow?")
```

## Backlog Split

### hanimo-webui P0

- Keep workflow condition evaluation on the safe parser/operator path; `new Function` removal is covered by `npm run test:workflow`.
- Keep screen outbound URL guard and public screen definition redaction covered by `npm run test:screen-security`; add execution audit logs, production allowlist guidance, and DB-backed route regression tests.
- Add regression coverage for JWT secret requirements; Session 1 removed the middleware fallback and fail-closes protected routes when the secret is missing or too short.
- Add DB-backed integration coverage for hardened API tokens: new full-hash tokens, legacy 16-char hash fallback, inactive tokens, and expired tokens.
- Finish DB reset/restore hardening beyond the Session 1 feature flag: re-auth, backup requirement, dry-run, event audit log, and safer restore parser.
- Split `origin/security/p0-hardening` into security-only patch set before merge.

## Session 1 Backend / Security / Admin Runtime Update

Date: 2026-06-27.

Code changes:

- Local login, refresh, and logout now keep middleware cookies and client localStorage in sync:
  - `app/api/auth/login/route.js` sets HttpOnly `token` and `refresh_token` cookies.
  - `app/api/auth/refresh/route.js` rotates both the access cookie and refresh cookie, and clears both when refresh is invalid.
  - `app/api/auth/logout/route.js` revokes the refresh token and clears both cookies.
- `app/api/auth/sso/route.js` now sets the same HttpOnly access-token cookie as local login. SSO implementation details and provider endpoints remain intentionally undocumented here.
- `middleware.js` no longer uses the `dev-secret-change-me` fallback. Protected pages/API routes fail closed with 503 if `JWT_SECRET` is missing or shorter than 32 characters.
- `app/api/admin/db-reset/route.js` and `app/api/admin/db-restore/route.js` now require `HANIMO_ENABLE_DESTRUCTIVE_ADMIN=true` in addition to admin auth. `.env.example` documents the default disabled state.

Current auth/admin runtime judgment:

| Surface | Session 1 result | Evidence |
|---|---|---|
| Local login cookie issue | Pass | Live login response sets HttpOnly `token` at `/` and `refresh_token` at `/api/auth`; `/admin` returns 200 with cookie-only auth. |
| Refresh rotation | Pass | `/api/auth/refresh` returns 200 and sets rotated access/refresh cookies. |
| Logout cleanup | Pass | `/api/auth/logout` returns 200, clears both cookies, and `/admin` redirects to `/login?redirect=%2Fadmin`. |
| Guest admin API access | Blocked | Representative `/api/admin/dashboard` request without credentials returns 401. |
| Non-admin admin API access | Blocked | App-issued non-admin token returns 403 for `/api/admin/dashboard`. |
| Destructive DB reset/restore | Release-gated | App-issued admin token receives 403 from DB reset/restore unless `HANIMO_ENABLE_DESTRUCTIVE_ADMIN=true`. |
| `security/p0-hardening` merge state | Still open | `git merge-base --is-ancestor origin/security/p0-hardening main` exits 1. |

The overall public release verdict remains **not public-ready** because destructive restore restrictions, workflow/screen execution audit logging, workflow custom endpoint outbound policy, and security-branch split/merge are not fully resolved.

### hanimo-webui P1

- Add first-class tool registry: schema, executor, permission, secret scope, timeout, retry, audit.
- Add MCP server registry and tool discovery/import flow.
- Add workflow run replay UI backed by `workflow_executions`.
- Add artifact model for generated files, HTML previews, logs, and workflow outputs.
- Add admin observability pages for workflow/tool executions separate from database maintenance.

### hanimo-rag Integration Backlog

- Keep rag as an engine/SDK dependency and optional local service, not a second platform UI.
- Define a minimal `rag.search` / `rag.ask` webui tool adapter.
- Define MCP connector schemas and permission defaults.
- Link the webui SDK card to the hanimo-rag alignment doc.

## Verification

Executed in `hanimo/hanimo-webui`:

| Command | Result | Notes |
|---|---|---|
| `npm run lint -- --quiet` | Pass | `eslint --quiet` exited 0. |
| `JWT_SECRET=local-dev-secret-at-least-32-characters SKIP_DB_CONNECTION=true npm run build` | Pass with warnings | Next.js 15.5.9 production build exited 0. Warnings remain for React hook dependencies and anonymous default export in `app/lib/piiFilter.js`. |
| Runtime curl smoke on production build (`localhost:3101`) | Pass | Login/admin/refresh/logout/admin-redirect flow passed; admin API 200 for admin, 403 for non-admin, destructive DB reset 403 behind maintenance flag. |
| Browser smoke on production build (`localhost:3101`) | Pass | Playwright form login reached `/admin/dashboard`; cookies and localStorage were present; UI logout returned to `/login` and cleared token state. |

These verification passes do **not** change the public release verdict. The P0 security gates above still block public release.
