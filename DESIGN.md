# hanimo-webui Design System

## 1. Atmosphere & Identity

hanimo-webui is a quiet self-hosted AI workbench: practical, dense enough for daily operation, and calm under admin load. The recognizable signature is warm amber command focus on a neutral stone surface system. Navigation, builders, and admin pages should feel like operating software, not a marketing site.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Surface/base | `--hn-bg` | `#fafaf9` | `#1c1917` | Page background |
| Surface/primary | `--hn-surface` | `#ffffff` | `#1f1813` | Panels, sidebars, cards |
| Surface/secondary | `--hn-surface-2` | `#f5f5f4` | `#292524` | Muted panels, row hover |
| Surface/tertiary | `--hn-surface-3` | `#e7e5e4` | `#44403c` | Strong separators |
| Text/primary | `--hn-fg` | `#1c1917` | `#fafaf9` | Body and headings |
| Text/secondary | `--hn-fg-2` | `#44403c` | `#d6d3d1` | Secondary copy |
| Text/muted | `--hn-fg-muted` | `#78716c` | `#a8a29e` | Hints, labels, metadata |
| Border/default | `--hn-border` | `#e7e5e4` | `#44403c` | Dividers and controls |
| Border/strong | `--hn-border-strong` | `#d6d3d1` | `#57534e` | Selected/active outlines |
| Accent/primary | `--hn-primary` | `#f5a623` | `#f5a623` | Primary actions, active nav, focus |
| Accent/soft | `--hn-primary-soft` | `rgba(245, 166, 35, 0.14)` | `rgba(245, 166, 35, 0.18)` | Active backgrounds |
| Accent/strong | `--hn-primary-strong` | `#d99437` | `#ffd089` | Hover emphasis |
| Status/success | `--hn-good` | `#6cae75` | `#6cae75` | Saved, pass |
| Status/warning | `--hn-warn` | `#e8a317` | `#e8a317` | Caution, work in progress |
| Status/error | `--hn-error` | `#d97757` | `#d97757` | Errors, destructive |
| Status/info | `--hn-info` | `#6b8db5` | `#6b8db5` | Informational status |

### Rules

- Use amber only for action, selection, or focus. Do not use it as decoration.
- Blue is reserved for the semantic info token; do not introduce raw blue for primary actions.
- Raw hex/rgb values belong in `app/globals.css` token definitions or this file, not in feature components.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Tracking | Usage |
|---|---:|---:|---:|---:|---|
| H1 | 30px / 1.875rem | 700 | 1.2 | 0 | Page titles |
| H2 | 24px / 1.5rem | 650 | 1.25 | 0 | Section titles |
| H3 | 18px / 1.125rem | 600 | 1.35 | 0 | Panel titles |
| Body | 16px / 1rem | 400 | 1.55 | 0 | Default content |
| Body/sm | 14px / 0.875rem | 400 | 1.5 | 0 | Controls, table text |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0 | Metadata, hints |
| Micro | 11px / 0.6875rem | 600 | 1.3 | 0 | Dense labels, badges |

### Font Stack

- Primary: `var(--hn-font)` = Pretendard Variable, Pretendard, Inter, Apple/System Korean UI, sans-serif.
- Mono: `var(--hn-mono)` = JetBrains Mono, SF Mono, ui-monospace, monospace.

### Rules

- Use sentence case for product UI labels in English; Korean labels should stay short and noun-led.
- Data, token hashes, keyboard hints, and technical IDs use the mono stack or tabular numeric styling.
- Body text below 14px is allowed only for dense metadata, not primary actions.

## 4. Spacing & Layout

### Base Unit

All spacing derives from 4px.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | 4px | Icon-to-label, dense table gaps |
| `--space-2` | 8px | Button inner gaps, compact rows |
| `--space-3` | 12px | Form/control padding |
| `--space-4` | 16px | Page gutters on mobile |
| `--space-5` | 20px | Card and panel padding |
| `--space-6` | 24px | Page section rhythm |
| `--space-8` | 32px | Major content breaks |
| `--space-10` | 40px | Empty/loading state vertical room |

### Grid

- Max content width: `max-w-7xl` for admin, `max-w-6xl` for workflow/screen lists, full-width split panes for builders.
- Breakpoints: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`).
- Persistent navigation uses 64px rail and 320px drawer/sidebar widths.

### Rules

- Prefer scan-friendly operational layouts: left rail/sidebar, compact headers, stable table/card grids.
- Builder pages may use full viewport panes, but controls must wrap on mobile and never require horizontal page scroll.
- Use `min-h-screen` or `min-h-dvh` patterns; avoid fixed hero-style sections.

## 5. Components

### Brand mark and chat start surface

- `app/components/brand/HanimoMark.js` is the canonical compact product mark for the chat header, expanded sidebar, rail, login, and setup surfaces. Do not redraw the amber stripe mark inside feature components.
- The empty chat state is a work-start surface, not a marketing hero. It presents one product promise and three solution intents: create, analyze, and code.
- Product claims on the start surface must remain contract-backed: self-hosted, OpenAI-compatible, and model choice. Avoid unverified context-size, speed, or privacy superlatives.
- Workspace owners may customize the site title and description; Hanimo visual identity remains in the token-driven mark and amber command focus.
- Branding settings preview both the in-app workspace header and the browser-tab identity before saving.

### Provider connection

- `/admin/providers` is the primary connection surface. Common vendors are URL/protocol presets over the existing generic adapters, not separate provider engines.
- Ollama, Novita, OpenRouter, OpenAI, DeepSeek, and Gemini remain editable after selecting a preset. `Custom` must always remain available for vLLM, LM Studio, intranet, and future OpenAI-compatible endpoints.
- Provider credentials are write-only in the UI. Saved keys are represented only by `apiKeySet` and must never be returned to the browser.
- Connection setup and model exposure are separate steps: save a provider first, then choose visible models in `/admin/models`.

### Sidebar and rail navigation

- **Structure**: fixed 64px rail for desktop, 320px drawer for expanded/mobile navigation.
- **Variants**: chat rail, expanded chat drawer, admin rail/drawer.
- **Spacing**: 40px icon buttons, 8-12px row gaps, 16px panel padding.
- **States**: active uses `--hn-primary-soft` and primary text; hover uses muted surface shift; disabled uses opacity and blocked cursor.
- **Accessibility**: every icon-only control needs `title` and `aria-label`.
- **Motion**: drawer open/close uses transform transitions only.

### Page header

- **Structure**: eyebrow, title, supporting text, optional actions aligned right.
- **Variants**: admin `PageHead`, workflow list header, screen-builder list header.
- **States**: actions expose disabled/loading state when requests are pending.
- **Accessibility**: title must describe the current route; back controls should include text or a title.

### Empty/loading/error states

- **Structure**: centered icon, title, short description, optional CTA.
- **Variants**: list empty, detail loading, inline error banner.
- **States**: loading uses spinner or skeleton; error gives retry or back route when possible.
- **Accessibility**: loading elements use `role="status"` or descriptive text.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | `--hn-dur-fast` / 150ms | ease-out | Button hover, tooltip reveal |
| Standard | `--hn-dur-base` / 200ms | `--hn-ease` | Drawer, active nav, panel toggles |
| Slow | `--hn-dur-slow` / 300ms | `--hn-ease` | Larger pane transitions |

### Rules

- Animate only `transform`, `opacity`, and color changes.
- Respect `data-reduce-motion` and `prefers-reduced-motion` for nonessential motion.
- Every clickable control needs hover, active or pressed feedback, and visible focus styling.

## 7. Depth & Surface

### Strategy

Depth is mixed but restrained: tonal surface shifts first, 1px borders second, shadows only for overlays/modals and selected cards.

| Level | Token/value | Usage |
|---|---|---|
| Subtle | `--hn-shadow-sm` | Small cards and selected rows |
| Default | `--hn-shadow-md` | Elevated cards, dropdowns |
| Prominent | `--hn-shadow-lg` | Modals, blocking overlays |

### Rules

- Page sections should be unframed layouts or full-width bands.
- Use cards only for repeated list items, modal content, or truly framed tools.
- Do not nest cards inside cards; use dividers or tonal shifts inside panels.

## 8. Open-source hub prototype extension

This extension applies only to the standalone open-source public-page
prototype. It does not change the operational product UI.

### Intent

- **Human**: a self-hosting adopter or technical maintainer who has just
  inspected the GitHub repository and is deciding whether the project is safe
  and maintainable enough to install.
- **Task**: verify license, provenance, release integrity, support boundaries,
  and recovery guidance before starting the first install.
- **Feeling**: a warm technical dossier: calm like archival paper, precise like
  a release terminal, and clearly maintained by a real person.

### Domain and color world

- Domain concepts: release ledger, checksum, provenance chain, local stack,
  maintainer signature, bilingual manual, recovery point.
- Color world: amber wax seal, cream paper, graphite terminal, muted brass,
  moss-green verification, clay-red warning.

### Signature

The signature component is the **trust rail**: a vertical amber line connecting
license, provenance, operations, and security evidence. It appears beside a
release ledger that uses real repository facts rather than generic product
claims.

### Defaults rejected

- Generic centered SaaS hero → offset editorial copy beside a release ledger.
- Three equal feature cards → a connected trust rail with unequal evidence rows.
- Purple/blue AI glow → warm paper, graphite, and amber command focus.
- Decorative logo wall → maintainer identity, source revision, and policy links.

### Prototype primitives

- `release-ledger`: layered graphite terminal sheet with status rows and copy
  feedback.
- `trust-rail`: connected evidence timeline with current and planned states.
- `language-switch`: compact KO/EN segmented control with visible focus.
- `maintainer-signature`: factual creator/contact block, not a testimonial.
- `doc-matrix`: bilingual documentation coverage table with horizontal overflow
  containment on mobile.

### Accessibility and motion

- Minimum 44px touch targets for primary controls.
- Amber never carries status without text or icon support.
- Entry motion is limited to opacity and translate, and is removed under
  `prefers-reduced-motion`.
- The standalone page keeps a skip link, semantic landmarks, visible focus,
  readable Korean line breaking, and no essential hover-only content.

## 9. WebUI product-shell prototype extension

This extension defines the standalone `Warm Command Deck` exploration for the
actual Hanimo WebUI product shell. It does not replace production components.

### Product diagnosis

- The composer owns many capabilities but exposes them at nearly equal visual
  weight, increasing decision cost before typing.
- Rail, drawer, header, model selector, and composer mix icon families and
  density rules, weakening the sense of one operating surface.
- The current compact amber mark is functional but lacks a distinctive favicon
  silhouette at 16–32px.
- Provider/model state is separated from the moment of composition, so users
  must infer which runtime will receive the prompt.

### Direction comparison

1. **Warm Command Deck — selected**: light paper work surface, graphite message
   layer, amber command focus, progressive composer tools, visible runtime rail.
2. **Graphite Studio — rejected for default**: strong focus and code readability,
   but too dark and operationally heavy as the only product identity.
3. **Honeycomb Canvas — rejected**: highly brandable but risks decorative card
   geometry and competes with long-form chat content.

### Signature and primitives

- **Signature**: the composer is a command dock with a single amber send key;
  tool capability expands from one `Tools` control instead of a permanent row
  of equally loud buttons.
- `workspace-rail`: 64px navigation with a precise active notch and tooltips.
- `conversation-drawer`: search-first recent conversation list with time groups.
- `runtime-rail`: provider, model, context, and connection state in one line.
- `message-sheet`: content-first messages with avatars only at speaker changes.
- `command-dock`: multiline input, compact attachments, progressive tool tray,
  model switch, keyboard hint, and deterministic send state.
- `context-inspector`: optional right panel for sources, files, and run metadata.

### Asset rules

- `hanimo-mark-v2.svg` is the product-shell exploration mark: three horizontal
  command lines and a lower-right execution node inside a rounded amber field.
- `favicon-v2.svg` simplifies the same geometry for 16–32px recognition.
- `icon-sprite.svg` is a consistent 1.75px round-cap technical icon family for
  prototype navigation and composer controls.
- Raster imagery is limited to optional empty-state or onboarding atmosphere;
  core controls and brand marks remain deterministic SVG.
