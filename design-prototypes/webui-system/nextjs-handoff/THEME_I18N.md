# Theme, palette, and localization preservation

## Existing contracts

| Feature | Contract |
| --- | --- |
| light/dark preference | local storage `theme` |
| customized theme cache | local storage `hanimo-webui-theme` |
| server theme | `/api/public/settings` → `themePreset`, `themeColors` |
| live update | `hanimo-webui-theme-updated` event |
| language | local storage `hanimo-webui-lang` |
| translations | `app/lib/i18n/ko.json`, `en.json` |

The redesign must use these contracts rather than add `next-themes`, a second
theme context, URL locales, or a second translation library.

## Palette compatibility

All presets in `app/lib/themePresets.js` must remain functional:

- Amber Soft
- Blue
- Green
- Purple
- Rose
- Slate
- Custom primary HEX

Acceptance requires testing at least Amber Soft, one cool preset, one dark mode,
and a custom HEX. A component that stays hard-coded amber fails even if the
default screenshot matches the prototype.

## Theme application sequence

1. `app/layout.js` restores mode and cached variables before paint.
2. `SiteSettings` fetches authoritative public settings.
3. Theme variables are applied to `document.documentElement` and the dark scope.
4. Admin changes dispatch the existing update event.
5. Components react automatically through CSS variables; they should not need
   React state for colors.

Avoid inline computed color values in components because they will not update
consistently when a theme event arrives.

## Translation workflow

Every new visible string requires the same key in Korean and English. Suggested
namespace additions:

```json
{
  "chat_shell": {
    "runtime": "Runtime",
    "provider": "Provider",
    "model": "Model",
    "context": "Context",
    "connected": "Connected",
    "degraded": "Degraded",
    "offline": "Offline",
    "open_inspector": "Open context inspector",
    "close_inspector": "Close context inspector",
    "tools": "Tools",
    "files": "Files",
    "runs": "Runs",
    "local_stack_healthy": "Local stack healthy"
  }
}
```

Korean must be authored naturally rather than mechanically transliterated. Keep
button text short and move explanation to descriptions/tooltips where needed.

## Dynamic and accessibility strings

- Use interpolation for counts and context values.
- Dates use the current language locale; do not hard-code `ko-KR` globally.
- `aria-label`, empty states, tooltips, validation, and status announcements are
  translated too.
- Provider/model brand names are data and should not be translated.
- Keyboard names may remain platform conventions, but explanatory text must be
  localized.
- Update `document.documentElement.lang` through the existing language path.

## Locale layout test

For every new control, test:

- Korean at 100% and 125% text scale
- English at 100% and 125% text scale
- narrow mobile with long translated labels
- no truncation of destructive or state-changing action labels
- tooltip and accessible name still present when the visual label collapses
