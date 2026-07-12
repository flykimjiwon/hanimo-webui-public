# QA and release checklist

## Required environments

- Production Next.js build, not only dev mode
- Chromium desktop at 1280 and 1440+
- Chromium responsive at 375×812 and 768×1024
- Safari/WebKit check where available, especially textarea and viewport height
- Korean and English
- light, dark, system mode
- Amber, one cool preset, and custom primary HEX

## Functional chat

- [ ] Create, select, rename, and delete a conversation
- [ ] Send with Enter
- [ ] Insert newline with Shift+Enter
- [ ] Korean IME composition does not send prematurely
- [ ] Stop an active generation
- [ ] Input and scroll focus remain predictable after send/stop
- [ ] Streaming message updates without shell layout jumps
- [ ] Error and retry states remain visible and translated
- [ ] Model change persists according to current room/default behavior

## Composer capabilities

- [ ] Attach with file picker
- [ ] Paste an image
- [ ] Drag/drop an image
- [ ] Remove one and all attachment chips
- [ ] Enforce image count/size limits
- [ ] Draw mode and preview remain functional
- [ ] Custom instruction opens, saves, enables, and disables
- [ ] Memory opens, saves, enables, and disables
- [ ] Tools tray closes on Escape and outside interaction
- [ ] Send/stop remains reachable at 200% zoom

## Navigation and inspector

- [ ] Rail destinations have tooltips and accessible names
- [ ] Active destination is indicated by more than color
- [ ] Mobile drawer traps focus, closes on Escape/backdrop, restores focus
- [ ] Room action buttons are keyboard reachable without hover
- [ ] Inspector defaults closed below 1120px
- [ ] Inspector tabs support arrow-key or standard tab interaction
- [ ] Closing inspector restores focus to its trigger
- [ ] Empty files/sources/runs states are helpful and translated

## Theme and localization

- [ ] No flash of incorrect mode or palette on refresh
- [ ] Six presets still render correctly
- [ ] Custom HEX updates rail, focus, selected room, links, and send control
- [ ] Semantic success/warning/error colors do not become the primary color
- [ ] Dark surfaces maintain readable depth and borders
- [ ] Every new key exists in both `ko.json` and `en.json`
- [ ] No hard-coded visible Korean or English remains in migrated components
- [ ] `<html lang>` updates correctly
- [ ] 125% type scale produces no clipped controls
- [ ] Every registered skin renders in light and dark mode
- [ ] Skin changes preserve the draft input, selected room, and selected model
- [ ] Skin changes do not trigger room/model network refetches
- [ ] Compact at 125% and relaxed at 85% remain usable
- [ ] Invalid persisted skin/palette/density values fall back safely
- [ ] Custom HEX is normalized and cannot inject arbitrary CSS

## Accessibility

- [ ] One logical `h1`; heading hierarchy remains meaningful
- [ ] All icon-only buttons have localized accessible names
- [ ] Popovers expose expanded state and control relationships
- [ ] Focus-visible contrast is at least 3:1
- [ ] Text contrast is at least 4.5:1 where required
- [ ] Status is not communicated by color/dot alone
- [ ] Dynamic errors and generation states use appropriate live regions
- [ ] Reduced-motion preference removes nonessential motion
- [ ] 200% browser zoom retains all actions and avoids two-axis scrolling
- [ ] Touch targets are at least 44×44 CSS pixels for primary mobile controls

## Visual regression matrix

Capture screenshots for:

1. empty chat
2. populated conversation
3. tools tray open
4. model selector open
5. attachments present
6. streaming/stop state
7. validation error
8. inspector context/files/runs
9. mobile drawer
10. dark mode
11. non-amber palette
12. English layout

Compare component geometry to `warm-command-deck.html` and the generated concept,
but accept deliberate differences required for real data, accessibility, theme
customization, or localization. Record accepted differences in `DESIGN.md`.

## Engineering gates

```bash
npm run lint
npm run build
npm run scan:public
npm run test:security
```

Add targeted component/E2E tests only around subtle behavioral boundaries such
as Korean IME sending, focus restoration, and responsive inspector defaults.
Do not replace real browser QA with snapshots.

## Release gate

- [ ] All changed files pass lint/build
- [ ] No browser console error or hydration warning
- [ ] No failed network request introduced by the shell
- [ ] No new production dependency without license/provenance review
- [ ] Canonical/public export parity passes
- [ ] `DESIGN.md` and this handoff reflect the shipped implementation
- [ ] A human can complete the full chat flow on desktop and mobile
