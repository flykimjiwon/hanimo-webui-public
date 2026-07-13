import { ModelNameField } from './ModelNameField';

function LabelRoundRobinDetails({ formData, labelRoundRobinInfo, t }) {
  if (!labelRoundRobinInfo) return null;
  return (
    <div className='mt-2 p-2 rounded bg-muted border border-border dark:border-border'>
      <div className='text-xs text-muted-foreground'>
        <span className='font-medium'>{t('admin_models.same_label_models')}</span>{' '}
        <span className='font-mono'>{formData.id}</span>
        {labelRoundRobinInfo.models.length > 0 && (
          <>
            {', '}
            {labelRoundRobinInfo.models.map((model, index) => (
              <span key={index}>
                <span className='font-mono'>{model.id}</span>
                {index < labelRoundRobinInfo.models.length - 1 && <span>, </span>}
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
  );
}

export function ModelIdentityFields({
  isEditMode,
  formData,
  onFormChange,
  endpoints,
  selectedEndpoint,
  availableModels,
  modelsLoading,
  roundRobinInfo,
  checkingRoundRobin,
  onModelSelectFocus,
  labelRoundRobinInfo,
  t,
}) {
  return (
    <>
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
              onChange={(event) => onFormChange({ label: event.target.value })}
              onFocus={(event) => {
                if (!formData.label?.trim() && formData.id) {
                  onFormChange({ label: formData.id });
                  setTimeout(() => {
                    event.target.setSelectionRange(
                      event.target.value.length,
                      event.target.value.length
                    );
                  }, 0);
                }
              }}
              className={`w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm ${
                labelRoundRobinInfo ? 'border-border dark:border-border' : ''
              }`}
              placeholder={formData.id || 'GPT-OSS 20B'}
            />
            <LabelRoundRobinDetails
              formData={formData}
              labelRoundRobinInfo={labelRoundRobinInfo}
              t={t}
            />
          </div>
        )}
      </div>

      {!isEditMode && (
        <LabelRoundRobinDetails
          formData={formData}
          labelRoundRobinInfo={labelRoundRobinInfo}
          t={t}
        />
      )}
    </>
  );
}
