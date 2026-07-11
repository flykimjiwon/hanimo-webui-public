# Hanimo WebUI Release Checklist

Verification snapshot: 2026-07-11. Checked items were executed in both trees
where applicable; unchecked items still require a release environment. After
the low-resource brand/provider UI pass, targeted lint plus public scan/parity
were re-run at 393 files; full build/security gates remain deferred and must be
re-run on the exact release commit.

## Automated gates

- [x] `npm ci` (security-patched lockfile, 660 packages)
- [x] `npm run audit:dependencies` (0 vulnerabilities)
- [x] `npm run test:security` (`49/49`, canonical and public)
- [x] `npm run test:workflow`
- [x] `npm run test:screen-security`
- [x] `npm run test:api-tokens`
- [x] `npm run test:admin-policy`
- [x] `npm run scan:public`
- [x] `npm run lint` (0 errors; 12 existing warnings)
- [x] `npm run build` (canonical and public)
- [x] `npm run test:parity` (77 security-sensitive entries)
- [x] `npm run verify:public` (393 release files)
- [x] `npm run check:production`
- [ ] `npm run test:docker-install` (harness and CI job ready; no local Docker runtime)

## Runtime gates

- [ ] Clean Docker install completes with generated JWT and credential-encryption keys
- [ ] PostgreSQL is reachable from the Docker app network and not host-published
- [x] Standalone authenticated `/v1` and `/api/v1` model/chat checks pass
- [x] Authenticated OpenAI-compatible upstream uses its configured key, not the caller key
- [x] Admin settings omit endpoint keys and preserve them across a masked GET/PUT round trip
- [x] Invalid image signatures and executable extensions are rejected by regression tests
- [x] Workflow legacy plaintext credentials fail closed; re-entry is documented for Labs
- [x] Login/register/refresh rate limits and cookie-origin checks are implemented
- [ ] The target deployment has set `HANIMO_PUBLIC_URL`, trusted-proxy, and allowed-origin values

## Scope gate

The stable release claim covers chat, model/provider settings, local users/admin,
opaque API keys, OpenAI-compatible APIs, and self-host operations. Workflow,
Screen, RAG, MCP, Community, and destructive DB tooling remain experimental.

## Release action

Do not create the `v0.1.0` tag until the clean-Docker job passes on the exact
release commit and the public export manifest reports no drift.
