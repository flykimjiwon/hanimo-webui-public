'use client';


import logger from '@/lib/logger';
import { Plus, Save, X } from '@/components/icons';
import { normalizeJsonString, normalizeLabel } from '../model-utils';

// Shared endpoint selector + manual API config block
function EndpointSelector({ formData, onFormChange, endpoints, availableModels, setAvailableModels, setSelectedEndpoint, buildManualPreset, t }) {
  return (
    <div>
      <label className='block text-xs font-medium text-foreground mb-1'>
        {t('admin_models.model_server')}
      </label>
      <select
        className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
        value={formData.endpoint || ''}
        onChange={(e) => {
          const ep = e.target.value;
          onFormChange({
            endpoint: ep,
            apiConfig: ep === 'manual' ? buildManualPreset('openai-compatible') : formData.apiConfig,
          });
          if (ep === 'manual') {
            setAvailableModels([]);
          }
          setSelectedEndpoint(ep);
        }}
        required
      >
        <option value='manual'>{t('admin_models.manual_add_custom_api')}</option>
        {endpoints.map((ep) => {
          const providerBadge =
            ep.provider === 'openai-compatible' ? '[OpenAI]' :
            ep.provider === 'gemini' ? '[Gemini]' :
            ep.provider === 'ollama' || ep.provider === 'model-server' ? '[Ollama]' :
            `[${ep.provider || 'Ollama'}]`;
          const label = ep.name
            ? `${providerBadge} ${ep.name} (${ep.url})`
            : `${providerBadge} ${ep.url}`;
          return (
            <option key={ep.url} value={ep.url}>
              {label}
            </option>
          );
        })}
      </select>

      {formData.endpoint && formData.endpoint !== 'manual' && availableModels.length > 0 && (
        <div className='flex items-start gap-2 p-2 rounded-md bg-muted border border-border mt-2'>
          <span className='text-xs text-foreground'>
            {(() => {
              const ep = endpoints.find((e) => e.url === formData.endpoint);
              return ep?.name ? `${ep.name} (${ep.url})` : formData.endpoint;
            })()}{' '}
            {t('admin_models.models_count', { count: availableModels.length })}
            {t('admin_models.loaded')}
          </span>
        </div>
      )}

      {formData.endpoint === 'manual' && (
        <div className='mt-3 p-4 bg-muted rounded-lg border border-border'>
          <div className='mb-4'>
            <p className='text-xs font-medium text-foreground mb-2'>
              {t('admin_models.apply_preset')}
            </p>
            <div className='flex flex-wrap gap-2'>
              <button
                type='button'
                onClick={() => onFormChange({ apiConfig: buildManualPreset('openai-compatible') })}
                className='px-2 py-1 text-xs rounded bg-card border border-border hover:bg-accent'
              >
                OpenAI Compatible
              </button>
              <button
                type='button'
                onClick={() => onFormChange({ apiConfig: buildManualPreset('responses') })}
                className='px-2 py-1 text-xs rounded bg-card border border-border hover:bg-accent'
              >
                Responses
              </button>
            </div>
          </div>
          <div className='mb-4'>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_models.api_key_label')}
            </label>
            <input
              type='text'
              value={formData.apiKey || ''}
              onChange={(e) => onFormChange({ apiKey: e.target.value })}
              placeholder={t('admin_models.placeholder_api_key')}
              className='w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent'
            />
            <p className='text-xs text-muted-foreground mt-1'>
              {t('admin_models.api_key_description')}
            </p>
          </div>

          <label className='block text-sm font-medium text-foreground mb-2'>
            {t('admin_models.api_request_settings_json')}
          </label>
          <p className='text-xs text-muted-foreground mb-2'>
            {t('admin_models.api_request_description')}
          </p>
          <textarea
            value={formData.apiConfig || ''}
            onChange={(e) => onFormChange({ apiConfig: e.target.value })}
            onBlur={(e) => {
              const normalized = normalizeJsonString(e.target.value);
              if (normalized !== e.target.value) {
                onFormChange({ apiConfig: normalized });
              }
            }}
            className='w-full h-64 px-3 py-2 text-xs font-mono bg-card border border-border rounded-md focus:ring-2 focus:ring-ring focus:border-transparent'
            placeholder={`{
  "method": "POST",
  "url": "https://api.openai.com/v1/chat/completions",
  "headers": {
    "Authorization": "Bearer {{OPENAI_API_KEY}}",
    "Content-Type": "application/json"
  },
  "body": {
    "model": "gpt-4",
    "messages": "{{messages}}",
    "stream": true
  },
  "stream": true,
  "responseMapping": {
    "path": "choices[0].message.content"
  }
}`}
          />
          <div className='mt-2 text-xs space-y-2'>
            <div className='p-3 bg-destructive/10 border border-destructive/20 rounded'>
              <p className='font-semibold text-destructive mb-2'>⚠️ {t('admin_models.fields_need_modification')}</p>
              <ul className='list-disc ml-5 text-destructive space-y-1'>
                <li><code className='bg-destructive/10/40 px-1 rounded'>&quot;url&quot;</code> - {t('admin_models.api_endpoint_address')}</li>
                <li><code className='bg-destructive/10/40 px-1 rounded'>&quot;model&quot;</code> - {t('admin_models.model_name_examples')}</li>
                <li><code className='bg-destructive/10/40 px-1 rounded'>&quot;responseMapping.path&quot;</code> - {t('admin_models.response_path')}</li>
              </ul>
            </div>
            <div className='text-muted-foreground'>
              <p><strong>{t('admin_models.available_variables')}</strong></p>
              <ul className='list-disc ml-5 mt-1'>
                <li><code className='bg-muted px-1 rounded'>{'{{OPENAI_API_KEY}}'}</code> - {t('admin_models.var_api_key_desc')}</li>
                <li><code className='bg-muted px-1 rounded'>{'{{messages}}'}</code> - {t('admin_models.var_messages_desc')}</li>
                <li><code className='bg-muted px-1 rounded'>{'{{message}}'}</code> - {t('admin_models.var_message_desc')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared model name field (input for manual/openai/gemini, select for ollama)
function ModelNameField({ formData, onFormChange, endpoints, selectedEndpoint, availableModels, modelsLoading, roundRobinInfo, checkingRoundRobin, onModelSelectFocus, isEditMode, t }) {
  const effectiveEndpoint = formData.endpoint || selectedEndpoint;
  const isManual = effectiveEndpoint === 'manual';

  const normalizeUrl = (url) => {
    try {
      const urlObj = new URL(url.trim());
      return `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}${
        urlObj.port ? `:${urlObj.port}` : ''
      }${urlObj.pathname.replace(/\/+$/, '')}`;
    } catch (error) {
      logger.warn('[Catch]', error.message);
      return url.trim().toLowerCase().replace(/\/+$/, '');
    }
  };

  const normalizedEp = effectiveEndpoint ? normalizeUrl(effectiveEndpoint) : '';
  const endpointConfig = endpoints.find((e) => normalizeUrl(e.url) === normalizedEp);
  const provider = endpointConfig?.provider || 'ollama';
  const isOllama = provider === 'ollama' || provider === 'model-server';

  const rrBadge = (offsetClass) =>
    formData.id ? (
      <div className={`absolute ${offsetClass} top-1/2 transform -translate-y-1/2 flex items-center gap-1`}>
        {checkingRoundRobin ? (
          <div className='animate-spin rounded-full h-3 w-3 border-b-2 border-primary'></div>
        ) : roundRobinInfo?.isRoundRobin ? (
          <span className='px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded font-medium'>
            RR {roundRobinInfo.serverCount}
          </span>
        ) : null}
      </div>
    ) : null;

  if (isManual || !isOllama) {
    return (
      <>
        <input
          type='text'
          value={formData.modelName || formData.id || ''}
          onChange={(e) => {
            const modelName = e.target.value;
            const autoLabel = !formData.label?.trim() ? modelName : formData.label;
            onFormChange({ id: modelName, modelName, label: autoLabel });
          }}
          placeholder={
            isManual
              ? t('admin_models.placeholder_custom_model')
              : provider === 'openai-compatible'
              ? t('admin_models.placeholder_openai_model')
              : provider === 'gemini'
              ? t('admin_models.placeholder_gemini_model')
              : t('admin_models.placeholder_model_name')
          }
          className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
        />
        {rrBadge('right-3')}
        <p className='text-xs text-muted-foreground mt-1'>
          {isManual
            ? t('admin_models.hint_custom_model')
            : provider === 'openai-compatible'
            ? t('admin_models.hint_openai_model')
            : provider === 'gemini'
            ? t('admin_models.hint_gemini_model')
            : t('admin_models.hint_enter_model')}
        </p>
      </>
    );
  }

  // Ollama: use select
  return (
    <>
      <select
        value={formData.modelName || formData.id}
        onFocus={onModelSelectFocus}
        onMouseDown={onModelSelectFocus}
        onChange={(e) => {
          const selectedModelName = e.target.value;
          const autoLabel = !formData.label?.trim() ? selectedModelName : formData.label;
          onFormChange({ id: selectedModelName, modelName: selectedModelName, label: autoLabel });
        }}
        className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
        disabled={modelsLoading}
      >
        <option value=''>
          {modelsLoading
            ? t('admin_models.loading_model_list')
            : t('admin_models.select_llm_model')}
        </option>
        {(formData.modelName || formData.id) &&
          !availableModels.find(
            (m) =>
              m.name === formData.modelName ||
              m.id === formData.modelName ||
              m.name === formData.id ||
              m.id === formData.id
          ) && (
            <option key={formData.id} value={formData.modelName || formData.id}>
              {formData.label || formData.modelName || formData.id}
            </option>
          )}
        {!modelsLoading &&
          availableModels.map((model) => (
            <option key={model.id} value={model.name || model.id}>
              {model.name || model.id}{' '}
              {model.sizeFormatted ? `(${model.sizeFormatted})` : ''}
            </option>
          ))}
      </select>
      {modelsLoading && (
        <div className='absolute right-3 top-1/2 transform -translate-y-1/2'>
          <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-primary'></div>
        </div>
      )}
      {rrBadge('right-10')}
      {availableModels.length > 0 && !isEditMode && (
        <p className='text-xs text-primary mt-1'>
          {t('admin_models.available_models_count', { count: availableModels.length })}
        </p>
      )}
    </>
  );
}

export function ModelForm({
  mode, // 'add' | 'edit'
  formData,
  onFormChange,
  onSave,
  onCancel,
  endpoints,
  availableModels,
  setAvailableModels,
  modelsLoading,
  roundRobinInfo,
  labelRoundRobinInfo,
  checkingRoundRobin,
  buildManualPreset,
  modelLabelRoundRobinMap,
  getFirstModelInRoundRobinGroup,
  onModelSelectFocus,
  selectedEndpoint,
  setSelectedEndpoint,
  modelConfig,
  editingModel,
  loading,
  t,
}) {
  const isEditMode = mode === 'edit';

  // For add form: find first model in round-robin group inline
  const getAddFormFirstModelInfo = () => {
    if (!formData.label || !modelConfig) return null;
    const normalizedLabel = normalizeLabel(formData.label);
    const group = normalizedLabel ? modelLabelRoundRobinMap[normalizedLabel] : null;

    if (group?.isRoundRobin && group.members.length > 0) {
      const sortedMembers = [...group.members].sort((a, b) => {
        if (a.categoryKey !== b.categoryKey) {
          return a.categoryKey.localeCompare(b.categoryKey);
        }
        return a.modelIndex - b.modelIndex;
      });
      const firstMember = sortedMembers[0];
      const firstModel =
        modelConfig.categories[firstMember.categoryKey]?.models[firstMember.modelIndex];
      if (firstModel) {
        return { ...firstMember, model: firstModel };
      }
    }
    return null;
  };

  const firstModelInfo = isEditMode
    ? getFirstModelInRoundRobinGroup(formData.label, editingModel?.category, editingModel?.index)
    : getAddFormFirstModelInfo();

  const isNotFirstInRoundRobin = firstModelInfo !== null;
  const sharedSystemPrompt = isNotFirstInRoundRobin
    ? firstModelInfo.model?.systemPrompt || []
    : formData.systemPrompt || [];

  return (
    <div className={isEditMode ? 'space-y-3' : 'mt-4 p-5 bg-primary/10 rounded-lg border border-primary/20'}>
      {!isEditMode && (
        <div className='flex items-center gap-2 mb-4'>
          <Plus className='h-4 w-4 text-primary' />
          <h4 className='font-semibold text-foreground text-sm'>
            {t('admin_models.add_new_model')}
          </h4>
        </div>
      )}

      <div className={isEditMode ? 'space-y-3' : 'space-y-3'}>
        {/* Add mode: label first */}
        {!isEditMode && (
          <div>
            <label className='block text-xs font-medium text-foreground mb-1 flex items-center gap-2'>
              <span>{t('admin_models.label')} *</span>
              {labelRoundRobinInfo && (
                <span className='px-1.5 py-0.5 bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground text-[10px] rounded font-medium'>
                  {t('admin_models.round_robin_count', { count: labelRoundRobinInfo.count })}
                </span>
              )}
            </label>
            <input
              type='text'
              value={formData.label || ''}
              onChange={(e) => {
                const label = e.target.value;
                onFormChange({ label });
                // Auto-fill from existing model with same label
                if (label.trim() && modelConfig) {
                  let foundModel = null;
                  Object.values(modelConfig.categories).forEach((category) => {
                    if (category.models) {
                      const existing = category.models.find(
                        (m) => m.label?.trim() === label.trim()
                      );
                      if (existing) foundModel = existing;
                    }
                  });
                  if (foundModel) {
                    onFormChange({
                      label,
                      id: foundModel.id || formData.id,
                      endpoint: foundModel.endpoint || formData.endpoint,
                    });
                    if (foundModel.endpoint) setSelectedEndpoint(foundModel.endpoint);
                  }
                }
              }}
              onFocus={(e) => {
                if (!formData.label?.trim() && formData.id) {
                  onFormChange({ label: formData.id });
                  setTimeout(() => {
                    e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                  }, 0);
                }
              }}
              className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
              placeholder={formData.id || 'GPT-OSS 20B'}
            />
            {/* Autocomplete suggestions */}
            {modelConfig && formData.label && (
              <div className='mt-2 flex flex-wrap gap-2'>
                {(() => {
                  const existingLabels = new Set();
                  Object.values(modelConfig.categories).forEach((category) => {
                    if (category.models) {
                      category.models.forEach((m) => {
                        if (m.label && m.label.trim()) existingLabels.add(m.label.trim());
                      });
                    }
                  });
                  return Array.from(existingLabels)
                    .filter((label) =>
                      label.toLowerCase().includes(formData.label?.toLowerCase() || '')
                    )
                    .slice(0, 5)
                    .map((label) => (
                      <button
                        key={label}
                        type='button'
                        onClick={() => {
                          let foundModel = null;
                          Object.values(modelConfig.categories).forEach((category) => {
                            if (category.models) {
                              const existing = category.models.find(
                                (m) => m.label?.trim() === label
                              );
                              if (existing) foundModel = existing;
                            }
                          });
                          onFormChange({
                            label,
                            id: foundModel?.id || formData.id,
                            endpoint: foundModel?.endpoint || formData.endpoint,
                          });
                          if (foundModel?.endpoint) setSelectedEndpoint(foundModel.endpoint);
                        }}
                        className='flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs transition-all duration-200 hover:bg-accent'
                      >
                        {label}
                      </button>
                    ));
                })()}
              </div>
            )}
          </div>
        )}

        {/* Endpoint selector */}
        <EndpointSelector
          formData={formData}
          onFormChange={onFormChange}
          endpoints={endpoints}
          availableModels={availableModels}
          setAvailableModels={setAvailableModels}
          setSelectedEndpoint={setSelectedEndpoint}
          buildManualPreset={buildManualPreset}
          t={t}
        />

        {/* Model name + label (2-column grid) */}
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <label className='block text-xs font-medium text-foreground mb-1'>
              {isEditMode ? t('admin_models.model_name') : t('admin_models.model_name_required')}
            </label>
            <div className='relative'>
              <ModelNameField
                formData={formData}
                onFormChange={onFormChange}
                endpoints={endpoints}
                selectedEndpoint={selectedEndpoint}
                availableModels={availableModels}
                modelsLoading={modelsLoading}
                roundRobinInfo={roundRobinInfo}
                checkingRoundRobin={checkingRoundRobin}
                onModelSelectFocus={onModelSelectFocus}
                isEditMode={isEditMode}
                t={t}
              />
            </div>
          </div>

          {/* Edit mode: label in second column */}
          {isEditMode && (
            <div>
              <label className='block text-xs font-medium text-foreground mb-1 flex items-center gap-2'>
                <span>{t('admin_models.label')}</span>
                {labelRoundRobinInfo && (
                  <span className='px-1.5 py-0.5 bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground text-[10px] rounded font-medium'>
                    {t('admin_models.round_robin')}{' '}
                    {t('admin_models.count_suffix', { count: labelRoundRobinInfo.count })}
                  </span>
                )}
              </label>
              <input
                type='text'
                value={formData.label || ''}
                onChange={(e) => onFormChange({ label: e.target.value })}
                onFocus={(e) => {
                  if (!formData.label?.trim() && formData.id) {
                    onFormChange({ label: formData.id });
                    setTimeout(() => {
                      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                    }, 0);
                  }
                }}
                className={`w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm ${
                  labelRoundRobinInfo ? 'border-border dark:border-border' : ''
                }`}
                placeholder={formData.id || 'GPT-OSS 20B'}
              />
              {labelRoundRobinInfo && (
                <div className='mt-2 p-2 rounded bg-muted border border-border dark:border-border'>
                  <div className='text-xs text-muted-foreground'>
                    <span className='font-medium'>{t('admin_models.same_label_models')}</span>{' '}
                    <span className='font-mono'>{formData.id}</span>
                    {labelRoundRobinInfo.models.length > 0 && (
                      <>
                        {', '}
                        {labelRoundRobinInfo.models.map((m, idx) => (
                          <span key={idx}>
                            <span className='font-mono'>{m.id}</span>
                            {idx < labelRoundRobinInfo.models.length - 1 && <span>, </span>}
                          </span>
                        ))}
                      </>
                    )}
                    {labelRoundRobinInfo.endpointCount > 1 && (
                      <span className='ml-2 text-muted-foreground dark:text-muted-foreground'>
                        ({t('admin_models.servers_count', { count: labelRoundRobinInfo.endpointCount })})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add mode: label round-robin info below grid */}
        {!isEditMode && labelRoundRobinInfo && (
          <div className='mt-2 p-2 rounded bg-muted border border-border dark:border-border'>
            <div className='text-xs text-muted-foreground'>
              <span className='font-medium'>{t('admin_models.same_label_models')}</span>{' '}
              <span className='font-mono'>{formData.id}</span>
              {labelRoundRobinInfo.models.length > 0 && (
                <>
                  {', '}
                  {labelRoundRobinInfo.models.map((m, idx) => (
                    <span key={idx}>
                      <span className='font-mono'>{m.id}</span>
                      {idx < labelRoundRobinInfo.models.length - 1 && <span>, </span>}
                    </span>
                  ))}
                </>
              )}
              {labelRoundRobinInfo.endpointCount > 1 && (
                <span className='ml-2 text-muted-foreground dark:text-muted-foreground'>
                  ({t('admin_models.servers_count', { count: labelRoundRobinInfo.endpointCount })})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Tooltip */}
        <div>
          <label className='block text-xs font-medium text-foreground mb-1'>
            {t('admin_models.tooltip_description')}
          </label>
          <textarea
            value={formData.tooltip || ''}
            onChange={(e) => onFormChange({ tooltip: e.target.value })}
            className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm resize-none'
            rows='2'
            placeholder={t('admin_models.placeholder_tooltip')}
          />
        </div>

        {/* Multiturn limit */}
        <div>
          <label className='block text-xs font-medium text-foreground mb-1'>
            {t('admin_models.multiturn_limit')}
          </label>
          <div className='flex items-center gap-3'>
            <input
              type='number'
              min='1'
              value={formData.multiturnLimit ?? ''}
              onChange={(e) => onFormChange({ multiturnLimit: e.target.value })}
              className='w-24 px-2 py-1 text-sm border border-border rounded-md bg-background text-foreground'
              disabled={formData.multiturnUnlimited || loading}
            />
            <label className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
              <input
                type='checkbox'
                checked={!!formData.multiturnUnlimited}
                onChange={(e) =>
                  onFormChange({
                    multiturnUnlimited: e.target.checked,
                    multiturnLimit: e.target.checked ? '' : formData.multiturnLimit,
                  })
                }
                className='h-4 w-4'
                disabled={loading}
              />
              {t('admin_models.no_limit')}
            </label>
          </div>
          <p className='text-xs text-muted-foreground mt-1'>
            {t('admin_models.multiturn_memory_desc')}
          </p>
        </div>

        {/* System prompt */}
        <div>
          <label className='block text-xs font-medium text-foreground mb-1'>
            {t('admin_models.system_prompt')}
            <span className='text-xs text-muted-foreground'>
              {t('admin_models.newline_separated')}
            </span>
            {isNotFirstInRoundRobin && (
              <span className='ml-2 px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-medium'>
                {t('admin_models.shared')}
              </span>
            )}
          </label>
          {isNotFirstInRoundRobin ? (
            <div className='space-y-2'>
              <textarea
                value={(sharedSystemPrompt || []).join('\n') || ''}
                disabled
                className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm resize-none bg-muted opacity-75 cursor-not-allowed'
                rows='6'
                placeholder={t('admin_models.system_prompt_placeholder')}
              />
              <div className='p-2 rounded bg-muted border border-border'>
                <p className='text-xs text-muted-foreground'>
                  <span className='font-medium'>{t('admin_models.round_robin_model')}</span>{' '}
                  {isEditMode
                    ? t('admin_models.system_prompt_shared_with_model')
                    : t('admin_models.system_prompt_shared_prefix')}
                  <span className='font-mono'>{firstModelInfo.model?.id}</span>
                  {isEditMode
                    ? t('admin_models.system_prompt_shared_suffix')
                    : t('admin_models.edit_first_model_prompt')}
                </p>
              </div>
            </div>
          ) : (
            <textarea
              value={(formData.systemPrompt || []).join('\n') || ''}
              onChange={(e) =>
                onFormChange({
                  systemPrompt: e.target.value
                    .split('\n')
                    .filter((line) => line !== null && line !== undefined),
                })
              }
              className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm resize-none'
              rows='6'
              placeholder={t('admin_models.system_prompt_placeholder')}
            />
          )}
        </div>

        {/* Checkboxes + action buttons */}
        <div className={`flex flex-wrap items-center justify-between gap-2 pt-3 border-t ${isEditMode ? 'border-border' : 'border-primary/20 dark:border-border'}`}>
          <div className='flex items-center gap-4 flex-wrap'>
            <label className='flex items-center gap-2 cursor-pointer'>
              <input
                type='checkbox'
                checked={formData.isDefault}
                onChange={(e) => onFormChange({ isDefault: e.target.checked })}
                className='w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring'
              />
              <span className='text-sm text-foreground'>{t('admin_models.default_model')}</span>
            </label>
            <label className='flex items-center gap-2 cursor-pointer'>
              <input
                type='checkbox'
                checked={formData.adminOnly}
                onChange={(e) => onFormChange({ adminOnly: e.target.checked })}
                className='w-4 h-4 text-destructive bg-muted border-border rounded focus:ring-ring'
              />
              <span className='text-sm text-foreground'>{t('admin_models.admin_only')}</span>
            </label>
            <label className='flex items-center gap-2 cursor-pointer'>
              <input
                type='checkbox'
                checked={formData.visible}
                onChange={(e) => onFormChange({ visible: e.target.checked })}
                className='w-4 h-4 text-muted-foreground bg-muted border-border rounded focus:ring-ring'
              />
              <span className='text-sm text-foreground'>{t('admin_models.show_on_main')}</span>
            </label>
          </div>

          <div className='flex gap-2'>
            <button
              onClick={onSave}
              className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors flex items-center gap-1'
            >
              {isEditMode ? (
                <><Save className='h-3.5 w-3.5' /> {t('common.save')}</>
              ) : (
                <><Plus className='h-3.5 w-3.5' /> {t('admin_models.add')}</>
              )}
            </button>
            <button
              onClick={onCancel}
              className='px-3 py-1.5 text-xs font-medium rounded-lg bg-muted hover:bg-accent dark:bg-muted dark:hover:bg-accent text-foreground transition-colors flex items-center gap-1'
            >
              <X className='h-3.5 w-3.5' /> {t('common.cancel')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
