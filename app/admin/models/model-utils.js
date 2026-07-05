import logger from '@/lib/logger';
// Pure utility functions and constants for the models admin page

export const normalizeLabel = (label = '') => label.trim().toLowerCase();

export const generateLabelFromModelId = (modelId = '') => {
  if (!modelId) return '';
  const parts = modelId.split(':');
  const name = parts[0] || '';
  const size = parts[1] || '';
  const formattedName = name
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('-');
  const formattedSize = size
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  if (formattedSize) {
    return `${formattedName} ${formattedSize}`;
  }
  return formattedName;
};

export const buildLabelRoundRobinMap = (categories = {}) => {
  const labelGroups = {};

  Object.entries(categories).forEach(([categoryKey, category]) => {
    if (!category?.models || !Array.isArray(category.models)) return;

    category.models.forEach((model, modelIndex) => {
      if (!model?.label) return;
      const normalized = normalizeLabel(model.label);
      if (!normalized) return;

      if (!labelGroups[normalized]) {
        labelGroups[normalized] = {
          label: model.label.trim(),
          members: [],
        };
      }

      labelGroups[normalized].members.push({
        id: model.id,
        label: model.label,
        endpoint: model.endpoint,
        categoryKey,
        modelIndex,
      });
    });
  });

  return Object.entries(labelGroups).reduce((acc, [key, group]) => {
    const endpointSet = new Set();
    const endpoints = [];

    group.members.forEach((member) => {
      if (member.endpoint && !endpointSet.has(member.endpoint)) {
        endpointSet.add(member.endpoint);
        endpoints.push({ url: member.endpoint });
      }
    });

    acc[key] = {
      ...group,
      endpoints,
      endpointCount: endpoints.length,
      count: group.members.length,
      isRoundRobin: group.members.length > 1,
    };

    return acc;
  }, {});
};

export const normalizeBase = (value) =>
  typeof value === 'string' && value.trim()
    ? value.trim().replace(/\/+$/, '')
    : 'https://api.openai.com';

export const normalizeMultiturnSettings = (model) => {
  const unlimited = !!model.multiturnUnlimited;
  let limitValue = model.multiturnLimit;
  if (unlimited) {
    return { multiturnLimit: null, multiturnUnlimited: true };
  }
  if (limitValue === '' || limitValue === null || limitValue === undefined) {
    return { multiturnLimit: null, multiturnUnlimited: true };
  }
  const parsed = Number.parseInt(limitValue, 10);
  return {
    multiturnLimit: Number.isNaN(parsed) ? null : parsed,
    multiturnUnlimited: false,
  };
};

export const normalizeApiConfig = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    logger.warn('API config convert failed', error);
    return String(value);
  }
};

export const normalizeJsonString = (value) => {
  if (!value) return value;
  const trimmed = value.trim();
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch (error) {
    try {
      let fixed = trimmed
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/,(\s*[}\]])/g, '$1');
      if (fixed.includes("'")) {
        fixed = fixed.replace(/'([^']*)'/g, (_, inner) => {
          const escaped = inner.replace(/\\'/g, "'");
          return `"${escaped.replace(/"/g, '\\"')}"`;
        });
      }
      return JSON.stringify(JSON.parse(fixed), null, 2);
    } catch (innerError) {
      return value;
    }
  }
};

export const getStatusText = (status, t) => {
  switch (status) {
    case 'vectorized':
      return t('admin_models.status_vectorized');
    case 'vectorizing':
      return t('admin_models.status_vectorizing');
    case 'processing':
      return t('admin_models.status_processing');
    case 'uploaded':
      return t('admin_models.status_uploaded');
    case 'error':
      return t('admin_models.status_error');
    default:
      return t('admin_models.status_unknown');
  }
};

export const getStatusClass = (status) => {
  switch (status) {
    case 'vectorized':
      return 'bg-primary/10 text-primary';
    case 'vectorizing':
    case 'processing':
      return 'bg-muted text-muted-foreground';
    case 'error':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-muted dark:bg-foreground text-foreground';
  }
};
