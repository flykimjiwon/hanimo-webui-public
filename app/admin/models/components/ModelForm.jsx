'use client';

import { Plus } from '@/components/icons';
import { AddModelLabelField } from './model-form/AddModelLabelField';
import { EndpointSelector } from './model-form/EndpointSelector';
import { ModelBehaviorFields } from './model-form/ModelBehaviorFields';
import { ModelFormActions } from './model-form/ModelFormActions';
import { ModelIdentityFields } from './model-form/ModelIdentityFields';
import {
  getAddFirstModelInfo,
  resolvePromptState,
} from './model-form-helpers.mjs';

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
  const firstModelInfo = isEditMode
    ? getFirstModelInRoundRobinGroup(
        formData.label,
        editingModel?.category,
        editingModel?.index
      )
    : getAddFirstModelInfo({
        label: formData.label,
        modelConfig,
        modelLabelRoundRobinMap,
      });
  const { systemPrompt: sharedSystemPrompt } = resolvePromptState({
    firstModelInfo,
    formSystemPrompt: formData.systemPrompt,
  });

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
        {!isEditMode && (
          <AddModelLabelField
            formData={formData}
            onFormChange={onFormChange}
            modelConfig={modelConfig}
            labelRoundRobinInfo={labelRoundRobinInfo}
            setSelectedEndpoint={setSelectedEndpoint}
            t={t}
          />
        )}

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

        <ModelIdentityFields
          isEditMode={isEditMode}
          formData={formData}
          onFormChange={onFormChange}
          endpoints={endpoints}
          selectedEndpoint={selectedEndpoint}
          availableModels={availableModels}
          modelsLoading={modelsLoading}
          roundRobinInfo={roundRobinInfo}
          checkingRoundRobin={checkingRoundRobin}
          onModelSelectFocus={onModelSelectFocus}
          labelRoundRobinInfo={labelRoundRobinInfo}
          t={t}
        />

        <ModelBehaviorFields
          formData={formData}
          onFormChange={onFormChange}
          firstModelInfo={firstModelInfo}
          isEditMode={isEditMode}
          sharedSystemPrompt={sharedSystemPrompt}
          loading={loading}
          t={t}
        />

        <ModelFormActions
          formData={formData}
          onFormChange={onFormChange}
          onSave={onSave}
          onCancel={onCancel}
          isEditMode={isEditMode}
          t={t}
        />
      </div>
    </div>
  );
}
