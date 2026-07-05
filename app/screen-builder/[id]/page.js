'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Save,
  ArrowLeft,
  Eye,
  Globe,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Hash,
  GripVertical,
  FileText,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import dynamic from 'next/dynamic';
const SiteMenuSelector = dynamic(() => import('@/components/SiteMenuSelector'), { ssr: false });
import EditableComponent from '@/components/screen-builder/EditableComponent';
const ComponentPropertyPanel = dynamic(() => import('@/components/screen-builder/ComponentPropertyPanel'), { ssr: false });
const ScreenRenderer = dynamic(() => import('@/components/screen-builder/ScreenRenderer'), { ssr: false });

const AUTOSAVE_DELAY = 2000;

// Minus icon inline (not in hanimo-webui icons)
function MinusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// Type icon inline (not in hanimo-webui icons)
function TypeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

// TextCursor icon inline (not in hanimo-webui icons)
function TextCursorIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1-4-4H7" />
      <path d="M7 22h1a4 4 0 0 0 4-4v-1" />
      <path d="M7 2h1a4 4 0 0 1 4 4v1" />
    </svg>
  );
}

// MousePointer icon inline (not in hanimo-webui icons)
function MousePointerIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 4 7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  );
}

// ── 컴포넌트 타입 목록
function getComponentTypes(t) {
  return [
    { value: 'Heading',     label: t('screen_builder.type_heading'),      icon: TypeIcon },
    { value: 'Paragraph',   label: t('screen_builder.type_paragraph'),    icon: FileText },
    { value: 'TextInput',   label: t('screen_builder.type_text_input'),   icon: TextCursorIcon },
    { value: 'TextArea',    label: t('screen_builder.type_textarea'),     icon: TextCursorIcon },
    { value: 'Select',      label: t('screen_builder.type_select'),       icon: FileText },
    { value: 'NumberInput', label: t('screen_builder.type_number_input'), icon: Hash },
    { value: 'Button',      label: t('screen_builder.type_button'),       icon: MousePointerIcon },
    { value: 'TextDisplay', label: t('screen_builder.type_text_display'), icon: FileText },
    { value: 'Divider',     label: t('screen_builder.type_divider'),      icon: MinusIcon },
  ];
}

// ── 새 컴포넌트 생성
function createComponent(type, t) {
  const id = `comp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const suffix = id.slice(-4);
  const defaults = {
    Heading:     { text: t('screen_builder.type_heading'), size: 'h2', colSpan: 12 },
    Paragraph:   { text: t('screen_builder.paragraph_default'), colSpan: 12 },
    TextInput:   { label: t('screen_builder.input_label'), placeholder: '', variableName: `input_${suffix}`, required: false, colSpan: 12 },
    TextArea:    { label: t('screen_builder.text_label'), placeholder: '', variableName: `text_${suffix}`, rows: 4, colSpan: 12 },
    Select:      { label: t('screen_builder.select_label'), variableName: `select_${suffix}`, options: [{ label: t('screen_builder.option_1'), value: 'option1' }, { label: t('screen_builder.option_2'), value: 'option2' }], colSpan: 12 },
    NumberInput: { label: t('screen_builder.number_label'), variableName: `num_${suffix}`, min: 0, max: 100, colSpan: 12 },
    Button:      { label: t('screen_builder.run'), style: 'primary', endpointId: '', colSpan: 12 },
    TextDisplay: { bindVariable: '', useMarkdown: false, colSpan: 12 },
    Divider:     { colSpan: 12 },
  };
  return { id, type, ...(defaults[type] || { colSpan: 12 }) };
}

// ── 좌측 목록 정렬 가능한 행
function SortableListItem({ comp, isSelected, onSelect, onDelete, typeLabel }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: comp.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(comp.id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
        isSelected
          ? 'bg-[var(--hn-primary-soft)] text-primary border border-[var(--hn-primary)]/40'
          : 'hover:bg-muted text-foreground border border-transparent'
      }`}
    >
      {/* 드래그 핸들 */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <span className="flex-1 truncate text-xs">{typeLabel}</span>

      {/* 삭제 버튼 */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(comp.id); }}
        className="flex-shrink-0 p-0.5 text-muted-foreground hover:text-[var(--hn-error)] transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── 메인 페이지
export default function ScreenBuilderPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useTranslation();

  // 화면 데이터
  const [screenName, setScreenName] = useState('');
  const [components, setComponents] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [status, setStatus] = useState('draft');

  // UI 상태
  const [selectedId, setSelectedId] = useState(null);
  const [addType, setAddType] = useState('Heading');
  const [previewMode, setPreviewMode] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // 저장 상태
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saved | error
  const [error, setError] = useState('');

  // 엔드포인트 섹션
  const [workflows, setWorkflows] = useState([]);
  const [epExpanded, setEpExpanded] = useState(false);

  // 자동저장 타이머
  const autoSaveTimer = useRef(null);

  // dnd-kit 센서
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const COMPONENT_TYPES = getComponentTypes(t);

  // ── 화면 불러오기
  useEffect(() => {
    const fetchScreen = async () => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/screens/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(t('screen_builder.load_screen_failed'));
        const data = await res.json();
        const screen = data.screen || data;
        setScreenName(screen.name || '');
        setNameInput(screen.name || '');
        setStatus(screen.status || 'draft');
        const def = screen.definition || {};
        setComponents(Array.isArray(def.components) ? def.components : []);
        setEndpoints(Array.isArray(def.endpoints) ? def.endpoints : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchScreen();
  }, [id, t]);

  // ── 워크플로우 목록 불러오기
  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/workflows', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWorkflows(Array.isArray(data.workflows) ? data.workflows : []);
        }
      } catch {
        // 조용히 실패
      }
    };
    fetchWorkflows();
  }, []);

  // ── 저장 함수
  const save = useCallback(async (silent = false) => {
    if (!silent) setSaving(true);
    setSaveStatus('idle');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/screens/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: screenName,
          definition: { components, endpoints },
        }),
      });
      if (!res.ok) throw new Error(t('screen_builder.save_failed'));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      if (!silent) setSaving(false);
    }
  }, [id, screenName, components, endpoints, t]);

  // ── 자동저장
  useEffect(() => {
    if (loading) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => save(true), AUTOSAVE_DELAY);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [components, endpoints, screenName, loading, save]);

  // ── 게시
  const publish = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/screens/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: screenName,
          definition: { components, endpoints },
          status: 'published',
        }),
      });
      setStatus('published');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // ── 컴포넌트 조작
  const handleAddComponent = () => {
    const comp = createComponent(addType, t);
    setComponents((prev) => [...prev, comp]);
    setSelectedId(comp.id);
  };

  const handleUpdateComponent = useCallback((updated) => {
    setComponents((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const handleDeleteComponent = useCallback((compId) => {
    setComponents((prev) => prev.filter((c) => c.id !== compId));
    setSelectedId((prev) => (prev === compId ? null : prev));
  }, []);

  const handleSelectComponent = useCallback((compId) => {
    setSelectedId((prev) => (prev === compId ? null : compId));
  }, []);

  // ── DnD 순서 변경
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setComponents((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // ── 이름 편집
  const handleNameSave = () => {
    setScreenName(nameInput.trim() || screenName);
    setNameEditing(false);
  };

  // ── 엔드포인트 조작
  const handleAddEndpoint = () => {
    const ep = {
      id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${t('screen_builder.endpoint')} ${endpoints.length + 1}`,
      type: 'workflow',
      workflowId: '',
      customUrl: '',
    };
    setEndpoints((prev) => [...prev, ep]);
  };

  const handleUpdateEndpoint = (updated) => {
    setEndpoints((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const handleDeleteEndpoint = (epId) => {
    setEndpoints((prev) => prev.filter((e) => e.id !== epId));
  };

  // ── 선택된 컴포넌트
  const selectedComponent = components.find((c) => c.id === selectedId) || null;

  // ── 타입 레이블 조회
  const getTypeLabel = (type) => {
    const found = COMPONENT_TYPES.find((ct) => ct.value === type);
    return found ? found.label : type;
  };

  // ── 로딩 상태
  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-muted/30">
        <SiteMenuSelector />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">{t('screen_builder.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-screen bg-muted/30">
        <SiteMenuSelector />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[var(--hn-error)]">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-muted/30 overflow-hidden">
      {/* ── SiteMenuSelector */}
      <SiteMenuSelector />

      {/* ── 상단 바 */}
      <header className="flex items-center gap-3 px-4 py-2.5 bg-background border-b border-border flex-shrink-0">
        {/* 뒤로가기 */}
        <button
          type="button"
          onClick={() => router.push('/screen-builder')}
          aria-label={t('screen_builder.list')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('screen_builder.list')}
        </button>

        <div className="w-px h-5 bg-border" />

        {/* 화면 이름 편집 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {nameEditing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave();
                  if (e.key === 'Escape') { setNameInput(screenName); setNameEditing(false); }
                }}
                autoFocus
                className="px-2 py-1 text-sm border border-primary rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-0 w-48"
              />
              <button type="button" onClick={handleNameSave} aria-label="이름 저장" className="p-1 text-[var(--hn-good)] hover:opacity-80">
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setNameInput(screenName); setNameEditing(true); }}
              className="text-sm font-semibold text-foreground hover:text-primary truncate max-w-xs transition-colors"
            >
              {screenName || t('screen_builder.no_screen_name')}
            </button>
          )}

          {/* 저장 상태 */}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-[var(--hn-good)] flex-shrink-0">
              <CheckCircle className="w-3.5 h-3.5" />{t('screen_builder.saved')}
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-xs text-[var(--hn-error)] flex-shrink-0">
              <AlertCircle className="w-3.5 h-3.5" />{t('screen_builder.save_failed')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 미리보기 토글 */}
          <button
            type="button"
            onClick={() => setPreviewMode((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              previewMode
                ? 'bg-[var(--hn-primary-soft)] text-primary'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            {previewMode ? t('screen_builder.edit_mode') : t('screen_builder.preview')}
          </button>

          {/* 저장 */}
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('screen_builder.save')}
          </button>

          {/* 게시 */}
          <button
            type="button"
            onClick={publish}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Globe className="w-3.5 h-3.5" />
            {status === 'published' ? t('screen_builder.status_published') : t('screen_builder.publish')}
          </button>
        </div>
      </header>

      {/* ── 본문: 좌측 패널 + 우측 캔버스 */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── 좌측 패널 (w-80) */}
        <aside className="w-80 flex-shrink-0 flex flex-col border-r border-border bg-background overflow-y-auto">

          {/* 컴포넌트 추가 섹션 */}
          <div className="p-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('screen_builder.add_component')}</p>
            <div className="flex gap-2">
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {COMPONENT_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddComponent}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('screen_builder.add')}
              </button>
            </div>
          </div>

          {/* 컴포넌트 목록 */}
          <div className="p-3 border-b border-border flex-shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {t('screen_builder.component_list')} ({components.length})
            </p>
            {components.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">{t('screen_builder.no_components')}</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={components.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1">
                    {components.map((comp) => (
                      <SortableListItem
                        key={comp.id}
                        comp={comp}
                        isSelected={selectedId === comp.id}
                        onSelect={handleSelectComponent}
                        onDelete={handleDeleteComponent}
                        typeLabel={getTypeLabel(comp.type)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* 엔드포인트 설정 섹션 */}
          <div className="border-b border-border">
            <button
              type="button"
              onClick={() => setEpExpanded((v) => !v)}
              aria-expanded={epExpanded}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:bg-muted transition-colors"
            >
              <span>{t('screen_builder.endpoint_settings')} ({endpoints.length})</span>
              {epExpanded ? <MinusIcon className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>

            {epExpanded && (
              <div className="px-3 pb-3">
                {endpoints.map((ep) => (
                  <div key={ep.id} className="mb-3 p-2.5 bg-muted rounded-lg border border-border">
                    <div className="flex items-center gap-1.5 mb-2">
                      <input
                        type="text"
                        value={ep.name || ''}
                        onChange={(e) => handleUpdateEndpoint({ ...ep, name: e.target.value })}
                        placeholder={t('screen_builder.endpoint_name')}
                        className="flex-1 px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteEndpoint(ep.id)}
                        className="p-1 text-muted-foreground hover:text-[var(--hn-error)] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* 타입 선택 */}
                    <div className="mb-2">
                      <label className="block text-xs text-muted-foreground mb-1">{t('screen_builder.type')}</label>
                      <select
                        value={ep.type || 'workflow'}
                        onChange={(e) => handleUpdateEndpoint({ ...ep, type: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="workflow">{t('screen_builder.workflow')}</option>
                        <option value="custom">{t('screen_builder.custom_url')}</option>
                      </select>
                    </div>

                    {/* 워크플로우 선택 또는 커스텀 URL */}
                    {ep.type === 'workflow' ? (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">{t('screen_builder.workflow')}</label>
                        <select
                          value={ep.workflowId || ''}
                          onChange={(e) => handleUpdateEndpoint({ ...ep, workflowId: e.target.value })}
                          className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">{t('screen_builder.select_workflow')}</option>
                          {workflows.map((wf) => (
                            <option key={wf.id} value={wf.id}>{wf.name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">URL</label>
                        <input
                          type="text"
                          value={ep.customUrl || ''}
                          onChange={(e) => handleUpdateEndpoint({ ...ep, customUrl: e.target.value })}
                          placeholder="https://..."
                          className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddEndpoint}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('screen_builder.add_endpoint')}
                </button>
              </div>
            )}
          </div>

          {/* 속성 패널 */}
          <div className="flex-1 p-3 min-h-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('screen_builder.property_panel')}</p>
            <ComponentPropertyPanel
              component={selectedComponent}
              onUpdate={handleUpdateComponent}
              endpoints={endpoints}
            />
          </div>
        </aside>

        {/* ── 우측 캔버스 */}
        <main role="region" aria-label="화면 편집 캔버스" className="flex-1 overflow-auto p-6 bg-muted/30">
          {previewMode ? (
            /* 미리보기 모드: ScreenRenderer */
            <div className="max-w-3xl mx-auto bg-background rounded-xl shadow-sm border border-border p-6">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                <Eye className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{t('screen_builder.preview')}</span>
              </div>
              <ScreenRenderer
                definition={{ components, endpoints }}
                screenId={id}
                isPreview={true}
              />
            </div>
          ) : (
            /* 편집 모드: EditableComponent 그리드 */
            <div
              className="max-w-5xl mx-auto bg-background rounded-xl shadow-sm border border-border p-6 min-h-96"
              onClick={() => setSelectedId(null)}
            >
              {components.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Plus className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t('screen_builder.no_components')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('screen_builder.add_component_hint')}</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={components.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-12 gap-4 pt-8">
                      {components.map((comp) => (
                        <EditableComponent
                          key={comp.id}
                          component={comp}
                          isSelected={selectedId === comp.id}
                          onSelect={handleSelectComponent}
                          onUpdate={handleUpdateComponent}
                          onDelete={handleDeleteComponent}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
