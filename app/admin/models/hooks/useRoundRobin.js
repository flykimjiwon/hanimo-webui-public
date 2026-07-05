'use client';


import logger from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { normalizeLabel } from '../model-utils';

export function useRoundRobin({ modelConfig, editForm, editingModel, newModel, modelLabelRoundRobinMap }) {
  const { t } = useTranslation();

  const [roundRobinInfo, setRoundRobinInfo] = useState(null);
  const [checkingRoundRobin, setCheckingRoundRobin] = useState(false);
  const [newModelRoundRobinInfo, setNewModelRoundRobinInfo] = useState(null);
  const [checkingNewModelRoundRobin, setCheckingNewModelRoundRobin] = useState(false);
  const [labelRoundRobinInfo, setLabelRoundRobinInfo] = useState(null);
  const [newModelLabelRoundRobinInfo, setNewModelLabelRoundRobinInfo] = useState(null);

  const checkRoundRobinForId = async (modelId, setInfo, setChecking) => {
    if (!modelId) {
      setInfo(null);
      return;
    }
    setChecking(true);
    try {
      const response = await fetch(
        `/api/admin/check-round-robin?modelName=${encodeURIComponent(modelId)}`
      );
      if (response.ok) {
        const data = await response.json();
        setInfo(data);
      }
    } catch (error) {
      logger.error(t('admin_models.console_rr_check_failed'), error);
    } finally {
      setChecking(false);
    }
  };

  // Edit form model ID round-robin check
  useEffect(() => {
    if (!editForm.id) {
      setRoundRobinInfo(null);
      return;
    }
    checkRoundRobinForId(editForm.id, setRoundRobinInfo, setCheckingRoundRobin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm.id, t]);

  // New model ID round-robin check
  useEffect(() => {
    if (!newModel.id) {
      setNewModelRoundRobinInfo(null);
      return;
    }
    checkRoundRobinForId(newModel.id, setNewModelRoundRobinInfo, setCheckingNewModelRoundRobin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newModel.id, t]);

  // Edit form label round-robin check
  useEffect(() => {
    if (!editForm.label || !modelConfig) {
      setLabelRoundRobinInfo(null);
      return;
    }

    const normalizedLabel = normalizeLabel(editForm.label);
    if (!normalizedLabel) {
      setLabelRoundRobinInfo(null);
      return;
    }

    const sameLabelModels = [];
    Object.entries(modelConfig.categories).forEach(
      ([categoryKey, category]) => {
        if (!category?.models || !Array.isArray(category.models)) return;

        category.models.forEach((model, index) => {
          if (
            model.label &&
            normalizeLabel(model.label) === normalizedLabel &&
            (!editingModel ||
              categoryKey !== editingModel.category ||
              index !== editingModel.index)
          ) {
            sameLabelModels.push({
              id: model.id,
              endpoint: model.endpoint,
              categoryKey,
              modelIndex: index,
            });
          }
        });
      }
    );

    if (sameLabelModels.length > 0) {
      const endpointSet = new Set();
      const endpoints = [];
      const addEndpoint = (url) => {
        if (url && !endpointSet.has(url)) {
          endpointSet.add(url);
          endpoints.push({ url });
        }
      };

      sameLabelModels.forEach((m) => addEndpoint(m.endpoint));
      addEndpoint(editForm.endpoint);

      setLabelRoundRobinInfo({
        isRoundRobin: true,
        count: sameLabelModels.length + 1,
        models: sameLabelModels,
        endpoints,
        endpointCount: endpoints.length,
      });
    } else {
      setLabelRoundRobinInfo(null);
    }
  }, [editForm.label, editForm.endpoint, modelConfig, editingModel]);

  // New model label round-robin check
  useEffect(() => {
    if (!newModel.label || !modelConfig) {
      setNewModelLabelRoundRobinInfo(null);
      return;
    }

    const normalizedNewLabel = normalizeLabel(newModel.label);
    if (!normalizedNewLabel) {
      setNewModelLabelRoundRobinInfo(null);
      return;
    }

    const allModels = [];
    Object.values(modelConfig.categories).forEach((category) => {
      if (category.models && Array.isArray(category.models)) {
        allModels.push(...category.models);
      }
    });

    const sameLabelModels = allModels.filter(
      (m) => m.label && normalizeLabel(m.label) === normalizedNewLabel
    );

    if (sameLabelModels.length > 0) {
      const allSameLabelModels = [
        ...sameLabelModels,
        { id: newModel.id, endpoint: newModel.endpoint },
      ];

      const endpointSet = new Set();
      const endpoints = [];
      allSameLabelModels.forEach((m) => {
        if (m.endpoint && !endpointSet.has(m.endpoint)) {
          endpointSet.add(m.endpoint);
          endpoints.push({ url: m.endpoint });
        }
      });

      setNewModelLabelRoundRobinInfo({
        isRoundRobin: true,
        count: sameLabelModels.length + 1,
        models: sameLabelModels,
        endpoints: endpoints,
        endpointCount: endpoints.length,
      });
    } else {
      setNewModelLabelRoundRobinInfo(null);
    }
  }, [newModel.label, newModel.id, newModel.endpoint, modelConfig]);

  const getLabelInfoForModel = (model, categoryKey, modelIndex) => {
    if (!model?.label) return null;
    const normalized = normalizeLabel(model.label);
    const group = normalized ? modelLabelRoundRobinMap[normalized] : null;

    if (!group?.isRoundRobin) {
      return null;
    }

    const otherMembers = group.members.filter(
      (member) =>
        member.categoryKey !== categoryKey || member.modelIndex !== modelIndex
    );

    if (otherMembers.length === 0) {
      return null;
    }

    return {
      ...group,
      models: otherMembers,
    };
  };

  const getFirstModelInRoundRobinGroup = (label, categoryKey, modelIndex) => {
    if (!label || !modelConfig) return null;
    const normalized = normalizeLabel(label);
    const group = normalized ? modelLabelRoundRobinMap[normalized] : null;

    if (!group?.isRoundRobin) {
      return null;
    }

    const allMembers = [{ categoryKey, modelIndex }, ...group.members].sort(
      (a, b) => {
        if (a.categoryKey !== b.categoryKey) {
          return a.categoryKey.localeCompare(b.categoryKey);
        }
        return a.modelIndex - b.modelIndex;
      }
    );

    const firstMember = allMembers[0];
    if (
      firstMember.categoryKey === categoryKey &&
      firstMember.modelIndex === modelIndex
    ) {
      return null;
    }

    const firstModel =
      modelConfig.categories[firstMember.categoryKey]?.models[
        firstMember.modelIndex
      ];
    return firstModel ? { ...firstMember, model: firstModel } : null;
  };

  return {
    roundRobinInfo,
    checkingRoundRobin,
    newModelRoundRobinInfo,
    checkingNewModelRoundRobin,
    labelRoundRobinInfo,
    newModelLabelRoundRobinInfo,
    getLabelInfoForModel,
    getFirstModelInRoundRobinGroup,
  };
}
