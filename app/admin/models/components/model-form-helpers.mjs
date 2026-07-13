export function normalizeEndpointUrl(url, onMalformed) {
  try {
    const parsed = new URL(url.trim());
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${
      parsed.port ? `:${parsed.port}` : ''
    }${parsed.pathname.replace(/\/+$/, '')}`;
  } catch (error) {
    onMalformed?.(error);
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export function formatEndpointOption(endpoint) {
  const badges = {
    'openai-compatible': '[OpenAI]',
    gemini: '[Gemini]',
    ollama: '[Ollama]',
    'model-server': '[Ollama]',
  };
  const badge = badges[endpoint.provider] || `[${endpoint.provider || 'Ollama'}]`;
  return endpoint.name
    ? `${badge} ${endpoint.name} (${endpoint.url})`
    : `${badge} ${endpoint.url}`;
}

export function applyEndpointSelection({
  endpoint,
  apiConfig,
  buildManualPreset,
  onFormChange,
  setAvailableModels,
  setSelectedEndpoint,
}) {
  onFormChange({
    endpoint,
    apiConfig:
      endpoint === 'manual'
        ? buildManualPreset('openai-compatible')
        : apiConfig,
  });
  if (endpoint === 'manual') setAvailableModels([]);
  setSelectedEndpoint(endpoint);
}

export function resolveModelField({ effectiveEndpoint, endpoints, onMalformed }) {
  const isManual = effectiveEndpoint === 'manual';
  const normalizedEndpoint = effectiveEndpoint
    ? normalizeEndpointUrl(effectiveEndpoint, onMalformed)
    : '';
  const endpointConfig = endpoints.find(
    (endpoint) =>
      normalizeEndpointUrl(endpoint.url, onMalformed) === normalizedEndpoint
  );
  const provider = endpointConfig?.provider || 'ollama';
  return {
    isManual,
    provider,
    isOllama: provider === 'ollama' || provider === 'model-server',
  };
}

export function buildModelSelectionPatch(modelName, currentLabel) {
  return {
    id: modelName,
    modelName,
    label: !currentLabel?.trim() ? modelName : currentLabel,
  };
}

export function hasSelectedModel(availableModels, formData) {
  return availableModels.some(
    (model) =>
      model.name === formData.modelName ||
      model.id === formData.modelName ||
      model.name === formData.id ||
      model.id === formData.id
  );
}

export function findExistingModelByLabel(modelConfig, label) {
  let foundModel = null;
  Object.values(modelConfig?.categories || {}).forEach((category) => {
    if (!category.models) return;
    const existing = category.models.find(
      (model) => model.label?.trim() === label.trim()
    );
    if (existing) foundModel = existing;
  });
  return foundModel;
}

export function applyLabelSelection({
  label,
  announceChange,
  formData,
  modelConfig,
  onFormChange,
  setSelectedEndpoint,
}) {
  if (announceChange) onFormChange({ label });
  if (!label.trim() || !modelConfig) return;

  const foundModel = findExistingModelByLabel(modelConfig, label);
  if (announceChange && !foundModel) return;
  onFormChange({
    label,
    id: foundModel?.id || formData.id,
    endpoint: foundModel?.endpoint || formData.endpoint,
  });
  if (foundModel?.endpoint) setSelectedEndpoint(foundModel.endpoint);
}

export function buildLabelSuggestions(modelConfig, query) {
  const existingLabels = new Set();
  Object.values(modelConfig?.categories || {}).forEach((category) => {
    if (!category.models) return;
    category.models.forEach((model) => {
      if (model.label?.trim()) existingLabels.add(model.label.trim());
    });
  });
  return Array.from(existingLabels)
    .filter((label) =>
      label.toLowerCase().includes(query?.toLowerCase() || '')
    )
    .slice(0, 5);
}

export function getAddFirstModelInfo({
  label,
  modelConfig,
  modelLabelRoundRobinMap,
}) {
  if (!label || !modelConfig) return null;
  const group = modelLabelRoundRobinMap[label.trim().toLowerCase()];
  if (!group?.isRoundRobin || group.members.length === 0) return null;

  const firstMember = [...group.members].sort((left, right) => {
    if (left.categoryKey !== right.categoryKey) {
      return left.categoryKey.localeCompare(right.categoryKey);
    }
    return left.modelIndex - right.modelIndex;
  })[0];
  const model =
    modelConfig.categories[firstMember.categoryKey]?.models[
      firstMember.modelIndex
    ];
  return model ? { ...firstMember, model } : null;
}

export function resolvePromptState({ firstModelInfo, formSystemPrompt }) {
  return {
    isShared: firstModelInfo !== null,
    systemPrompt: firstModelInfo
      ? firstModelInfo.model?.systemPrompt || []
      : formSystemPrompt || [],
  };
}

export function toggleUnlimitedMultiturn(checked, multiturnLimit) {
  return {
    multiturnUnlimited: checked,
    multiturnLimit: checked ? '' : multiturnLimit,
  };
}

export function getFormDisabledState({
  modelsLoading,
  multiturnUnlimited,
  loading,
}) {
  return {
    modelSelect: modelsLoading,
    multiturnLimit: multiturnUnlimited || loading,
    multiturnUnlimited: loading,
    save: false,
    cancel: false,
  };
}
