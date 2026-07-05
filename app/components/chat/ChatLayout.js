'use client';

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Menu } from 'lucide-react';

const SidebarRail = dynamic(() => import('@/components/chat/SidebarRail'), { ssr: false });

function ChatLayout({ children, sidebarOpen = false, onOpenSidebar, onCloseSidebar, userRole }) {
  const router = useRouter();
  return (
    <div
      id='chat-layout'
      data-testid='chat-layout'
      className={`h-screen overflow-hidden flex flex-col bg-background relative transition-all duration-[var(--hn-dur-slow)] ease-[var(--hn-ease)] pl-0 ${
        sidebarOpen ? 'lg:pl-80' : 'lg:pl-16'
      }`}
    >
      {/* 모바일 햄버거 진입점: lg 미만에서 사이드바를 열 수 있는 유일한 버튼 */}
      <button
        type='button'
        onClick={onOpenSidebar}
        aria-label='메뉴 열기'
        className='fixed top-3 left-3 z-40 lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-[var(--hn-radius)] bg-[var(--hn-surface)] border border-border shadow-sm text-muted-foreground hover:text-foreground'
      >
        <Menu className='h-5 w-5' />
      </button>

      {/* 모바일 스크림: 사이드바가 열려 있을 때 바깥 영역 클릭 시 닫기 */}
      {sidebarOpen && (
        <div
          className='fixed inset-0 z-40 bg-black/40 lg:hidden'
          aria-hidden='true'
          onClick={() => onCloseSidebar?.()}
        />
      )}

      {/* expanded 사이드바가 열려있지 않을 때만 64px rail을 lg 이상에서 노출 */}
      {!sidebarOpen && (
        <SidebarRail
          onNew={() => router.push('/')}
          onOpenSidebar={onOpenSidebar}
          userRole={userRole}
        />
      )}
      {children}
    </div>
  );
}

export default ChatLayout;
