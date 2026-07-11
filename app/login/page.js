'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn, Mail, Lock, Loader2 } from '@/components/icons';
import dynamic from 'next/dynamic';
const NoticePopup = dynamic(() => import('../components/NoticePopup'), { ssr: false });
import DarkModeToggle from '@/components/DarkModeToggle';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import HanimoMark from '@/components/brand/HanimoMark';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const getSafeRedirect = useCallback(() => {
    const redirect = searchParams.get('redirect');
    if (
      redirect &&
      redirect.startsWith('/') &&
      !redirect.startsWith('//')
    ) {
      return redirect;
    }
    return '/';
  }, [searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginNotice, setLoginNotice] = useState(null);
  const [supportContacts, setSupportContacts] = useState([]);
  const [supportContactsEnabled, setSupportContactsEnabled] = useState(true);
  const [browserBlockedMessage, setBrowserBlockedMessage] = useState('');
  const [browserInfoMessage, setBrowserInfoMessage] = useState('');
  const [browserAllowed, setBrowserAllowed] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = decodeJWTPayload(token);
        if (payload?.exp && Date.now() >= payload.exp * 1000) {
          localStorage.removeItem('token');
          return;
        }
        router.replace(getSafeRedirect());
      } catch (error) {
        localStorage.removeItem('token');
      }
    }
  }, [router, getSafeRedirect]);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isEdge = ua.includes('Edg/');
    const edgeMatch = ua.match(/Edg\/(\d+)/);
    const edgeVersion = edgeMatch ? parseInt(edgeMatch[1], 10) : null;
    const chromeMatch = ua.match(/Chrome\/(\d+)/);
    const chromeVersion = chromeMatch ? parseInt(chromeMatch[1], 10) : null;
    const isChrome = !!chromeVersion && !isEdge;
    const browserName = isEdge ? 'Edge' : 'Chrome';
    const browserVersion = isEdge ? edgeVersion : chromeVersion;
    const isChromium = isChrome || isEdge;
    const isSupported = !!browserVersion && isChromium && browserVersion >= 111;

    if (!isSupported) {
      const message = isChromium
        ? t('auth.browser_limited', {
            browser: browserName,
            version: browserVersion || 'unknown',
          })
        : t('auth.browser_unsupported');
      setBrowserBlockedMessage(message);
      setBrowserAllowed(true);
      setBrowserInfoMessage('');
    } else {
      setBrowserBlockedMessage('');
      setBrowserAllowed(true);
      setBrowserInfoMessage(t('auth.browser_current', {
        browser: browserName,
        version: browserVersion,
      }));
    }
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/notice?showPopup=true&limit=1&popupTarget=login')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.notices && data.notices.length > 0) {
          setLoginNotice(data.notices[0]);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fetch('/api/public/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setSupportContacts(
          Array.isArray(data.supportContacts) ? data.supportContacts : []
        );
        setSupportContactsEnabled(
          data.supportContactsEnabled !== undefined
            ? data.supportContactsEnabled
            : true
        );
      })
      .catch(() => {});
  }, []);


  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('auth.login_failed'));
      }

      localStorage.setItem('token', data.token);

      router.push(getSafeRedirect());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className='min-h-screen flex flex-col transition-colors duration-200'
      style={{ background: 'var(--hn-bg)', color: 'var(--hn-fg)' }}
    >
      <div className='flex flex-1'>
        {/* P1: Left brand panel — hidden on mobile, visible md+ */}
        <div
          className='hidden md:flex flex-col justify-between'
          style={{
            width: '40%',
            minHeight: '100vh',
            background: 'linear-gradient(160deg, var(--hn-surface) 0%, var(--hn-surface-2) 100%)',
            borderRight: '1px solid var(--hn-border)',
            padding: 'var(--hn-pad, 40px)',
          }}
        >
          <div>
            {/* Canonical Hanimo lockup */}
            <div className='flex items-center gap-3 mb-10'>
              <HanimoMark size={40} />
              <span className='font-bold text-xl' style={{ color: 'var(--hn-fg)' }}>Hanimo</span>
            </div>

            {/* Eyebrow */}
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--hn-fg-muted)', marginBottom: 12 }}>
              {t('auth.brand_kicker')}
            </p>

            {/* H1 */}
            <h1 className='font-bold mb-8' style={{ fontSize: 26, lineHeight: 1.3, letterSpacing: '-0.02em', color: 'var(--hn-fg)' }}>
              <span className='whitespace-pre-line'>{t('auth.brand_title')}</span>
            </h1>

            {/* Feature bullets */}
            <ul className='flex flex-col gap-3'>
              {[
                t('auth.brand_feature_models'),
                t('auth.brand_feature_gateway'),
                t('auth.brand_feature_workspace'),
              ].map((text, i) => (
                <li key={i} className='flex items-start gap-2.5'>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--hn-surface-3)',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="var(--hn-fg-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className='text-sm' style={{ color: 'var(--hn-fg-muted)' }}>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer copyright */}
          <p className='text-xs' style={{ color: 'var(--hn-fg-muted)' }}>© 2026 Hanimo</p>
        </div>

        {/* Right: form area */}
        <div className='flex-1 flex items-center justify-center px-4 relative'>
          <div className='absolute top-4 right-4'>
            <DarkModeToggle />
          </div>
          <div className='w-full max-w-md'>
            <div className='text-center mb-8'>
              <HanimoMark size={44} className='mx-auto mb-5' />
              <h1
                id='login-title'
                data-testid='login-title'
                className='font-bold mb-2'
                style={{
                  fontSize: 26,
                  letterSpacing: '-0.02em',
                  color: 'var(--hn-fg)',
                }}
              >
                {t('auth.login_title')}
              </h1>
              <p
                id='login-subtitle'
                data-testid='login-subtitle'
                style={{ color: 'var(--hn-fg-muted)', fontSize: 14 }}
              >
                {t('auth.login_subtitle')}
              </p>
            </div>

          <Card
            className='border-0'
            style={{
              background: 'var(--hn-surface)',
              border: '1px solid var(--hn-border)',
              borderRadius: 14,
              boxShadow: 'var(--hn-shadow-md)',
            }}
          >
            <form
              id='login-form'
              data-testid='login-form'
              onSubmit={handleSubmit}
            >
              <CardContent className='space-y-4'>
                {browserBlockedMessage && (
                  <Alert>
                    <AlertDescription className='text-sm text-amber-700 dark:text-amber-300'>
                      {browserBlockedMessage}
                    </AlertDescription>
                  </Alert>
                )}
                {!browserBlockedMessage && browserInfoMessage && (
                  <Alert>
                    <AlertDescription className='text-sm text-muted-foreground'>
                      {browserInfoMessage}
                    </AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant='destructive'>
                    <AlertDescription
                      id='login-error'
                      data-testid='login-error'
                    >
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                <div className='space-y-2'>
                  <Label
                    htmlFor='login-email'
                    id='login-email-label'
                    data-testid='login-email-label'
                  >
                    {t('auth.email')}
                  </Label>
                  <div className='relative'>
                    <Mail className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='login-email'
                      data-testid='login-email'
                      type='email'
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className='pl-10'
                      placeholder={t('auth.email_placeholder')}
                      aria-describedby='login-email-label'
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label
                    htmlFor='login-password'
                    id='login-password-label'
                    data-testid='login-password-label'
                  >
                    {t('auth.password')}
                  </Label>
                  <div className='relative'>
                    <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='login-password'
                      data-testid='login-password'
                      type='password'
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className='pl-10'
                      placeholder={t('auth.password_placeholder')}
                      aria-describedby='login-password-label'
                    />
                  </div>
                </div>

                <Button
                  id='login-submit'
                  data-testid='login-submit'
                  type='submit'
                  disabled={loading}
                  className='w-full'
                  size='lg'
                >
                  {loading ? (
                    <>
                      <Loader2
                        data-testid='login-submit-loading'
                        className='h-5 w-5 animate-spin'
                      />
                      {t('common.processing')}
                    </>
                  ) : (
                    <>
                      <LogIn className='h-5 w-5' />
                      {t('auth.sign_in')}
                    </>
                  )}
                </Button>
              </CardContent>

              <CardFooter className='justify-center border-t border-border'>
                <p className='text-sm text-muted-foreground'>
                  {t('auth.no_account')}{' '}
                  <a
                    id='login-signup-link'
                    data-testid='login-signup-link'
                    href='/signup'
                    className='text-primary hover:text-primary/80 font-medium'
                  >
                    {t('auth.sign_up')}
                  </a>
                </p>
              </CardFooter>
            </form>
          </Card>
          </div>
        </div>
      </div>
      {supportContactsEnabled && supportContacts.length > 0 && (
        <div className='fixed bottom-4 right-4 z-40'>
          <div className='bg-card/95 border border-border rounded-lg shadow-lg px-4 py-3 text-xs text-foreground min-w-[220px]'>
            <div className='text-sm font-semibold mb-2'>{t('auth.support_contacts')}</div>
            <div className='space-y-2'>
              {supportContacts.map((contact, index) => (
                <div key={`support-${index}`}>
                  <div className='font-medium'>
                    {contact.department?.replaceAll('부서', '그룹') || t('auth.no_group')}
                  </div>
                  <div className='text-muted-foreground'>
                    {(contact.name || t('auth.no_name')) +
                      (contact.phone ? ` · ${contact.phone}` : '')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <NoticePopup target='login' initialNotice={loginNotice} />
    </div>
  );
}

function LoginPageFallback() {
  const { t } = useTranslation();
  return (
    <div className='min-h-screen bg-background transition-colors duration-200 flex items-center justify-center'>
      <div className='text-sm text-muted-foreground'>
        {t('auth.loading_login')}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
