# Hanimo WebUI product-design exploration

## Audit findings

### Brand and iconography

- The amber mark is structurally sound but too close to a generic menu glyph at
  small sizes.
- Navigation currently mixes project wrapper icons, Lucide, and Phosphor. Even
  when individual icons are correct, stroke density and bounding boxes vary.
- The browser icon, product mark, empty state, and admin identity should share
  one construction rule rather than separate artwork.

### Navigation

- A rail plus expanded drawer is the right architecture, but active state,
  search, recent conversations, and global destinations compete for attention.
- Recent chats need time grouping and quiet metadata before more decoration.
- Admin, profile, community, and product tools need distinct zones rather than
  one continuous icon list.

### Header and runtime state

- Centering only the workspace title leaves model/provider state disconnected
  from the chat task.
- The selected model, provider type, connection state, and context usage should
  form one compact runtime rail adjacent to the conversation title.

### Messages

- Chat should remain content-first. Repeated bubbles, borders, and avatars would
  reduce long-form reading quality.
- Speaker changes need a small identity marker, while code, sources, tool runs,
  and warnings need stronger structured surfaces.

### Composer

- The composer is the highest-value redesign target. Attachments, draw, custom
  instructions, images, memory, model choice, and send/stop state should not all
  appear at equal priority.
- Default state: input, attach, Tools, model, send.
- Expanded state: draw, image analysis, instruction, memory, and file context.
- Runtime errors should appear inline above the dock, not as detached alerts.

## Directions considered

### A. Warm Command Deck — selected

Cream work surface, graphite reading layer, amber command focus, restrained
green status. Best match for the existing Hanimo identity and daily use.

### B. Graphite Studio

Dark-only technical workbench with very high code focus. Strong as a theme, but
too heavy as the default and less distinctive from existing developer tools.

### C. Honeycomb Canvas

More literal honeycomb modules and warm illustration. Memorable, but risks
turning dense chat and admin work into decorative card layouts.

## Prototype coverage

- Desktop rail and conversation drawer
- Mobile navigation overlay
- Conversation title and runtime rail
- User and assistant message treatments
- Source and tool-result treatment
- Collapsible context inspector
- Composer focus, attachment chips, tool tray, model menu, send/stop state
- Light/dark theme, KO/EN labels, keyboard focus, reduced motion
- New brand mark, favicon, and unified SVG icon sprite

## Visual artifacts

- Interactive prototype: `warm-command-deck.html`
- Generated product concept: `generated/warm-command-deck-concept.png`
- Brand assets: `assets/hanimo-mark-v2.svg`, `assets/favicon-v2.svg`
- Interface icon system: `assets/icon-sprite.svg`
- Next.js implementation handoff: `nextjs-handoff/README.md`
- Nine-skin comparison gallery and shared appearance lab: `variants/index.html`

The generated concept is a directional reference, not a production screenshot.
The interactive HTML remains the source of truth for responsive behavior,
keyboard interaction, light/dark themes, and Korean/English labels.

## Production candidates

1. Adopt the SVG mark/favicons after 16px and monochrome tests.
2. Refactor the composer first; it delivers the largest usability gain without
   changing backend contracts.
3. Merge provider/model/context health into a reusable runtime rail.
4. Normalize production icons through a single wrapper and fixed optical box.
5. Apply drawer information architecture after composer validation.
6. Treat the right inspector as optional progressive disclosure, not a default
   permanent panel on smaller screens.
