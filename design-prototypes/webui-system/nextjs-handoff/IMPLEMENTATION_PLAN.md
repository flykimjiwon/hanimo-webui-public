# Incremental implementation plan

Each phase should be independently reviewable and revertible. Do not combine the
complete shell migration with backend or message-parsing changes.

## Phase A — appearance contract and migration

- define a validated appearance preference contract
- migrate the existing `ThemeDrawer` instead of adding a parallel drawer
- preserve `theme` and `hanimo-webui-theme` reads during one release migration
- add `skin`, `typeScale`, and `density` with safe defaults
- apply cached root attributes in the pre-paint script

Gate: old stored preferences migrate without FOUC or hydration warnings.

## Phase B — shared skin registry

- add a registry of supported skin IDs and localized labels
- load skin CSS through one root attribute contract
- move common shell geometry into base semantic component styles
- keep only visual overrides in individual skin files

Gate: switching skin does not remount chat state, refetch rooms, or clear input.

## Phase C — appearance drawer

- add skin preview, palette, custom HEX, mode, type scale, and density controls
- expose reset-to-site-default and reset-to-product-default separately
- announce applied changes accessibly and preserve keyboard focus

Gate: every setting is keyboard operable, localized, persistent, and reversible.

## Phase 0 — lock behavior and showcase primitives

Deliverables:

- inventory current props and user flows for six chat components
- add Warm Command Deck aliases to `globals.css`
- create a development-only component showcase for rail items, runtime pills,
  attachment chips, tool actions, send/stop, and inspector tabs
- add Korean/English keys before components reference them

Gate: primitives render in all interaction states at 375, 768, and 1280 widths,
in light/dark and at least two primary palettes.

## Phase 1 — brand and icon normalization

Files likely affected:

- `app/components/brand/HanimoMark.js`
- `app/components/icons.*` or current icon wrapper
- `public/icon.svg`
- `app/layout.js` only if the fallback asset path changes

Do not alter administrator custom favicon behavior.

Gate: mark size matrix, monochrome, accessible-name audit, no layout shift.

## Phase 2 — shell and navigation

Files likely affected:

- `ChatLayout.js`
- `SidebarRail.js` or `WorkspaceRail.js`
- `Sidebar.js` or `ConversationDrawer.js`
- minimal wiring in `app/page.js`

Preserve the existing room operations and `sidebarOpen`. Implement overlay focus
trap, Escape close, backdrop close, and focus restoration.

Gate: new chat, room switch/rename/delete, admin navigation, theme toggle,
profile/logout, desktop and mobile drawer.

## Phase 3 — runtime rail

Files likely affected:

- `ChatHeader.js`
- new `RuntimeRail.js`
- `ModelSelector.js`
- small derived view-model wiring in `app/page.js`

Do not introduce a second selected-model state. Unknown provider health must be
represented honestly.

Gate: loading, connected, unavailable model, long model name, narrow collapse,
keyboard model selection.

## Phase 4 — command dock

Files likely affected:

- `ChatInput.js` or new `CommandDock.js`
- optional `CommandTools.js`, `AttachmentStrip.js`
- existing file/image input helpers

This is the highest-risk phase. Move markup in small slices while keeping the
same callbacks. Preserve IME composition guards and input focus after sending.

Gate: plain send, multiline, Korean IME, stop, empty validation, maximum length,
attach/remove, paste, drop, image limits, draw, instruction, memory, model
selection, provider failure.

## Phase 5 — message surfaces

Files likely affected:

- `MessageList.js`
- message/code/source child components and semantic classes

Avoid changing Markdown parsing or message normalization. Apply the content-first
layout and structured artifact surfaces with CSS/token changes first.

Gate: user/assistant/system/error, streaming, code, tables, long Korean text,
images, citations/sources, tool results, copy, feedback, scroll anchoring.

## Phase 6 — context inspector

Files likely affected:

- new `ContextInspector.js`
- `ChatLayout.js`
- derived selectors near the existing message state

Start read-only. Desktop panel and mobile sheet share the same content component.

Gate: empty context, files, sources, runs, tab keyboard navigation, close/focus
restore, default closed below 1120px, no composer obstruction.

## Phase 7 — integration hardening

- remove any temporary duplicate controls
- confirm no prototype hard-coded strings or colors remain
- run lint and production build
- run browser QA from `QA_CHECKLIST.md`
- compare against HTML/PNG reference without sacrificing palette/i18n behavior
- update `DESIGN.md` for any accepted deviation or new primitive

## Suggested commit boundaries

1. `design: add command deck tokens and primitive showcase`
2. `design: normalize WebUI brand and icons`
3. `feat: migrate chat navigation shell`
4. `feat: add chat runtime rail`
5. `feat: migrate composer to command dock`
6. `feat: refine structured message surfaces`
7. `feat: add context inspector`
8. `test: verify command deck responsive states`

Do not use these commit names until each corresponding gate passes.

## Rollback strategy

- Keep prop compatibility during each phase so an individual component can be
  reverted without reverting hooks or APIs.
- Do not maintain two long-lived shells behind a permanent feature flag.
- A short-lived development flag is acceptable only during browser comparison
  and must be removed before release.
- If the command dock phase regresses attachments or IME, revert that component
  phase rather than patching around the sender hook.
