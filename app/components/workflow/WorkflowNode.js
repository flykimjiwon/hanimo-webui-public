'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MessageSquare } from '@/components/icons';
import { CircleArrowRight, CircleArrowLeft } from 'lucide-react';

const ArrowRightCircle = (props) => <CircleArrowRight strokeWidth={1.5} {...props} />;
const ArrowLeftCircle = (props) => <CircleArrowLeft strokeWidth={1.5} {...props} />;

// Node type config (3 types). Category color mapping:
// input → warn (trigger), llm-chat → primary/amber (model), output → good (output).
const NODE_TYPE_CONFIG = {
  input: {
    borderColor: 'border-[var(--hn-primary)]',
    iconBg: 'bg-[var(--hn-warn-soft)]',
    iconColor: 'text-[var(--hn-warn)]',
    icon: ArrowRightCircle,
    label: '입력',
    hasPorts: { left: 0, right: 1 },
  },
  output: {
    borderColor: 'border-[var(--hn-good)]',
    iconBg: 'bg-[var(--hn-good-soft)]',
    iconColor: 'text-[var(--hn-good)]',
    icon: ArrowLeftCircle,
    label: '출력',
    hasPorts: { left: 1, right: 0 },
  },
  'llm-chat': {
    borderColor: 'border-[var(--hn-primary)]',
    iconBg: 'bg-[var(--hn-primary-soft)]',
    iconColor: 'text-primary',
    icon: MessageSquare,
    label: 'LLM 채팅',
    hasPorts: { left: 1, right: 1 },
  },
};

// Port component — 16px circle, scales on hover
function Port({ side, nodeId, onPortMouseDown, onPortMouseUp }) {
  const isLeft = side === 'left';

  return (
    <div
      role="button"
      aria-label={isLeft ? '입력 포트' : '출력 포트'}
      className={`w-4 h-4 rounded-full border-2 cursor-crosshair transition-all duration-150
        hover:scale-125 hover:shadow-lg z-10
        ${isLeft
          ? 'border-[var(--hn-info)] bg-[var(--hn-info-soft)] hover:bg-[var(--hn-info-soft)] opacity-100'
          : 'border-[var(--hn-primary)] bg-[var(--hn-primary-soft)] hover:bg-[var(--hn-primary-soft)]'
        }`}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!isLeft) onPortMouseDown?.(e, nodeId, side);
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
        if (isLeft) onPortMouseUp?.(e, nodeId, side);
      }}
      title={isLeft ? '입력 포트 — 여기로 연결 받기' : '출력 포트 — 클릭해서 연결 시작'}
    />
  );
}

// Draggable workflow node
export default function WorkflowNode({
  node,
  isSelected,
  isConnectSource,
  onSelect,
  onPortMouseDown,
  onPortMouseUp,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: node.id,
    data: { type: 'canvas-node', node },
  });

  const config = NODE_TYPE_CONFIG[node.type] || NODE_TYPE_CONFIG['llm-chat'];
  const Icon = config.icon;

  const style = {
    position: 'absolute',
    left: node.x,
    top: node.y,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isSelected ? 20 : isDragging ? 30 : 10,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  // Summary info shown inside the node
  const summaryText = (() => {
    if (node.type === 'input') {
      return node.data?.variableName ? `변수: ${node.data.variableName}` : null;
    }
    if (node.type === 'llm-chat') {
      if (node.data?.model) return node.data.model;
      if (node.data?.prompt) return node.data.prompt.slice(0, 40);
      return null;
    }
    if (node.type === 'output') {
      return node.data?.variableName ? `변수: ${node.data.variableName}` : null;
    }
    return null;
  })();

  const hasLeftPort = config.hasPorts.left > 0;
  const hasRightPort = config.hasPorts.right > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      tabIndex={0}
      className={`w-56 min-h-20 rounded-lg border-2 bg-background shadow-sm select-none
        ${config.borderColor}
        ${isSelected ? 'ring-2 ring-[var(--hn-primary)] ring-offset-1' : ''}
        ${isConnectSource ? 'ring-2 ring-[var(--hn-primary)] ring-offset-2 shadow-[var(--hn-primary-soft)]' : ''}
      `}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          onSelect?.(node.id);
        }
      }}
      {...attributes}
      {...listeners}
    >
      {/* Input port (left center) */}
      {hasLeftPort && (
        <div className="absolute top-1/2 -translate-y-1/2 -left-2.5 z-10">
          <Port
            side="left"
            nodeId={node.id}
            onPortMouseDown={onPortMouseDown}
            onPortMouseUp={onPortMouseUp}
          />
        </div>
      )}

      {/* Node content */}
      <div className="p-3">
        {/* Top: icon + type label + grip */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded ${config.iconBg}`}>
            <Icon className={`w-4 h-4 ${config.iconColor}`} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {config.label}
          </span>
          <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 ml-auto" />
        </div>

        {/* Node name */}
        <div className="text-sm font-semibold text-foreground truncate">
          {node.data?.label || node.label || '노드'}
        </div>

        {/* Summary info */}
        {summaryText && (
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {summaryText}
          </div>
        )}
      </div>

      {/* Output port (right center) */}
      {hasRightPort && (
        <div className="absolute top-1/2 -translate-y-1/2 -right-2.5 z-10">
          <Port
            side="right"
            nodeId={node.id}
            onPortMouseDown={onPortMouseDown}
            onPortMouseUp={onPortMouseUp}
          />
        </div>
      )}
    </div>
  );
}
