'use client';

/**
 * ThemeDrawer — 사용자 테마 환경설정 드로어
 *
 * 시안의 theme-settings.jsx를 React/Next.js로 포팅한 컴포넌트.
 * 사용자가 직접 색상·폰트·밀도·모서리·다크모드를 결정합니다.
 *
 * 저장 형식: localStorage 'hanimo-webui-theme' = { light: {--hn-...}, dark: {--hn-...}, prefs: {...} }
 * 복원: layout.js의 inline FOUC-방지 스크립트가 페이지 로드 직후 자동 적용.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'hanimo-webui-theme';

// typeScale 안전 범위 — 일부 어드민 테이블이 1.2배에서 깨질 수 있어 프로덕션 안전치로 클램프
const TYPE_SCALE_MIN = 0.9;
const TYPE_SCALE_MAX = 1.15;
const clampTypeScale = (v) => Math.min(TYPE_SCALE_MAX, Math.max(TYPE_SCALE_MIN, Number(v) || 1));

// 8 팔레트 — 결정값 'all-8' 반영
const PALETTES = [
  { id: 'amber',    name: '앰버 (기본)',  light: '#f5a623', dark: '#f5be5b', deep: '#d99437' },
  { id: 'sunset',   name: '선셋',         light: '#e76f51', dark: '#f08a6e', deep: '#c45a3f' },
  { id: 'rose',     name: '로즈',         light: '#e11d74', dark: '#f04898', deep: '#b8155f' },
  { id: 'plum',     name: '플럼',         light: '#8b5cf6', dark: '#a78bfa', deep: '#7042e0' },
  { id: 'ocean',    name: '오션',         light: '#0ea5e9', dark: '#38bdf8', deep: '#0284c7' },
  { id: 'forest',   name: '포레스트',     light: '#16a34a', dark: '#4ade80', deep: '#15803d' },
  { id: 'mint',     name: '민트',         light: '#14b8a6', dark: '#2dd4bf', deep: '#0f766e' },
  { id: 'graphite', name: '그래파이트',   light: '#44403c', dark: '#a8a29e', deep: '#1c1917' },
];

// 폰트 — 결정값 'pretendard' 우선
const FONTS = [
  { id: 'pretendard', name: 'Pretendard', stack: '"Pretendard Variable", "Pretendard", "Inter", -apple-system, sans-serif' },
  { id: 'system',     name: 'System',     stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif' },
  { id: 'inter+pretendard', name: 'Inter + Pretendard', stack: '"Inter", "Pretendard Variable", "Pretendard", sans-serif' },
  { id: 'serif',      name: 'Serif',      stack: 'Georgia, "Times New Roman", "Noto Serif KR", serif' },
];

const DENSITIES = [
  { id: 'compact', name: '촘촘', pad: '10px',  rowGap: '6px' },
  { id: 'cozy',    name: '보통', pad: '14px',  rowGap: '10px' },
  { id: 'roomy',   name: '여유', pad: '18px',  rowGap: '14px' },
];
// density id → { pad, rowGap } 빠른 조회 (persist 에서 사용)
const densityMap = DENSITIES.reduce((acc, d) => {
  acc[d.id] = { pad: d.pad, rowGap: d.rowGap };
  return acc;
}, {});

const DEFAULTS = {
  paletteId: 'amber',
  primary: '#f5a623',
  primaryDark: '#f5be5b',
  primaryStrong: '#d99437',
  fontId: 'pretendard',
  fontStack: FONTS[0].stack,
  density: 'cozy',
  radius: 0.625,
  typeScale: 1.0,
  reduceMotion: false,
  // 채팅 — 다운스트림 클러스터(chat-layout)가 prefs 에서 읽어 적용
  bubbleStyle: 'boxed',
  inputStyle: 'rounded',
  // 개인화 — 다운스트림 클러스터(empty-state/sidebar-recent/board)가 prefs 에서 읽어 적용
  emptyStyle: 'greet',
  recentStyle: 'rich',
  articleLayout: 'toc',
  editorMode: 'rich',
};

// ───────── 자체 라인 글리프 (외부 아이콘 세트 미사용) ─────────
const Glyph = ({ d, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='2.2'
    strokeLinecap='round'
    strokeLinejoin='round'
  >
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);
const G = {
  brush: <Glyph d={['M3 21c3-1 3-4 6-4s4 4 8 4', 'M14 3l7 7-9 4-2-2 4-9z']} size={16} />,
  close: <Glyph d='M6 6l12 12M18 6 6 18' size={14} />,
  check: <Glyph d='m5 12 5 5L20 7' size={12} />,
  reset: <Glyph d={['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5']} size={13} />,
  sun:   <Glyph d={['M12 5v2', 'M12 17v2', 'M5 12H3', 'M21 12h-2', 'M6.3 6.3l1.4 1.4', 'M16.3 16.3l1.4 1.4', 'M16.3 7.7l1.4-1.4', 'M6.3 17.7l1.4-1.4']} size={13} />,
  moon:  <Glyph d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' size={13} />,
  auto:  <Glyph d={['M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z']} size={13} />,
};

function loadTheme() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
}

function applyVars(vars) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => {
    if (k.startsWith('--')) root.style.setProperty(k, v);
  });
}

export default function ThemeDrawer({ open, onClose }) {
  const [prefs, setPrefs] = useState(DEFAULTS);
  const [mode, setMode] = useState('light');
  const [hexCopied, setHexCopied] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const copyHex = useCallback(() => {
    if (typeof navigator === 'undefined') return;
    navigator.clipboard?.writeText(prefs.primary).then(() => {
      setHexCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setHexCopied(false), 1200);
    }).catch(() => {});
  }, [prefs.primary]);

  useEffect(() => {
    const saved = loadTheme();
    if (saved?.prefs) setPrefs({ ...DEFAULTS, ...saved.prefs });
    if (typeof document !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      const stored = localStorage.getItem('theme');
      if (stored === 'auto') setMode('auto');
      else setMode(isDark ? 'dark' : 'light');
    }
  }, [open]);

  const buildVars = useCallback((p) => {
    const lightVars = {
      '--hn-primary': p.primary,
      '--hn-primary-soft': hexToRgba(p.primary, 0.14),
      '--hn-primary-strong': p.primaryStrong || p.primary,
      '--hn-radius': `${p.radius}rem`,
    };
    const darkVars = {
      '--hn-primary': p.primaryDark || p.primary,
      '--hn-primary-soft': hexToRgba(p.primaryDark || p.primary, 0.20),
      '--hn-primary-strong': p.primary,
      '--hn-radius': `${p.radius}rem`,
    };
    return { lightVars, darkVars };
  }, []);

  const persist = useCallback((next) => {
    setPrefs(next);
    const { lightVars, darkVars } = buildVars(next);
    saveTheme({ light: lightVars, dark: darkVars, prefs: next });
    // immediate apply
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const isDark = root.classList.contains('dark');
      applyVars(isDark ? darkVars : lightVars);
      root.style.setProperty('--hn-font', next.fontStack);
      // 밀도 토큰 — globals.css 에 선언돼 있으나 그동안 DOM 에 쓰이지 않던 것을 여기서 반영
      const dm = densityMap[next.density] || densityMap.cozy;
      root.style.setProperty('--hn-pad', dm.pad);
      root.style.setProperty('--hn-row-gap', dm.rowGap);
      // 글자 크기 — globals.css :root font-size: calc(1rem * var(--type-scale)) 가 소비
      root.style.setProperty('--type-scale', clampTypeScale(next.typeScale));
      // 모션 줄이기 — globals.css :root[data-reduce-motion] 규칙이 소비
      root.toggleAttribute('data-reduce-motion', !!next.reduceMotion);
    }
  }, [buildVars]);

  const setMode_ = useCallback((m) => {
    setMode(m);
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (m === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (m === 'light') {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      const isSysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', isSysDark);
      localStorage.setItem('theme', 'auto');
    }
    // re-apply vars for new mode
    const saved = loadTheme();
    if (saved) {
      const isDark = root.classList.contains('dark');
      applyVars(isDark ? saved.dark : saved.light);
    }
  }, []);

  const pickPalette = (p) => {
    persist({
      ...prefs,
      paletteId: p.id,
      primary: p.light,
      primaryDark: p.dark,
      primaryStrong: p.deep,
    });
  };

  const setRadius = (v) => persist({ ...prefs, radius: v });
  const setDensity = (id) => persist({ ...prefs, density: id });
  const setFont = (f) => persist({ ...prefs, fontId: f.id, fontStack: f.stack });
  const setTypeScale = (v) => persist({ ...prefs, typeScale: clampTypeScale(v) });
  const setReduceMotion = (v) => persist({ ...prefs, reduceMotion: !!v });
  const setPref = (key, value) => persist({ ...prefs, [key]: value });
  const setCustomColor = (hex) => {
    persist({
      ...prefs,
      paletteId: 'custom',
      primary: hex,
      primaryDark: hex,
      primaryStrong: hex,
    });
  };

  const reset = () => {
    setPrefs(DEFAULTS);
    localStorage.removeItem(STORAGE_KEY);
    // clear inline styles
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      [
        '--hn-primary', '--hn-primary-soft', '--hn-primary-strong', '--hn-radius', '--hn-font',
        '--hn-pad', '--hn-row-gap', '--type-scale',
      ].forEach((k) => root.style.removeProperty(k));
      root.toggleAttribute('data-reduce-motion', false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(28,25,23,.5)',
          animation: 'hn-fade .15s ease',
        }}
      />
      <aside
        role='dialog'
        aria-label='테마 설정'
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(420px, 100vw)',
          zIndex: 90,
          background: 'var(--hn-surface)',
          color: 'var(--hn-fg)',
          borderLeft: '1px solid var(--hn-border)',
          boxShadow: 'var(--hn-shadow-lg)',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--hn-font)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid var(--hn-border)',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, letterSpacing: '-.01em' }}>외관 · 테마</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--hn-fg-muted)' }}>
              색상 · 폰트 · 밀도를 내 취향에 맞게.
            </p>
          </div>
          <button onClick={onClose} aria-label='닫기' style={iconBtn}>
            {G.close}
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* 모드 */}
          <Section title='모드' hint='시스템 설정 따라가기 가능'>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <ModeCard active={mode === 'light'} onClick={() => setMode_('light')} icon={G.sun} label='라이트' previews={['#fafaf9', '#ffffff', '#f5f5f4']} />
              <ModeCard active={mode === 'dark'} onClick={() => setMode_('dark')} icon={G.moon} label='다크' previews={['#1c1917', '#292524', '#44403c']} />
              <ModeCard active={mode === 'auto'} onClick={() => setMode_('auto')} icon={G.auto} label='시스템' previews={['#fafaf9', '#1c1917']} split />
            </div>
          </Section>

          {/* 컬러 팔레트 */}
          <Section title='강조 색상' hint={prefs.paletteId === 'custom' ? '커스텀' : (PALETTES.find((p) => p.id === prefs.paletteId)?.name || '')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {PALETTES.map((p) => (
                <button key={p.id} onClick={() => pickPalette(p)} title={p.name}
                  style={{
                    ...paletteBtn,
                    borderColor: prefs.paletteId === p.id ? 'var(--hn-primary)' : 'var(--hn-border)',
                    boxShadow: prefs.paletteId === p.id ? '0 0 0 3px var(--hn-primary-soft)' : 'none',
                  }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.light, boxShadow: `0 4px 8px -2px ${p.light}80` }} />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{p.name}</span>
                </button>
              ))}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              marginTop: 12, padding: 10,
              background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 8,
            }}>
              <label style={{ position: 'relative', width: 36, height: 36, borderRadius: 8, background: prefs.primary, cursor: 'pointer', boxShadow: '0 0 0 1px rgba(0,0,0,.06) inset' }}>
                <input type='color' value={prefs.primary} onChange={(e) => setCustomColor(e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              </label>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>커스텀 색상</div>
                <div style={{ fontSize: 11, color: 'var(--hn-fg-muted)', fontFamily: 'var(--hn-mono)' }}>{prefs.primary}</div>
              </div>
              <button
                type='button'
                onClick={copyHex}
                aria-label='색상 코드 복사'
                style={{
                  ...btnGhost,
                  padding: '6px 10px', fontSize: 11.5,
                  color: hexCopied ? 'var(--hn-good)' : 'var(--hn-fg)',
                  borderColor: hexCopied ? 'var(--hn-good)' : 'var(--hn-border)',
                }}
              >
                <span>{hexCopied ? '복사됨' : '복사'}</span>
              </button>
            </div>
          </Section>

          {/* 폰트 */}
          <Section title='타이포그래피'>
            <Seg
              value={prefs.fontId}
              options={FONTS.map((f) => ({ id: f.id, label: f.name }))}
              onChange={(id) => setFont(FONTS.find((f) => f.id === id))}
            />
            <div style={{
              marginTop: 12, padding: 12,
              background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 8,
              fontFamily: prefs.fontStack,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>한글 영문 Aa Bb 1234</div>
              <div style={{ fontSize: 12, color: 'var(--hn-fg-muted)', marginTop: 4 }}>하니모는 셀프호스팅 AI 워크스페이스입니다.</div>
            </div>
            <Row label='글자 크기' desc={`${Math.round(clampTypeScale(prefs.typeScale) * 100)}%`}>
              <input type='range' min={TYPE_SCALE_MIN} max={TYPE_SCALE_MAX} step='0.05'
                value={clampTypeScale(prefs.typeScale)}
                onChange={(e) => setTypeScale(e.target.value)}
                aria-label='글자 크기'
                style={{ width: 180, accentColor: 'var(--hn-primary)' }} />
            </Row>
          </Section>

          {/* 밀도 */}
          <Section title='레이아웃'>
            <Row label='밀도' desc='행 간격과 패딩'>
              <Seg
                value={prefs.density}
                options={DENSITIES.map((d) => ({ id: d.id, label: d.name }))}
                onChange={setDensity}
              />
            </Row>
            <Row label='모서리 둥글기' desc={`${prefs.radius.toFixed(2)} rem`}>
              <input type='range' min='0' max='1.4' step='0.05' value={prefs.radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                style={{ width: 180, accentColor: 'var(--hn-primary)' }} />
            </Row>
            <Row label='모션 줄이기' desc='애니메이션·전환 최소화 (접근성)'>
              <Switch checked={!!prefs.reduceMotion} onChange={setReduceMotion} label='모션 줄이기' />
            </Row>
          </Section>

          {/* 채팅 */}
          <Section title='채팅' hint='채팅 화면에 적용'>
            <Row label='말풍선' desc='메시지 표시 방식'>
              <Seg
                value={prefs.bubbleStyle}
                options={[{ id: 'boxed', label: '버블' }, { id: 'plain', label: '평문' }]}
                onChange={(id) => setPref('bubbleStyle', id)}
              />
            </Row>
            <Row label='입력창' desc='입력 박스 모양'>
              <Seg
                value={prefs.inputStyle}
                options={[{ id: 'boxed', label: '박스' }, { id: 'rounded', label: '둥근' }]}
                onChange={(id) => setPref('inputStyle', id)}
              />
            </Row>
          </Section>

          {/* 개인화 */}
          <Section title='개인화' hint='빈 화면·목록·문서'>
            <Row label='빈 화면' desc='채팅 시작 화면 스타일'>
              <Seg
                value={prefs.emptyStyle}
                options={[
                  { id: 'greet', label: '인사+인텐트' },
                  { id: 'cards', label: '제안 카드' },
                  { id: 'minimal', label: '미니멀' },
                  { id: 'hero', label: '히어로' },
                ]}
                onChange={(id) => setPref('emptyStyle', id)}
              />
            </Row>
            <Row label='최근 목록' desc='사이드바 최근 항목'>
              <Seg
                value={prefs.recentStyle}
                options={[{ id: 'rich', label: '미리보기' }, { id: 'compact', label: '제목만' }]}
                onChange={(id) => setPref('recentStyle', id)}
              />
            </Row>
            <Row label='문서 레이아웃' desc='게시글 보기'>
              <Seg
                value={prefs.articleLayout}
                options={[{ id: 'toc', label: '사이드 목차' }, { id: 'plain', label: '단일 컬럼' }]}
                onChange={(id) => setPref('articleLayout', id)}
              />
            </Row>
            <Row label='에디터' desc='글 작성 모드'>
              <Seg
                value={prefs.editorMode}
                options={[{ id: 'rich', label: '리치' }, { id: 'markdown', label: '마크다운' }]}
                onChange={(id) => setPref('editorMode', id)}
              />
            </Row>
          </Section>

          {/* 사이드바 */}
          <Section title='사이드바' hint='새로고침 후 적용'>
            <Row label='모드' desc='Rail은 64px 아이콘, Expanded는 280px 풀 사이드바'>
              <Seg
                value={typeof window !== 'undefined' && localStorage.getItem('hanimo-webui-sidebar-mode') === 'expanded' ? 'expanded' : 'rail'}
                options={[
                  { id: 'rail', label: 'Rail' },
                  { id: 'expanded', label: 'Expanded' },
                ]}
                onChange={(id) => {
                  localStorage.setItem('hanimo-webui-sidebar-mode', id);
                  if (typeof window !== 'undefined') window.location.reload();
                }}
              />
            </Row>
          </Section>

          {/* 미리보기 — 모든 토큰을 var() 로 참조해 변경 즉시 반영 */}
          <Section title='미리보기'>
            <div style={{
              padding: 'var(--hn-pad)',
              background: 'var(--hn-surface-2)',
              border: '1px solid var(--hn-border)',
              borderRadius: 'var(--hn-radius)',
              display: 'flex', flexDirection: 'column', gap: 'var(--hn-row-gap)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <span style={{
                  width: 26, height: 26, flexShrink: 0, borderRadius: '50%',
                  background: 'var(--hn-primary)', color: 'var(--hn-primary-fg)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>지</span>
                <div style={{
                  background: 'var(--hn-primary)', color: 'var(--hn-primary-fg)',
                  padding: '7px 11px', borderRadius: 'var(--hn-radius)', fontSize: 13,
                  borderBottomLeftRadius: 4,
                }}>요약해줘</div>
              </div>
              <div style={{
                alignSelf: 'flex-start', maxWidth: '88%',
                background: 'var(--hn-surface)', color: 'var(--hn-fg)',
                border: '1px solid var(--hn-border)',
                padding: '7px 11px', borderRadius: 'var(--hn-radius)', fontSize: 13,
              }}>네, 핵심만 정리해 드릴게요.</div>
              <button type='button' style={{
                ...btnPrimary, flex: 'unset', alignSelf: 'flex-start',
                padding: '7px 14px', borderRadius: 'var(--hn-radius)', fontSize: 12.5,
              }}>
                <span>기본 동작</span>
              </button>
            </div>
          </Section>

        </div>

        <footer style={{
          padding: 14, borderTop: '1px solid var(--hn-border)',
          display: 'flex', gap: 8,
        }}>
          <button onClick={reset} style={btnGhost}>{G.reset}<span>기본값으로</span></button>
          <button onClick={onClose} style={btnPrimary}><span>완료</span></button>
        </footer>
      </aside>
    </>
  );
}

// ───────── 보조 컴포넌트 ─────────
function Section({ title, hint, children }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '-.005em' }}>{title}</h4>
        {hint && <span style={{ fontSize: 11, color: 'var(--hn-fg-muted)' }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--hn-border)' }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: 'var(--hn-fg-muted)' }}>{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', padding: 3,
      background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 8,
      flexWrap: 'wrap',
    }}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{
            padding: '5px 10px', border: 0, fontSize: 11.5, fontWeight: 600, borderRadius: 6,
            background: value === o.id ? 'var(--hn-surface)' : 'transparent',
            color: value === o.id ? 'var(--hn-fg)' : 'var(--hn-fg-muted)',
            boxShadow: value === o.id ? 'var(--hn-shadow-sm)' : 'none',
            cursor: 'pointer',
          }}>{o.label}</button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 40, height: 22, padding: 0, flexShrink: 0,
        borderRadius: 999, cursor: 'pointer',
        border: '1px solid var(--hn-border)',
        background: checked ? 'var(--hn-primary)' : 'var(--hn-surface-2)',
        transition: 'background var(--hn-dur-fast, .15s) var(--hn-ease, ease)',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: checked ? 'var(--hn-primary-fg)' : 'var(--hn-surface)',
        boxShadow: 'var(--hn-shadow-sm)',
        transition: 'left var(--hn-dur-fast, .15s) var(--hn-ease, ease)',
      }} />
    </button>
  );
}

function ModeCard({ active, onClick, label, icon, previews, split }) {
  return (
    <button onClick={onClick}
      style={{
        padding: 10, border: '1.5px solid var(--hn-border)', borderRadius: 10,
        background: active ? 'var(--hn-surface)' : 'var(--hn-bg)',
        borderColor: active ? 'var(--hn-primary)' : 'var(--hn-border)',
        boxShadow: active ? '0 0 0 3px var(--hn-primary-soft)' : 'none',
        cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
      }}>
      <div style={{ display: 'flex', height: 22, width: '100%', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--hn-border)' }}>
        {(split ? previews : previews).map((c, i) => (
          <span key={i} style={{ background: c, flex: 1 }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600 }}>
        <span style={{ color: 'var(--hn-primary-strong)' }}>{icon}</span>
        {label}
      </div>
    </button>
  );
}

// ───────── styles ─────────
const iconBtn = {
  width: 32, height: 32, borderRadius: 8, background: 'transparent',
  border: 0, color: 'var(--hn-fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
};
const paletteBtn = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
  padding: 10, border: '1.5px solid var(--hn-border)', borderRadius: 10,
  background: 'var(--hn-surface)', cursor: 'pointer',
};
const btnPrimary = {
  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 14px', fontWeight: 700, fontSize: 13,
  background: 'var(--hn-primary)', color: 'var(--hn-primary-fg)',
  border: 0, borderRadius: 8, cursor: 'pointer',
};
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 14px', fontWeight: 600, fontSize: 13,
  background: 'var(--hn-surface)', color: 'var(--hn-fg)',
  border: '1px solid var(--hn-border)', borderRadius: 8, cursor: 'pointer',
};

// ───────── helpers ─────────
function hexToRgba(hex, a) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return `rgba(245,166,35,${a})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
