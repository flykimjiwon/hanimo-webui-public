'use client';

export function PresetUrlSettings({
  manualPresetBaseUrl,
  manualPresetApiBase,
  onBaseUrlChange,
  onApiBaseChange,
  onSave,
  saving,
  t,
}) {
  return (
    <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div>
          <h2 className='text-xl font-semibold text-foreground'>
            {t('admin_models.manual_preset_url_settings')}
          </h2>
          <p className='text-sm text-muted-foreground mt-1'>
            {t('admin_models.manual_preset_description')}
          </p>
        </div>
        <button
          type='button'
          onClick={onSave}
          disabled={saving}
          className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <div>
          <label className='block text-sm font-medium text-foreground mb-2'>
            baseUrl (responses)
          </label>
          <input
            type='text'
            value={manualPresetBaseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder='https://api.openai.com'
            className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 w-full'
          />
        </div>
        <div>
          <label className='block text-sm font-medium text-foreground mb-2'>
            apiBase (compatible)
          </label>
          <input
            type='text'
            value={manualPresetApiBase}
            onChange={(e) => onApiBaseChange(e.target.value)}
            placeholder='https://api.openai.com'
            className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 w-full'
          />
        </div>
      </div>
    </div>
  );
}
