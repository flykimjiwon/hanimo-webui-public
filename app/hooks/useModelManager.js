'use client';
import { useState, useEffect, useCallback } from 'react';
import { fetchDirectModels } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTranslation } from '@/hooks/useTranslation';

// 클라이언트에서 사용할 기본 모델 (서버 사이드 모듈 import 방지)
function getDefaultModel() {
  // 클라이언트에서는 환경 변수를 직접 확인할 수 없으므로 기본값 반환
  return 'gemma3:1b';
}

// localStorage에서 방별 마지막 모델 저장/로드
const ROOM_MODELS_STORAGE_KEY = 'roomModels';

function saveRoomModel(roomId, modelId) {
  if (!roomId || !modelId) return;
  try {
    const roomModels = JSON.parse(
      localStorage.getItem(ROOM_MODELS_STORAGE_KEY) || '{}'
    );
    roomModels[roomId] = modelId;
    localStorage.setItem(ROOM_MODELS_STORAGE_KEY, JSON.stringify(roomModels));
  } catch (error) {
    logger.error('방별 모델 저장 실패:', error);
  }
}

export function loadRoomModel(roomId) {
  if (!roomId) return null;
  try {
    const roomModels = JSON.parse(
      localStorage.getItem(ROOM_MODELS_STORAGE_KEY) || '{}'
    );
    return roomModels[roomId] || null;
  } catch (error) {
    logger.error('방별 모델 로드 실패:', error);
    return null;
  }
}

export function useModelManager(userRole) {
  const { t } = useTranslation();

  const [modelOptions, setModelOptions] = useState([]);
  const [modelConfig, setModelConfig] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [userDefaultModelId, setUserDefaultModelId] = useState(null);

  useEffect(() => {
    async function loadModelOptions() {
      setModelsLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = { next: { revalidate: 0 } };

         if (token) {
           headers['Authorization'] = `Bearer ${token}`;
         }

        const directData = await fetchDirectModels(headers);

        let directModels = [];
        let directConfig = {};
        const configData = directData.modelConfig || directData;
        if (
          configData.categories &&
          typeof configData.categories === 'object'
        ) {
          directModels = Object.values(configData.categories).flatMap((cat) =>
            (cat.models || []).map((model) => ({
              ...model,
              modelType: 'direct',
            }))
          );
          directConfig = configData.categories;
        }

        const allModels = directModels;

        if (allModels.length > 0) {
          logger.log(
            '통합 모델 목록:',
            allModels.map((m) => ({
              id: m.id,
              modelName: m.modelName || m.name || m.id,
              label: m.label,
              type: m.modelType,
              adminOnly: m.adminOnly,
            }))
          );
          setModelConfig(directConfig);
          setModelOptions(allModels);

          // Priority: user default > admin default > first model
          let resolvedDefault = allModels.find((m) => m.isDefault)?.id || allModels[0]?.id;

          try {
            const settingsRes = await fetch('/api/user/settings', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json();
              if (settingsData.defaultModelId) {
                const userDefault = allModels.find((m) => m.id === settingsData.defaultModelId);
                if (userDefault) {
                  resolvedDefault = userDefault.id;
                  setUserDefaultModelId(userDefault.id);
                }
              }
            }
          } catch (err) {
            logger.warn('Failed to load user default model:', err.message);
          }

          setSelectedModel(resolvedDefault);
        } else {
          throw new Error(t('model_manager.no_models_available'));
        }
      } catch (error) {
        logger.warn(
          'API/DB 설정 가져오기 실패. 클라이언트 기본값을 사용합니다:',
          error.message
        );
        const fallbackDefault = getDefaultModel();
        const fallbackConfig = {
          models: {
            label: t('model_manager.model_list_label'),
            models: [
              { id: 'gemma3:1b', label: 'Gemma 3 1B' },
              { id: 'gpt-oss:20b', label: 'GPT-OSS 20B' },
              { id: 'gpt-oss:120b', label: 'GPT-OSS 120B' },
            ].map((model) => ({
              ...model,
              isDefault: model.id === fallbackDefault,
            })),
          },
        };
        const fallbackModels = fallbackConfig.models.models;
        setModelConfig(fallbackConfig);
        setModelOptions(fallbackModels);
        setSelectedModel(fallbackDefault);
      } finally {
        setModelsLoading(false);
      }
    }
    loadModelOptions();
  }, [userRole, t]);

  // 방별 모델 복원 함수 (UUID 기반 복원)
  const restoreRoomModel = useCallback((roomId, availableModelIds) => {
    if (!roomId || !availableModelIds || availableModelIds.length === 0) return;

    const savedModel = loadRoomModel(roomId);
    logger.debug(
      `[restoreRoomModel] 방 ${roomId}에서 저장된 모델: ${savedModel}`
    );

    if (!savedModel) return false;

    // 1단계: UUID로 직접 매칭 시도
    const directMatch = modelOptions.find((m) => m.id === savedModel);

    if (directMatch) {
      if (selectedModel === directMatch.id) {
        return true;
      }
      logger.debug(`[restoreRoomModel] UUID 직접 매칭 성공`, directMatch);
      setSelectedModel(directMatch.id);
      logger.log(
        `방 ${roomId}의 마지막 모델 복원: ${savedModel} -> ${directMatch.id}`
      );
      return true;
    }

    // 2단계: modelName으로 찾기 (레거시 호환성)
    const modelNameMatch = modelOptions.find((m) => m.modelName === savedModel);
    if (modelNameMatch) {
      if (selectedModel === modelNameMatch.id) {
        return true;
      }
      logger.debug(`[restoreRoomModel] modelName 매칭 성공`, modelNameMatch);
      setSelectedModel(modelNameMatch.id);
      logger.log(
        `방 ${roomId}의 마지막 모델 복원 (modelName): ${savedModel} -> ${modelNameMatch.id}`
      );
      return true;
    }

    // 3단계: 표시명으로 찾기 (레거시 호환성)
    const labelMatch = modelOptions.find(
      (m) =>
        m.label &&
        m.label.trim().toLowerCase() === savedModel.trim().toLowerCase()
    );
    if (labelMatch) {
      if (selectedModel === labelMatch.id) {
        return true;
      }
      logger.debug(`[restoreRoomModel] label 매칭 성공`, labelMatch);
      setSelectedModel(labelMatch.id);
      logger.log(
        `방 ${roomId}의 마지막 모델 복원 (label): ${savedModel} -> ${labelMatch.id}`
      );
      return true;
    }

    logger.debug(`[restoreRoomModel] 복원 실패: 모든 시도 실패`);
    return false;
  }, [modelOptions, selectedModel]);

  // 모델 선택 시 방별로 저장하는 래퍼 함수
  const setSelectedModelWithRoom = useCallback((modelId, roomId) => {
    logger.debug(
      `[setSelectedModelWithRoom] 모델 선택: ${modelId}, 방: ${roomId}`
    );
    setSelectedModel(modelId);
    if (roomId && modelId) {
      saveRoomModel(roomId, modelId);
      logger.debug(`[setSelectedModelWithRoom] localStorage에 저장 완료`);
    }
  }, []);

  const saveUserDefaultModel = useCallback(async (modelId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ defaultModelId: modelId || '' }),
      });
      if (res.ok) {
        setUserDefaultModelId(modelId || null);
        return true;
      }
      return false;
    } catch (err) {
      logger.error('Failed to save user default model:', err);
      return false;
    }
  }, []);

  return {
    modelOptions,
    modelConfig,
    selectedModel,
    setSelectedModel,
    setSelectedModelWithRoom,
    restoreRoomModel,
    modelsLoading,
    userDefaultModelId,
    saveUserDefaultModel,
  };
}
