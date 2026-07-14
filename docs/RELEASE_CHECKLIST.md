# Hanimo WebUI Release Checklist

Verification snapshot: 2026-07-14, uncommitted local worktree. Checked items
below were rerun without Docker after the current source changes. This is not a
release commit, tag, public export, or deployment claim. The current gates
completed 91 security tests, 146 combined Node tests, lint with zero warnings,
dependency audit with zero vulnerabilities, and a 111/111-route production
build. Docker runtime was intentionally skipped on this machine.

## Automated gates

- [ ] `npm ci` (rerun on the eventual release commit)
- [x] `npm audit --audit-level=high` (0 vulnerabilities)
- [x] `npm run test:security` (`91/91`)
- [x] `npm run test:workflow`
- [x] `npm run test:screen-security`
- [x] `npm run test:api-tokens`
- [x] `npm run test:admin-policy`
- [ ] `npm run scan:public` (rerun after the public export is prepared)
- [x] `npm run lint` (0 errors, 0 warnings)
- [x] `npm run build` (111/111 routes)
- [ ] `npm run test:parity` (current public sibling has not been updated)
- [ ] `npm run verify:public` (run after current changes are committed and exported)
- [ ] `npm run check:production` (rerun on the eventual release commit)
- [x] Full Node test suite (`146/146`)
- [ ] `npm run test:docker-install` (intentionally skipped; no local Docker runtime execution)

## Runtime gates

- [ ] Clean Docker install completes with generated JWT and credential-encryption keys
- [ ] PostgreSQL is reachable from the Docker app network and not host-published
- [ ] Standalone authenticated `/v1` and `/api/v1` model/chat checks on the final release commit
- [x] Authenticated OpenAI-compatible upstream uses its configured key, not the caller key
- [x] Admin settings omit endpoint keys and preserve them across a masked GET/PUT round trip
- [x] Invalid image signatures and executable extensions are rejected by regression tests
- [x] Workflow legacy plaintext credentials fail closed; re-entry is documented for Labs
- [x] Login/register/refresh rate limits and cookie-origin checks are implemented
- [x] First-admin setup requires a generated setup token and serializes concurrent creation
- [x] Provider timeout and explicit private-LAN allowlist are documented and wired through Compose
- [x] Provider failures expose only generic messages and correlation IDs across stable `/v1` routes
- [x] Profile/signup/admin use one canonical department contract, including legacy-value normalization
- [x] Board write exposes only the general/notice categories that the database actually persists
- [x] Signup, profile, and board-write desktop/mobile browser QA has zero overflow or console warnings
- [ ] The target deployment has set `HANIMO_PUBLIC_URL`, trusted-proxy, and allowed-origin values

## Scope gate

The stable release claim covers chat, model/provider settings, local users/admin,
opaque API keys, OpenAI-compatible APIs, and self-host operations. Workflow,
Screen, RAG, MCP, Community, and destructive DB tooling remain experimental.

## Release action

Do not create the `v0.1.0` tag until the clean-Docker job passes on the exact
release commit and the public export manifest reports no drift. Commit/push,
canonical/public parity, and exact-SHA CI are still pending for this worktree.
