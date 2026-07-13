import {
  getFormDisabledState,
  toggleUnlimitedMultiturn,
} from '../model-form-helpers.mjs';

export function ModelBehaviorFields({
  formData,
  onFormChange,
  firstModelInfo,
  isEditMode,
  sharedSystemPrompt,
  loading,
  t,
}) {
  const disabled = getFormDisabledState({
    modelsLoading: false,
    multiturnUnlimited: formData.multiturnUnlimited,
    loading,
  });
  const isShared = firstModelInfo !== null;

  return (
    <>
      <div>
        <label className='block text-xs font-medium text-foreground mb-1'>
          {t('admin_models.tooltip_description')}
        </label>
        <textarea
          value={formData.tooltip || ''}
          onChange={(event) => onFormChange({ tooltip: event.target.value })}
          className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm resize-none'
          rows='2'
          placeholder={t('admin_models.placeholder_tooltip')}
        />
      </div>

      <div>
        <label className='block text-xs font-medium text-foreground mb-1'>
          {t('admin_models.multiturn_limit')}
        </label>
        <div className='flex items-center gap-3'>
          <input
            type='number'
            min='1'
            value={formData.multiturnLimit ?? ''}
            onChange={(event) => onFormChange({ multiturnLimit: event.target.value })}
            className='w-24 px-2 py-1 text-sm border border-border rounded-md bg-background text-foreground'
            disabled={disabled.multiturnLimit}
          />
          <label className='inline-flex items-center gap-2 text-xs text-muted-foreground'>
            <input
              type='checkbox'
              checked={!!formData.multiturnUnlimited}
              onChange={(event) =>
                onFormChange(
                  toggleUnlimitedMultiturn(
                    event.target.checked,
                    formData.multiturnLimit
                  )
                )
              }
              className='h-4 w-4'
              disabled={disabled.multiturnUnlimited}
            />
            {t('admin_models.no_limit')}
          </label>
        </div>
        <p className='text-xs text-muted-foreground mt-1'>
          {t('admin_models.multiturn_memory_desc')}
        </p>
      </div>

      <div>
        <label className='block text-xs font-medium text-foreground mb-1'>
          {t('admin_models.system_prompt')}
          <span className='text-xs text-muted-foreground'>
            {t('admin_models.newline_separated')}
          </span>
          {isShared && (
            <span className='ml-2 px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded font-medium'>
              {t('admin_models.shared')}
            </span>
          )}
        </label>
        {isShared ? (
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
            onChange={(event) =>
              onFormChange({
                systemPrompt: event.target.value
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
    </>
  );
}
