# Warm Command Deck — Next.js implementation handoff

이 폴더는 `warm-command-deck.html`을 현재 Hanimo Next.js 애플리케이션에
기능 회귀 없이 옮기기 위한 구현 계약입니다. 프로토타입 HTML을 JSX로 그대로
복사하는 문서가 아니라, 현재 상태·API·테마·다국어 체계를 유지하면서 화면을
점진적으로 교체하는 방법을 설명합니다.

This folder is the implementation contract for porting the Warm Command Deck
prototype into the existing Hanimo Next.js application without replacing its
state, API, theme, or localization contracts.

## Source of truth

1. Product design contract: `../../../DESIGN.md`
2. Interactive behavior reference: `../warm-command-deck.html`
3. Visual direction reference: `../generated/warm-command-deck-concept.png`
4. Current production behavior: `../../../app/page.js` and existing chat hooks
5. This handoff: component boundaries, migration sequence, and acceptance gates

When these disagree, preserve production behavior first, follow `DESIGN.md` for
visual decisions, and treat the generated PNG as direction rather than literal
pixel truth.

## Documents

| Document | Use |
| --- | --- |
| `ARCHITECTURE.md` | Server/client boundaries, state ownership, data flow |
| `COMPONENT_MAPPING.md` | Prototype region → current file → target component |
| `DESIGN_TOKENS.md` | Token bridge for Tailwind 4 and customizable themes |
| `THEME_I18N.md` | Palette, light/dark, custom HEX, Korean/English preservation |
| `ASSET_INTEGRATION.md` | Mark, favicon, sprite, and React icon strategy |
| `IMPLEMENTATION_PLAN.md` | Mergeable phases, file-level work, rollback boundaries |
| `QA_CHECKLIST.md` | Functional, responsive, accessibility, visual, release gates |

## Non-negotiable compatibility

- Keep Next.js `15.5.20`, React `19.2.1`, App Router, and Tailwind CSS 4.
- Keep `useChat`, `useModelManager`, `useChatSender`, and all existing API routes.
- Keep local storage keys: `theme`, `hanimo-webui-theme`,
  `hanimo-webui-lang`, and `hanimo-webui-sidebar-mode`.
- Keep all six presets, custom primary HEX, separate light/dark variables, and
  administrator-supplied theme colors.
- Keep Korean and English dictionaries. No visible prototype string may remain
  hard-coded in a production component.
- Keep image attachment, paste/drop, draw mode, custom instructions, memory,
  model selection, stop/send, room persistence, and error behavior.
- Do not turn `app/page.js` into a larger client boundary. Interactive UI should
  remain in focused client components.
- Do not adopt the SVG `<symbol>` sprite directly in React if the existing
  `@/components/icons` wrapper can expose the same icon consistently.

## Recommended implementation shape

```text
app/page.js                         existing orchestration; minimal prop wiring
app/components/chat/
  ChatLayout.js                    shell, rail, drawer, responsive overlays
  WorkspaceRail.js                evolved SidebarRail
  ConversationDrawer.js           evolved Sidebar
  RuntimeRail.js                   new provider/model/context/status summary
  ContextInspector.js              new optional sources/files/runs panel
  CommandDock.js                   evolved ChatInput shell
  CommandTools.js                  progressive tool tray
  ModelSelector.js                 existing behavior, new trigger/popover skin
  MessageList.js                   existing rendering, refined surface classes
app/components/brand/HanimoMark.js v2 path behind the existing component API
app/lib/chat-ui-contract.js         optional constants only; no server data
```

Names are recommendations, not a requirement. The required boundary is that
runtime data remains owned by the existing hooks and view components receive
serializable values and callbacks.

## Definition of done

The port is complete only when every item in `QA_CHECKLIST.md` passes in a real
browser at 375, 768, and 1280+ widths, both languages, every theme mode, one
non-amber preset, and a custom HEX palette. A matching screenshot alone is not
completion.
