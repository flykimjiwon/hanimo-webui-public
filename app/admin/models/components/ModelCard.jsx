'use client';

import { Edit2, Trash2, Copy } from '@/components/icons';

export function ModelCard({
  model,
  categoryKey,
  modelIndex,
  labelInfo,
  modelRoundRobinMap,
  onEdit,
  onCopy,
  onDelete,
  onSetDefault,
  t,
}) {
  const isLabelRoundRobin = Boolean(labelInfo);

  return (
    <div className='flex items-start justify-between w-full'>
      <div className='flex-1 space-y-2'>
        {/* Header: round-robin badge + model name */}
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-center gap-2 flex-wrap'>
            {isLabelRoundRobin && (
              <span className='px-2 py-0.5 bg-muted dark:bg-muted text-muted-foreground dark:text-muted-foreground text-[10px] rounded font-medium'>
                {t('admin_models.round_robin_count', { count: labelInfo.count })}
              </span>
            )}
            <h3 className='font-semibold text-sm text-foreground'>
              {model.label}
            </h3>
            {model.isDefault && (
              <span className='px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] rounded font-medium'>
                {t('admin_models.badge_default')}
              </span>
            )}
            {model.adminOnly === true && (
              <span className='px-1.5 py-0.5 bg-destructive/10 text-destructive text-[10px] rounded font-medium'>
                {t('admin_models.admin_only')}
              </span>
            )}
            {model.visible === false && (
              <span className='px-1.5 py-0.5 bg-muted text-foreground text-[10px] rounded font-medium'>
                {t('admin_models.badge_hidden')}
              </span>
            )}
          </div>
        </div>

        {/* Basic info: Name, ID, Endpoint */}
        <div className='space-y-1'>
          <div className='flex items-center gap-2 flex-wrap'>
            {model.name && (
              <span className='text-xs text-muted-foreground'>
                <span className='font-medium'>
                  {t('admin_models.model_name_label')}
                </span>{' '}
                <span className='font-mono text-foreground'>{model.name}</span>
              </span>
            )}
            <span className='text-xs text-muted-foreground'>
              <span className='font-medium'>
                {t('admin_models.base_id_label')}
              </span>{' '}
              <span className='font-mono text-foreground'>{model.id}</span>
            </span>
            {modelRoundRobinMap[model.id]?.isRoundRobin && (
              <span className='px-1.5 py-0.5 bg-muted dark:bg-muted text-foreground dark:text-foreground text-[10px] rounded font-medium'>
                {t('admin_models.server_rr')}{' '}
                {modelRoundRobinMap[model.id].serverCount}
              </span>
            )}
          </div>
          {model.endpoint && (
            <div className='text-xs text-muted-foreground'>
              <span className='font-medium'>Endpoint:</span>{' '}
              <span className='font-mono text-muted-foreground break-all'>
                {model.endpoint}
              </span>
            </div>
          )}
        </div>

        {/* Tooltip description */}
        {model.tooltip && (
          <p className='text-xs text-muted-foreground leading-relaxed'>
            {model.tooltip}
          </p>
        )}

        {/* Label round-robin details */}
        {labelInfo && (
          <div className='pt-2 border-t border-border dark:border-border'>
            <div className='text-xs'>
              <div className='flex items-center gap-1.5 mb-1'>
                <span className='font-medium text-muted-foreground dark:text-muted-foreground'>
                  {t('admin_models.same_label_models')}
                </span>
                <span className='text-muted-foreground dark:text-muted-foreground'>
                  {t('admin_models.servers_count', { count: labelInfo.endpointCount })}
                </span>
              </div>
              <div className='flex flex-wrap items-center gap-1.5'>
                <span className='px-1.5 py-0.5 bg-muted dark:bg-muted rounded font-mono text-[10px] text-muted-foreground dark:text-muted-foreground'>
                  {model.id}
                </span>
                {labelInfo.models.map((m, idx) => (
                  <span
                    key={idx}
                    className='px-1.5 py-0.5 bg-muted dark:bg-muted rounded font-mono text-[10px] text-muted-foreground dark:text-muted-foreground'
                  >
                    {m.id}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Server round-robin info */}
        {modelRoundRobinMap[model.id]?.isRoundRobin && !labelInfo && (
          <div className='pt-2 border-t border-border'>
            <div className='text-xs text-muted-foreground'>
              <span className='font-medium'>
                {t('admin_models.server_round_robin')}
              </span>{' '}
              <span className='font-mono'>
                {modelRoundRobinMap[model.id].serverName}
              </span>
              <span className='ml-1 text-muted-foreground'>
                {t('admin_models.count_suffix_paren', {
                  count: modelRoundRobinMap[model.id].serverCount,
                })}
              </span>
            </div>
          </div>
        )}

        {/* System prompt preview */}
        {model.systemPrompt && model.systemPrompt.length > 0 && (
          <div className='pt-2 border-t border-border'>
            <div className='flex items-center gap-1.5 mb-1'>
              <span className='px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] rounded font-medium'>
                {t('admin_models.system_prompt')}
              </span>
              <span className='text-xs text-muted-foreground'>
                {t('admin_models.lines_count', { count: model.systemPrompt.length })}
              </span>
            </div>
            <p className='text-xs text-muted-foreground line-clamp-2 leading-relaxed'>
              {model.systemPrompt.slice(0, 2).join(' ').substring(0, 100)}
              {(model.systemPrompt.join(' ').length > 100 ||
                model.systemPrompt.length > 2) &&
                '...'}
            </p>
          </div>
        )}
      </div>

      <div className='flex gap-1.5 ml-3'>
        {!model.isDefault && (
          <button
            onClick={() => onSetDefault(categoryKey, modelIndex)}
            className='px-2 py-1 text-xs font-medium rounded-md text-primary hover:bg-primary/10 dark:hover:bg-primary/10 transition-colors'
            title={t('admin_models.set_default_model')}
          >
            {t('admin_models.set_default')}
          </button>
        )}
        <button
          onClick={() => onEdit(categoryKey, modelIndex)}
          className='p-1.5 rounded-md text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-accent transition-colors'
          title={t('common.edit')}
        >
          <Edit2 className='h-3.5 w-3.5' />
        </button>
        <button
          onClick={() => onCopy(categoryKey, modelIndex)}
          className='p-1.5 rounded-md text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-accent transition-colors'
          title={t('admin_models.copy_settings')}
        >
          <Copy className='h-3.5 w-3.5' />
        </button>
        <button
          onClick={() => onDelete(categoryKey, modelIndex)}
          className='p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10 transition-colors'
          title={t('common.delete')}
        >
          <Trash2 className='h-3.5 w-3.5' />
        </button>
      </div>
    </div>
  );
}
