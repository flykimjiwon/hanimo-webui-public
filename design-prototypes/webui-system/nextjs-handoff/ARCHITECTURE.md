# Architecture and state ownership

## Current stack

- Next.js 15 App Router
- React 19 client components for the chat workspace
- Tailwind CSS 4 with CSS-first `@theme`
- CSS variables for shadcn-compatible semantic colors and Hanimo `--hn-*`
- JSON dictionaries through `LanguageProvider` and `useTranslation`
- Dynamic imports for browser-heavy chat surfaces

The new design does not require a framework, router, state library, or API
change.

## Ownership rule

`app/page.js` remains the composition root. It owns the product state supplied
by existing hooks and passes it to presentation components. Do not duplicate
selected model, message, room, attachment, memory, instruction, or draw state in
the new shell.

```text
useChat ─────────────── rooms, currentRoom, messages, room operations
useModelManager ─────── modelOptions, modelConfig, selectedModel
useChatSender ───────── input, send/stop, generation and validation state
page.js ─────────────── permissions, settings, modal state, attachment state
  │
  ├─ ChatLayout ─────── rail/drawer/inspector visibility only
  ├─ RuntimeRail ────── derived runtime display; no independent model state
  ├─ MessageList ────── existing message renderer
  └─ CommandDock ────── existing ChatInput callbacks and input ref
```

## Server and client boundaries

- Keep `app/layout.js` as the server root layout.
- `SiteSettings`, language controls, chat shell, popovers, drawers, and composer
  remain client components.
- Metadata defaults stay in `app/layout.js`; runtime branding remains applied by
  `SiteSettings` because administrators can change the site title/favicon.
- Do not access `localStorage` during server render. Preserve the current inline
  boot script for theme/language FOUC prevention until it is separately tested.
- Load heavy or browser-only panels with `next/dynamic` only when their bundle or
  DOM dependency justifies it. Small buttons and layout primitives should be
  ordinary imports.

## New view state

Only these states are legitimately new:

| State | Owner | Persistence |
| --- | --- | --- |
| context inspector open | `ChatLayout` or page | optional local storage |
| inspector tab | `ContextInspector` | session only |
| command tools expanded | `CommandDock` | session only |
| model popover open | `ModelSelector` | session only |
| mobile drawer open | existing `sidebarOpen` | existing behavior |

Do not persist transient popover or tray states. On viewports below 1120px the
inspector must initialize closed and must not cover the composer unexpectedly.

## Derived runtime model

`RuntimeRail` should receive a deliberately small view model:

```js
{
  providerLabel,
  modelLabel,
  connectionState, // 'connected' | 'degraded' | 'offline' | 'unknown'
  contextUsed,
  contextLimit,
  isLoadingModels,
}
```

Derive this from existing model configuration and request state. Do not add a
new fetch solely to populate decorative runtime data. If context usage is not
available accurately, omit the meter or label it unavailable; never fabricate a
number.

## Context inspector data

The first implementation should expose only data already present in message and
room state:

- referenced/uploaded files
- source metadata returned with assistant messages
- tool/run metadata already rendered in the conversation
- room message count and selected model

Do not create backend persistence for the inspector. It is a different view of
existing data, not a new data store.

## Error and loading behavior

- Preserve the existing alert/toast contract for global failures.
- Composer validation errors should be visible adjacent to the command dock and
  announced with `role="alert"` or an `aria-live` region.
- Model loading must disable the model trigger without disabling typing.
- Sending locks only controls that would corrupt the active request. Stop must
  remain immediately reachable.
- Empty, loading, streaming, completed, cancelled, and failed message states all
  require explicit rendering.

## Performance boundaries

- Memoize leaf controls only when props are stable and measurement shows value.
- Do not pass a large `messages` array into the rail or runtime header.
- Keep the composer text state in the existing sender path to avoid two sources
  of truth.
- The inspector may compute indexes with `useMemo`, but must not deep-clone
  messages on each keystroke.
- Animate only `transform`, `opacity`, or `filter`; drawer width/layout jumps
  should use discrete responsive states or a transform overlay.
