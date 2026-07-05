'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/useTranslation';

const UPDATE_HISTORY = [
  {
    version: 'v1.8.0',
    date: '2026-03',
    items: [
      'Admin design theme color picker (6 presets + custom HEX)',
      'Chart color customization for dashboard',
      'Manager role support (admin page access, badges)',
      'Dashboard/analytics switched to messages table for accurate stats',
      'Streaming token count logging in /v1/completions',
      'FIM → chat/completions auto-conversion for IDE autocomplete',
    ],
  },
  {
    version: 'v1.7.0',
    date: '2026-03',
    items: [
      'DB backup/restore rewritten in pure Node.js (no pg_dump)',
      'Agent visibility toggle (show/hide per agent)',
      'User default model selection (saved server-side)',
      '/v1 API manual endpoint support',
      'Security: X-User-Role header removed from client',
    ],
  },
  {
    version: 'v1.6.0',
    date: '2026-02',
    items: [
      'Full i18n support (Korean / English)',
      'shadcn/ui component system migration',
      'Warm amber design system with dark mode tokens',
      'Phosphor Icons integration',
    ],
  },
  {
    version: 'v1.5.0',
    date: '2026-01',
    items: [
      'PPT generation agent workflow',
      'Direct messages (DM) system',
      'Notice popup system',
      'Agent permission management (role / department / user)',
      'OpenAI-compatible API (/v1/chat/completions, /v1/models, /v1/embeddings)',
    ],
  },
];

const UPCOMING = [
  {
    title: 'hanimo-rag',
    desc: 'Hybrid RAG engine — vector + full-text + knowledge graph, PostgreSQL only, pip install',
  },
  {
    title: 'Graph Knowledge Base',
    desc: 'Obsidian-style bidirectional linking, entity extraction, graph visualization',
  },
  {
    title: 'Supabase Cloud Integration',
    desc: 'One-click deploy to Supabase with pgvector, hybrid search SQL functions',
  },
];

export default function PatchNotesModal({ isOpen, onClose }) {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-w-lg max-h-[80vh] overflow-hidden flex flex-col'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <span className='text-lg font-semibold'>{t('patch_notes.title')}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue='history' className='flex-1 overflow-hidden flex flex-col'>
          <TabsList className='grid grid-cols-2 shrink-0'>
            <TabsTrigger value='history'>{t('patch_notes.history')}</TabsTrigger>
            <TabsTrigger value='upcoming'>{t('patch_notes.upcoming')}</TabsTrigger>
          </TabsList>

          <TabsContent value='history' className='flex-1 overflow-y-auto mt-3 pr-1'>
            <div className='space-y-5'>
              {UPDATE_HISTORY.map((release) => (
                <div key={release.version}>
                  <div className='flex items-center gap-2 mb-2'>
                    <span className='inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground'>
                      {release.version}
                    </span>
                    <span className='text-xs text-muted-foreground'>{release.date}</span>
                  </div>
                  <ul className='space-y-1 pl-1'>
                    {release.items.map((item, i) => (
                      <li key={i} className='flex items-start gap-2 text-sm text-foreground'>
                        <span className='mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0' />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value='upcoming' className='flex-1 overflow-y-auto mt-3 pr-1'>
            <div className='space-y-4'>
              {UPCOMING.map((item, i) => (
                <div key={i} className='rounded-lg border border-border bg-muted/40 p-3'>
                  <p className='text-sm font-semibold text-foreground mb-1'>{item.title}</p>
                  <p className='text-xs text-muted-foreground'>{item.desc}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
