'use client';
import { memo } from 'react';
import { X } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';

const CustomInstructionModal = memo(function CustomInstructionModal({
  isOpen,
  onClose,
  customInstruction,
  setCustomInstruction,
  customInstructionActive,
  setCustomInstructionActive,
  onSave,
  onDelete,
}) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4'
      onClick={onClose}
    >
      <div
        className='bg-background rounded-2xl shadow-2xl w-full max-w-lg border border-border'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between px-5 py-4 border-b border-border'>
          <h3 className='text-base font-semibold text-foreground'>
            {t('chat.custom_instruction') || 'Custom Instruction'}
          </h3>
          <Button variant='ghost' size='icon-sm' onClick={onClose}>
            <X className='h-4 w-4' />
          </Button>
        </div>

        <div className='px-5 py-4 space-y-4'>
          <p className='text-sm text-muted-foreground'>
            {t('chat.custom_instruction_desc') || 'Enter instructions for the AI in this chat room. This will be appended to the system prompt with every message.'}
          </p>
          <textarea
            value={customInstruction}
            onChange={(e) => { if (e.target.value.length <= 5000) setCustomInstruction(e.target.value); }}
            placeholder={t('chat.custom_instruction_placeholder') || 'e.g. Always respond in Korean. Include code examples.'}
            rows={6}
            className='w-full resize-none rounded-xl border border-input bg-muted text-sm text-foreground placeholder:text-muted-foreground p-3 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all'
          />
          <div className='flex items-center justify-between'>
            <span className='text-xs text-muted-foreground'>{customInstruction.length} / 5,000</span>
            <label className='flex items-center gap-2 cursor-pointer select-none'>
              <span className='text-sm text-muted-foreground'>
                {t('chat.custom_instruction_active') || 'Active'}
              </span>
              <button
                type='button'
                role='switch'
                aria-checked={customInstructionActive}
                onClick={() => setCustomInstructionActive(!customInstructionActive)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                  customInstructionActive ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform duration-200 ${
                  customInstructionActive ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`} />
              </button>
            </label>
          </div>
        </div>

        <div className='flex items-center justify-between px-5 py-3 border-t border-border'>
          <Button
            variant='ghost'
            size='sm'
            className='text-destructive hover:text-destructive hover:bg-destructive/10'
            onClick={() => { onDelete(); onClose(); }}
          >
            {t('common.delete') || 'Delete'}
          </Button>
          <div className='flex gap-2'>
            <Button variant='ghost' size='sm' onClick={onClose}>
              {t('common.cancel') || 'Cancel'}
            </Button>
            <Button
              size='sm'
              onClick={() => { onSave(customInstruction, customInstructionActive); onClose(); }}
            >
              {t('common.save') || 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CustomInstructionModal;
