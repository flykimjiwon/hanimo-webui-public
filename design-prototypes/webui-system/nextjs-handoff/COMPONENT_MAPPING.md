# Component mapping

## Shell mapping

| Prototype region | Current production owner | Target responsibility |
| --- | --- | --- |
| 64px workspace rail | `SidebarRail.js` | nav, new chat, theme, settings, profile |
| conversation drawer | `Sidebar.js` | search, grouped rooms, room actions, user footer |
| top conversation title | `ChatHeader.js` | title, compact mobile actions |
| runtime controls | `ModelSelector.js` + page state | provider/model/context/status summary |
| message canvas | `MessageList.js` | content-first turns and structured artifacts |
| command dock | `ChatInput.js` | input, attachments, tools, model, send/stop |
| context inspector | no single owner | derived files/sources/runs view |
| responsive shell | `ChatLayout.js` | rail/drawer/canvas/inspector layout |

## Props to preserve

Before restyling, capture the current public props of each component. Existing
parents and hooks should continue to work during each migration phase.

### `ChatInput` / proposed `CommandDock`

Preserve all existing props and semantics, including:

- `input`, `setInput`, `handleSend`, `isGenerating`, stop/cancel callback
- `selectedModel`, `setSelectedModel`, `modelOptions`, `modelConfig`
- selected images and removal callbacks
- draw mode and draw availability
- custom instruction state and opener
- memory state and toggle/opener
- maximum question/image limits and validation
- input ref and keyboard behavior

Recommended internal decomposition:

```text
CommandDock
  AttachmentStrip
  ComposerTextarea
  ComposerError
  ComposerActions
    AttachButton
    CommandToolsTrigger
    ModelSelector
    SendStopButton
  CommandTools (popover/sheet depending on viewport)
```

Decomposition must not change callback order or create duplicate file inputs.

### `Sidebar`

Keep room creation, selection, rename, deletion, role-aware destinations,
logout, and the existing responsive close behavior. Visual time grouping may be
derived client-side from room timestamps, but sorting must not mutate the rooms
array owned by `useChat`.

### `ModelSelector`

Retain model option filtering, unavailable/loading states, default-model
behavior, and room-level persistence. The runtime rail may render the selected
provider separately, but the selector remains the only control that changes the
selected model.

### `MessageList`

Retain Markdown sanitization, code blocks, copy/feedback actions, streaming,
image content, sources, tool output, errors, and scroll anchoring. The redesign
should primarily alter wrappers and tokens; message parsing is out of scope.

## Target anatomy and states

### Workspace rail

- Width: `--wcd-rail-width` (64px default)
- Active destination: amber notch + semantic primary-soft surface
- Tooltip: keyboard accessible and portaled above drawers
- Mobile: rail is not permanently visible; expose its destinations in drawer
- Logo button: same hit target as nav items, minimum 44×44px

States: default, hover, focus-visible, active, disabled, unread indicator.

### Conversation drawer

- Search first, then time-grouped rooms
- Selected room uses background and weight, not color alone
- Rename/delete remain discoverable on keyboard focus, not hover only
- Footer contains local stack health and account summary as separate zones

States: empty, loading, search-empty, selected, editing, deleting, error.

### Runtime rail

- Title stays the primary information
- Provider status uses label + dot; dot alone is insufficient
- Model selection remains a button with popup semantics
- Context is text first; graphical meter is supplementary
- On narrow widths collapse in this order: context → provider → subtitle

### Command dock

- Default actions: attach, tools, model, send/stop
- Expanded tools: drawing, image analysis, custom instruction, memory, file context
- Attachments appear above the textarea as removable chips
- Enter sends; Shift+Enter inserts a newline; IME composition must never send
- Textarea grows to a bounded maximum, then scrolls internally
- Send key is the strongest amber control, but preserves customized primary color

States: idle, focused, populated, attachments, tools-open, sending, stopping,
validation-error, provider-error, disabled.

### Context inspector

- Desktop optional panel, not mandatory permanent chrome
- Tablet/mobile rendered as sheet or full-height drawer
- Tabs: context, files, runs; hide empty tabs only if discoverability remains
- Close restores focus to the opener

## Responsive matrix

| Width | Rail | Drawer | Inspector | Composer |
| --- | --- | --- | --- | --- |
| `< 640` | hidden | modal sheet | modal sheet | edge-safe, compact labels |
| `640–767` | hidden/compact | modal sheet | modal sheet | full controls if space allows |
| `768–1119` | fixed rail | overlay drawer | closed by default sheet | centered with safe gutters |
| `1120–1439` | fixed rail | optional fixed | optional fixed | bounded reading column |
| `≥ 1440` | fixed rail | fixed/remembered | optional fixed | full runtime and inspector |

Use CSS container/responsive behavior for presentation. Use JavaScript viewport
checks only when interaction semantics genuinely differ, and subscribe safely
through `matchMedia` rather than reading `window.innerWidth` during render.
