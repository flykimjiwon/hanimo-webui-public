export const SKIN_REGISTRY = Object.freeze([
  skin('warm-command-deck', 'warm_command_deck'),
  skin('graphite-terminal', 'graphite_terminal'),
  skin('aurora-glass', 'aurora_glass'),
  skin('paper-ledger', 'paper_ledger'),
  skin('cobalt-studio', 'cobalt_studio'),
  skin('honeycomb-focus', 'honeycomb_focus'),
  skin('mono-atelier', 'mono_atelier'),
  skin('moss-laboratory', 'moss_laboratory'),
  skin('signal-orange', 'signal_orange'),
]);

export const SKIN_IDS = Object.freeze(SKIN_REGISTRY.map(({ id }) => id));

const SKIN_ID_SET = new Set(SKIN_IDS);

export function isSkinId(value) {
  return typeof value === 'string' && SKIN_ID_SET.has(value);
}

export function normalizeSkinId(value, fallback = SKIN_IDS[0]) {
  return isSkinId(value) ? value : fallback;
}

function skin(id, key) {
  return Object.freeze({
    id,
    labelKey: `appearance.skin.${key}`,
    stylesheet: id,
    supports: Object.freeze({ light: true, dark: true }),
  });
}
