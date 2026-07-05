'use client';

import { Plus, Save, Edit } from '@/components/icons';

export function CategoryPanel({
  categoryKey,
  category,
  editingCategory,
  setEditingCategory,
  onCategoryLabelChange,
  onSaveCategoryOrder,
  savingCategory,
  onAddModel,
  children,
  t,
}) {
  return (
    <div className='bg-card border border-border rounded-xl shadow-sm p-6 border-2 border-border'>
      <div className='flex items-center justify-between mb-5'>
        {editingCategory === categoryKey ? (
          <input
            type='text'
            value={category.label}
            onChange={(e) => onCategoryLabelChange(categoryKey, e.target.value)}
            onBlur={() => setEditingCategory(null)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingCategory(null)}
            className='w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors duration-200 text-lg font-semibold'
            autoFocus
          />
        ) : (
          <h3 className='text-lg font-semibold text-foreground flex items-center gap-2'>
            {category.label}
            <button
              onClick={() => setEditingCategory(categoryKey)}
              className='p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors'
              title={t('admin_models.edit_category_name')}
            >
              <Edit size={14} />
            </button>
          </h3>
        )}
        <div className='flex items-center gap-2'>
          <button
            onClick={() => onSaveCategoryOrder(categoryKey)}
            disabled={savingCategory === categoryKey}
            className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5'
            title={t('admin_models.save_model_order')}
          >
            <Save className='h-3.5 w-3.5' />
            {savingCategory === categoryKey
              ? t('common.saving')
              : t('admin_models.save_order')}
          </button>
          <button
            onClick={() => onAddModel(categoryKey)}
            className='px-3 py-1.5 text-xs font-medium rounded-lg bg-primary hover:bg-primary/90 text-white transition-colors flex items-center gap-1.5'
          >
            <Plus className='h-3.5 w-3.5' />
            {t('admin_models.add_model')}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
