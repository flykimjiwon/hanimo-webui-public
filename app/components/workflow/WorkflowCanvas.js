'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import WorkflowNode from './WorkflowNode';
import { useTranslation } from '@/hooks/useTranslation';
import { CircleArrowRight, CircleArrowLeft } from 'lucide-react';
import { MessageSquare } from '@/components/icons';

const ArrowRightCircle = (props) => <CircleArrowRight strokeWidth={1.5} {...props} />;
const ArrowLeftCircle = (props) => <CircleArrowLeft strokeWidth={1.5} {...props} />;

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_WIDTH = 224; // w-56 = 14rem = 224px
const NODE_HEIGHT = 88;

const PALETTE_NODE_LABELS = {
  input: { labelKey: 'workflow.node_input_label', icon: ArrowRightCircle, color: 'border-[var(--hn-warn)] bg-[var(--hn-warn-soft)]' },
  'llm-chat': { labelKey: 'workflow.node_llm_label', icon: MessageSquare, color: 'border-[var(--hn-primary)] bg-[var(--hn-primary-soft)]' },
  output: { labelKey: 'workflow.node_output_label', icon: ArrowLeftCircle, color: 'border-[var(--hn-good)] bg-[var(--hn-good-soft)]' },
};

// ─── Edge path calculation ────────────────────────────────────────────────────

function buildEdgePath(sourceNode, targetNode) {
  if (!sourceNode || !targetNode) return '';

  const sx = sourceNode.x + NODE_WIDTH;
  const sy = sourceNode.y + NODE_HEIGHT / 2;
  const tx = targetNode.x;
  const ty = targetNode.y + NODE_HEIGHT / 2;

  const dx = Math.abs(tx - sx);
  const cx1 = sx + dx * 0.5;
  const cx2 = tx - dx * 0.5;

  return `M ${sx},${sy} C ${cx1},${sy} ${cx2},${ty} ${tx},${ty}`;
}

// ─── Drag overlay ─────────────────────────────────────────────────────────────

function PaletteOverlay({ nodeType }) {
  const { t } = useTranslation();
  const cfg = PALETTE_NODE_LABELS[nodeType] || PALETTE_NODE_LABELS['llm-chat'];
  const Icon = cfg.icon;
  return (
    <div className={`w-56 px-3 py-2.5 rounded-lg border-2 shadow-lg ${cfg.color} opacity-80`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        <span className="text-sm font-semibold text-foreground">{t(cfg.labelKey)}</span>
      </div>
    </div>
  );
}

// ─── Workflow canvas ──────────────────────────────────────────────────────────

export default function WorkflowCanvas({
  nodes = [],
  edges = [],
  onNodesChange,
  onEdgesChange,
  onNodeSelect,
  selectedNodeId,
  children,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Canvas pan drag state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Currently dragged palette node type
  const [activeDragType, setActiveDragType] = useState(null);

  // Click-to-connect state
  const [connectMode, setConnectMode] = useState(null); // { sourceNodeId } | null
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // canvas coordinate space

  // Drag sensor: drag starts after 5px movement
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ─── Escape key cancels connect mode ───────────────────────────────────────

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') setConnectMode(null);

      // Delete/Backspace deletes selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        const updatedNodes = nodes.filter((n) => n.id !== selectedNodeId);
        const updatedEdges = edges.filter(
          (ed) => ed.source !== selectedNodeId && ed.target !== selectedNodeId
        );
        onNodesChange?.(updatedNodes);
        onEdgesChange?.(updatedEdges);
        onNodeSelect?.(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedNodeId, nodes, edges, onNodesChange, onEdgesChange, onNodeSelect]);

  // ─── Drag end handler ──────────────────────────────────────────────────────

  const handleDragEnd = useCallback(
    (event) => {
      const { active, delta } = event;

      // Drop from palette onto canvas
      if (active.data.current?.type === 'palette-node') {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();

        const dropX = (event.activatorEvent.clientX + delta.x - rect.left - pan.x) / zoom;
        const dropY = (event.activatorEvent.clientY + delta.y - rect.top - pan.y) / zoom;

        const nodeType = active.data.current.nodeType;
        // Use Korean label directly since this is internal node data
        const labelMap = { input: '입력 노드', 'llm-chat': 'LLM 채팅', output: '출력 노드' };
        const label = labelMap[nodeType] || nodeType;

        const newNode = {
          id: `node-${Date.now()}`,
          type: nodeType,
          x: Math.max(0, dropX - NODE_WIDTH / 2),
          y: Math.max(0, dropY - NODE_HEIGHT / 2),
          data: { label },
        };

        const updatedNodes = [...nodes, newNode];

        // Auto-connect: when existing nodes present, connect last non-output node to new node
        let updatedEdges = edges;
        if (nodes.length > 0 && nodeType !== 'input') {
          const candidates = nodes.filter((n) => n.type !== 'output');
          if (candidates.length > 0) {
            const lastNode = candidates[candidates.length - 1];
            const alreadyConnected = edges.some((ed) => ed.source === lastNode.id && ed.target === newNode.id);
            if (!alreadyConnected) {
              updatedEdges = [
                ...edges,
                { id: `edge-${lastNode.id}-${newNode.id}`, source: lastNode.id, target: newNode.id },
              ];
            }
          }
        }

        onNodesChange?.(updatedNodes);
        onEdgesChange?.(updatedEdges);
        return;
      }

      // Move existing canvas node
      if (active.data.current?.type === 'canvas-node') {
        const updatedNodes = nodes.map((n) => {
          if (n.id !== active.id) return n;
          return {
            ...n,
            x: n.x + delta.x / zoom,
            y: n.y + delta.y / zoom,
          };
        });
        onNodesChange?.(updatedNodes);
      }
    },
    [nodes, edges, pan, zoom, onNodesChange, onEdgesChange]
  );

  // ─── Canvas pan events ────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e) => {
      if (connectMode) {
        setConnectMode(null);
        return;
      }

      if (e.target === canvasRef.current || e.target.classList.contains('canvas-bg')) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        panOrigin.current = { ...pan };
        e.preventDefault();
        onNodeSelect?.(null);
      }
    },
    [pan, onNodeSelect, connectMode]
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
      }

      if (connectMode && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setMousePos({
          x: (e.clientX - rect.left - pan.x) / zoom,
          y: (e.clientY - rect.top - pan.y) / zoom,
        });
      }
    },
    [pan, zoom, connectMode]
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ─── Zoom events ──────────────────────────────────────────────────────────

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.min(2.0, Math.max(0.25, prev * delta)));
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ─── Port events (click-to-connect) ──────────────────────────────────────

  const handlePortMouseDown = useCallback(
    (e, nodeId, side) => {
      if (side !== 'right') return;
      e.stopPropagation();
      if (connectMode) {
        setConnectMode(null);
        return;
      }
      const sourceNode = nodes.find((n) => n.id === nodeId);
      if (!sourceNode || !canvasRef.current) return;

      setConnectMode({ sourceNodeId: nodeId });
      setMousePos({
        x: sourceNode.x + NODE_WIDTH,
        y: sourceNode.y + NODE_HEIGHT / 2,
      });
    },
    [connectMode, nodes]
  );

  const handlePortMouseUp = useCallback(
    (e, nodeId, side) => {
      if (side !== 'left' || !connectMode) return;
      e.stopPropagation();

      const { sourceNodeId } = connectMode;

      if (sourceNodeId !== nodeId) {
        const exists = edges.some((ed) => ed.source === sourceNodeId && ed.target === nodeId);
        if (!exists) {
          const newEdge = {
            id: `edge-${sourceNodeId}-${nodeId}`,
            source: sourceNodeId,
            target: nodeId,
          };
          onEdgesChange?.([...edges, newEdge]);
        }
      }
      setConnectMode(null);
    },
    [connectMode, edges, onEdgesChange]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const connectSourceNode = connectMode ? nodesById[connectMode.sourceNodeId] : null;
  const pendingLineStart = connectSourceNode
    ? { x: connectSourceNode.x + NODE_WIDTH, y: connectSourceNode.y + NODE_HEIGHT / 2 }
    : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => {
        const t = event.active.data.current?.nodeType;
        if (t) setActiveDragType(t);
      }}
      onDragEnd={(event) => {
        setActiveDragType(null);
        handleDragEnd(event);
      }}
    >
      {/* flex container: children(palette) + canvas side by side */}
      <div className="flex w-full h-full">
        {children}

        {/* Canvas outer container */}
        <div
          ref={canvasRef}
          role="application"
          aria-label="워크플로우 캔버스"
          className="relative flex-1 h-full overflow-hidden bg-muted/50 dark:bg-muted/30 canvas-bg"
          style={{ cursor: isPanning.current ? 'grabbing' : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Connect mode banner */}
          {connectMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
              <div className="bg-background border border-[var(--hn-primary)] text-foreground text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--hn-primary-soft)] animate-pulse inline-block" />
                {t('workflow.connect_hint')}
              </div>
            </div>
          )}

          {/* Grid background */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity: 0.4 }}
          >
            <defs>
              <pattern
                id="grid"
                width={20 * zoom}
                height={20 * zoom}
                x={pan.x % (20 * zoom)}
                y={pan.y % (20 * zoom)}
                patternUnits="userSpaceOnUse"
              >
                <circle cx="1" cy="1" r="1" fill="var(--hn-fg-muted)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Transform layer (pan + zoom) */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '4000px',
              height: '3000px',
            }}
          >
            {/* SVG edge layer */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              style={{ zIndex: 1 }}
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--hn-primary)" />
                </marker>
                <marker
                  id="arrow-pending"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--hn-primary-soft)" />
                </marker>
              </defs>

              {/* Existing edges */}
              {edges.map((edge) => {
                const path = buildEdgePath(nodesById[edge.source], nodesById[edge.target]);
                if (!path) return null;
                return (
                  <path
                    key={edge.id}
                    d={path}
                    fill="none"
                    stroke="var(--hn-primary)"
                    strokeWidth={3}
                    strokeLinecap="round"
                    markerEnd="url(#arrow)"
                  />
                );
              })}

              {/* Pending connection line in connect mode */}
              {connectMode && pendingLineStart && (
                <path
                  d={`M ${pendingLineStart.x},${pendingLineStart.y} C ${pendingLineStart.x + 80},${pendingLineStart.y} ${mousePos.x - 80},${mousePos.y} ${mousePos.x},${mousePos.y}`}
                  fill="none"
                  stroke="var(--hn-primary-soft)"
                  strokeWidth={2.5}
                  strokeDasharray="7,4"
                  strokeLinecap="round"
                  markerEnd="url(#arrow-pending)"
                />
              )}
            </svg>

            {/* HTML node layer */}
            {nodes.map((node) => (
              <WorkflowNode
                key={node.id}
                node={node}
                isSelected={node.id === selectedNodeId}
                isConnectSource={connectMode?.sourceNodeId === node.id}
                onSelect={onNodeSelect}
                onPortMouseDown={handlePortMouseDown}
                onPortMouseUp={handlePortMouseUp}
              />
            ))}
          </div>

          {/* Empty canvas hint */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-center opacity-40">
                <p className="text-base font-semibold text-muted-foreground">
                  {t('workflow.canvas_empty_title')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('workflow.canvas_empty_hint')}
                </p>
              </div>
            </div>
          )}

          {/* Zoom indicator */}
          <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background px-2 py-1 rounded shadow-sm border border-border pointer-events-none">
            {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragType ? <PaletteOverlay nodeType={activeDragType} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
