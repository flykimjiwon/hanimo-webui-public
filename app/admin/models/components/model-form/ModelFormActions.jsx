import { Plus, Save, X } from '@/components/icons';

export function ModelFormActions({
  formData,
  onFormChange,
  onSave,
  onCancel,
  isEditMode,
  t,
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 pt-3 border-t ${isEditMode ? 'border-border' : 'border-primary/20 dark:border-border'}`}>
      <div className='flex items-center gap-4 flex-wrap'>
        <label className='flex items-center gap-2 cursor-pointer'>
          <input
            type='checkbox'
            checked={formData.isDefault}
            onChange={(event) => onFormChange({ isDefault: event.target.checked })}
            className='w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring'
          />
          <span className='text-sm text-foreground'>{t('admin_models.default_model')}</span>
        </label>
        <label className='flex items-center gap-2 cursor-pointer'>
          <input
            type='checkbox'
            checked={formData.adminOnly}
            onChange={(event) => onFormChange({ adminOnly: event.target.checked })}
            className='w-4 h-4 text-destructive bg-muted border-border rounded focus:ring-ring'
          />
          <span className='text-sm text-foreground'>{t('admin_models.admin_only')}</span>
        </label>
        <label className='flex items-center gap-2 cursor-pointer'>
          <input
            type='checkbox'
            checked={formData.visible}
            onChange={(event) => onFormChange({ visible: event.target.checked })}
            className='w-4 h-4 text-muted-foreground bg-muted border-border rounded focus:ring-ring'
          />
          <span className='text-sm text-foreground'>{t('admin_models.show_on_main')}</span>
        </label>
      </div>

      <div className='flex gap-2'>
        <button
          onClick={onSave}
          className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors flex items-center gap-1'
        >
          {isEditMode ? (
            <><Save className='h-3.5 w-3.5' /> {t('common.save')}</>
          ) : (
            <><Plus className='h-3.5 w-3.5' /> {t('admin_models.add')}</>
          )}
        </button>
        <button
          onClick={onCancel}
          className='px-3 py-1.5 text-xs font-medium rounded-lg bg-muted hover:bg-accent dark:bg-muted dark:hover:bg-accent text-foreground transition-colors flex items-center gap-1'
        >
          <X className='h-3.5 w-3.5' /> {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
