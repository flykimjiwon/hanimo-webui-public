'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { TokenManager } from '@/lib/tokenManager';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import { arrayMove } from '@dnd-kit/sortable';
import {
  normalizeLabel,
  normalizeApiConfig,
  normalizeMultiturnSettings,
  generateLabelFromModelId,
  buildLabelRoundRobinMap,
} from '../model-utils';

const EMPTY_MODEL = {
  id: '',
  label: '',
  tooltip: '',
  isDefault: false,
  adminOnly: false,
  visible: true,
  modelType: 'direct',
  systemPrompt: [],
  endpoint: '',
  apiConfig: null,
  apiKey: '',
  multiturnLimit: '',
  multiturnUnlimited: true,
};

export function useModelConfig({ endpoints }) {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();

  const [modelConfig, setModelConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState(null);
  const [savingCategory, setSavingCategory] = useState(null);
  const [editingModel, setEditingModel] = useState(null);
  const [showAddForm, setShowAddForm] = useState({ category: null, show: false });
  const [editingCategory, setEditingCategory] = useState(null);
  const [modelRoundRobinMap, setModelRoundRobinMap] = useState({});
  const [modelLabelRoundRobinMap, setModelLabelRoundRobinMap] = useState({});

  const [newModel, setNewModel] = useState({ ...EMPTY_MODEL });
  const [editForm, setEditForm] = useState({ ...EMPTY_MODEL });

  // Rebuild label round-robin map whenever config changes
  useEffect(() => {
    if (modelConfig?.categories) {
      setModelLabelRoundRobinMap(buildLabelRoundRobinMap(modelConfig.categories));
    } else {
      setModelLabelRoundRobinMap({});
    }
  }, [modelConfig]);

  // Auto-set endpoint defaults when endpoints load
  useEffect(() => {
    if (endpoints.length > 0) {
      setNewModel((m) =>
        m.endpoint ? m : { ...m, endpoint: endpoints[0].url }
      );
      if (editingModel) {
        setEditForm((f) =>
          f.endpoint ? f : { ...f, endpoint: endpoints[0].url }
        );
      }
    }
  }, [endpoints, editingModel]);

  // Auto-sync new model system prompt when joining round-robin group
  useEffect(() => {
    if (!newModel.label || !modelConfig) return;

    const normalizedLabel = normalizeLabel(newModel.label);
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

      if (firstModel?.systemPrompt && firstModel.systemPrompt.length > 0) {
        const currentPrompt = newModel.systemPrompt || [];
        const firstPrompt = firstModel.systemPrompt || [];

        if (
          currentPrompt.length === 0 ||
          JSON.stringify(currentPrompt) !== JSON.stringify(firstPrompt)
        ) {
          setNewModel((prev) => ({
            ...prev,
            systemPrompt: [...firstPrompt, ...currentPrompt],
          }));
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newModel.id, newModel.label, modelConfig, modelLabelRoundRobinMap]);

  // Centralized PUT /api/admin/models call shared by all save flows.
  // Caller handles `setBusy(true|false)` and provides the success message.
  const putModelsConfig = async ({ categories, setBusy, successMessage }) => {
    try {
      setBusy?.(true);
      const response = await TokenManager.safeFetch('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({ categories }),
      });

      if (!response.ok) {
        let errorMessage = t('admin_models.model_config_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn('[Catch]', error.message);
        }
        logger.error(t('admin_models.console_config_save_failed'), response.status, errorMessage);
        alert(errorMessage, 'error', t('admin_models.save_failed_title'));
        return null;
      }

      const data = await response.json();
      if (successMessage) {
        alert(successMessage(data), 'success', t('admin_models.save_complete'));
      }
      return data;
    } catch (error) {
      logger.error(t('admin_models.console_config_save_failed'), error);
      alert(
        error.message || t('admin_models.model_config_save_error'),
        'error',
        t('admin_models.save_failed_title')
      );
      return null;
    } finally {
      setBusy?.(false);
    }
  };

  const autoSaveCategories = (updatedConfig) =>
    putModelsConfig({
      categories: updatedConfig.categories,
      setBusy: (busy) => setSavingSection(busy ? 'llm' : null),
      successMessage: (data) => data.message || t('admin_models.llm_config_saved'),
    });

  const fetchModelConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await TokenManager.safeFetch('/api/admin/models');

      if (!response) {
        const errorMsg = t('admin_models.no_response_object');
        logger.error(t('admin_models.console_config_query_failed'), {
          error: errorMsg,
          responseType: typeof response,
          responseValue: response,
        });
        throw new Error(errorMsg);
      }

      if (response.status === 401) {
        alert(t('admin_models.auth_expired'), 'warning', t('admin_models.auth_error'));
        return;
      }

      if (!response.ok) {
        const status = response.status;
        const statusText = response.statusText;

        let errorMessage = t('admin_models.model_config_load_failed');
        let responseText = '';

        try {
          responseText = await response.text();
          if (responseText && responseText.trim()) {
            try {
              const errorData = JSON.parse(responseText);
              errorMessage = errorData.error || errorData.details || errorMessage;
            } catch (parseError) {
              errorMessage = responseText.substring(0, 200) || errorMessage;
            }
          }
        } catch (textError) {
          logger.warn(t('admin_models.console_response_read_failed'), textError);
        }

        const errorInfo = {
          status: status ?? 'unknown',
          statusText: statusText ?? 'unknown',
          errorMessage: errorMessage || t('admin_models.cannot_get_error_message'),
          url: '/api/admin/models',
          responseTextLength: responseText ? responseText.length : 0,
        };

        logger.error(t('admin_models.console_config_query_failed'), {
          status: String(errorInfo.status),
          statusText: String(errorInfo.statusText),
          errorMessage: String(errorInfo.errorMessage),
          url: String(errorInfo.url),
          responseTextLength: Number(errorInfo.responseTextLength),
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setModelConfig(data.modelConfig);

      if (data.modelConfig && data.modelConfig.categories) {
        const allModels = [];
        Object.values(data.modelConfig.categories).forEach((category) => {
          if (category.models && Array.isArray(category.models)) {
            allModels.push(...category.models);
          }
        });

        const roundRobinPromises = allModels.map(async (model) => {
          try {
            const rrResponse = await fetch(
              `/api/admin/check-round-robin?modelName=${encodeURIComponent(model.id)}`
            );
            if (rrResponse.ok) {
              const rrData = await rrResponse.json();
              return { modelId: model.id, data: rrData };
            }
          } catch (error) {
            logger.error(t('admin_models.console_model_rr_check_failed', { modelId: model.id }), error);
          }
          return { modelId: model.id, data: null };
        });

        const roundRobinResults = await Promise.all(roundRobinPromises);
        const roundRobinMap = {};
        roundRobinResults.forEach(({ modelId, data }) => {
          if (data) {
            roundRobinMap[modelId] = data;
          }
        });
        setModelRoundRobinMap(roundRobinMap);
      }
    } catch (error) {
      logger.error(t('admin_models.console_config_load_error'), error);
      alert(error.message, 'error', t('admin_models.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [alert, t]);

  const saveLLMModels = () =>
    putModelsConfig({
      categories: modelConfig.categories,
      setBusy: (busy) => setSavingSection(busy ? 'llm' : null),
      successMessage: (data) => data.message || t('admin_models.llm_config_saved'),
    });

  const saveCategoryOrder = (categoryKey) =>
    putModelsConfig({
      categories: modelConfig.categories,
      setBusy: (busy) => setSavingCategory(busy ? categoryKey : null),
      successMessage: () =>
        t('admin_models.category_order_saved', {
          category: modelConfig.categories[categoryKey].label,
        }),
    });

  const saveModelConfig = () =>
    putModelsConfig({
      categories: modelConfig.categories,
      setBusy: setSaving,
      successMessage: (data) => data.message || t('admin_models.all_config_saved'),
    });

  const handleCategoryLabelChange = (categoryKey, newLabel) => {
    setModelConfig((config) => ({
      ...config,
      categories: {
        ...config.categories,
        [categoryKey]: { ...config.categories[categoryKey], label: newLabel },
      },
    }));
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeCategoryKey = active.data.current.sortable.containerId;
    const overCategoryKey = over.data.current.sortable.containerId;

    if (activeCategoryKey !== overCategoryKey) return;

    setModelConfig((config) => {
      const newConfig = { ...config };
      const items = newConfig.categories[activeCategoryKey].models;
      const oldIndex = active.data.current.sortable.index;
      const newIndex = over.data.current.sortable.index;
      newConfig.categories[activeCategoryKey].models = arrayMove(
        items,
        oldIndex,
        newIndex
      );
      return newConfig;
    });
  };

  const addModel = (category, getFirstModelInRoundRobinGroup) => {
    if (!newModel.id) {
      alert(t('admin_models.enter_model_name'), 'warning', t('admin_models.input_error'));
      return;
    }

    const label = newModel.label?.trim() || generateLabelFromModelId(newModel.id);
    if (!label) {
      alert(t('admin_models.enter_model_name'), 'warning', t('admin_models.input_error'));
      return;
    }
    if (!newModel.endpoint) {
      alert(t('admin_models.select_model_server'), 'warning', t('admin_models.select_error'));
      return;
    }

    const updatedConfig = { ...modelConfig };
    if (newModel.isDefault) {
      updatedConfig.categories[category].models.forEach((model) => {
        model.isDefault = false;
      });
    }

    let systemPrompt = newModel.systemPrompt || [];

    const normalizedLabel = normalizeLabel(label);
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
        updatedConfig.categories[firstMember.categoryKey]?.models[firstMember.modelIndex];

      if (firstModel?.systemPrompt && firstModel.systemPrompt.length > 0) {
        systemPrompt = [...firstModel.systemPrompt];
      }
    }

    const multiturnSettings = normalizeMultiturnSettings(newModel);
    const modelToAdd = {
      ...newModel,
      id: newModel.id.trim(),
      modelName: newModel.modelName || newModel.id.trim(),
      label: label.trim(),
      tooltip: newModel.tooltip.trim(),
      systemPrompt: systemPrompt,
      endpoint: newModel.endpoint || '',
      apiConfig: newModel.apiConfig || null,
      apiKey: newModel.apiKey || null,
      ...multiturnSettings,
    };
    delete modelToAdd.dbId;
    updatedConfig.categories[category].models.push(modelToAdd);

    if (group?.isRoundRobin && systemPrompt.length > 0) {
      group.members.forEach((member) => {
        if (updatedConfig.categories[member.categoryKey]?.models[member.modelIndex]) {
          updatedConfig.categories[member.categoryKey].models[member.modelIndex] = {
            ...updatedConfig.categories[member.categoryKey].models[member.modelIndex],
            systemPrompt: [...systemPrompt],
          };
        }
      });
    }

    setModelConfig(updatedConfig);
    setShowAddForm({ category: null, show: false });
    setNewModel({
      ...EMPTY_MODEL,
      endpoint: endpoints[0]?.url ? endpoints[0].url : '',
    });

    setTimeout(() => autoSaveCategories(updatedConfig), 100);
  };

  const startEditing = (category, modelIndex) => {
    const model = modelConfig.categories[category].models[modelIndex];

    setEditForm({
      ...model,
      dbId: model.dbId || undefined,
      id: model.id || '',
      label: model.label || '',
      tooltip: model.tooltip || '',
      adminOnly: model.adminOnly || false,
      visible: model.visible !== false,
      systemPrompt: model.systemPrompt || [],
      endpoint: model.endpoint || (endpoints[0]?.url ? endpoints[0].url : ''),
      apiConfig: normalizeApiConfig(model.apiConfig),
      apiKey: model.apiKey || '',
      multiturnLimit:
        model.multiturnLimit !== undefined && model.multiturnLimit !== null
          ? model.multiturnLimit
          : '',
      multiturnUnlimited:
        model.multiturnUnlimited === true ||
        model.multiturnLimit === undefined ||
        model.multiturnLimit === null ||
        model.multiturnLimit === '',
    });
    setEditingModel({ category, index: modelIndex });
  };

  const saveEdit = async (getFirstModelInRoundRobinGroup) => {
    if (!editForm.id) {
      alert(t('admin_models.enter_model_name'), 'warning', t('admin_models.input_error'));
      return;
    }

    const label = editForm.label?.trim() || generateLabelFromModelId(editForm.id);
    if (!label) {
      alert(t('admin_models.enter_model_name'), 'warning', t('admin_models.input_error'));
      return;
    }
    if (!editForm.endpoint) {
      alert(t('admin_models.select_model_server'), 'warning', t('admin_models.select_error'));
      return;
    }

    const updatedConfig = { ...modelConfig };
    const { category, index } = editingModel;

    const originalModel = updatedConfig.categories[category].models[index];
    const originalLabel = originalModel.label;
    const isLabelChanged = originalLabel !== label;

    if (isLabelChanged) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/admin/settings', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const settings = await response.json();
          const roomNameModel = settings.roomNameGenerationModel;
          const imageModel = settings.imageAnalysisModel;

          if (roomNameModel === originalLabel || imageModel === originalLabel) {
            const usageInfo = [];
            if (roomNameModel === originalLabel) usageInfo.push(t('admin_models.usage_room_name'));
            if (imageModel === originalLabel) usageInfo.push(t('admin_models.usage_image_analysis'));

            const confirmChange = await confirm(
              t('admin_models.label_in_use_confirm', { usageInfo: usageInfo.join(', ') }),
              t('admin_models.label_change_warning')
            );
            if (!confirmChange) return;
          }
        }
      } catch (error) {
        logger.error(t('admin_models.console_settings_check_error'), error);
      }
    }

    if (editForm.isDefault) {
      updatedConfig.categories[category].models.forEach((model, idx) => {
        if (idx !== index) model.isDefault = false;
      });
    }

    const systemPrompt = editForm.systemPrompt || [];
    const normalizedLabel = normalizeLabel(label);
    const group = normalizedLabel ? modelLabelRoundRobinMap[normalizedLabel] : null;

    const firstModelInfo = getFirstModelInRoundRobinGroup(label, category, index);
    const isFirstInRoundRobin = firstModelInfo === null && group?.isRoundRobin;

    if (isFirstInRoundRobin && group?.members) {
      const allMembers = [
        { categoryKey: category, modelIndex: index },
        ...group.members,
      ];

      allMembers.forEach((member) => {
        if (updatedConfig.categories[member.categoryKey]?.models[member.modelIndex]) {
          updatedConfig.categories[member.categoryKey].models[member.modelIndex] = {
            ...updatedConfig.categories[member.categoryKey].models[member.modelIndex],
            systemPrompt: [...systemPrompt],
          };
        }
      });
    }

    const multiturnSettings = normalizeMultiturnSettings(editForm);

    updatedConfig.categories[category].models[index] = {
      ...editForm,
      dbId: originalModel.dbId || editForm.dbId,
      id: editForm.id.trim(),
      modelName: editForm.modelName || editForm.id.trim(),
      label: label.trim(),
      tooltip: editForm.tooltip.trim(),
      systemPrompt: systemPrompt,
      endpoint: editForm.endpoint || '',
      apiConfig: editForm.apiConfig || null,
      apiKey: editForm.apiKey || originalModel.apiKey || null,
      ...multiturnSettings,
    };

    setModelConfig(updatedConfig);
    setEditingModel(null);
    setEditForm({ ...EMPTY_MODEL });

    setTimeout(() => autoSaveCategories(updatedConfig), 100);
  };

  const deleteModel = async (category, modelIndex) => {
    const modelToDelete = modelConfig.categories[category].models[modelIndex];
    const modelLabel = modelToDelete.label;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const settings = await response.json();
        const roomNameModel = settings.roomNameGenerationModel;
        const imageModel = settings.imageAnalysisModel;

        if (roomNameModel === modelLabel) {
          alert(t('admin_models.model_used_for_room_name'), 'error', t('admin_models.cannot_delete'));
          return;
        }

        if (imageModel === modelLabel) {
          alert(t('admin_models.model_used_for_image_analysis'), 'error', t('admin_models.cannot_delete'));
          return;
        }
      }
    } catch (error) {
      logger.error(t('admin_models.console_settings_check_error'), error);
      const confirmDelete = await confirm(
        t('admin_models.settings_check_failed_confirm'),
        t('common.warning')
      );
      if (!confirmDelete) return;
    }

    const confirmDelete = await confirm(
      t('admin_models.confirm_delete_model'),
      t('admin_models.model_delete_confirm_title')
    );
    if (!confirmDelete) return;

    const updatedConfig = { ...modelConfig };
    const deletedModel = updatedConfig.categories[category].models.splice(modelIndex, 1)[0];
    if (
      deletedModel.isDefault &&
      updatedConfig.categories[category].models.length > 0
    ) {
      updatedConfig.categories[category].models[0].isDefault = true;
    }
    setModelConfig(updatedConfig);

    setTimeout(() => autoSaveCategories(updatedConfig), 100);
  };

  const copyModel = (category, modelIndex) => {
    const source = modelConfig.categories[category].models[modelIndex];
    if (!source) return;

    const baseModelName = source.modelName || source.id || '';
    const baseLabel = source.label || baseModelName || t('admin_models.model');
    const uniqueSuffix =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36);
    const newId = `${baseModelName || source.id}-copy-${uniqueSuffix}`;

    const copiedModel = {
      ...source,
      dbId: undefined,
      id: newId,
      modelName: baseModelName,
      label: t('admin_models.model_copy_label', { label: baseLabel }),
      isDefault: false,
    };

    const updatedConfig = { ...modelConfig };
    updatedConfig.categories[category].models.splice(modelIndex + 1, 0, copiedModel);
    setModelConfig(updatedConfig);

    setTimeout(() => autoSaveCategories(updatedConfig), 100);
  };

  const setDefaultModel = (category, modelIndex) => {
    const updatedConfig = { ...modelConfig };
    updatedConfig.categories[category].models.forEach((model, index) => {
      model.isDefault = index === modelIndex;
    });
    setModelConfig(updatedConfig);
  };

  return {
    modelConfig,
    loading,
    saving,
    savingSection,
    savingCategory,
    editingModel,
    setEditingModel,
    showAddForm,
    setShowAddForm,
    editingCategory,
    setEditingCategory,
    newModel,
    setNewModel,
    editForm,
    setEditForm,
    modelRoundRobinMap,
    modelLabelRoundRobinMap,
    fetchModelConfig,
    saveLLMModels,
    saveCategoryOrder,
    saveModelConfig,
    handleCategoryLabelChange,
    handleDragEnd,
    addModel,
    startEditing,
    saveEdit,
    deleteModel,
    copyModel,
    setDefaultModel,
  };
}
