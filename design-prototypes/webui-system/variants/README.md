# Hanimo WebUI alternative design directions

All five variants preserve the content structure and interaction script of
`../warm-command-deck.html`. They explore product character rather than five
simple palette swaps.

| Direction | Strongest quality | Best fit | Main trade-off |
| --- | --- | --- | --- |
| Graphite Terminal | density and technical confidence | developers, operations | dark-first and less welcoming |
| Aurora Glass | calm spatial depth | broad daily use | translucent material needs careful performance QA |
| Paper Ledger | long-form reading and provenance | research, review, compliance | less conventional chat styling |
| Cobalt Studio | clear operational navigation | mixed admin/chat work | weaker amber-only brand recognition |
| Honeycomb Focus | strongest Hanimo identity | flagship default shell | geometric motifs require restraint |

## Recommendation

Keep Warm Command Deck as the baseline. The strongest production synthesis is:

- Warm Command Deck information architecture and command dock
- Honeycomb Focus active-state and brand geometry
- Cobalt Studio operational status hierarchy
- Paper Ledger long-form source treatment
- Aurora Glass only for overlays and elevated transient surfaces

Graphite Terminal is best retained as an optional high-density theme rather
than blended into the default light experience.

## Shared interactions

- light/dark toggle
- Korean/English switch
- context inspector open/close
- tools tray open/close
- model selector and model change
- mobile conversation drawer
- Enter-to-send prototype behavior

Open `index.html` for the comparison gallery or open each file directly for the
full interactive canvas.
