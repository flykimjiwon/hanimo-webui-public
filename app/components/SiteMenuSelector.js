'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutGrid, ChevronRight, X, Loader2, ExternalLink } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

const CORE_MENU_LINKS = [
  { id: 'core-chat', labelKey: 'sidebar.chat_rooms', descriptionKey: 'site_menu.core_chat_desc', link: '/' },
  { id: 'core-workflow', labelKey: 'sidebar.workflow', descriptionKey: 'site_menu.core_workflow_desc', link: '/workflow' },
  { id: 'core-screen-builder', labelKey: 'sidebar.screen_builder', descriptionKey: 'site_menu.core_screen_builder_desc', link: '/screen-builder' },
  { id: 'core-board', labelKey: 'sidebar.free_board', descriptionKey: 'site_menu.core_board_desc', link: '/board' },
  { id: 'core-notice', labelKey: 'notice.title', descriptionKey: 'site_menu.core_notice_desc', link: '/notice' },
  { id: 'core-api-keys', labelKey: 'sidebar.my_api_keys', descriptionKey: 'site_menu.core_api_keys_desc', link: '/my-api-keys' },
  { id: 'core-profile', labelKey: 'sidebar.edit_profile', descriptionKey: 'site_menu.core_profile_desc', link: '/profile' },
];

function buildCoreMenus(t) {
  return CORE_MENU_LINKS.map((item, index) => ({
    id: item.id,
    label: t(item.labelKey),
    description: t(item.descriptionKey),
    link: item.link,
    linkTarget: '_self',
    depth: 1,
    displayOrder: index + 1,
    children: [],
  }));
}

export default function SiteMenuSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected1, setSelected1] = useState('');
  const [selected2, setSelected2] = useState('');
  const [showSitemap, setShowSitemap] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    const fetchMenus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }
        const res = await fetch('/api/menus/list', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const fetchedMenus = Array.isArray(data.menus) ? data.menus : [];
          setMenus(fetchedMenus.length > 0 ? fetchedMenus : buildCoreMenus(t));
        }
      } catch {
        // 조용히 실패
      } finally {
        setLoading(false);
      }
    };
    fetchMenus();
  }, [t]);

  // 현재 경로에 맞는 1뎁스/2뎁스 선택값 자동 감지
  useEffect(() => {
    if (menus.length === 0) return;

    for (const menu of menus) {
      // 직접 링크인 1뎁스
      if (menu.children.length === 0 && menu.link) {
        if (pathname === menu.link || (menu.link !== '/' && pathname.startsWith(menu.link))) {
          setSelected1(menu.id);
          setSelected2('');
          return;
        }
      }
      // 2뎁스 검색
      for (const child of menu.children) {
        if (child.link && (pathname === child.link || pathname.startsWith(child.link))) {
          setSelected1(menu.id);
          setSelected2(child.id);
          return;
        }
      }
    }

    // 홈 경로
    const homeMenu = menus.find((m) => m.link === '/' && m.children.length === 0);
    if (homeMenu && pathname === '/') {
      setSelected1(homeMenu.id);
      setSelected2('');
    }
  }, [menus, pathname]);

  const navigate = (link, linkTarget) => {
    if (!link) return;
    if (linkTarget === '_blank') {
      const fullUrl = link.startsWith('/') ? `${window.location.origin}${link}` : link;
      window.open(fullUrl, '_blank');
    } else if (link.startsWith('/')) {
      router.push(link);
    } else {
      window.open(link, '_blank');
    }
  };

  const handle1Change = (e) => {
    const id = e.target.value;
    setSelected1(id);
    setSelected2('');
    if (!id) return;
    const menu = menus.find((m) => m.id === id);
    if (!menu) return;
    if (menu.children.length === 0 && menu.link) {
      navigate(menu.link, menu.linkTarget);
    }
  };

  const handle2Change = (e) => {
    const id = e.target.value;
    setSelected2(id);
    if (!id) return;
    const menu1 = menus.find((m) => m.id === selected1);
    if (!menu1) return;
    const child = menu1.children.find((c) => c.id === id);
    if (child && child.link) {
      navigate(child.link, child.linkTarget);
    }
  };

  // 모달 바깥 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setShowSitemap(false);
      }
    };
    if (showSitemap) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSitemap]);

  const selectedMenu1 = menus.find((m) => m.id === selected1);
  const show2ndSelect = selectedMenu1 && selectedMenu1.children.length > 0;

  if (loading) {
    return (
      <div className='flex items-center gap-2 px-3 py-2 bg-muted border-b border-border'>
        <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
        <span className='text-xs text-muted-foreground'>{t('site_menu.loading')}</span>
      </div>
    );
  }

  if (menus.length === 0) return null;

  return (
    <>
      <div className='flex flex-wrap items-center gap-2 px-3 py-2 bg-muted border-b border-border'>
        {/* 1뎁스 셀렉트 */}
        <select
          value={selected1}
          onChange={handle1Change}
          className='min-w-0 flex-1 sm:flex-none px-3 py-1.5 text-sm bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:border-transparent cursor-pointer'
        >
          <option value=''>{t('site_menu.select_menu')}</option>
          {menus.map((menu) => (
            <option key={menu.id} value={menu.id}>
              {menu.label}
            </option>
          ))}
        </select>

        {/* 2뎁스 셀렉트 (상위가 자식을 가질 때만 표시) */}
        {show2ndSelect && (
          <>
            <ChevronRight className='h-4 w-4 text-muted-foreground' />
            <select
              value={selected2}
              onChange={handle2Change}
              className='min-w-0 flex-1 sm:flex-none px-3 py-1.5 text-sm bg-background border border-border rounded-lg text-foreground focus:ring-2 focus:ring-ring focus:border-transparent cursor-pointer'
            >
              <option value=''>{t('site_menu.select_submenu')}</option>
              {selectedMenu1.children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.label}
                </option>
              ))}
            </select>
          </>
        )}

        {/* 사이트맵 버튼 */}
        <button
          onClick={() => setShowSitemap(true)}
          className='ml-auto sm:ml-1 p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors'
          title={t('site_menu.sitemap')}
          aria-label={t('site_menu.sitemap')}
        >
          <LayoutGrid className='h-4 w-4' />
        </button>
      </div>

      {/* 사이트맵 모달 — Portal로 body에 직접 렌더링 */}
      {showSitemap && createPortal(
        <div className='fixed inset-0 z-[99999] flex items-start justify-center pt-12 sm:pt-24 bg-black/50 backdrop-blur-sm overflow-hidden'>
          <div
            ref={modalRef}
            className='bg-background rounded-xl shadow-2xl w-full max-w-2xl mx-3 sm:mx-4 max-h-[82vh] sm:max-h-[70vh] overflow-hidden flex flex-col'
          >
            {/* 모달 헤더 */}
            <div className='flex items-center justify-between px-6 py-4 border-b border-border'>
              <div className='flex items-center gap-2'>
                <LayoutGrid className='h-5 w-5 text-primary' />
                <h2 className='text-base font-semibold text-foreground'>{t('site_menu.sitemap')}</h2>
              </div>
              <button
                onClick={() => setShowSitemap(false)}
                className='p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted'
                aria-label={t('common.close')}
              >
                <X className='h-5 w-5' />
              </button>
            </div>

            {/* 모달 본문 */}
            <div className='overflow-y-auto p-6'>
              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                {menus.map((menu) => (
                  <div
                    key={menu.id}
                    className='border border-border rounded-lg overflow-hidden'
                  >
                    {/* 1뎁스 헤더 */}
                    <div
                      className={`px-4 py-3 bg-muted border-b border-border ${
                        menu.link ? 'cursor-pointer hover:bg-muted' : ''
                      }`}
                      onClick={() => {
                        if (menu.link) {
                          navigate(menu.link, menu.linkTarget);
                          setShowSitemap(false);
                        }
                      }}
                    >
                      <div className='flex items-center justify-between'>
                        <span className='font-medium text-foreground text-sm'>
                          {menu.label}
                        </span>
                        {menu.link && !menu.link.startsWith('/') && (
                          <ExternalLink className='h-3.5 w-3.5 text-muted-foreground' />
                        )}
                      </div>
                      {menu.description && (
                        <p className='text-xs text-muted-foreground mt-0.5'>
                          {menu.description}
                        </p>
                      )}
                    </div>

                    {/* 2뎁스 자식들 (없으면 1뎁스 자신을 표시) */}
                    {(() => {
                      const items = menu.children.length > 0
                        ? menu.children
                        : menu.link ? [{ id: `${menu.id}-self`, label: menu.label, description: menu.description, link: menu.link, linkTarget: menu.linkTarget }] : [];
                      return items.length > 0 && (
                        <div className='divide-y divide-border'>
                          {items.map((child) => (
                            <button
                              key={child.id}
                              onClick={() => {
                                navigate(child.link, child.linkTarget);
                                setShowSitemap(false);
                              }}
                              className='w-full text-left px-4 py-2.5 hover:bg-primary/10 transition-colors group'
                            >
                              <div className='flex items-center justify-between'>
                                <span className='text-sm text-foreground group-hover:text-primary'>
                                  {child.label}
                                </span>
                                {child.link && !child.link.startsWith('/') && (
                                  <ExternalLink className='h-3 w-3 text-muted-foreground' />
                                )}
                              </div>
                              {child.description && (
                                <p className='text-xs text-muted-foreground mt-0.5'>
                                  {child.description}
                                </p>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {/* 자식 없고 링크도 없는 경우 */}
                    {menu.children.length === 0 && !menu.link && (
                      <div className='px-4 py-2.5 text-xs text-muted-foreground italic'>
                        {t('site_menu.coming_soon')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </>
  );
}
