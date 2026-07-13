'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings, Plus, Trash2, Loader2 } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

// ─── Common form fields ───────────────────────────────────────────────────────

function FieldRow({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold text-muted-foreground mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function TextareaInput({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
    />
  );
}

function CheckboxInput({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 accent-[var(--hn-primary)] focus:ring-ring"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

// ─── Node type forms ──────────────────────────────────────────────────────────

function InputNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput
          value={data.label}
          onChange={(v) => onChange({ label: v })}
          placeholder={t('workflow.field_node_name_placeholder_input')}
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_variable_name')}>
        <TextInput
          value={data.variableName}
          onChange={(v) => onChange({ variableName: v })}
          placeholder="user_input"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_input_type')}>
        <SelectInput
          value={data.inputType || 'text'}
          onChange={(v) => onChange({ inputType: v })}
          options={[
            { value: 'text', label: t('workflow.type_text') },
            { value: 'number', label: t('workflow.type_number') },
            { value: 'select', label: t('workflow.type_select') },
          ]}
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_default_value')}>
        <TextInput
          value={data.defaultValue}
          onChange={(v) => onChange({ defaultValue: v })}
          placeholder={t('workflow.field_default_value_placeholder')}
        />
      </FieldRow>
      <FieldRow label="">
        <CheckboxInput
          label={t('workflow.field_required')}
          checked={data.required}
          onChange={(v) => onChange({ required: v })}
        />
      </FieldRow>
    </>
  );
}

function OutputNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput
          value={data.label}
          onChange={(v) => onChange({ label: v })}
          placeholder={t('workflow.field_node_name_placeholder_output')}
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_variable_name')}>
        <TextInput
          value={data.variableName}
          onChange={(v) => onChange({ variableName: v })}
          placeholder="result"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_output_format')}>
        <SelectInput
          value={data.outputFormat || 'text'}
          onChange={(v) => onChange({ outputFormat: v })}
          options={[
            { value: 'text', label: t('workflow.type_text') },
            { value: 'json', label: 'JSON' },
            { value: 'markdown', label: t('workflow.type_markdown') },
          ]}
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_source_variable')}>
        <TextInput
          value={data.sourceVariable}
          onChange={(v) => onChange({ sourceVariable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
    </>
  );
}

// ─── Custom endpoint management section ──────────────────────────────────────

function CustomEndpointSection({ workflowId, data, onChange }) {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    endpointUrl: '',
    apiKey: '',
    providerType: 'openai-compat',
    modelName: '',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (!workflowId) return;
    setLoading(true);
    const token = localStorage.getItem('token');
    fetch(`/api/workflows/${workflowId}/endpoints`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => setEndpoints(d.endpoints || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflowId]);

  const handleAdd = async () => {
    if (!addForm.name.trim() || !addForm.endpointUrl.trim()) {
      setAddError(t('workflow.endpoint_name_url_required'));
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/workflows/${workflowId}/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(addForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || t('workflow.endpoint_add_failed'));
      setEndpoints((prev) => [...prev, d.endpoint]);
      setAddForm({ name: '', endpointUrl: '', apiKey: '', providerType: 'openai-compat', modelName: '' });
      setShowAddForm(false);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="mt-1">
      <FieldRow label={t('workflow.endpoint_select')}>
        {loading ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> {t('workflow.loading')}
          </div>
        ) : (
          <SelectInput
            value={data.customEndpointId || ''}
            onChange={(v) => onChange({ customEndpointId: v })}
            options={[
              { value: '', label: t('workflow.endpoint_select_placeholder') },
              ...endpoints.map((ep) => ({ value: ep.id, label: ep.name })),
            ]}
          />
        )}
      </FieldRow>

      {!showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mb-3"
        >
          <Plus className="w-3 h-3" />
          {t('workflow.endpoint_add')}
        </button>
      )}

      {showAddForm && (
        <div className="rounded-lg border border-primary/30 p-3 mb-3 bg-[var(--hn-primary-soft)]">
          <p className="text-xs font-bold text-primary mb-2">{t('workflow.endpoint_new')}</p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('workflow.endpoint_name_placeholder')}
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              placeholder={t('workflow.endpoint_url_placeholder')}
              value={addForm.endpointUrl}
              onChange={(e) => setAddForm((f) => ({ ...f, endpointUrl: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="password"
              placeholder={t('workflow.endpoint_apikey_placeholder')}
              value={addForm.apiKey}
              onChange={(e) => setAddForm((f) => ({ ...f, apiKey: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <select
              value={addForm.providerType}
              onChange={(e) => setAddForm((f) => ({ ...f, providerType: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="openai-compat">OpenAI 호환</option>
              <option value="ollama">Ollama</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">기타</option>
            </select>
            <input
              type="text"
              placeholder={t('workflow.endpoint_model_placeholder')}
              value={addForm.modelName}
              onChange={(e) => setAddForm((f) => ({ ...f, modelName: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {addError && <p className="text-xs text-[var(--hn-error)] mt-1">{addError}</p>}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={addLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded"
            >
              {addLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              {t('workflow.add')}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setAddError(''); }}
              className="px-2 py-1 text-xs bg-muted hover:bg-muted text-foreground rounded"
            >
              {t('workflow.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LlmChatNodeForm({ data, onChange, models, workflowId }) {
  const { t } = useTranslation();
  const [modelSource, setModelSource] = useState(data.modelSource || 'site');

  const handleModelSourceChange = (src) => {
    setModelSource(src);
    onChange({ modelSource: src });
  };

  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput
          value={data.label}
          onChange={(v) => onChange({ label: v })}
          placeholder={t('workflow.field_node_name_placeholder_llm')}
        />
      </FieldRow>

      <FieldRow label={t('workflow.field_model_source')}>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="modelSource"
              value="site"
              checked={modelSource === 'site'}
              onChange={() => handleModelSourceChange('site')}
              className="accent-[var(--hn-primary)]"
            />
            <span className="text-sm text-foreground">{t('workflow.model_source_site')}</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="modelSource"
              value="custom"
              checked={modelSource === 'custom'}
              onChange={() => handleModelSourceChange('custom')}
              className="accent-[var(--hn-primary)]"
            />
            <span className="text-sm text-foreground">{t('workflow.model_source_custom')}</span>
          </label>
        </div>
      </FieldRow>

      {modelSource === 'site' && models?.length > 0 && (
        <FieldRow label={t('workflow.field_model_select')}>
          <SelectInput
            value={data.modelId}
            onChange={(v) => onChange({ modelId: v })}
            options={[
              { value: '', label: t('workflow.model_select_placeholder') },
              ...models.map((m) => ({ value: m.id, label: m.name || m.model })),
            ]}
          />
        </FieldRow>
      )}
      {modelSource === 'custom' && (
        <CustomEndpointSection workflowId={workflowId} data={data} onChange={onChange} />
      )}

      <FieldRow label={t('workflow.field_system_prompt')}>
        <TextareaInput
          value={data.systemPrompt}
          onChange={(v) => onChange({ systemPrompt: v })}
          placeholder={t('workflow.field_system_prompt_placeholder')}
          rows={3}
        />
      </FieldRow>

      <FieldRow label={t('workflow.field_prompt_template')}>
        <TextareaInput
          value={data.promptTemplate}
          onChange={(v) => onChange({ promptTemplate: v })}
          placeholder={t('workflow.field_prompt_template_placeholder')}
          rows={4}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {'{{변수명}} 형식으로 앞 노드 출력값 참조'}
        </p>
      </FieldRow>

      <FieldRow label={`Temperature: ${data.temperature ?? 0.7}`}>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={data.temperature ?? 0.7}
          onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
          className="w-full accent-[var(--hn-primary)]"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
          <span>{t('workflow.temperature_low')}</span>
          <span>{t('workflow.temperature_high')}</span>
        </div>
      </FieldRow>

      <FieldRow label="Max Tokens">
        <input
          type="number"
          value={data.maxTokens || 2048}
          min={1}
          max={32768}
          onChange={(e) => onChange({ maxTokens: parseInt(e.target.value) || 2048 })}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </FieldRow>
    </>
  );
}

// ─── Additional node type forms ───────────────────────────────────────────────

function ConditionNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_condition_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_input_variable')}>
        <TextInput
          value={data.inputVariable}
          onChange={(v) => onChange({ inputVariable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_operator')}>
        <SelectInput
          value={data.operator || 'contains'}
          onChange={(v) => onChange({ operator: v })}
          options={[
            { value: 'contains', label: '포함 (contains)' },
            { value: 'equals', label: '같음 (equals)' },
            { value: 'not_equals', label: '다름 (not_equals)' },
            { value: 'greater_than', label: '보다 큼 (greater_than)' },
            { value: 'less_than', label: '보다 작음 (less_than)' },
            { value: 'regex', label: '정규식 (regex)' },
            { value: 'is_empty', label: '비어있음 (is_empty)' },
            { value: 'is_not_empty', label: '비어있지 않음 (is_not_empty)' },
          ]}
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_compare_value')}>
        <TextInput
          value={data.compareValue}
          onChange={(v) => onChange({ compareValue: v })}
          placeholder={t('workflow.field_compare_value_placeholder')}
        />
      </FieldRow>
    </>
  );
}

function SwitchNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  const cases = data.cases || [];

  const addCase = () => {
    onChange({ cases: [...cases, { value: '', label: `${t('workflow.case')} ${cases.length + 1}` }] });
  };

  const removeCase = (i) => {
    onChange({ cases: cases.filter((_, idx) => idx !== i) });
  };

  const updateCase = (i, field, val) => {
    const updated = cases.map((c, idx) => (idx === i ? { ...c, [field]: val } : c));
    onChange({ cases: updated });
  };

  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_switch_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_variable_name')}>
        <TextInput
          value={data.variable}
          onChange={(v) => onChange({ variable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_cases')}>
        <div className="space-y-2">
          {cases.map((c, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input
                type="text"
                value={c.value}
                onChange={(e) => updateCase(i, 'value', e.target.value)}
                placeholder={t('workflow.case_value')}
                className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                value={c.label}
                onChange={(e) => updateCase(i, 'label', e.target.value)}
                placeholder={t('workflow.case_label')}
                className="flex-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeCase(i)}
                className="p-1 text-muted-foreground hover:text-[var(--hn-error)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCase}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <Plus className="w-3 h-3" />
            {t('workflow.case_add')}
          </button>
        </div>
      </FieldRow>
      <FieldRow label={t('workflow.field_default_port_label')}>
        <TextInput
          value={data.defaultLabel}
          onChange={(v) => onChange({ defaultLabel: v })}
          placeholder="default"
        />
      </FieldRow>
    </>
  );
}

function LoopNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_loop_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_array_variable')}>
        <TextInput
          value={data.arrayVariable}
          onChange={(v) => onChange({ arrayVariable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_item_variable')}>
        <TextInput
          value={data.itemVariable}
          onChange={(v) => onChange({ itemVariable: v })}
          placeholder="item"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_max_iterations')}>
        <input
          type="number"
          value={data.maxIterations ?? 100}
          min={1}
          max={10000}
          onChange={(e) => onChange({ maxIterations: parseInt(e.target.value) || 100 })}
          className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </FieldRow>
    </>
  );
}

function MergeNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_merge_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_merge_strategy')}>
        <SelectInput
          value={data.mergeStrategy || 'concat'}
          onChange={(v) => onChange({ mergeStrategy: v })}
          options={[
            { value: 'concat', label: '연결 (concat)' },
            { value: 'object', label: '객체 합치기 (object)' },
            { value: 'first', label: '첫 번째 값 (first)' },
          ]}
        />
      </FieldRow>
    </>
  );
}

function TemplateNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_template_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_template_text')}>
        <TextareaInput
          value={data.template}
          onChange={(v) => onChange({ template: v })}
          placeholder="안녕하세요, {{name}}님!"
          rows={5}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {'{{변수명}} 형식으로 앞 노드 출력값 참조'}
        </p>
      </FieldRow>
    </>
  );
}

function JsonTransformNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_json_transform_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_input_variable')}>
        <TextInput
          value={data.inputVariable}
          onChange={(v) => onChange({ inputVariable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_transform_type')}>
        <SelectInput
          value={data.transformType || 'extract'}
          onChange={(v) => onChange({ transformType: v })}
          options={[
            { value: 'extract', label: '추출 (extract)' },
            { value: 'filter', label: '필터 (filter)' },
            { value: 'map', label: '매핑 (map)' },
          ]}
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_path_or_condition')}>
        <TextInput
          value={data.pathOrCondition}
          onChange={(v) => onChange({ pathOrCondition: v })}
          placeholder="예: data.items[0].name"
        />
      </FieldRow>
    </>
  );
}

function TextSplitNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_text_split_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_input_variable')}>
        <TextInput
          value={data.inputVariable}
          onChange={(v) => onChange({ inputVariable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_separator')}>
        <TextInput
          value={data.separator}
          onChange={(v) => onChange({ separator: v })}
          placeholder="\n"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('workflow.separator_hint_split')}
        </p>
      </FieldRow>
    </>
  );
}

function TextJoinNodeForm({ data, onChange }) {
  const { t } = useTranslation();
  return (
    <>
      <FieldRow label={t('workflow.field_node_name')}>
        <TextInput value={data.label} onChange={(v) => onChange({ label: v })} placeholder={t('workflow.node_text_join_placeholder')} />
      </FieldRow>
      <FieldRow label={t('workflow.field_input_variable')}>
        <TextInput
          value={data.inputVariable}
          onChange={(v) => onChange({ inputVariable: v })}
          placeholder="{{node_id.output}}"
        />
      </FieldRow>
      <FieldRow label={t('workflow.field_separator')}>
        <TextInput
          value={data.separator}
          onChange={(v) => onChange({ separator: v })}
          placeholder="\n"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('workflow.separator_hint_join')}
        </p>
      </FieldRow>
    </>
  );
}

// ─── Node type → header label mapping ────────────────────────────────────────

const NODE_TYPE_LABEL_KEYS = {
  input: 'workflow.node_type_input_settings',
  output: 'workflow.node_type_output_settings',
  'llm-chat': 'workflow.node_type_llm_settings',
  condition: 'workflow.node_type_condition_settings',
  switch: 'workflow.node_type_switch_settings',
  loop: 'workflow.node_type_loop_settings',
  merge: 'workflow.node_type_merge_settings',
  template: 'workflow.node_type_template_settings',
  'json-transform': 'workflow.node_type_json_transform_settings',
  'text-split': 'workflow.node_type_text_split_settings',
  'text-join': 'workflow.node_type_text_join_settings',
};

// ─── Property panel main ──────────────────────────────────────────────────────

export default function PropertyPanel({ node, onNodeUpdate, models = [], workflowId }) {
  const { t } = useTranslation();
  const [localData, setLocalData] = useState({});
  const selectedNodeRef = useRef(node);
  selectedNodeRef.current = node;

  // Sync local state when selected node changes (only on node.id change)
  useEffect(() => {
    const selectedNode = selectedNodeRef.current;
    if (selectedNode) {
      setLocalData(selectedNode.data || {});
    }
  }, [node?.id]);

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <Settings className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" />
        <p className="text-sm text-muted-foreground">{t('workflow.property_panel_hint1')}</p>
        <p className="text-sm text-muted-foreground">{t('workflow.property_panel_hint2')}</p>
      </div>
    );
  }

  const handleChange = (patch) => {
    const updated = { ...localData, ...patch };
    setLocalData(updated);
    onNodeUpdate && onNodeUpdate(updated);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-foreground">{t('workflow.property_panel_title')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t(NODE_TYPE_LABEL_KEYS[node.type]) || t('workflow.node_settings')}
          </p>
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {node.id}
        </div>
      </div>

      {/* Form area */}
      <div className="flex-1 overflow-y-auto p-4">
        {node.type === 'input' && (
          <InputNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'output' && (
          <OutputNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'llm-chat' && (
          <LlmChatNodeForm data={localData} onChange={handleChange} models={models} workflowId={workflowId} />
        )}
        {node.type === 'condition' && (
          <ConditionNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'switch' && (
          <SwitchNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'loop' && (
          <LoopNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'merge' && (
          <MergeNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'template' && (
          <TemplateNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'json-transform' && (
          <JsonTransformNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'text-split' && (
          <TextSplitNodeForm data={localData} onChange={handleChange} />
        )}
        {node.type === 'text-join' && (
          <TextJoinNodeForm data={localData} onChange={handleChange} />
        )}
      </div>
    </div>
  );
}
