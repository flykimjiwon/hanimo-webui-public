'use client';

/**
 * SidebarRail — 64px 폭의 아이콘 전용 사이드바.
 *
 * 시안의 RailSide 컴포넌트를 React로 포팅. 사용자 결정값 sidebarLayout=rail에 해당.
 * 기존 Sidebar 컴포넌트(expanded 280px)는 그대로 두고, ChatLayout에서
 * sidebarOpen=false일 때 이 컴포넌트를 띄웁니다.
 *
 * - 자체 라인 글리프만 사용 (외부 아이콘 세트 X)
 * - hover 시 우측 툴팁
 * - 활성 메뉴: amber 배경 + amber 글자
 */

import { usePathname, useRouter } from 'next/navigation';
import { memo, useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const Glyph = ({ d, size = 18 }) => (
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

const ICON = {
  chat:    <Glyph d='M21 12a8 8 0 0 1-11.36 7.27L4 21l1.73-5.64A8 8 0 1 1 21 12Z' />,
  board:   <Glyph d={['M3 4h18v16H3z', 'M3 10h18', 'M8 4v16']} />,
  workflow:<Glyph d={['M6 5h4v4H6z', 'M14 15h4v4h-4z', 'M10 7h3a3 3 0 0 1 3 3v5', 'M14 17h-3a3 3 0 0 1-3-3V9']} />,
  screen:  <Glyph d={['M4 5h16v14H4z', 'M4 10h16', 'M10 10v9']} />,
  admin:   <Glyph d={['M12 3 4 7v6c0 4.5 3.5 8 8 8s8-3.5 8-8V7l-8-4Z', 'm9 12 2 2 4-4']} />,
  profile: <Glyph d={['M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0']} />,
  plus:    <Glyph d='M12 5v14M5 12h14' />,
  panel:   <Glyph d={['M3 3h18v18H3z', 'M9 3v18', 'm14 9 3 3-3 3']} />,
};

function NavBtn({ icon, label, active, onClick }) {
  return (
    <button
      type='button'
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`group relative inline-flex items-center justify-center w-10 h-10 rounded-[10px] border-0 cursor-pointer transition-colors ${
        active
          ? 'bg-[var(--hn-primary-soft)] text-[var(--hn-primary-strong)]'
          : 'bg-transparent text-[var(--hn-fg-muted)] hover:bg-[var(--hn-surface-2)] hover:text-[var(--hn-fg)]'
      }`}
    >
      {icon}
      <span
        aria-hidden='true'
        style={{
          position: 'absolute',
          left: 'calc(100% + 8px)',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--hn-fg, #1c1917)',
          color: 'var(--hn-bg, #fafaf9)',
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          borderRadius: 6,
          whiteSpace: 'nowrap',
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity .15s',
          zIndex: 50,
          boxShadow: '0 4px 12px -4px rgba(0,0,0,.3)',
        }}
        className='group-hover:opacity-100'
      >
        {label}
      </span>
    </button>
  );
}

function SidebarRail({ onNew, onOpenSidebar, userRole }) {
  const router = useRouter();
  const pathname = usePathname() || '/';

  const isChat = pathname === '/' || pathname.startsWith('/chat');
  const isBoard = pathname.startsWith('/board') || pathname.startsWith('/notice');
  const isWorkflow = pathname.startsWith('/workflow');
  const isScreenBuilder = pathname.startsWith('/screen-builder');
  const isAdmin = pathname.startsWith('/admin');
  const isProfile = pathname.startsWith('/profile') || pathname.startsWith('/my-api');

  const showAdmin = userRole === 'admin';

  // 다크모드 토글 — layout.js 인라인 스크립트와 동일한 'theme' localStorage 키 사용
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* localStorage 접근 불가 시 무시 */
    }
    setIsDark(next);
  };

  return (
    <aside
      aria-label='사이드바 레일'
      className='fixed left-0 top-0 bottom-0 z-30 hidden lg:flex flex-col items-center justify-between w-16 py-3.5 bg-[var(--hn-surface)] border-r border-border'
    >
      <div className='flex flex-col items-center gap-3'>
        {/* hanimo mark */}
        <div
          aria-hidden='true'
          className='relative'
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--hn-primary, #f5a623)',
            boxShadow: '0 4px 12px -4px rgba(245,166,35,.4)',
          }}
        >
          <span style={{ position: 'absolute', left: 6, right: 6, top: 9, height: 2, background: 'var(--hn-primary-fg, #fff)', borderRadius: 1 }} />
          <span style={{ position: 'absolute', left: 6, right: 6, top: 16, height: 2, background: 'var(--hn-primary-fg, #fff)', borderRadius: 1, opacity: 0.55 }} />
        </div>

        {/* new chat */}
        <button
          type='button'
          onClick={onNew}
          title='새 대화'
          aria-label='새 대화'
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'var(--hn-primary, #f5a623)',
            color: 'var(--hn-primary-fg, #fff)',
            border: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px -4px rgba(245,166,35,.45)',
          }}
        >
          {ICON.plus}
        </button>

        <span
          aria-hidden='true'
          style={{ width: 28, height: 1, background: 'var(--hn-border, #e7e5e4)', margin: '4px 0' }}
        />

        {/* nav */}
        <nav className='flex flex-col items-center gap-1'>
          <NavBtn icon={ICON.chat}    label='채팅'    active={isChat}    onClick={() => router.push('/')} />
          <NavBtn icon={ICON.board}   label='게시판'   active={isBoard}   onClick={() => router.push('/board')} />
          <NavBtn icon={ICON.workflow} label='워크플로' active={isWorkflow} onClick={() => router.push('/workflow')} />
          <NavBtn icon={ICON.screen} label='스크린 빌더' active={isScreenBuilder} onClick={() => router.push('/screen-builder')} />
          {showAdmin && (
            <NavBtn icon={ICON.admin} label='관리자'   active={isAdmin}   onClick={() => router.push('/admin')} />
          )}
          <NavBtn icon={ICON.profile} label='내 프로필' active={isProfile} onClick={() => router.push('/profile')} />
        </nav>
      </div>

      <div className='flex flex-col items-center gap-2'>
        {/* 다크/라이트 모드 토글 */}
        <NavBtn
          icon={isDark ? <Sun size={18} /> : <Moon size={18} />}
          label={isDark ? '라이트 모드' : '다크 모드'}
          active={false}
          onClick={toggleTheme}
        />
        {/* expand sidebar */}
        {onOpenSidebar && (
          <NavBtn icon={ICON.panel} label='사이드바 펼치기' active={false} onClick={onOpenSidebar} />
        )}
      </div>
    </aside>
  );
}

export default memo(SidebarRail);
