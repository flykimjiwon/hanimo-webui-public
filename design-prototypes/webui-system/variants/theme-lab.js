(() => {
  const STORAGE_KEY = 'hanimo-webui-prototype-theme-lab';
  const palettes = {
    amber: { color: '#f5a623', deep: '#a76100' },
    blue: { color: '#3b82f6', deep: '#1d4ed8' },
    green: { color: '#10b981', deep: '#047857' },
    purple: { color: '#8b5cf6', deep: '#6d28d9' },
    rose: { color: '#f43f5e', deep: '#be123c' },
    slate: { color: '#64748b', deep: '#334155' },
  };
  const skins = [
    ['warm-command-deck', 'Warm Command Deck'],
    ['graphite-terminal', 'Graphite Terminal'],
    ['aurora-glass', 'Aurora Glass'],
    ['paper-ledger', 'Paper Ledger'],
    ['cobalt-studio', 'Cobalt Studio'],
    ['honeycomb-focus', 'Honeycomb Focus'],
    ['mono-atelier', 'Mono Atelier'],
    ['moss-laboratory', 'Moss Laboratory'],
    ['signal-orange', 'Signal Orange'],
  ];
  const defaults = { mode: 'system', palette: 'amber', custom: '#f5a623', scale: '100', density: 'cozy' };
  let state = { ...defaults };
  try { state = { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch {}

  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const currentSkin = location.pathname.split('/').pop().replace('.html', '') || 'warm-command-deck';

  function activeColor() {
    return state.palette === 'custom' ? state.custom : palettes[state.palette]?.color || palettes.amber.color;
  }

  function activeDeep() {
    return state.palette === 'custom' ? state.custom : palettes[state.palette]?.deep || palettes.amber.deep;
  }

  function apply() {
    const dark = state.mode === 'dark' || (state.mode === 'system' && systemDark.matches);
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--amber', activeColor());
    root.style.setProperty('--amber-deep', activeDeep());
    root.style.setProperty('--amber-soft', `color-mix(in srgb, ${activeColor()} 22%, transparent)`);
    root.style.setProperty('--prototype-scale', String(Number(state.scale) / 100));
    root.style.fontSize = `calc(16px * ${Number(state.scale) / 100})`;
    document.body.classList.remove('density-compact', 'density-cozy', 'density-relaxed');
    document.body.classList.add(`density-${state.density}`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncControls();
  }

  function segmented(name, values) {
    const group = document.createElement('div');
    group.className = `theme-lab-segments${values.length === 4 ? ' four' : ''}`;
    values.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.setting = name;
      button.dataset.value = value;
      button.textContent = label;
      button.addEventListener('click', () => { state[name] = value; apply(); });
      group.append(button);
    });
    return group;
  }

  function field(label, content) {
    const wrapper = document.createElement('label');
    wrapper.className = 'theme-lab-field';
    const title = document.createElement('span');
    title.textContent = label;
    wrapper.append(title, content);
    return wrapper;
  }

  const panel = document.createElement('section');
  panel.className = 'theme-lab';
  panel.id = 'themeLab';
  panel.setAttribute('aria-label', 'Design settings');
  panel.innerHTML = '<div class="theme-lab-head"><strong>Design settings</strong><button class="theme-lab-close" type="button" aria-label="Close settings">×</button></div>';
  const body = document.createElement('div');
  body.className = 'theme-lab-body';

  const skinSelect = document.createElement('select');
  skinSelect.className = 'theme-lab-select';
  skins.forEach(([value, label]) => skinSelect.add(new Option(label, value, false, value === currentSkin)));
  skinSelect.addEventListener('change', () => {
    const inVariants = location.pathname.includes('/variants/');
    location.href = skinSelect.value === 'warm-command-deck'
      ? (inVariants ? '../warm-command-deck.html' : 'warm-command-deck.html')
      : `${inVariants ? '' : 'variants/'}${skinSelect.value}.html`;
  });
  body.append(field('Skin', skinSelect));

  const swatches = document.createElement('div');
  swatches.className = 'theme-lab-palettes';
  Object.entries(palettes).forEach(([name, palette]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-lab-swatch';
    button.style.setProperty('--swatch', palette.color);
    button.dataset.palette = name;
    button.setAttribute('aria-label', `${name} palette`);
    button.addEventListener('click', () => { state.palette = name; apply(); });
    swatches.append(button);
  });
  const customButton = document.createElement('button');
  customButton.type = 'button';
  customButton.className = 'theme-lab-swatch';
  customButton.style.setProperty('--swatch', 'conic-gradient(red,#ff0,#0f0,#0ff,#00f,#f0f,red)');
  customButton.dataset.palette = 'custom';
  customButton.setAttribute('aria-label', 'Custom palette');
  customButton.addEventListener('click', () => { state.palette = 'custom'; apply(); });
  swatches.append(customButton);
  body.append(field('Palette', swatches));

  const customRow = document.createElement('div');
  customRow.className = 'theme-lab-custom';
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.value = state.custom;
  customInput.setAttribute('aria-label', 'Custom primary color');
  const customOutput = document.createElement('output');
  customInput.addEventListener('input', () => { state.custom = customInput.value; state.palette = 'custom'; apply(); });
  customRow.append(customInput, customOutput);
  body.append(field('Custom primary', customRow));
  body.append(field('Mode', segmented('mode', [['light','Light'],['dark','Dark'],['system','System']])));
  body.append(field('Type scale', segmented('scale', [['85','85%'],['100','100%'],['115','115%'],['125','125%']])));
  body.append(field('Density', segmented('density', [['compact','Compact'],['cozy','Cozy'],['relaxed','Relaxed']])));
  panel.append(body);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'theme-lab-trigger';
  trigger.textContent = 'Design';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'themeLab');
  trigger.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    trigger.setAttribute('aria-expanded', String(open));
  });
  panel.querySelector('.theme-lab-close').addEventListener('click', () => {
    panel.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  });

  function syncControls() {
    panel.querySelectorAll('[data-setting]').forEach(button => button.setAttribute('aria-pressed', String(state[button.dataset.setting] === button.dataset.value)));
    panel.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', String(state.palette === button.dataset.palette)));
    customInput.value = state.custom;
    customOutput.value = `${state.custom.toUpperCase()} · ${state.palette === 'custom' ? 'active' : 'saved'}`;
  }

  const legacyThemeToggle = document.getElementById('themeToggle');
  legacyThemeToggle?.addEventListener('click', () => {
    queueMicrotask(() => {
      state.mode = root.dataset.theme === 'dark' ? 'dark' : 'light';
      apply();
    });
  });
  systemDark.addEventListener('change', () => { if (state.mode === 'system') apply(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && panel.classList.contains('open')) panel.querySelector('.theme-lab-close').click(); });
  document.body.append(panel, trigger);
  apply();
})();
