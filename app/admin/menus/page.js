'use client';

import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import {
  Menu,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  GripVertical,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useTranslation } from '@/hooks/useTranslation';
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

const EMPTY_FORM = {
  label: '',
  description: '',
  link: '',
  linkTarget: '_self',
  parentId: '',
  displayOrder: 0,
  isVisible: true,
  icon: '',
};

// 정렬 가능한 1뎁스 행 컴포넌트
function SortableRootRow({ root, isReadOnly, expanded, onToggleExpand, onOpenCreate, onOpenEdit, onDelete, onToggleVisibility, isExternal, t, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: root.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className='grid grid-cols-[1fr_1fr_80px_60px_60px_80px] items-center hover:bg-muted transition-colors border-b border-border'
      >
        <div className='px-4 py-3'>
          <div className='flex items-center gap-2'>
            {!isReadOnly && (
              <button
                {...attributes}
                {...listeners}
                className='p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing'
                title={t('site_menu.drag_to_reorder')}
                aria-label={t('site_menu.drag_to_reorder')}
              >
                <GripVertical className='h-4 w-4' />
              </button>
            )}
            {root.children.length > 0 ? (
              <button
                onClick={() => onToggleExpand(root.id)}
                className='p-0.5 text-muted-foreground hover:text-foreground'
              >
                {expanded[root.id] ? (
                  <ChevronDown className='h-4 w-4' />
                ) : (
                  <ChevronRight className='h-4 w-4' />
                )}
              </button>
            ) : (
              <span className='w-5' />
            )}
            <span className='font-medium text-foreground'>
              {root.label}
            </span>
            {root.children.length > 0 && (
              <span className='text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full'>
                {root.children.length}{t('site_menu.sub_count_suffix')}
              </span>
            )}
          </div>
        </div>
        <div className='px-4 py-3'>
          {root.link ? (
            <div className='flex items-center gap-1 text-foreground'>
              {isExternal(root.link) ? (
                <ExternalLink className='h-3.5 w-3.5 text-orange-400 shrink-0' />
              ) : (
                <span className='h-3.5 w-3.5 text-primary shrink-0 text-xs font-bold'>/</span>
              )}
              <span className='truncate max-w-[200px] text-xs'>{root.link}</span>
            </div>
          ) : (
            <span className='text-xs text-muted-foreground italic'>{t('site_menu.no_link')}</span>
          )}
        </div>
        <div className='px-4 py-3 text-center'>
          <span className='text-xs text-muted-foreground'>
            {root.link_target === '_blank' ? t('site_menu.new_window') : t('site_menu.current_window')}
          </span>
        </div>
        <div className='px-4 py-3 text-center text-muted-foreground'>
          {root.display_order}
        </div>
        <div className='px-4 py-3 text-center'>
          <button
            onClick={() => onToggleVisibility(root)}
            disabled={isReadOnly}
            className='p-1 rounded hover:bg-muted disabled:cursor-not-allowed'
            title={root.is_visible ? t('site_menu.visible_click_to_hide') : t('site_menu.hidden_click_to_show')}
            aria-label={root.is_visible ? t('site_menu.visible_click_to_hide') : t('site_menu.hidden_click_to_show')}
          >
            {root.is_visible ? (
              <Eye className='h-4 w-4 text-[var(--hn-good)]' />
            ) : (
              <EyeOff className='h-4 w-4 text-muted-foreground' />
            )}
          </button>
        </div>
        <div className='px-4 py-3'>
          <div className='flex items-center justify-end gap-1'>
            {!isReadOnly && (
              <>
                <button
                  onClick={() => onOpenCreate(root.id)}
                  className='p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded'
                  title={t('site_menu.add_submenu')}
                  aria-label={t('site_menu.add_submenu')}
                >
                  <Plus className='h-4 w-4' />
                </button>
                <button
                  onClick={() => onOpenEdit(root)}
                  className='p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded'
                  title={t('site_menu.edit')}
                  aria-label={t('site_menu.edit')}
                >
                  <Edit2 className='h-4 w-4' />
                </button>
                <button
                  onClick={() => onDelete(root)}
                  className='p-1.5 text-muted-foreground hover:text-[var(--hn-error)] hover:bg-[var(--hn-error-soft)] rounded'
                  title={t('site_menu.delete')}
                  aria-label={t('site_menu.delete')}
                >
                  <Trash2 className='h-4 w-4' />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {children}
    </>
  );
}

// 정렬 가능한 2뎁스 행 컴포넌트
function SortableChildRow({ child, isReadOnly, onOpenEdit, onDelete, onToggleVisibility, isExternal, t }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className='grid grid-cols-[1fr_1fr_80px_60px_60px_80px] items-center bg-muted/50 hover:bg-muted transition-colors border-b border-border'
    >
      <div className='px-4 py-2.5'>
        <div className='flex items-center gap-2 ml-7'>
          {!isReadOnly && (
            <button
              {...attributes}
              {...listeners}
              className='p-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing'
              title={t('site_menu.drag_to_reorder')}
              aria-label={t('site_menu.drag_to_reorder')}
            >
              <GripVertical className='h-3.5 w-3.5' />
            </button>
          )}
          <span className='text-muted-foreground text-xs'>└</span>
          <span className='text-foreground'>{child.label}</span>
        </div>
      </div>
      <div className='px-4 py-2.5'>
        {child.link ? (
          <div className='flex items-center gap-1 text-foreground'>
            {isExternal(child.link) ? (
              <ExternalLink className='h-3.5 w-3.5 text-orange-400 shrink-0' />
            ) : (
              <span className='h-3.5 w-3.5 text-primary shrink-0 text-xs font-bold'>/</span>
            )}
            <span className='truncate max-w-[200px] text-xs'>{child.link}</span>
          </div>
        ) : (
          <span className='text-xs text-muted-foreground italic'>{t('site_menu.no_link')}</span>
        )}
      </div>
      <div className='px-4 py-2.5 text-center'>
        <span className='text-xs text-muted-foreground'>
          {child.link_target === '_blank' ? t('site_menu.new_window') : t('site_menu.current_window')}
        </span>
      </div>
      <div className='px-4 py-2.5 text-center text-muted-foreground text-xs'>
        {child.display_order}
      </div>
      <div className='px-4 py-2.5 text-center'>
        <button
          onClick={() => onToggleVisibility(child)}
          disabled={isReadOnly}
          className='p-1 rounded hover:bg-muted disabled:cursor-not-allowed'
          title={child.is_visible ? t('site_menu.visible_click_to_hide') : t('site_menu.hidden_click_to_show')}
          aria-label={child.is_visible ? t('site_menu.visible_click_to_hide') : t('site_menu.hidden_click_to_show')}
        >
          {child.is_visible ? (
            <Eye className='h-4 w-4 text-[var(--hn-good)]' />
          ) : (
            <EyeOff className='h-4 w-4 text-muted-foreground' />
          )}
        </button>
      </div>
      <div className='px-4 py-2.5'>
        <div className='flex items-center justify-end gap-1'>
          {!isReadOnly && (
            <>
              <button
                onClick={() => onOpenEdit(child)}
                className='p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded'
                title={t('site_menu.edit')}
                aria-label={t('site_menu.edit')}
              >
                <Edit2 className='h-4 w-4' />
              </button>
              <button
                onClick={() => onDelete(child)}
                className='p-1.5 text-muted-foreground hover:text-[var(--hn-error)] hover:bg-[var(--hn-error-soft)] rounded'
                title={t('site_menu.delete')}
                aria-label={t('site_menu.delete')}
              >
                <Trash2 className='h-4 w-4' />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminMenusPage() {
  const { confirm, alert } = useAlert();
  const { isReadOnly } = useAdminAuth();
  const { t } = useTranslation();

  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null); // null = 신규
  const [form, setForm] = useState(EMPTY_FORM);

  // 트리 펼침 상태
  const [expanded, setExpanded] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchMenus = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/menus', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMenus(data.menus || []);
      }
    } catch (e) {
      await alert(t('site_menu.fetch_error'));
    } finally {
      setLoading(false);
    }
  }, [alert, t]);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  // 트리 구조로 변환
  const buildTree = (flat) => {
    const roots = flat.filter((m) => !m.parent_id);
    const children = (parentId) => flat.filter((m) => m.parent_id === parentId);
    return roots.map((root) => ({ ...root, children: children(root.id) }));
  };

  const tree = buildTree(menus);

  const openCreate = (parentId = '') => {
    setEditingMenu(null);
    setForm({ ...EMPTY_FORM, parentId });
    setShowModal(true);
  };

  const openEdit = (menu) => {
    setEditingMenu(menu);
    setForm({
      label: menu.label,
      description: menu.description || '',
      link: menu.link || '',
      linkTarget: menu.link_target || '_self',
      parentId: menu.parent_id || '',
      displayOrder: menu.display_order ?? 0,
      isVisible: menu.is_visible !== false,
      icon: menu.icon || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingMenu(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      await alert(t('site_menu.label_required'));
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        label: form.label.trim(),
        description: form.description || null,
        link: form.link || null,
        linkTarget: form.linkTarget,
        parentId: form.parentId || null,
        displayOrder: parseInt(form.displayOrder) || 0,
        isVisible: form.isVisible,
        icon: form.icon || null,
      };

      let res;
      if (editingMenu) {
        res = await fetch('/api/admin/menus', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: editingMenu.id, ...payload }),
        });
      } else {
        res = await fetch('/api/admin/menus', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        closeModal();
        await fetchMenus();
      } else {
        const err = await res.json();
        await alert(err.error || t('site_menu.save_error'));
      }
    } catch (e) {
      await alert(t('site_menu.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (menu) => {
    const hasChildren = menus.some((m) => m.parent_id === menu.id);
    const msg = hasChildren
      ? t('site_menu.confirm_delete_with_children', { label: menu.label })
      : t('site_menu.confirm_delete', { label: menu.label });

    const confirmed = await confirm(msg);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/admin/menus?id=${menu.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchMenus();
      } else {
        const err = await res.json();
        await alert(err.error || t('site_menu.delete_error'));
      }
    } catch (e) {
      await alert(t('site_menu.delete_error'));
    }
  };

  const handleToggleVisibility = async (menu) => {
    if (isReadOnly) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/menus', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: menu.id,
          label: menu.label,
          description: menu.description,
          link: menu.link,
          linkTarget: menu.link_target,
          parentId: menu.parent_id,
          displayOrder: menu.display_order,
          isVisible: !menu.is_visible,
          icon: menu.icon,
        }),
      });
      if (res.ok) {
        await fetchMenus();
      }
    } catch (e) {
      await alert(t('site_menu.update_error'));
    }
  };

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // 링크 타입 판단
  const isExternal = (link) => link && !link.startsWith('/');

  // 1뎁스 메뉴 목록 (parentId 선택용)
  const rootMenus = menus.filter((m) => !m.parent_id);

  // 1뎁스 드래그 종료 핸들러
  const handleRootDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const rootIds = tree.map((r) => r.id);
    const oldIndex = rootIds.indexOf(active.id);
    const newIndex = rootIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(rootIds, oldIndex, newIndex);

    // 낙관적 업데이트: menus 배열에서 1뎁스 순서 재배치
    setMenus((prev) => {
      const roots = prev.filter((m) => !m.parent_id);
      const children = prev.filter((m) => m.parent_id);
      const reordered = newOrder.map((id, idx) => {
        const item = roots.find((r) => r.id === id);
        return { ...item, display_order: idx };
      });
      return [...reordered, ...children];
    });

    // API 업데이트
    try {
      const token = localStorage.getItem('token');
      await Promise.all(
        newOrder.map((id, idx) => {
          const item = menus.find((m) => m.id === id);
          if (!item) return Promise.resolve();
          return fetch('/api/admin/menus', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              id,
              label: item.label,
              description: item.description,
              link: item.link,
              linkTarget: item.link_target,
              parentId: item.parent_id,
              displayOrder: idx,
              isVisible: item.is_visible,
              icon: item.icon,
            }),
          });
        })
      );
    } catch (e) {
      await fetchMenus();
    }
  };

  // 2뎁스 드래그 종료 핸들러 (특정 부모 하위)
  const handleChildDragEnd = async (event, parentId) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const parentNode = tree.find((r) => r.id === parentId);
    if (!parentNode) return;

    const childIds = parentNode.children.map((c) => c.id);
    const oldIndex = childIds.indexOf(active.id);
    const newIndex = childIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(childIds, oldIndex, newIndex);

    // 낙관적 업데이트
    setMenus((prev) => {
      const others = prev.filter((m) => m.parent_id !== parentId);
      const reordered = newOrder.map((id, idx) => {
        const item = prev.find((m) => m.id === id);
        return { ...item, display_order: idx };
      });
      return [...others, ...reordered];
    });

    // API 업데이트
    try {
      const token = localStorage.getItem('token');
      await Promise.all(
        newOrder.map((id, idx) => {
          const item = menus.find((m) => m.id === id);
          if (!item) return Promise.resolve();
          return fetch('/api/admin/menus', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              id,
              label: item.label,
              description: item.description,
              link: item.link,
              linkTarget: item.link_target,
              parentId: item.parent_id,
              displayOrder: idx,
              isVisible: item.is_visible,
              icon: item.icon,
            }),
          });
        })
      );
    } catch (e) {
      await fetchMenus();
    }
  };

  return (
    <div className='p-6'>
      <PageHead
        eyebrow='사이트'
        title={t('site_menu.page_title')}
        sub='사용자에게 노출되는 사이트 메뉴를 추가·수정·정렬합니다.'
        actions={
          <>
            <button
              onClick={fetchMenus}
              className='p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted'
              title={t('site_menu.refresh')}
            >
              <RefreshCw className='h-4 w-4' />
            </button>
            {!isReadOnly && (
              <button
                onClick={() => openCreate()}
                className='flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium'
              >
                <Plus className='h-4 w-4' />
                {t('site_menu.add_menu')}
              </button>
            )}
          </>
        }
      />

      {/* 메뉴 목록 */}
      <div className='bg-background rounded-xl border border-border overflow-x-auto'>
        {loading ? (
          <div className='flex items-center justify-center py-16'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
            <span className='ml-2 text-muted-foreground'>{t('site_menu.loading')}</span>
          </div>
        ) : tree.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
            <Menu className='h-10 w-10 mb-3 opacity-40' />
            <p className='text-sm'>{t('site_menu.no_menus')}</p>
            {!isReadOnly && (
              <button
                onClick={() => openCreate()}
                className='mt-3 text-sm text-primary hover:underline'
              >
                {t('site_menu.add_first_menu')}
              </button>
            )}
          </div>
        ) : (
          <div className='w-full text-sm'>
            <div className='grid grid-cols-[1fr_1fr_80px_60px_60px_80px] bg-muted text-xs text-muted-foreground uppercase tracking-wide border-b border-border'>
              <div className='px-4 py-3 font-medium'>{t('site_menu.col_label')}</div>
              <div className='px-4 py-3 font-medium'>{t('site_menu.col_link')}</div>
              <div className='px-4 py-3 font-medium text-center'>{t('site_menu.col_link_target')}</div>
              <div className='px-4 py-3 font-medium text-center'>{t('site_menu.col_order')}</div>
              <div className='px-4 py-3 font-medium text-center'>{t('site_menu.col_visible')}</div>
              <div className='px-4 py-3 font-medium text-right'>{t('site_menu.col_actions')}</div>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRootDragEnd}
            >
              <SortableContext
                items={tree.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <div>
                  {tree.map((root) => (
                    <SortableRootRow
                      key={root.id}
                      root={root}
                      isReadOnly={isReadOnly}
                      expanded={expanded}
                      onToggleExpand={toggleExpand}
                      onOpenCreate={openCreate}
                      onOpenEdit={openEdit}
                      onDelete={handleDelete}
                      onToggleVisibility={handleToggleVisibility}
                      isExternal={isExternal}
                      t={t}
                    >
                      {/* 2뎁스 행들 — 각 부모별 별도 DnD 컨텍스트 */}
                      {expanded[root.id] && root.children.length > 0 && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(e) => handleChildDragEnd(e, root.id)}
                        >
                          <SortableContext
                            items={root.children.map((c) => c.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div>
                              {root.children.map((child) => (
                                <SortableChildRow
                                  key={child.id}
                                  child={child}
                                  isReadOnly={isReadOnly}
                                  onOpenEdit={openEdit}
                                  onDelete={handleDelete}
                                  onToggleVisibility={handleToggleVisibility}
                                  isExternal={isExternal}
                                  t={t}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </SortableRootRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      {/* 메뉴 추가/수정 모달 */}
      {showModal && (
        <div role='dialog' aria-modal='true' className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm'>
          <div className='bg-background rounded-xl shadow-xl w-full max-w-lg mx-4 p-6'>
            <div className='flex items-center justify-between mb-5'>
              <h2 className='text-lg font-semibold text-foreground'>
                {editingMenu ? t('site_menu.modal_edit_title') : t('site_menu.modal_add_title')}
              </h2>
              <button
                onClick={closeModal}
                className='p-1.5 text-muted-foreground hover:text-foreground rounded'
              >
                <X className='h-5 w-5' />
              </button>
            </div>

            <div className='space-y-4'>
              {/* 메뉴명 */}
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('site_menu.field_label')} <span className='text-[var(--hn-error)]'>*</span>
                </label>
                <input
                  type='text'
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={t('site_menu.field_label_placeholder')}
                  className='w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
                />
              </div>

              {/* 설명 */}
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('site_menu.field_description')}
                </label>
                <input
                  type='text'
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={t('site_menu.field_description_placeholder')}
                  className='w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
                />
              </div>

              {/* 상위 메뉴 */}
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('site_menu.field_parent')}
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  className='w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
                >
                  <option value=''>{t('site_menu.field_parent_none')}</option>
                  {rootMenus
                    .filter((m) => !editingMenu || m.id !== editingMenu.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </div>

              {/* 링크 */}
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('site_menu.field_link')}
                </label>
                <input
                  type='text'
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  placeholder={t('site_menu.field_link_placeholder')}
                  className='w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
                />
                {form.link && (
                  <p className='mt-1 text-xs text-muted-foreground flex items-center gap-1'>
                    {isExternal(form.link) ? (
                      <>
                        <ExternalLink className='h-3 w-3 text-orange-400' />
                        {t('site_menu.external_link')}
                      </>
                    ) : (
                      <>
                        <span className='text-primary font-bold'>/</span>
                        {t('site_menu.internal_link')}
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* 링크 타겟 */}
              <div>
                <label className='block text-sm font-medium text-foreground mb-2'>
                  {t('site_menu.field_link_target')}
                </label>
                <div className='flex gap-4'>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='radio'
                      value='_self'
                      checked={form.linkTarget === '_self'}
                      onChange={(e) => setForm((f) => ({ ...f, linkTarget: e.target.value }))}
                      className='text-primary'
                    />
                    <span className='text-sm text-foreground'>{t('site_menu.current_window')}</span>
                  </label>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='radio'
                      value='_blank'
                      checked={form.linkTarget === '_blank'}
                      onChange={(e) => setForm((f) => ({ ...f, linkTarget: e.target.value }))}
                      className='text-primary'
                    />
                    <span className='text-sm text-foreground'>{t('site_menu.new_window')}</span>
                  </label>
                </div>
              </div>

              {/* 표시 순서 + 표시 여부 */}
              <div className='flex gap-4'>
                <div className='flex-1'>
                  <label className='block text-sm font-medium text-foreground mb-1'>
                    {t('site_menu.field_display_order')}
                  </label>
                  <input
                    type='number'
                    value={form.displayOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))
                    }
                    className='w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
                  />
                </div>
                <div className='flex items-end pb-2'>
                  <label className='flex items-center gap-2 cursor-pointer'>
                    <input
                      type='checkbox'
                      checked={form.isVisible}
                      onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
                      className='w-4 h-4 text-primary rounded'
                    />
                    <span className='text-sm text-foreground'>{t('site_menu.field_is_visible')}</span>
                  </label>
                </div>
              </div>

              {/* 아이콘 */}
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('site_menu.field_icon')}
                </label>
                <input
                  type='text'
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder={t('site_menu.field_icon_placeholder')}
                  className='w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring'
                />
              </div>
            </div>

            {/* 버튼 */}
            <div className='flex justify-end gap-2 mt-6'>
              <button
                onClick={closeModal}
                className='px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg'
              >
                {t('site_menu.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className='flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {saving ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <Check className='h-4 w-4' />
                )}
                {editingMenu ? t('site_menu.save_edit') : t('site_menu.save_add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
