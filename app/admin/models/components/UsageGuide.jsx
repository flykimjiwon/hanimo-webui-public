'use client';

export function UsageGuide({ t }) {
  return (
    <div className='bg-primary/10 border border-primary/20 rounded-lg p-5'>
      <div className='flex items-start gap-3'>
        <div className='flex-shrink-0 text-2xl'>💡</div>
        <div className='flex-1'>
          <h3 className='text-sm font-semibold text-foreground mb-3'>
            {t('admin_models.usage_guide')}
          </h3>
          <ul className='text-sm text-primary space-y-2'>
            <li className='flex items-start gap-2'>
              <span className='text-primary flex-shrink-0'>•</span>
              <span>
                <strong>{t('admin_models.guide_llm_title')}</strong>{' '}
                {t('admin_models.guide_llm_desc_1')}
              </span>
            </li>
            <li className='flex items-start gap-2'>
              <span className='text-primary flex-shrink-0'>•</span>
              <span>
                <strong>{t('admin_models.guide_rr_title')}</strong>{' '}
                {t('admin_models.guide_rr_desc_1')}
              </span>
            </li>
            <li className='flex items-start gap-2'>
              <span className='text-primary flex-shrink-0'>•</span>
              <span>{t('admin_models.guide_save_hint')}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
