# Design token bridge

The prototype uses illustrative values. Production must route every value
through existing semantic variables so administrator palettes continue to work.

## Token hierarchy

```text
Admin/API theme values
  → shadcn variables (--primary, --background, --border, ...)
  → Hanimo semantic aliases (--hn-primary, --hn-surface, ...)
  → Warm Command Deck component aliases (--wcd-*)
  → Tailwind utilities / component CSS
```

Do not set amber directly in a component. Amber is the default brand preset,
while blue, green, purple, rose, slate, and custom HEX are supported product
features.

## Proposed aliases

Add these to `app/globals.css` only when implementation begins:

```css
:root {
  --wcd-canvas: var(--hn-bg);
  --wcd-panel: var(--hn-surface);
  --wcd-panel-muted: var(--hn-surface-2);
  --wcd-panel-strong: var(--hn-surface-3);
  --wcd-text: var(--hn-fg);
  --wcd-text-secondary: var(--hn-fg-2);
  --wcd-text-muted: var(--hn-fg-muted);
  --wcd-border: var(--hn-border);
  --wcd-border-strong: var(--hn-border-strong);
  --wcd-command: var(--primary, var(--hn-primary));
  --wcd-command-soft: color-mix(in oklch, var(--wcd-command) 14%, transparent);
  --wcd-command-strong: var(--hn-primary-strong);
  --wcd-focus: var(--ring, var(--hn-ring));
  --wcd-positive: var(--hn-good);
  --wcd-warning: var(--hn-warn);
  --wcd-danger: var(--hn-error);
  --wcd-info: var(--hn-info);

  --wcd-rail-width: 4rem;
  --wcd-drawer-width: 20.5rem;
  --wcd-inspector-width: 19.5rem;
  --wcd-reading-width: 52rem;
  --wcd-composer-width: 60rem;

  --wcd-radius-control: calc(var(--hn-radius) - 2px);
  --wcd-radius-surface: calc(var(--hn-radius) + 4px);
  --wcd-radius-dock: calc(var(--hn-radius) + 8px);
  --wcd-shadow-float: var(--hn-shadow-md);
  --wcd-shadow-dock: var(--hn-shadow-lg);
}
```

The layout dimensions may be adjusted after visual QA, but must remain tokens.

## Tailwind 4 usage

This repository uses Tailwind 4 CSS-first configuration. Do not create a
Tailwind 3 `tailwind.config.js` just for this work. Either use arbitrary values
that reference variables or expose tokens through the existing `@theme` block.

```jsx
<main className="bg-[var(--wcd-canvas)] text-[var(--wcd-text)]" />
<button className="bg-[var(--wcd-command)] text-primary-foreground" />
```

Prefer a small semantic component class for multi-layer material recipes rather
than repeating long arbitrary-value strings in JSX.

## Theme behavior requirements

- `--wcd-command` must follow the active administrator/user primary value.
- Dark mode must change surfaces and text, not merely invert the canvas.
- Status colors remain semantic and must not be recolored by the primary preset.
- Focus rings follow `--ring`, which is included in every preset.
- Generated artwork is never used as a CSS background for the production shell.
- Contrast targets: 4.5:1 for normal text, 3:1 for large text and control edges.

## Typography

- UI: existing Pretendard variable stack
- Code/metrics: existing JetBrains Mono stack
- Avoid introducing another web font in this migration.
- Runtime metadata may use mono sparingly; conversation content remains UI font.
- Respect the existing `--type-scale` preference without clipping controls.

## Motion

Use existing duration/easing variables:

- `--hn-dur-fast`: hover/focus feedback
- `--hn-dur-base`: popover and compact state change
- `--hn-dur-slow`: drawer/sheet entrance
- `--hn-ease`: standard easing

Under `prefers-reduced-motion: reduce`, remove nonessential transitions and keep
state changes immediate. Never animate width, height, top, or left in the chat
shell; use transform and opacity.
