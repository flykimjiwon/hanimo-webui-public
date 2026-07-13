import logger from '@/lib/logger';
import {
  buildModelSelectionPatch,
  hasSelectedModel,
  resolveModelField,
} from '../model-form-helpers.mjs';

export function ModelNameField({
  formData,
  onFormChange,
  endpoints,
  selectedEndpoint,
  availableModels,
  modelsLoading,
  roundRobinInfo,
  checkingRoundRobin,
  onModelSelectFocus,
  isEditMode,
  t,
}) {
  const effectiveEndpoint = formData.endpoint || selectedEndpoint;
  const { isManual, provider, isOllama } = resolveModelField({
    effectiveEndpoint,
    endpoints,
    onMalformed: (error) => logger.warn('[Catch]', error.message),
  });
  const disabled = modelsLoading;

  const roundRobinBadge = (offsetClass) =>
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
          onChange={(event) =>
            onFormChange(
              buildModelSelectionPatch(event.target.value, formData.label)
            )
          }
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
        {roundRobinBadge('right-3')}
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

  return (
    <>
      <select
        value={formData.modelName || formData.id}
        onFocus={onModelSelectFocus}
        onMouseDown={onModelSelectFocus}
        onChange={(event) =>
          onFormChange(
            buildModelSelectionPatch(event.target.value, formData.label)
          )
        }
        className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
        disabled={disabled}
      >
        <option value=''>
          {modelsLoading
            ? t('admin_models.loading_model_list')
            : t('admin_models.select_llm_model')}
        </option>
        {(formData.modelName || formData.id) &&
          !hasSelectedModel(availableModels, formData) && (
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
      {roundRobinBadge('right-10')}
      {availableModels.length > 0 && !isEditMode && (
        <p className='text-xs text-primary mt-1'>
          {t('admin_models.available_models_count', { count: availableModels.length })}
        </p>
      )}
    </>
  );
}
