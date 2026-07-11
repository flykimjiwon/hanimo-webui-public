'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  KeyRound,
  Laptop,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
} from 'lucide-react';
import PageHead from '@/components/admin/PageHead';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import { PROVIDER_CATEGORIES, PROVIDER_CATALOG, searchProviderCatalog } from '@/lib/provider-catalog.mjs';

const CATEGORY_LABELS = { all: 'All', local: 'Local', gateway: 'Gateways', cloud: 'Cloud', custom: 'Custom' };
const CATEGORY_ICONS = { local: Laptop, gateway: Server, cloud: Cloud, custom: Server };

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function providerLabel(provider) {
  if (provider === 'ollama') return 'OLLAMA';
  if (provider === 'gemini') return 'GEMINI';
  return 'OPENAI COMPATIBLE';
}

export default function ProvidersPage() {
  const router = useRouter();
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('ollama');
  const [name, setName] = useState('Ollama');
  const [url, setUrl] = useState('http://localhost:11434');
  const [provider, setProvider] = useState('ollama');
  const [apiKey, setApiKey] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');

  const preset = useMemo(
    () => PROVIDER_CATALOG.find((item) => item.id === selectedPreset),
    [selectedPreset]
  );
  const visiblePresets = useMemo(
    () => searchProviderCatalog(catalogQuery, catalogCategory),
    [catalogQuery, catalogCategory]
  );

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/settings', {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || t('admin_providers.load_failed'));
      }
      setEndpoints(
        (Array.isArray(data.customEndpoints) ? data.customEndpoints : []).map(
          (endpoint) => ({
            ...endpoint,
            name: endpoint.name || endpoint.url,
            provider: endpoint.provider || 'ollama',
            isActive: endpoint.isActive !== false,
          })
        )
      );
    } catch (error) {
      alert(error.message, 'error', t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [alert, t]);

  useEffect(() => {
    loadEndpoints();
  }, [loadEndpoints]);

  const selectPreset = (presetId) => {
    const next = PROVIDER_CATALOG.find((item) => item.id === presetId);
    if (!next) return;
    setSelectedPreset(next.id);
    setName(next.name);
    setUrl(next.url);
    setProvider(next.provider);
    setApiKey('');
  };

  const persist = async (nextEndpoints, successMessage) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customEndpoints: nextEndpoints }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || t('admin_providers.save_failed'));
      }
      await loadEndpoints();
      if (successMessage) alert(successMessage, 'success');
      return true;
    } catch (error) {
      alert(error.message, 'error', t('common.error'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addProvider = async () => {
    const cleanName = name.trim();
    const cleanUrl = normalizeUrl(url);
    if (!cleanName || !cleanUrl) {
      alert(t('admin_providers.name_url_required'), 'warning');
      return;
    }
    try {
      const parsed = new URL(cleanUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      alert(t('admin_providers.invalid_url'), 'warning');
      return;
    }
    if (endpoints.some((endpoint) => normalizeUrl(endpoint.url) === cleanUrl)) {
      alert(t('admin_providers.duplicate_url'), 'warning');
      return;
    }
    if (preset?.requiresKey && !apiKey.trim()) {
      alert(t('admin_providers.key_required'), 'warning');
      return;
    }

    const nextEndpoint = {
      name: cleanName,
      url: cleanUrl,
      provider,
      isActive: true,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    };
    const saved = await persist(
      [...endpoints, nextEndpoint],
      t('admin_providers.connected', { name: cleanName })
    );
    if (saved) {
      setApiKey('');
      selectPreset('custom');
    }
  };

  const toggleEndpoint = async (target) => {
    const next = endpoints.map((endpoint) =>
      endpoint.url === target.url
        ? { ...endpoint, isActive: endpoint.isActive === false }
        : endpoint
    );
    await persist(next, t('admin_providers.updated'));
  };

  const removeEndpoint = async (target) => {
    const accepted = await confirm(
      t('admin_providers.remove_confirm', { name: target.name }),
      t('admin_providers.remove_title')
    );
    if (!accepted) return;
    await persist(
      endpoints.filter((endpoint) => endpoint.url !== target.url),
      t('admin_providers.removed')
    );
  };

  return (
    <div className='space-y-6'>
      <PageHead
        eyebrow='CORE CONNECTION'
        title={t('admin_providers.title')}
        sub={t('admin_providers.subtitle')}
        actions={
          <Button variant='outline' size='sm' onClick={loadEndpoints} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin_providers.refresh')}
          </Button>
        }
      />

      <Card className='overflow-hidden border-border shadow-sm'>
        <CardContent className='p-0'>
          <div className='border-b border-border bg-[var(--hn-primary-soft)] px-5 py-4'>
            <div className='flex items-start gap-3'>
              <div className='mt-0.5 rounded-lg bg-[var(--hn-primary)] p-2 text-[var(--hn-primary-fg)]'>
                <Plus className='h-4 w-4' />
              </div>
              <div>
                <h2 className='text-base font-semibold text-foreground'>
                  {t('admin_providers.quick_connect')}
                </h2>
                <p className='mt-1 break-keep text-sm text-muted-foreground'>
                  {t('admin_providers.quick_connect_desc')}
                </p>
              </div>
            </div>
          </div>

          <div className='space-y-5 p-5'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center'>
              <div className='relative min-w-0 flex-1'>
                <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder='Search providers, gateways, and local engines' className='pl-9' aria-label='Search provider catalog' />
              </div>
              <div className='flex gap-1 overflow-x-auto pb-1 lg:pb-0' aria-label='Provider categories'>
                {PROVIDER_CATEGORIES.map((category) => (
                  <Button key={category} type='button' size='sm' variant={catalogCategory === category ? 'default' : 'outline'} onClick={() => setCatalogCategory(category)}>
                    {CATEGORY_LABELS[category]}
                  </Button>
                ))}
              </div>
            </div>

            <div className='max-h-[340px] overflow-y-auto rounded-[var(--hn-radius)] border border-border p-2'>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
              {visiblePresets.map((item) => {
                const Icon = CATEGORY_ICONS[item.category] || Cloud;
                const active = selectedPreset === item.id;
                return (
                  <button
                    key={item.id}
                    type='button'
                    onClick={() => selectPreset(item.id)}
                    className={`flex min-h-[74px] flex-col items-start justify-between rounded-[var(--hn-radius)] border p-3 text-left transition-all ${
                      active
                        ? 'border-[var(--hn-primary)] bg-[var(--hn-primary-soft)] shadow-sm'
                        : 'border-border bg-background hover:border-[var(--hn-border-strong)] hover:bg-muted'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[var(--hn-primary-strong)]' : 'text-muted-foreground'}`} />
                    <span className='mt-3 text-xs font-semibold text-foreground'>
                      {item.id === 'custom' ? t('admin_providers.custom') : item.name}
                    </span>
                    <span className='mt-1 text-[9px] uppercase tracking-wide text-muted-foreground'>{CATEGORY_LABELS[item.category]}</span>
                  </button>
                );
              })}
              </div>
              {visiblePresets.length === 0 && <p className='py-10 text-center text-sm text-muted-foreground'>No matching providers.</p>}
            </div>

            <p className='text-xs text-muted-foreground'>
              {preset?.discovery === 'limited'
                ? 'Model discovery is provider-specific. Save the connection, then enter an exact model ID if listing is unavailable.'
                : preset?.category === 'local'
                  ? 'Local engine compatibility depends on its version, loaded model, chat template, and tool parser.'
                  : 'This preset uses Hanimo’s existing OpenAI-compatible, Gemini, or Ollama transport. Available capabilities remain model-specific.'}
            </p>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='provider-name'>{t('admin_providers.name')}</Label>
                <Input
                  id='provider-name'
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('admin_providers.name_placeholder')}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='provider-type'>{t('admin_providers.protocol')}</Label>
                <select
                  id='provider-type'
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                  className='flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'
                >
                  <option value='ollama'>Ollama</option>
                  <option value='openai-compatible'>OpenAI-compatible</option>
                  <option value='gemini'>Google Gemini</option>
                </select>
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='provider-url'>{t('admin_providers.base_url')}</Label>
              <Input
                id='provider-url'
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder='https://provider.example/v1'
                className='font-mono text-xs'
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='provider-key' className='flex items-center gap-2'>
                <KeyRound className='h-3.5 w-3.5' />
                {t('admin_providers.api_key')}
              </Label>
              <Input
                id='provider-key'
                type='password'
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={provider === 'ollama' ? t('admin_providers.key_optional') : '••••••••••••'}
                autoComplete='new-password'
              />
              <p className='text-xs text-muted-foreground'>
                {t('admin_providers.key_note')}
              </p>
            </div>

            <div className='flex justify-end'>
              <Button onClick={addProvider} disabled={saving}>
                {saving ? <Loader2 className='h-4 w-4 animate-spin' /> : <Plus className='h-4 w-4' />}
                {t('admin_providers.connect')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className='space-y-3'>
        <div className='flex items-end justify-between gap-4'>
          <div>
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_providers.connected_title')}
            </h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('admin_providers.connected_desc')}
            </p>
          </div>
          <Badge variant='secondary'>{endpoints.length}</Badge>
        </div>

        {loading ? (
          <Card><CardContent className='flex items-center justify-center py-12'><Loader2 className='h-5 w-5 animate-spin text-primary' /></CardContent></Card>
        ) : endpoints.length === 0 ? (
          <Card><CardContent className='py-12 text-center text-sm text-muted-foreground'>{t('admin_providers.empty')}</CardContent></Card>
        ) : (
          <div className='grid gap-3 lg:grid-cols-2'>
            {endpoints.map((endpoint) => (
              <Card key={endpoint.url} className='border-border shadow-sm'>
                <CardContent className='p-4'>
                  <div className='flex items-start gap-3'>
                    <span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${endpoint.isActive === false ? 'bg-muted-foreground/35' : 'bg-[var(--hn-good)]'}`} />
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <h3 className='font-semibold text-foreground'>{endpoint.name}</h3>
                        <Badge variant='outline' className='font-mono text-[9px]'>{providerLabel(endpoint.provider)}</Badge>
                        {endpoint.apiKeySet && (
                          <Badge variant='secondary' className='gap-1 text-[9px]'><KeyRound className='h-2.5 w-2.5' />KEY</Badge>
                        )}
                      </div>
                      <p className='mt-2 truncate font-mono text-[11px] text-muted-foreground' title={endpoint.url}>{endpoint.url}</p>
                    </div>
                    <div className='flex items-center gap-1'>
                      <Button variant='ghost' size='icon-sm' onClick={() => toggleEndpoint(endpoint)} title={endpoint.isActive === false ? t('admin_providers.enable') : t('admin_providers.disable')}>
                        <CheckCircle2 className={`h-4 w-4 ${endpoint.isActive === false ? 'text-muted-foreground' : 'text-[var(--hn-good)]'}`} />
                      </Button>
                      <Button variant='ghost' size='icon-sm' onClick={() => removeEndpoint(endpoint)} title={t('common.delete')}>
                        <Trash2 className='h-4 w-4 text-destructive' />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className='flex flex-col gap-3 rounded-[var(--hn-radius)] border border-border bg-muted/60 p-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <p className='text-sm font-semibold text-foreground'>{t('admin_providers.next_title')}</p>
          <p className='mt-1 text-xs text-muted-foreground'>{t('admin_providers.next_desc')}</p>
        </div>
        <Button variant='outline' onClick={() => router.push('/admin/models')}>
          {t('admin_providers.open_models')}
          <ArrowRight className='h-4 w-4' />
        </Button>
      </div>
    </div>
  );
}
