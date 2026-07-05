'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Lock, ExternalLink, Globe } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
const ScreenRenderer = dynamic(() => import('@/components/screen-builder/ScreenRenderer'), { ssr: false });

// 비밀번호 입력 폼
function PasswordForm({ screenName, shareId, onSuccess }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/screens/share/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('screen_builder.wrong_password'));
      }
      const data = await res.json();
      onSuccess(data.screen);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--hn-bg)' }}>
      {/* P0: shadcn Card with hn- tokens, amber icon container, shadcn Input+Button */}
      <Card
        className="w-full max-w-sm border-0"
        style={{
          background: 'var(--hn-surface)',
          border: '1px solid var(--hn-border)',
          borderRadius: 14,
          boxShadow: 'var(--hn-shadow-md)',
        }}
      >
        <CardContent className="pt-8 pb-6 px-8">
          <div className="flex justify-center mb-4">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--hn-primary-soft)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lock className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-center mb-1" style={{ color: 'var(--hn-fg)' }}>
            {screenName || t('screen_builder.password_protected')}
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: 'var(--hn-fg-muted)' }}>
            {t('screen_builder.password_required')}
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('screen_builder.enter_password')}
              required
            />
            {error && <p className="text-xs text-[var(--hn-error)]">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full" size="lg">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t('screen_builder.confirm')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// 403 화면
function ForbiddenPage({ t }) {
  return (
    // P2: var(--hn-bg) replaces bg-muted/30
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--hn-bg)' }}>
      <div className="text-center">
        {/* P2: tokenised numeral display */}
        <div
          className="text-6xl font-black mb-4"
          style={{
            color: 'var(--hn-fg-muted)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.04em',
          }}
        >
          403
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--hn-fg)' }}>
          {t('screen_builder.forbidden_title')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--hn-fg-muted)' }}>
          {t('screen_builder.forbidden_description')}
        </p>
      </div>
    </div>
  );
}

// 공유 페이지 메인
export default function SharePage() {
  const { shareId } = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [screen, setScreen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requirePassword, setRequirePassword] = useState(false);
  const [requireAuth, setRequireAuth] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [passwordScreenMeta, setPasswordScreenMeta] = useState(null);

  useEffect(() => {
    const fetchScreen = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/screens/share/${shareId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();

        if (res.status === 401) {
          if (data.requireAuth) {
            setRequireAuth(true);
          }
          return;
        }

        if (res.status === 403) {
          setForbidden(true);
          return;
        }

        if (!res.ok) {
          setError(data.error || t('screen_builder.load_failed'));
          return;
        }

        if (data.requirePassword) {
          setRequirePassword(true);
          setPasswordScreenMeta(data.screen);
          return;
        }

        setScreen(data.screen);
      } catch {
        setError(t('screen_builder.load_error'));
      } finally {
        setLoading(false);
      }
    };
    fetchScreen();
  }, [shareId, t]);

  // 로그인 리다이렉트
  useEffect(() => {
    if (requireAuth) {
      router.push(`/login?redirect=/s/${shareId}`);
    }
  }, [requireAuth, shareId, router]);

  // P2: var(--hn-bg) replaces bg-muted/30
  if (loading && !requirePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--hn-bg)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (forbidden) return <ForbiddenPage t={t} />;

  if (requirePassword) {
    return (
      <PasswordForm
        screenName={passwordScreenMeta?.name}
        shareId={shareId}
        onSuccess={(sc) => { setScreen(sc); setRequirePassword(false); setLoading(false); }}
      />
    );
  }

  // P2: var(--hn-bg) replaces bg-muted/30
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--hn-bg)' }}>
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-[var(--hn-error)]" />
          <p className="text-sm" style={{ color: 'var(--hn-fg-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!screen) return null;

  return (
    // P2: var(--hn-bg) replaces bg-muted/30
    <div className="min-h-screen" style={{ background: 'var(--hn-bg)' }}>
      {/* P1: restyled header — amber logo glyph + centred badge + outlined copy-link button */}
      <header
        className="px-6 py-3 flex items-center justify-between gap-4"
        style={{ background: 'var(--hn-surface)', borderBottom: '1px solid var(--hn-border)' }}
      >
        {/* Left: logo glyph + brand name + screen name */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            aria-hidden="true"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'var(--hn-primary)',
              position: 'relative',
              flexShrink: 0,
              boxShadow: '0 4px 12px -4px rgba(245,166,35,.4)',
            }}
          >
            <span style={{ position: 'absolute', left: 6, right: 6, top: 8, height: 2.5, background: 'var(--hn-primary-fg)', borderRadius: 2 }} />
            <span style={{ position: 'absolute', left: 6, right: 6, top: 14, height: 2.5, background: 'var(--hn-primary-fg)', borderRadius: 2, opacity: 0.55 }} />
          </div>
          <span className="font-bold text-sm" style={{ color: 'var(--hn-fg)' }}>hanimo</span>
          <span className="text-sm mx-1" style={{ color: 'var(--hn-border)' }}>·</span>
          <h1 className="text-sm font-medium truncate" style={{ color: 'var(--hn-fg)' }}>
            {screen.name}
          </h1>
        </div>

        {/* Centre: read-only badge */}
        <span className="hidden sm:flex items-center gap-1.5 text-xs border border-border rounded-full px-3 py-1 flex-shrink-0" style={{ color: 'var(--hn-fg-muted)' }}>
          <Globe className="w-3 h-3" />
          공유된 화면 · 읽기 전용
        </span>

        {/* Right: copy-link anchor styled as outlined button */}
        <a
          href={typeof window !== 'undefined' ? window.location.href : '#'}
          onClick={(e) => {
            e.preventDefault();
            navigator.clipboard?.writeText(window.location.href);
          }}
          className="flex items-center gap-1 text-xs rounded-lg px-3 py-1.5 border border-border transition-colors hover:bg-[var(--hn-surface-2)] flex-shrink-0"
          style={{ color: 'var(--hn-fg-muted)' }}
        >
          {t('screen_builder.made_with_hanimo-webui')}
          <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      {/* 화면 콘텐츠 */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <ScreenRenderer
          definition={screen.definition}
          screenId={screen.id}
          isPreview={false}
        />
      </main>

      {/* P1: CTA footer */}
      <footer className="max-w-5xl mx-auto px-6">
        <div
          className="mt-8 py-6 flex items-center justify-between gap-4 flex-wrap"
          style={{ borderTop: '1px solid var(--hn-border)' }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--hn-fg)' }}>
              이 화면이 도움이 되셨나요?
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'var(--hn-fg-muted)' }}>
              hanimo 워크스페이스에서 직접 대화를 시작해 보세요.
            </p>
          </div>
          <Button asChild>
            <Link href="/">hanimo 시작하기</Link>
          </Button>
        </div>
      </footer>
    </div>
  );
}
