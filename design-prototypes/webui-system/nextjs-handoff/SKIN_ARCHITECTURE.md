# Reusable skin architecture for Next.js

## Objective

Ship one accessible chat DOM and interaction model while allowing multiple
visual skins. A skin changes material, geometry, density defaults, and component
treatment. It must not fork chat behavior, data fetching, translations, or API
contracts.

## Preference model

```js
{
  skin: 'warm-command-deck',
  mode: 'system',
  palette: 'amber-soft',
  customPrimary: '#f5a623',
  typeScale: 1,
  density: 'cozy'
}
```

These axes are independent:

- `skin`: structural visual recipe
- `mode`: light, dark, or system
- `palette`: primary/action color family
- `customPrimary`: user-defined primary when palette is custom
- `typeScale`: 0.85, 1, 1.15, or 1.25
- `density`: compact, cozy, or relaxed spacing

Do not encode combinations such as `dark-blue-compact-honeycomb`. That creates
an unmaintainable matrix and prevents independent preference changes.

## Proposed production files

```text
app/components/theme/
  AppearanceProvider.js
  AppearanceDrawer.js
  SkinPicker.js
app/lib/appearance/
  appearance-contract.js
  skin-registry.js
  palette-registry.js
app/styles/skins/
  warm-command-deck.css
  graphite-terminal.css
  aurora-glass.css
  paper-ledger.css
  cobalt-studio.css
  honeycomb-focus.css
  mono-atelier.css
  moss-laboratory.css
  signal-orange.css
```

The current `ThemeDrawer` may evolve into `AppearanceDrawer`; do not ship a
second competing settings surface. Preserve its local storage and server theme
integration while expanding the validated preference shape.

## DOM contract

Apply preferences to the root element:

```html
<html
  data-skin="warm-command-deck"
  data-theme="dark"
  data-density="cozy"
  style="--type-scale: 1"
>
```

Skin CSS must target stable semantic component classes or data attributes. It
must not depend on generated Tailwind class order or duplicate component JSX.

## Token layers

```text
base semantic tokens
  → mode surface tokens
  → administrator/user palette action tokens
  → skin material and geometry aliases
  → component state styles
```

Skin files may define surface depth, radius, rail material, and message/source
treatment. They may not redefine status meaning, focus visibility, destructive
color, or minimum hit targets.

## Registry contract

Each registered skin should declare metadata rather than import component code:

```js
{
  id: 'paper-ledger',
  labelKey: 'appearance.skin.paper_ledger',
  stylesheet: 'paper-ledger',
  defaultDensity: 'relaxed',
  preview: '/appearance/paper-ledger.webp',
  supports: { light: true, dark: true }
}
```

Validate persisted values against registries before applying them. Unknown or
removed values fall back to `warm-command-deck`, never arbitrary class names.

## Persistence and precedence

Recommended precedence:

1. explicit authenticated user appearance preference
2. local device preference cache
3. administrator site defaults
4. product defaults

Mode `system` resolves from `prefers-color-scheme` without overwriting the saved
mode. Apply cached settings in the existing pre-paint layout script to prevent
FOUC. Server settings should reconcile after hydration without switching a
user's explicit preference unexpectedly.

## Security and operations

- Allow only registry skin IDs and density/scale enum values.
- Validate custom colors as normalized HEX before writing CSS variables.
- Never inject user-provided CSS, stylesheet URLs, or arbitrary variable names.
- Skin assets must follow the repository license/provenance policy.
- A missing skin stylesheet must fail safely to baseline tokens.

## Testing matrix

The complete Cartesian product is unnecessary. Use pairwise coverage plus
invariants:

- every skin in light/cozy/100%/amber
- every skin in dark/compact/125%/one cool palette
- baseline with all six palettes and custom HEX
- baseline with every scale and density
- selected high-risk combinations: glass dark/custom, graphite light/125%,
  ledger mobile/English, honeycomb custom palette

Every combination must retain readable focus, semantic status colors, mobile
composer access, Korean/English layout, and no hydration mismatch.
