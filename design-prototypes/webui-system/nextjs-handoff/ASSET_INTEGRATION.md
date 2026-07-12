# Asset integration

## Available prototype assets

- `../assets/hanimo-mark-v2.svg`
- `../assets/favicon-v2.svg`
- `../assets/icon-sprite.svg`
- `../generated/warm-command-deck-concept.png`

The PNG is a design reference only. Do not ship it as application chrome.

## Product mark

Keep the current `HanimoMark` component API (`size`, `className`, accessibility
behavior) and replace only its internal SVG geometry after visual acceptance.
This prevents changes across chat, admin, settings, and messages.

Required mark checks:

- crisp at 16, 24, 32, and 64 CSS pixels
- recognizable in monochrome
- no clipped stroke at 200% zoom
- decorative instances use `aria-hidden="true"`
- linked/home instance has a translated accessible name on its button/link

## Favicon

After approval, copy the optimized favicon into `public/icon.svg` or update the
metadata path consistently. Keep runtime administrator favicon behavior in
`SiteSettings`; the bundled mark is the fallback, not an override of custom
branding.

Test browser tab, pinned tab behavior where supported, shortcut metadata, and
dark browser chrome. Provide PNG/ICO fallbacks only if actual target-browser
testing shows they are needed.

## Interface icons

The sprite is a geometry and optical-weight reference. Production React should
prefer the existing `@/components/icons` wrapper because the repository already
normalizes Lucide/Phosphor usage there.

For any missing custom Hanimo icon:

1. Export it as a React SVG component with `currentColor`.
2. Use one viewBox convention and the documented 1.75px optical stroke.
3. Pass `aria-hidden` by default; the parent button owns the accessible name.
4. Avoid embedding raw SVG strings or `dangerouslySetInnerHTML`.
5. Add an icon showcase state before using it across the shell.

## Asset licensing

- Project-authored SVG geometry remains under the repository license.
- Do not copy third-party product logos from the generated concept.
- Provider names may appear as text; provider logos require separate provenance
  and trademark review.
- When adding an external icon or font, record package, version, license, source,
  modifications, and required notice in `THIRD_PARTY_NOTICES.md`.
- Keep generated-image provenance documented; do not imply that the generated
  concept is a screenshot of a shipped product.
