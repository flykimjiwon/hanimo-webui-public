import {
  applyLabelSelection,
  buildLabelSuggestions,
} from '../model-form-helpers.mjs';

export function AddModelLabelField({
  formData,
  onFormChange,
  modelConfig,
  labelRoundRobinInfo,
  setSelectedEndpoint,
  t,
}) {
  const applyLabel = (label, announceChange) =>
    applyLabelSelection({
      label,
      announceChange,
      formData,
      modelConfig,
      onFormChange,
      setSelectedEndpoint,
    });

  return (
    <div>
      <label className='block text-xs font-medium text-foreground mb-1 flex items-center gap-2'>
        <span>{t('admin_models.label')} *</span>
        {labelRoundRobinInfo && (
          <span className='px-1.5 py-0.5 bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground text-[10px] rounded font-medium'>
            {t('admin_models.round_robin_count', { count: labelRoundRobinInfo.count })}
          </span>
        )}
      </label>
      <input
        type='text'
        value={formData.label || ''}
        onChange={(event) => applyLabel(event.target.value, true)}
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
        className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-sm'
        placeholder={formData.id || 'GPT-OSS 20B'}
      />
      {modelConfig && formData.label && (
        <div className='mt-2 flex flex-wrap gap-2'>
          {buildLabelSuggestions(modelConfig, formData.label).map((label) => (
            <button
              key={label}
              type='button'
              onClick={() => applyLabel(label, false)}
              className='flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs transition-all duration-200 hover:bg-accent'
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
