import { ghostButton, primaryButton, Row, Section, Segmented, Toggle } from './ThemeDrawerControls';

const TYPE_SCALE_MIN = 0.85;
const TYPE_SCALE_MAX = 1.25;
const DENSITIES = [
  { id: 'compact', label: '촘촘' },
  { id: 'cozy', label: '보통' },
  { id: 'relaxed', label: '여유' },
];

const Glyph = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'>
    {Array.isArray(d) ? d.map((path, index) => <path key={index} d={path} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  close: <Glyph d='M6 6l12 12M18 6 6 18' size={14} />,
  reset: <Glyph d={['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5']} size={13} />,
  sun: <Glyph d={['M12 5v2', 'M12 17v2', 'M5 12H3', 'M21 12h-2', 'M6.3 6.3l1.4 1.4', 'M16.3 16.3l1.4 1.4', 'M16.3 7.7l1.4-1.4', 'M6.3 17.7l1.4 1.4']} size={13} />,
  moon: <Glyph d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' size={13} />,
  system: <Glyph d={['M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z']} size={13} />,
};

function ModeCard({ active, icon, label, onClick, previews }) {
  return <button type='button' onClick={onClick} style={{ padding: 10, border: '1.5px solid', borderRadius: 10, background: active ? 'var(--hn-surface)' : 'var(--hn-bg)', borderColor: active ? 'var(--hn-primary)' : 'var(--hn-border)', boxShadow: active ? '0 0 0 3px var(--hn-primary-soft)' : 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
    <span style={{ display: 'flex', height: 22, width: '100%', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--hn-border)' }}>{previews.map((color, index) => <span key={index} style={{ background: color, flex: 1 }} />)}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600 }}><span style={{ color: 'var(--hn-primary-strong)' }}>{icon}</span>{label}</span>
  </button>;
}

export default function ThemeDrawerSections({ prefs, mode, skins, palettes, fonts, hexCopied, update, setPalette, setFont, copyHex, setThemeMode, reset, onClose }) {
  const paletteName = prefs.paletteId === 'custom' ? '커스텀' : palettes.find((palette) => palette.id === prefs.paletteId)?.name;

  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(28,25,23,.5)', animation: 'hn-fade .15s ease' }} />
    <aside role='dialog' aria-modal='true' aria-label='외관 설정' style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(420px, 100vw)', zIndex: 90, background: 'var(--hn-surface)', color: 'var(--hn-fg)', borderLeft: '1px solid var(--hn-border)', boxShadow: 'var(--hn-shadow-lg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--hn-font)' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--hn-border)' }}>
        <div><h3 style={{ margin: 0, fontSize: 16, letterSpacing: '-.01em' }}>외관 · 테마</h3><p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--hn-fg-muted)' }}>색상 · 폰트 · 밀도를 내 취향에 맞게.</p></div>
        <button type='button' onClick={onClose} aria-label='닫기' style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 0, color: 'var(--hn-fg-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{ICONS.close}</button>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Section title='모드' hint='시스템 설정 따라가기 가능'><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <ModeCard active={mode === 'light'} onClick={() => setThemeMode('light')} icon={ICONS.sun} label='라이트' previews={['#fafaf9', '#ffffff', '#f5f5f4']} />
          <ModeCard active={mode === 'dark'} onClick={() => setThemeMode('dark')} icon={ICONS.moon} label='다크' previews={['#1c1917', '#292524', '#44403c']} />
          <ModeCard active={mode === 'system'} onClick={() => setThemeMode('system')} icon={ICONS.system} label='시스템' previews={['#fafaf9', '#1c1917']} />
        </div></Section>
        <Section title='스킨' hint='화면 구조는 유지하고 재질만 변경'><Segmented value={prefs.skin} options={skins} onChange={(skin) => update('skin', skin)} /></Section>
        <Section title='강조 색상' hint={paletteName}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>{palettes.map((palette) => <button type='button' key={palette.id} onClick={() => setPalette(palette)} title={palette.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: 10, border: '1.5px solid', borderRadius: 10, background: 'var(--hn-surface)', cursor: 'pointer', borderColor: prefs.paletteId === palette.id ? 'var(--hn-primary)' : 'var(--hn-border)', boxShadow: prefs.paletteId === palette.id ? '0 0 0 3px var(--hn-primary-soft)' : 'none' }}><span style={{ width: 22, height: 22, borderRadius: '50%', background: palette.light, boxShadow: `0 4px 8px -2px ${palette.light}80` }} /><span style={{ fontSize: 11, fontWeight: 600 }}>{palette.name}</span></button>)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, padding: 10, background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 8 }}><label style={{ position: 'relative', width: 36, height: 36, borderRadius: 8, background: prefs.primary, cursor: 'pointer' }}><input type='color' value={prefs.primary} onChange={(event) => update('primary', event.target.value)} aria-label='커스텀 강조 색상' style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} /></label><div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>커스텀 색상</div><div style={{ fontSize: 11, color: 'var(--hn-fg-muted)', fontFamily: 'var(--hn-mono)' }}>{prefs.primary}</div></div><button type='button' onClick={copyHex} style={{ ...ghostButton, padding: '6px 10px', fontSize: 11.5, color: hexCopied ? 'var(--hn-good)' : 'var(--hn-fg)' }}>{hexCopied ? '복사됨' : '복사'}</button></div>
        </Section>
        <Section title='타이포그래피'><Segmented value={prefs.fontId} options={fonts.map((font) => ({ id: font.id, label: font.name }))} onChange={(id) => setFont(fonts.find((font) => font.id === id))} /><div style={{ marginTop: 12, padding: 12, background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 8, fontFamily: prefs.fontStack }}><div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>한글 영문 Aa Bb 1234</div><div style={{ fontSize: 12, color: 'var(--hn-fg-muted)', marginTop: 4 }}>하니모는 셀프호스팅 AI 워크스페이스입니다.</div></div><Row label='글자 크기' desc={`${Math.round(Number(prefs.typeScale) * 100)}%`}><input type='range' min={TYPE_SCALE_MIN} max={TYPE_SCALE_MAX} step='0.05' value={prefs.typeScale} onChange={(event) => update('typeScale', event.target.value)} aria-label='글자 크기' style={{ width: 180, accentColor: 'var(--hn-primary)' }} /></Row></Section>
        <Section title='레이아웃'><Row label='밀도' desc='행 간격과 패딩'><Segmented value={prefs.density} options={DENSITIES} onChange={(density) => update('density', density)} /></Row><Row label='모서리 둥글기' desc={`${Number(prefs.radius).toFixed(2)} rem`}><input type='range' min='0' max='1.4' step='0.05' value={prefs.radius} onChange={(event) => update('radius', Number(event.target.value))} aria-label='모서리 둥글기' style={{ width: 180, accentColor: 'var(--hn-primary)' }} /></Row><Row label='모션 줄이기' desc='애니메이션·전환 최소화'><Toggle checked={prefs.reduceMotion} onChange={(reduceMotion) => update('reduceMotion', reduceMotion)} label='모션 줄이기' /></Row></Section>
        <Section title='채팅' hint='채팅 화면에 적용'><Row label='말풍선' desc='메시지 표시 방식'><Segmented value={prefs.bubbleStyle} options={[{ id: 'boxed', label: '버블' }, { id: 'plain', label: '평문' }]} onChange={(bubbleStyle) => update('bubbleStyle', bubbleStyle)} /></Row><Row label='입력창' desc='입력 박스 모양'><Segmented value={prefs.inputStyle} options={[{ id: 'boxed', label: '박스' }, { id: 'rounded', label: '둥근' }]} onChange={(inputStyle) => update('inputStyle', inputStyle)} /></Row></Section>
        <Section title='개인화' hint='빈 화면·목록·문서'><Row label='빈 화면' desc='채팅 시작 화면 스타일'><Segmented value={prefs.emptyStyle} options={[{ id: 'greet', label: '인사+인텐트' }, { id: 'cards', label: '제안 카드' }, { id: 'minimal', label: '미니멀' }, { id: 'hero', label: '히어로' }]} onChange={(emptyStyle) => update('emptyStyle', emptyStyle)} /></Row><Row label='최근 목록' desc='사이드바 최근 항목'><Segmented value={prefs.recentStyle} options={[{ id: 'rich', label: '미리보기' }, { id: 'compact', label: '제목만' }]} onChange={(recentStyle) => update('recentStyle', recentStyle)} /></Row><Row label='문서 레이아웃' desc='게시글 보기'><Segmented value={prefs.articleLayout} options={[{ id: 'toc', label: '사이드 목차' }, { id: 'plain', label: '단일 컬럼' }]} onChange={(articleLayout) => update('articleLayout', articleLayout)} /></Row><Row label='에디터' desc='글 작성 모드'><Segmented value={prefs.editorMode} options={[{ id: 'rich', label: '리치' }, { id: 'markdown', label: '마크다운' }]} onChange={(editorMode) => update('editorMode', editorMode)} /></Row></Section>
        <Section title='사이드바' hint='새로고침 후 적용'><Row label='모드' desc='Rail은 64px 아이콘, Expanded는 280px 풀 사이드바'><Segmented value={typeof window !== 'undefined' && localStorage.getItem('hanimo-webui-sidebar-mode') === 'expanded' ? 'expanded' : 'rail'} options={[{ id: 'rail', label: 'Rail' }, { id: 'expanded', label: 'Expanded' }]} onChange={(sidebarMode) => { localStorage.setItem('hanimo-webui-sidebar-mode', sidebarMode); window.location.reload(); }} /></Row></Section>
        <Section title='미리보기'><div style={{ padding: 'var(--hn-pad)', background: 'var(--hn-surface-2)', border: '1px solid var(--hn-border)', borderRadius: 'var(--hn-radius)', display: 'flex', flexDirection: 'column', gap: 'var(--hn-row-gap)' }}><div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}><span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--hn-primary)', color: 'var(--hn-primary-fg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>지</span><span style={{ background: 'var(--hn-primary)', color: 'var(--hn-primary-fg)', padding: '7px 11px', borderRadius: 'var(--hn-radius)', fontSize: 13, borderBottomLeftRadius: 4 }}>요약해줘</span></div><span style={{ alignSelf: 'flex-start', background: 'var(--hn-surface)', color: 'var(--hn-fg)', border: '1px solid var(--hn-border)', padding: '7px 11px', borderRadius: 'var(--hn-radius)', fontSize: 13 }}>네, 핵심만 정리해 드릴게요.</span><button type='button' style={{ ...primaryButton, flex: 'unset', alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 'var(--hn-radius)', fontSize: 12.5 }}>기본 동작</button></div></Section>
      </div>
      <footer style={{ padding: 14, borderTop: '1px solid var(--hn-border)', display: 'flex', gap: 8 }}><button type='button' onClick={reset} style={ghostButton}>{ICONS.reset}<span>기본값으로</span></button><button type='button' onClick={onClose} style={primaryButton}>완료</button></footer>
    </aside>
  </>;
}
