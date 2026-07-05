'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2, GripVertical, Plus } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

// 컴포넌트 타입별 미리보기 레이블 키
const TYPE_LABEL_KEYS = {
  TextInput: 'screen_builder.type_text_input',
  TextArea: 'screen_builder.type_textarea',
  Select: 'screen_builder.type_select',
  NumberInput: 'screen_builder.type_number_input',
  FileUpload: 'screen_builder.type_file_upload',
  Toggle: 'screen_builder.type_toggle',
  TextDisplay: 'screen_builder.type_text_display',
  JsonDisplay: 'screen_builder.type_json_display',
  ChartDisplay: 'screen_builder.type_chart_display',
  ImageDisplay: 'screen_builder.type_image_display',
  TableDisplay: 'screen_builder.type_table_display',
  Heading: 'screen_builder.type_heading',
  Paragraph: 'screen_builder.type_paragraph',
  Divider: 'screen_builder.type_divider',
  Container: 'screen_builder.type_container',
  Button: 'screen_builder.type_button',
};

// Minus icon inline (not in hanimo-webui icons)
function MinusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// 컴포넌트 미리보기 (비활성)
function ComponentPreview({ comp, t }) {
  switch (comp.type) {
    case 'TextInput':
      return (
        <div className="flex flex-col gap-1 pointer-events-none">
          {comp.label && <label className="text-xs font-medium text-muted-foreground">{comp.label}</label>}
          <div className="px-3 py-2 border border-border rounded-lg bg-muted text-xs text-muted-foreground">{comp.placeholder || t('screen_builder.type_text_input')}</div>
        </div>
      );
    case 'TextArea':
      return (
        <div className="flex flex-col gap-1 pointer-events-none">
          {comp.label && <label className="text-xs font-medium text-muted-foreground">{comp.label}</label>}
          <div className="px-3 py-2 border border-border rounded-lg bg-muted text-xs text-muted-foreground h-16">{comp.placeholder || t('screen_builder.type_textarea')}</div>
        </div>
      );
    case 'Select':
      return (
        <div className="flex flex-col gap-1 pointer-events-none">
          {comp.label && <label className="text-xs font-medium text-muted-foreground">{comp.label}</label>}
          <div className="px-3 py-2 border border-border rounded-lg bg-muted text-xs text-muted-foreground">{t('screen_builder.select_placeholder')}</div>
        </div>
      );
    case 'NumberInput':
      return (
        <div className="flex flex-col gap-1 pointer-events-none">
          {comp.label && <label className="text-xs font-medium text-muted-foreground">{comp.label}</label>}
          <div className="px-3 py-2 border border-border rounded-lg bg-muted text-xs text-muted-foreground">0</div>
        </div>
      );
    case 'FileUpload':
      return (
        <div className="px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground pointer-events-none">
          {comp.label || t('screen_builder.type_file_upload')}
        </div>
      );
    case 'Toggle':
      return (
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-xs text-muted-foreground">{comp.label || t('screen_builder.type_toggle')}</span>
          <div className="w-9 h-5 bg-muted rounded-full" />
        </div>
      );
    case 'Button':
      return (
        <button
          type="button"
          className={`px-4 py-2 rounded-lg text-xs font-semibold pointer-events-none ${comp.style === 'secondary' ? 'bg-muted text-foreground border border-border' : 'bg-primary text-primary-foreground'}`}
        >
          {comp.label || t('screen_builder.type_button')}
        </button>
      );
    case 'Heading':
      return <p className="font-bold text-base text-foreground pointer-events-none">{comp.text || t('screen_builder.type_heading')}</p>;
    case 'Paragraph':
      return <p className="text-xs text-muted-foreground pointer-events-none">{comp.text || t('screen_builder.type_paragraph')}</p>;
    case 'Divider':
      return <hr className="border-border" />;
    case 'TextDisplay':
      return <div className="px-2 py-1.5 bg-muted rounded text-xs text-muted-foreground pointer-events-none">{comp.bindVariable ? `[${t('screen_builder.binding')}: ${comp.bindVariable}]` : t('screen_builder.type_text_display')}</div>;
    case 'JsonDisplay':
      return <div className="px-2 py-1.5 bg-muted rounded text-xs text-[var(--hn-good)] font-mono pointer-events-none">{'{ ... }'}</div>;
    case 'ChartDisplay':
      return <div className="h-24 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground pointer-events-none">{t('screen_builder.type_chart_display')} ({comp.chartType || 'bar'})</div>;
    case 'ImageDisplay':
      return <div className="h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground pointer-events-none">{t('screen_builder.type_image_display')}</div>;
    case 'TableDisplay':
      return <div className="h-20 bg-muted rounded border border-border flex items-center justify-center text-xs text-muted-foreground pointer-events-none">{t('screen_builder.type_table_display')}</div>;
    case 'Container':
      return <div className="border-2 border-dashed border-border rounded-lg h-16 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">{t('screen_builder.type_container')}</div>;
    default:
      return <div className="text-xs text-muted-foreground italic">{comp.type}</div>;
  }
}

// 편집 가능한 컴포넌트 래퍼
export default function EditableComponent({ component, isSelected, onSelect, onUpdate, onDelete }) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    gridColumn: `span ${component.colSpan || 12}`,
  };

  const handleColSpanChange = (delta) => {
    const next = Math.min(12, Math.max(1, (component.colSpan || 12) + delta));
    onUpdate({ ...component, colSpan: next });
  };

  const typeLabel = t(TYPE_LABEL_KEYS[component.type] || 'screen_builder.unknown_component');

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => { e.stopPropagation(); onSelect(component.id); }}
      className={`group relative rounded-lg border-2 p-2 transition-all cursor-pointer ${
        isSelected
          ? 'border-primary shadow-lg shadow-[var(--hn-primary-soft)]'
          : 'border-transparent hover:border-primary/30'
      } ${isDragging ? 'z-50' : ''}`}
    >
      {/* 툴바 (선택 시 표시) */}
      {isSelected && (
        <div className="absolute -top-8 left-0 flex items-center gap-1 bg-primary text-primary-foreground rounded-t-lg px-2 py-1 text-xs z-10">
          {/* 드래그 핸들 */}
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-primary/80 rounded"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-3 h-3" />
          </button>
          <span className="font-medium">{typeLabel}</span>
          <span className="ml-1 opacity-70">col-{component.colSpan || 12}</span>

          {/* colSpan 조절 */}
          <button type="button" onClick={(e) => { e.stopPropagation(); handleColSpanChange(-1); }} className="p-0.5 hover:bg-primary/80 rounded" title={t('screen_builder.decrease_width')}>
            <MinusIcon className="w-3 h-3" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); handleColSpanChange(1); }} className="p-0.5 hover:bg-primary/80 rounded" title={t('screen_builder.increase_width')}>
            <Plus className="w-3 h-3" />
          </button>

          {/* 삭제 */}
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(component.id); }} className="p-0.5 hover:bg-[var(--hn-error)] rounded ml-1" title={t('screen_builder.delete')}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 비선택 시 드래그 핸들 */}
      {!isSelected && (
        <div
          className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      {/* 컴포넌트 미리보기 */}
      <div className="pointer-events-none select-none">
        <ComponentPreview comp={component} t={t} />
      </div>
    </div>
  );
}
