'use client';

import logger from '@/lib/logger';
import { useState, memo, useEffect, Fragment } from 'react';
import { Zap, ChevronDown, Loader2, Star } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/hooks/useTranslation';

// 모델 타입 추론 (표시 전용 휴리스틱 — 모델 선택/API 로직과 무관)
// ext  = endpoint 호스트명이 localhost/IP가 아닌 외부 호스트 (--hn-info)
// local= 카테고리 키 또는 endpoint에 ollama/local/onprem 포함 (--hn-good)
// lite = label/modelName에 lite/mini/flash 포함 (--hn-fg-muted)
function inferModelType(model, categoryKey = '') {
  if (!model) return null;
  const cat = (categoryKey || '').toLowerCase();
  const label = (model.label || model.modelName || model.id || '').toLowerCase();

  if (/lite|mini|flash/.test(label)) return 'lite';
  if (/ollama|local|onprem/.test(cat)) return 'local';

  if (model.endpoint) {
    const ep = String(model.endpoint).toLowerCase();
    if (/ollama|local|onprem/.test(ep)) return 'local';
    try {
      const hostname = new URL(model.endpoint).hostname;
      if (
        hostname &&
        hostname !== 'localhost' &&
        !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
      ) {
        return 'ext';
      }
      return 'local';
    } catch {
      return null;
    }
  }
  return null;
}

const MODEL_TYPE_COLOR = {
  ext: 'var(--hn-info)',
  local: 'var(--hn-good)',
  lite: 'var(--hn-fg-muted)',
};

function ModelTypeDot({ type }) {
  if (!type || !MODEL_TYPE_COLOR[type]) return null;
  return (
    <span
      aria-hidden='true'
      className='inline-block w-2 h-2 rounded-full flex-shrink-0'
      style={{ background: MODEL_TYPE_COLOR[type] }}
    />
  );
}

// 라운드로빈 여부 확인 (같은 label + 서로 다른 endpoint)
function isRoundRobinGroup(models) {
  if (models.length <= 1) return false;

  const uniqueEndpoints = new Set(
    models.filter((m) => m.endpoint).map((m) => m.endpoint)
  );

  return uniqueEndpoints.size > 1;
}

// label별로 모델 그룹화
function groupModelsByLabel(models) {
  const grouped = new Map();

  models.forEach((model) => {
    const displayLabel = model.label || model.id;
    if (!displayLabel) return;

    const labelKey = displayLabel.trim().toLowerCase();
    if (!grouped.has(labelKey)) {
      grouped.set(labelKey, []);
    }
    grouped.get(labelKey).push({
      ...model,
      label: displayLabel,
    });
  });

  return grouped;
}

// 중복 모델 제거 (label + endpoint가 모두 같은 경우)
function removeDuplicateModels(models) {
  const uniqueModels = [];
  const seenKeys = new Set();

  models.forEach((model) => {
    const key = `${model.label || model.id}|${model.endpoint || ''}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueModels.push(model);
    }
  });

  return uniqueModels;
}

// 모델 설정 병합 (라운드로빈 모델은 1개로 통합, 일반 모델은 각각 표시)
function mergeModelConfig(modelConfig) {
  if (!modelConfig) return null;

  return Object.entries(modelConfig).reduce((acc, [categoryKey, category]) => {
    const categoryModels = [];
    const modelsByLabel = groupModelsByLabel(category.models);

    modelsByLabel.forEach((models) => {
      const uniqueModels = removeDuplicateModels(models);
      const isRoundRobin = isRoundRobinGroup(uniqueModels);

      if (isRoundRobin) {
        // 라운드로빈 모델: isDefault 우선하여 첫 번째만 추가
        const sortedModels = [...uniqueModels].sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return 0;
        });
        categoryModels.push(sortedModels[0]);
      } else {
        // 일반 모델: 중복 제거된 모델들을 모두 개별 표시
        categoryModels.push(...uniqueModels);
      }
    });

    acc[categoryKey] = {
      ...category,
      models: categoryModels,
    };
    return acc;
  }, {});
}

const ModelSelector = memo(function ModelSelector({
  selectedModel,
  setSelectedModel,
  modelConfig,
  disabled,
  userDefaultModelId,
  onSetUserDefault,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();
  const [hasInteracted, setHasInteracted] = useState(false);
  const [roundRobinInfo, setRoundRobinInfo] = useState(null);
  const [checkingRoundRobin, setCheckingRoundRobin] = useState(false);

  // 모든 모델 수집 (id가 이미 UUID로 고유함)
  const allModels = modelConfig
    ? Object.values(modelConfig).flatMap((cat) =>
        cat.models.map((model) => {
          const label = model.label || model.modelName || model.id;
          return {
            ...model,
            label,
          };
        })
      )
    : [];

  // 라운드로빈 모델은 1개로 통합, 일반 모델은 각각 표시
  const mergedModelConfig = mergeModelConfig(modelConfig);

  // 선택된 모델 정보 찾기 (id로 찾기)
  const selectedModelInfo = allModels.find(
    (model) => model.id === selectedModel
  );

  // 라운드로빈 상태 확인
  useEffect(() => {
    if (!selectedModel || !selectedModelInfo) {
      setRoundRobinInfo(null);
      setCheckingRoundRobin(false);
      return;
    }

    const checkRoundRobin = async () => {
      setCheckingRoundRobin(true);
      try {
        // id는 UUID이므로 modelName을 사용하여 라운드로빈 확인
        const modelNameToCheck = selectedModelInfo.modelName || selectedModelInfo.id;

        const response = await fetch(
          `/api/admin/check-round-robin?modelName=${encodeURIComponent(
            modelNameToCheck
          )}`
        );
        if (response.ok) {
          const data = await response.json();
          setRoundRobinInfo(data);
        }
      } catch (error) {
        logger.error('라운드로빈 상태 확인 실패:', error);
      } finally {
        setCheckingRoundRobin(false);
      }
    };

    checkRoundRobin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  const handleModelSelect = (modelId) => {
    if (!modelId) return;

    const targetModel = allModels.find((m) => m.id === modelId);
    if (targetModel) {
      setSelectedModel(targetModel.id);
    }

    setIsOpen(false);
    if (!hasInteracted) {
      setHasInteracted(true);
    }
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (!disabled) {
          setIsOpen(open);
          if (!hasInteracted && open) setHasInteracted(true);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          id='model-selector-button'
          data-testid='model-selector-button'
          variant='secondary'
          size='sm'
          disabled={disabled}
          className='gap-2 text-xs'
        >
          <Zap size={14} className='text-muted-foreground' />
          {selectedModelInfo && (
            <ModelTypeDot type={inferModelType(selectedModelInfo)} />
          )}
          <span className='hidden sm:inline'>
            {selectedModelInfo?.label || t('chat.model_select')}
          </span>
          {/* 라운드로빈 상태 태그 */}
          {roundRobinInfo?.isRoundRobin && (
            <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
              RR {roundRobinInfo.serverCount}
            </Badge>
          )}
          {checkingRoundRobin && (
            <Loader2 size={12} className='animate-spin text-muted-foreground' />
          )}
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </Button>
      </DropdownMenuTrigger>

      {/* 드롭다운 메뉴 */}
      <DropdownMenuContent
        id='model-selector-dropdown'
        data-testid='model-selector-dropdown'
        side='top'
        align='end'
        className='min-w-64'
      >
        <DropdownMenuRadioGroup value={selectedModel} onValueChange={handleModelSelect}>
          {mergedModelConfig &&
            Object.entries(mergedModelConfig).map(([categoryKey, category], idx) => (
              <Fragment key={categoryKey}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel data-testid={`model-selector-category-${categoryKey}`}>
                  {category.label}
                </DropdownMenuLabel>
                {category.models.map((model, index) => {
                  // 같은 label을 가진 모든 모델 찾기
                  const sameLabelModels = allModels.filter(
                    (m) =>
                      m.label &&
                      m.label.trim().toLowerCase() ===
                        model.label?.trim().toLowerCase()
                  );

                  const isRoundRobin = isRoundRobinGroup(sameLabelModels);
                  const hasDefaultModel = sameLabelModels.some(
                    (m) => m.isDefault
                  );

                    const isUserDefault = userDefaultModelId === model.id;

                    return (
                    <DropdownMenuRadioItem
                      key={`${categoryKey}-${model.id}-${index}`}
                      id={`model-option-${model.id}`}
                      data-testid={`model-option-${model.id}`}
                      value={model.id}
                      className='data-[state=checked]:bg-accent'
                      title={model.tooltip || undefined}
                    >
                      <div className='flex items-center justify-between flex-1'>
                        <span className='flex items-center gap-2 min-w-0'>
                          <ModelTypeDot type={inferModelType(model, categoryKey)} />
                          <span className='truncate'>{model.label || model.modelName || model.id}</span>
                        </span>
                        <div className='flex items-center gap-1.5'>
                          {isRoundRobin && (
                            <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                              RR
                            </Badge>
                          )}
                          {hasDefaultModel && (
                            <Badge variant='outline' className='text-[10px] px-1.5 py-0'>
                              {t('chat.model_default')}
                            </Badge>
                          )}
                          {isUserDefault && (
                            <Badge variant='secondary' className='text-[10px] px-1.5 py-0 bg-[var(--hn-warn-soft)] text-[var(--hn-warn)]'>
                              My Default
                            </Badge>
                          )}
                          {onSetUserDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetUserDefault(isUserDefault ? '' : model.id);
                              }}
                              className='p-0.5 hover:text-primary transition-colors'
                              title={isUserDefault ? 'Remove as my default' : 'Set as my default'}
                            >
                              <Star
                                size={12}
                                className={isUserDefault ? 'fill-primary text-primary' : 'text-muted-foreground'}
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    </DropdownMenuRadioItem>
                  );
                })}
              </Fragment>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export default ModelSelector;
