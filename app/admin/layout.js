'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { TokenManager } from '@/lib/tokenManager';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import DarkModeToggle from '@/components/DarkModeToggle';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  Cpu,
  Server,
  GripVertical,
  Edit3,
  Save,
  RotateCcw,
  Edit2,
  Check,
  XIcon,
  Key,
  Terminal,
  Shield,
  Mail,
  Bot,
  ChevronRight,
  Database,
  Lock,
  Brain,
} from '@/components/icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ADMIN_ONLY_MENU_IDS = ['messages', 'direct-messages', 'external-api-logs', 'database'];

// 드래그 가능한 메뉴 아이템 컴포넌트
function SortableNavItem({
  id,
  item,
  isReorderMode,
  isEditMode,
  editingItemId,
  editingName,
  onStartEditing,
  onSaveEdit,
  onCancelEdit,
  onEditingNameChange,
  pathname,
  isExpanded,
  onToggleExpand,
  isAdminOnly,
  userRole,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isCurrentlyEditing = editingItemId === id;
  const hasChildren = item.children && item.children.length > 0;
  const isActive = hasChildren
    ? item.children.some(
        (child) =>
          pathname === child.href ||
          (child.href !== '/' && pathname?.startsWith(child.href))
      )
    : pathname === item.href ||
    (item.href !== '/' && pathname?.startsWith(item.href));
  return (
    <div ref={setNodeRef} style={style}>
      {/* Main row */}
      <div
      className={`group flex items-center rounded-md border-l-[3px] ${isReorderMode
            ? 'bg-muted border-2 border-dashed border-border py-2 px-2 mb-1 text-muted-foreground'
            : isEditMode
            ? 'bg-muted border border-border py-2 px-2 mb-1 text-muted-foreground'
            : isActive
            ? 'bg-secondary text-foreground font-medium border-l-primary px-2 py-2 transition-all'
            : 'text-muted-foreground hover:bg-muted border-l-transparent hover:border-l-primary/40 px-2 py-2 transition-all'
        }`}
        data-testid={`admin-menu-item-${id}`}
      >
        {isReorderMode && (
          <div
            {...attributes}
            {...listeners}
            className='mr-2 cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground'
          >
            <GripVertical className='h-4 w-4' />
          </div>
        )}
      <div className='flex items-center flex-1'>
          <item.icon
          className={`mr-3 h-5 w-5 shrink-0 ${isActive && !isReorderMode && !isEditMode
                ? 'text-foreground'
                : 'text-muted-foreground group-hover:text-muted-foreground'
            }`}
          />

          {hasChildren ? (
            // 부모 항목 (하위메뉴 펼침/접기)
            <div className='flex items-center justify-between flex-1'>
              <button
                onClick={!isReorderMode && !isEditMode ? onToggleExpand : undefined}
                className={`text-sm font-medium text-left flex-1 ${
                  isReorderMode || isEditMode ? 'pointer-events-none' : ''
                }`}
                data-testid={`admin-sidebar-menu-link-${item.id}`}
              >
                {item.name}
              </button>
              {isEditMode ? (
                <button
                  onClick={() => onStartEditing(id, item.name)}
                  className='opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground'
                  data-testid={`admin-menu-edit-button-${id}`}
                >
                  <Edit2 className='h-4 w-4' />
                </button>
              ) : !isReorderMode && (
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
              )}
            </div>
          ) : isCurrentlyEditing ? (
            // 메뉴명 편집 모드
            <div className='flex items-center flex-1 gap-2'>
              <input
                type='text'
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                className='flex-1 px-2 py-1 text-sm border border-border rounded bg-card text-foreground'
                autoFocus
                data-testid={`admin-menu-edit-input-${id}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onSaveEdit(id);
                  } else if (e.key === 'Escape') {
                    onCancelEdit();
                  }
                }}
              />
              <button
                onClick={() => onSaveEdit(id)}
                className='p-1 text-[var(--hn-good)] hover:text-[var(--hn-good)]/80'
                data-testid={`admin-menu-save-button-${id}`}
              >
                <Check className='h-4 w-4' />
              </button>
              <button
                onClick={onCancelEdit}
                className='p-1 text-[var(--hn-error)] hover:text-[var(--hn-error)]/80'
                data-testid={`admin-menu-cancel-button-${id}`}
              >
                <XIcon className='h-4 w-4' />
              </button>
            </div>
          ) : isAdminOnly && userRole !== 'admin' ? (
            <div className='flex items-center justify-between flex-1 opacity-50 cursor-not-allowed' title='Admin only'>
              <span className='text-sm font-medium'>{item.name}</span>
              <Lock className='h-3.5 w-3.5 text-[var(--hn-error)]' />
            </div>
          ) : (
            // 일반 항목
            <div className='flex items-center justify-between flex-1'>
              <a
                href={isReorderMode || isEditMode ? undefined : item.href}
              className={`text-sm font-medium ${isReorderMode || isEditMode ? 'pointer-events-none' : ''
                }`}
                onClick={
                  isReorderMode || isEditMode
                    ? (e) => e.preventDefault()
                    : undefined
                }
                data-testid={`admin-sidebar-menu-link-${item.id}`}
              >
                {item.name}
              </a>
            {isEditMode && (
                <button
                  onClick={() => onStartEditing(id, item.name)}
                  className='opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground'
                  data-testid={`admin-menu-edit-button-${id}`}
                >
                  <Edit2 className='h-4 w-4' />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 하위메뉴 리스트 */}
      {hasChildren && isExpanded && !isReorderMode && (
        <div className='ml-8 mt-1 mb-2 space-y-0.5'>
          {item.children.map((child) => {
            const isChildActive =
              pathname === child.href ||
              (child.href !== '/' && pathname?.startsWith(child.href));
            return (
              <a
                key={child.id}
                href={isEditMode ? undefined : child.href}
                className={`flex items-center px-2 py-1.5 text-sm rounded-md border-l-[3px] transition-all ${
                  isChildActive
                    ? 'bg-secondary text-foreground font-medium border-l-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground border-l-transparent hover:border-l-primary/40'
                }`}
                data-testid={`admin-sidebar-menu-link-${child.id}`}
              >
                {child.name}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminLayout({ children }) {
  const { alert, confirm } = useAlert();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isValidating, setIsValidating] = useState(true);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [navigation, setNavigation] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const { t, loadNamespace } = useTranslation();

  // Load admin translations on mount
  useEffect(() => {
    loadNamespace('admin');
  }, [loadNamespace]);

  const toggleGroup = (id) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 기본 메뉴 구조 (useMemo로 메모이제이션)
  const defaultNavigation = useMemo(
    () => [
      {
        id: 'dashboard',
        name: t('admin.dashboard'),
        href: '/admin/dashboard',
        icon: LayoutDashboard,
      },
      { id: 'users', name: t('admin.users'), href: '/admin/users', icon: Users },
      {
        id: 'modelServers',
        name: t('admin.model_servers'),
        href: '/admin/modelServers',
        icon: Server,
      },
      { id: 'models', name: t('admin.models'), href: '/admin/models', icon: Cpu },
      {
        id: 'messages',
        name: t('admin_layout.messages_mgmt'),
        href: '/admin/messages',
        icon: MessageSquare,
      },
      {
        id: 'direct-messages',
        name: t('admin.direct_messages_mgmt'),
        href: '/admin/direct-messages',
        icon: Mail,
      },
      // 참고: 에이전트 도구 / PII 보안 로그는 오픈소스 빌드에서 통째 제거됐습니다.
      // SSO 로그는 별도 항목으로 보존 가능 (현재 메뉴 미노출, 페이지는 살아있음).
      {
        id: 'user-memories',
        name: 'User Memories',
        href: '/admin/user-memories',
        icon: Brain,
      },
      {
        id: 'external-api-logs',
        name: t('admin.external_api_logs'),
        href: '/admin/external-api-logs',
        icon: Terminal,
      },
      {
        id: 'api-keys',
        name: t('sidebar.api_keys'),
        href: '/admin/api-keys',
        icon: Key,
      },
      {
        id: 'analytics',
        name: t('admin_layout.analytics'),
        href: '/admin/analytics',
        icon: BarChart3,
      },
      { id: 'settings', name: t('admin.settings'), href: '/admin/settings', icon: Settings },
      { id: 'database', name: t('admin.database'), href: '/admin/database', icon: Database },
      { id: 'home', name: t('admin.go_home'), href: '/', icon: Home },
    ],
    [t]
  );

  // 메뉴 순서 및 이름 초기화
  useEffect(() => {
    const savedOrder = localStorage.getItem('adminMenuOrder');
    const savedNames = localStorage.getItem('adminMenuNames');

    let customNames = {};
    if (savedNames) {
      try {
        customNames = JSON.parse(savedNames);
      } catch (error) {
        logger.error(t('admin_layout.menu_name_load_error'), error);
      }
    }

    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder);
        const orderedNavigation = orderIds
          .map((id) => {
            const item = defaultNavigation.find((nav) => nav.id === id);
            return item
              ? {
                  ...item,
                  name: customNames[id] || item.name, // 커스텀 이름이 있으면 사용
                }
              : null;
          })
          .filter(Boolean);

        // 새로운 메뉴 항목이 추가된 경우 처리
        const existingIds = orderedNavigation.map((item) => item.id);
        const newItems = defaultNavigation
          .filter((item) => !existingIds.includes(item.id))
          .map((item) => ({
            ...item,
            name: customNames[item.id] || item.name,
          }));

        setNavigation([...orderedNavigation, ...newItems]);
      } catch (error) {
        logger.error(t('admin_layout.menu_order_load_error'), error);
        const navigationWithNames = defaultNavigation.map((item) => ({
          ...item,
          name: customNames[item.id] || item.name,
        }));
        setNavigation(navigationWithNames);
      }
    } else {
      const navigationWithNames = defaultNavigation.map((item) => ({
        ...item,
        name: customNames[item.id] || item.name,
      }));
      setNavigation(navigationWithNames);
    }
  }, [defaultNavigation, t]);

  // 현재 경로에 하위 메뉴가 포함된 그룹은 자동 펼침
  useEffect(() => {
    const newExpanded = {};
    navigation.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some(
          (child) =>
            pathname === child.href ||
            (child.href !== '/' && pathname?.startsWith(child.href))
        );
        if (hasActiveChild) {
          newExpanded[item.id] = true;
        }
      }
    });
    if (Object.keys(newExpanded).length > 0) {
      setExpandedGroups((prev) => ({ ...prev, ...newExpanded }));
    }
  }, [pathname, navigation]);

  // TokenManager를 사용한 관리자 권한 확인 및 자동 토큰 검증
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsValidating(true);

        // 토큰 존재 확인
        const token = localStorage.getItem('token');
        if (!token) {
          const loginUrl = await TokenManager.getLoginUrl(pathname);
          router.replace(loginUrl);
          return;
        }

        // 토큰 유효성 검증
        const result = await TokenManager.validateToken();
        if (!result.valid) {
          logger.info(t('admin_layout.token_invalid'), result.reason);
          // 토큰이 유효하지 않으면 localStorage 직접 정리하고 로그인 페이지로
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          const loginUrl = await TokenManager.getLoginUrl(pathname);
          router.replace(loginUrl);
          return;
        }

        if (result.user.role !== 'admin') {
          alert(t('admin.permission_required'), 'warning', t('admin.permission_error'));
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.replace('/');
          return;
        }

        // 사용자 정보 설정
        setUser({
          ...result.user,
          name: result.user.name || t('admin.title'),
        });

        // 토큰 자동 갱신 + 글로벌 401 인터셉터 시작
        await TokenManager.initializeTokenValidation();
      } catch (error) {
        logger.error(t('admin_layout.auth_init_failed'), error);
        TokenManager.logout();
      } finally {
        setIsValidating(false);
      }
    };

    initializeAuth();

    // 컴포넌트 언마운트 시 주기적 검증 중단
    return () => {
      TokenManager.stopPeriodicValidation();
    };
  }, [router, alert, confirm, t, pathname]);

  const handleLogout = async () => {
    const confirmed = await confirm(
      t('sidebar.logout_confirm_message'),
      t('sidebar.logout_confirm_title'),
      'warning'
    );
    if (confirmed) {
      TokenManager.logout();
    }
  };

  // 드래그 앤 드롭 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 드래그 앤 드롭 핸들러
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setNavigation((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newOrder = arrayMove(items, oldIndex, newIndex);

        // localStorage에 순서 저장
        const orderIds = newOrder.map((item) => item.id);
        localStorage.setItem('adminMenuOrder', JSON.stringify(orderIds));

        return newOrder;
      });
    }
  };

  // 순서 편집 모드 토글
  const toggleReorderMode = () => {
    setIsReorderMode(!isReorderMode);
  };

  // 순서 초기화
  const resetMenuOrder = () => {
    setNavigation(defaultNavigation);
    localStorage.removeItem('adminMenuOrder');
    setIsReorderMode(false);
  };

  // 순서 저장
  const saveMenuOrder = () => {
    setIsReorderMode(false);
    // 이미 handleDragEnd에서 저장하고 있으므로 추가 작업 불요
  };

  // 메뉴명 편집 모드 토글
  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
    if (isEditMode) {
      // 편집 모드 종료 시 편집 상태 초기화
      setEditingItemId(null);
      setEditingName('');
    }
  };

  // 메뉴명 편집 시작
  const startEditingName = (itemId, currentName) => {
    setEditingItemId(itemId);
    setEditingName(currentName);
  };

  // 메뉴명 편집 저장
  const saveMenuName = (itemId) => {
    if (editingName.trim()) {
      const updatedNavigation = navigation.map((item) =>
        item.id === itemId ? { ...item, name: editingName.trim() } : item
      );
      setNavigation(updatedNavigation);

      // localStorage에 메뉴명 저장
      const savedNames = localStorage.getItem('adminMenuNames');
      let customNames = {};
      if (savedNames) {
        try {
          customNames = JSON.parse(savedNames);
        } catch (error) {
          logger.error(t('admin_layout.saved_menu_name_load_error'), error);
        }
      }
      customNames[itemId] = editingName.trim();
      localStorage.setItem('adminMenuNames', JSON.stringify(customNames));
    }

    setEditingItemId(null);
    setEditingName('');
  };

  // 메뉴명 편집 취소
  const cancelEditingName = () => {
    setEditingItemId(null);
    setEditingName('');
  };

  // 메뉴명 초기화
  const resetMenuNames = () => {
    const resetNavigation = navigation.map((item) => {
      const defaultItem = defaultNavigation.find(
        (defaultNav) => defaultNav.id === item.id
      );
      if (!defaultItem) return item;
      return {
        ...item,
        name: defaultItem.name,
        // 하위메뉴 이름도 초기화
        children: item.children
          ? item.children.map((child) => {
              const defaultChild = defaultItem.children?.find(
                (dc) => dc.id === child.id
              );
              return defaultChild ? { ...child, name: defaultChild.name } : child;
            })
          : item.children,
      };
    });
    setNavigation(resetNavigation);
    localStorage.removeItem('adminMenuNames');
    setIsEditMode(false);
    setEditingItemId(null);
    setEditingName('');
  };

  if (isValidating || !user) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
          <p className='text-muted-foreground'>
            {isValidating ? t('admin.validating') : t('admin.loading_user')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background transition-all duration-300 ease-in-out'>
      {/* 접힌 사이드바 (아이콘만) */}
      <div
        className={`
          fixed left-0 top-0 h-full w-16 bg-card border-r border-border z-40
          flex flex-col items-center py-4
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        `}
        data-testid='admin-sidebar-collapsed'
      >
        {/* 메뉴 버튼 (열기/닫기 토글) */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className='p-3 rounded-lg hover:bg-muted transition-colors mb-2'
          title={t('admin.open_sidebar')}
          data-testid='admin-sidebar-toggle-button'
        >
          <Menu className='h-5 w-5 text-muted-foreground' />
        </button>

        {/* 다크모드 토글 */}
        <div className='mb-4'>
          <DarkModeToggle />
        </div>

        {/* 메뉴 아이콘들 */}
        <div className='flex-1 overflow-y-auto w-full flex flex-col items-center gap-2'>
          {navigation.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const isRestricted = ADMIN_ONLY_MENU_IDS.includes(item.id) && user?.role !== 'admin';
            const isActive = hasChildren
              ? item.children.some(
                  (child) =>
                    pathname === child.href ||
                    (child.href !== '/' && pathname?.startsWith(child.href))
                )
              : pathname === item.href ||
                (item.href !== '/' && pathname?.startsWith(item.href));
            if (hasChildren) {
              return (
                <button
                  key={item.id}
                  onClick={() => setSidebarOpen(true)}
                  className={`p-3 rounded-lg transition-all relative ${
                    isActive
                      ? 'bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--hn-primary)]'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                  title={item.name}
                  data-testid={`admin-sidebar-menu-icon-${item.id}`}
                >
                  <item.icon className='h-5 w-5' />
                </button>
              );
            }
            if (isRestricted) {
              return (
                <div
                  key={item.id}
                  className='p-3 rounded-lg opacity-50 cursor-not-allowed text-muted-foreground'
                  title='Admin only'
                  data-testid={`admin-sidebar-menu-icon-${item.id}`}
                >
                  <item.icon className='h-5 w-5' />
                </div>
              );
            }
            return (
              <a
                key={item.id}
                href={item.href}
                className={`p-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--hn-primary)]'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
                title={item.name}
                data-testid={`admin-sidebar-menu-icon-${item.id}`}
              >
                <item.icon className='h-5 w-5' />
              </a>
            );
          })}
        </div>

        {/* 로그아웃 */}
        <button
          onClick={handleLogout}
          className='p-3 rounded-lg hover:bg-muted transition-colors mt-auto'
          title={t('auth.sign_out')}
          data-testid='admin-sidebar-logout-button'
        >
          <LogOut className='h-5 w-5 text-muted-foreground' />
        </button>
      </div>

      {/* 펼쳐진 사이드바 */}
      <div
        className={`
          fixed left-0 top-0 h-full w-80 bg-card border-r border-border z-50
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        data-testid='admin-sidebar-expanded'
      >
        {/* 사이드바 헤더 */}
        <div className='flex items-center justify-between p-4 border-b border-border'>
          <h2
            className='text-lg font-semibold text-foreground'
            data-testid='admin-sidebar-title'
          >
            {t('admin.panel_title')}
          </h2>
          <div className='flex items-center gap-2'>
            <DarkModeToggle />
            <button
              onClick={() => setSidebarOpen(false)}
              className='p-2 rounded-lg hover:bg-muted transition-colors'
              title={t('admin.close_sidebar')}
              data-testid='admin-sidebar-close-button'
            >
              <X className='h-5 w-5 text-muted-foreground' />
            </button>
          </div>
        </div>

        {/* 메뉴 목록 (스크롤 가능 영역) */}
        <div className='flex-1 overflow-y-auto min-h-0 px-2 py-4'>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={navigation.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <nav className='space-y-1'>
                {navigation.map((item) => (
                  <SortableNavItem
                    key={item.id}
                    id={item.id}
                    item={item}
                    isReorderMode={isReorderMode}
                    isEditMode={isEditMode}
                    editingItemId={editingItemId}
                    editingName={editingName}
                    onStartEditing={startEditingName}
                    onSaveEdit={saveMenuName}
                    onCancelEdit={cancelEditingName}
                    onEditingNameChange={setEditingName}
                     pathname={pathname}
                     isExpanded={!!expandedGroups[item.id]}
                     onToggleExpand={() => toggleGroup(item.id)}
                     isAdminOnly={ADMIN_ONLY_MENU_IDS.includes(item.id)}
                     userRole={user?.role}
                   />
                 ))}
               </nav>
            </SortableContext>
          </DndContext>

          {/* 메뉴 편집 버튼들 */}
          <div className='mt-4 pt-4 border-t border-border space-y-2'>
            {!isReorderMode && !isEditMode ? (
              <>
                <button
                  onClick={toggleReorderMode}
                  className='w-full flex items-center justify-start gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md'
                  data-testid='admin-menu-reorder-button'
                >
                  <Edit3 className='h-4 w-4' />
                  {t('admin.reorder_menu')}
                </button>
                <button
                  onClick={toggleEditMode}
                  className='w-full flex items-center justify-start gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md'
                  data-testid='admin-menu-edit-mode-button'
                >
                  <Edit2 className='h-4 w-4' />
                  {t('admin.edit_menu_names')}
                </button>
              </>
            ) : isReorderMode ? (
              <>
                <button
                  onClick={saveMenuOrder}
                   className='w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md'
                  data-testid='admin-menu-save-order-button'
                >
                  <Save className='h-4 w-4' />
                  {t('common.save')}
                </button>
                <button
                  onClick={resetMenuOrder}
                  className='w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md'
                  data-testid='admin-menu-reset-order-button'
                >
                  <RotateCcw className='h-4 w-4' />
                  {t('admin.reset')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleEditMode}
                  className='w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[var(--hn-good)] bg-[var(--hn-good-soft)] hover:bg-[var(--hn-good-soft)]/80 border border-[var(--hn-good)]/30 rounded-md'
                  data-testid='admin-menu-finish-edit-button'
                >
                  <Check className='h-4 w-4' />
                  {t('admin.finish_edit')}
                </button>
                <button
                  onClick={resetMenuNames}
                  className='w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md'
                  data-testid='admin-menu-reset-names-button'
                >
                  <RotateCcw className='h-4 w-4' />
                  {t('admin.reset_names')}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 사용자 정보 및 로그아웃 */}
        <div className='flex shrink-0 border-t border-border p-4'>
          <div className='group block w-full shrink-0'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-muted-foreground'>
                  {user.name}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('admin.title')}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className='p-2 text-muted-foreground hover:text-foreground'
                data-testid='admin-sidebar-logout-button-bottom'
              >
                <LogOut className='h-4 w-4' />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'pl-0 lg:pl-80' : 'pl-0 lg:pl-16'
        }`}
      >
        {/* Page content */}
        <main className='py-6'>
          <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
            <AdminAuthProvider user={user}>
              {children}
            </AdminAuthProvider>
          </div>
        </main>
      </div>
    </div>
  );
}
