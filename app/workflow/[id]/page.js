'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save, ArrowLeft, Play, Loader2, CheckCircle, AlertCircle } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import dynamic from 'next/dynamic';
const SiteMenuSelector = dynamic(() => import('@/components/SiteMenuSelector'), { ssr: false });
const WorkflowCanvas = dynamic(() => import('@/components/workflow/WorkflowCanvas'), { ssr: false });
const NodePalette = dynamic(() => import('@/components/workflow/NodePalette'), { ssr: false });
const PropertyPanel = dynamic(() => import('@/components/workflow/PropertyPanel'), { ssr: false });
const TestPanel = dynamic(() => import('@/components/workflow/TestPanel'), { ssr: false });

export default function WorkflowEditorPage() {
  const { id: workflowId } = useParams();
  const router = useRouter();
  const { t } = useTranslation();

  const [, setWorkflow] = useState(null);
  const [workflowName, setWorkflowName] = useState('');
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [showTest, setShowTest] = useState(false);

  const autosaveTimer = useRef(null);
  const latestData = useRef({ nodes, edges, workflowName });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Load workflow
  useEffect(() => {
    if (!workflowId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/workflows/${workflowId}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error(t('workflow.error_load'));
        const data = await res.json();
        const wf = data.workflow || data;
        setWorkflow(wf);
        setWorkflowName(wf.name || t('workflow.unnamed'));
        const def = wf.definition || {};
        setNodes(def.nodes || []);
        setEdges(def.edges || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [workflowId, t]);

  // Load models
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/models', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        setModels(data.models || data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // Sync latest data ref
  useEffect(() => {
    latestData.current = { nodes, edges, workflowName };
  }, [nodes, edges, workflowName]);

  // Autosave timer cleanup
  useEffect(() => {
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, []);

  // Save function
  const saveWorkflow = useCallback(async () => {
    if (!workflowId) return;
    const { nodes: n, edges: e, workflowName: nm } = latestData.current;
    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: nm, definition: { nodes: n, edges: e } }),
      });
      if (!res.ok) throw new Error(t('workflow.error_save'));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch {
      setSaveStatus('error');
    }
  }, [workflowId, t]);

  const triggerAutosave = useCallback(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => saveWorkflow(), 2000);
  }, [saveWorkflow]);

  const handleNodesChange = useCallback((newNodes) => {
    setNodes(newNodes);
    triggerAutosave();
  }, [triggerAutosave]);

  const handleEdgesChange = useCallback((newEdges) => {
    setEdges(newEdges);
    triggerAutosave();
  }, [triggerAutosave]);

  const handleNameChange = (val) => {
    setWorkflowName(val);
    triggerAutosave();
  };

  const handleNodeSelect = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleNodeUpdate = useCallback((updatedData) => {
    setNodes(prev => prev.map(n =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, ...updatedData } } : n
    ));
    triggerAutosave();
  }, [selectedNodeId, triggerAutosave]);

  const inputSchema = nodes
    .filter(n => n.type === 'input')
    .map(n => ({
      variableName: n.data?.variableName || 'input',
      label: n.data?.label || n.data?.variableName || t('workflow.input_label'),
      inputType: n.data?.inputType || 'text',
      required: n.data?.required ?? true,
      defaultValue: n.data?.defaultValue || '',
    }));

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  if (loading) return (
    <div className="min-h-screen bg-muted flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen bg-muted flex items-center justify-center">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-[var(--hn-error)] mx-auto mb-4" />
        <p className="text-[var(--hn-error)]">{error}</p>
        <button onClick={() => router.push('/workflow')} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg">{t('workflow.back_to_list')}</button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-muted">
      <SiteMenuSelector />

      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-background border-b border-border">
        <button onClick={() => router.push('/workflow')} className="p-1.5 hover:bg-muted rounded" title={t('workflow.back_to_list')}>
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <input
          type="text"
          value={workflowName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="text-lg font-semibold bg-transparent border-none outline-none text-foreground flex-1 min-w-0"
          placeholder={t('workflow.name_placeholder')}
        />
        {/* Save status */}
        {saveStatus === 'saving' && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />{t('workflow.saving')}</span>}
        {saveStatus === 'saved' && <span className="text-xs text-[var(--hn-good)] flex items-center gap-1"><CheckCircle className="w-3 h-3" />{t('workflow.saved')}</span>}
        {saveStatus === 'error' && <span className="text-xs text-[var(--hn-error)] flex items-center gap-1"><AlertCircle className="w-3 h-3" />{t('workflow.save_failed')}</span>}
        <button onClick={saveWorkflow} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm rounded-lg flex items-center gap-1.5">
          <Save className="w-4 h-4" /> {t('workflow.save')}
        </button>
        <button onClick={() => setShowTest(!showTest)} className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1.5 ${showTest ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted'}`}>
          <Play className="w-4 h-4" /> {t('workflow.test')}
        </button>
      </div>

      {/* Main 3-panel layout — WorkflowCanvas provides DndContext, NodePalette passed as children */}
      <div className="flex-1 flex overflow-hidden">
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeSelect={handleNodeSelect}
          selectedNodeId={selectedNodeId}
        >
          <div className="w-56 flex-shrink-0 border-r border-border bg-background overflow-y-auto">
            <NodePalette />
          </div>
        </WorkflowCanvas>

        {/* Right: property panel */}
        <div className="w-72 flex-shrink-0 border-l border-border bg-background overflow-y-auto">
          <PropertyPanel
            node={selectedNode}
            onNodeUpdate={handleNodeUpdate}
            models={models}
            workflowId={workflowId}
          />
        </div>
      </div>

      {/* Bottom: test panel */}
      {showTest && (
        <div className="border-t border-border bg-background">
          <TestPanel
            workflowId={workflowId}
            inputSchema={inputSchema}
          />
        </div>
      )}
    </div>
  );
}
