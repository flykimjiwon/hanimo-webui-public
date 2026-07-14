'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, User, Mail, Lock, Loader2, AlertTriangle, Sparkles, Database, Cpu, Check } from 'lucide-react';
import DarkModeToggle from '@/components/DarkModeToggle';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import HanimoMark from '@/components/brand/HanimoMark';

export default function SetupPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(false);

  useEffect(() => {
    fetch('/api/auth/create-first-admin')
      .then((res) => res.json())
      .then((data) => {
        setHasAdmin(data.hasAdmin);
        setChecking(false);
        if (data.hasAdmin) {
          setTimeout(() => router.replace('/login'), 3000);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError(t('signup.password_mismatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('setup.password_min_length'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/create-first-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hanimo-Setup-Token': setupToken,
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('setup.create_failed'));
      }

      localStorage.setItem('token', data.token);
      router.push('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // P1: display-only stepper — step 0,1 done; step 2 active (admin account); steps 3,4 pending
  const setupSteps = [
    { label: t('setup.step_start'), icon: Sparkles },
    { label: t('setup.step_database'), icon: Database },
    { label: t('setup.step_admin'), icon: ShieldCheck },
    { label: t('setup.step_model'), icon: Cpu },
    { label: t('setup.step_done'), icon: Check },
  ];
  const activeStep = 2;

  if (checking) {
    return (
      <div className='min-h-screen flex items-center justify-center' style={{ background: 'var(--hn-bg)' }}>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  if (hasAdmin) {
    return (
      <div className='min-h-screen flex items-center justify-center px-4' style={{ background: 'var(--hn-bg)' }}>
        <div className='text-center'>
          <AlertTriangle className='h-12 w-12 mx-auto mb-4' style={{ color: 'var(--hn-warn)' }} />
          <h2 className='text-xl font-semibold mb-2' style={{ color: 'var(--hn-fg)' }}>
            {t('setup.admin_exists')}
          </h2>
          <p className='mb-4' style={{ color: 'var(--hn-fg-muted)' }}>
            {t('setup.admin_exists_description')}
          </p>
          <p className='text-sm' style={{ color: 'var(--hn-fg-muted)' }}>
            {t('setup.redirect_notice')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className='min-h-screen flex flex-col transition-colors duration-200'
      style={{ background: 'var(--hn-bg)', color: 'var(--hn-fg)' }}
    >
      <div className='flex flex-1'>
        {/* P1: Left rail stepper */}
        <div
          className='hidden md:flex flex-col'
          style={{
            width: 240,
            minWidth: 240,
            background: 'var(--hn-surface)',
            borderRight: '1px solid var(--hn-border)',
            padding: '32px 24px',
            minHeight: '100vh',
          }}
        >
          {/* Brand row */}
          <div className='flex items-center gap-2 mb-6'>
            <HanimoMark size={32} />
            <span className='font-bold text-base' style={{ color: 'var(--hn-fg)' }}>Hanimo</span>
          </div>

          {/* Sub-label */}
          <p className='text-xs mb-8' style={{ color: 'var(--hn-fg-muted)' }}>
            {t('setup.brand_sub')}
          </p>

          {/* Stepper */}
          <ol className='flex flex-col gap-1 flex-1'>
            {setupSteps.map((step, idx) => {
              const isDone = idx < activeStep;
              const isActive = idx === activeStep;
              const StepIcon = step.icon;
              return (
                <li key={idx} className='flex items-center gap-3 py-2'>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isDone || isActive ? 'var(--hn-primary)' : 'transparent',
                      border: isDone || isActive ? 'none' : '1.5px solid var(--hn-border)',
                    }}
                  >
                    {isDone ? (
                      <Check style={{ width: 13, height: 13, color: 'var(--hn-primary-fg)' }} />
                    ) : (
                      <StepIcon
                        style={{
                          width: 13,
                          height: 13,
                          color: isActive ? 'var(--hn-primary-fg)' : 'var(--hn-fg-muted)',
                        }}
                      />
                    )}
                  </div>
                  <span
                    className='text-sm'
                    style={{
                      color: isActive ? 'var(--hn-fg)' : isDone ? 'var(--hn-fg-muted)' : 'var(--hn-fg-muted)',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Version footer */}
          <p className='text-xs mt-6' style={{ color: 'var(--hn-fg-muted)' }}>
            v1 · Next.js 15 · PostgreSQL
          </p>
        </div>

        {/* Right: form area */}
        <div className='flex-1 flex items-center justify-center px-4 relative'>
          <div className='absolute top-4 right-4'>
            <DarkModeToggle />
          </div>
          <div className='w-full max-w-md'>
            <div className='text-center mb-8'>
              <div className='flex justify-center mb-4'>
                {/* P2: amber icon container matching login/signup pattern */}
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
                  <ShieldCheck className='h-6 w-6 text-primary' />
                </div>
              </div>
              <h1 className='text-3xl font-bold mb-2' style={{ color: 'var(--hn-fg)' }}>
                {t('setup.title')}
              </h1>
              <p style={{ color: 'var(--hn-fg-muted)' }}>
                {t('setup.subtitle')}
              </p>
            </div>

            {/* P2: Card with hn- inline styles matching login/signup */}
            <Card
              className='border-0'
              style={{
                background: 'var(--hn-surface)',
                border: '1px solid var(--hn-border)',
                borderRadius: 14,
                boxShadow: 'var(--hn-shadow-md)',
              }}
            >
              <form onSubmit={handleSubmit}>
                <CardContent className='space-y-4'>
                  {error && (
                    <Alert variant='destructive'>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className='space-y-2'>
                    <Label>{t('setup.token_label')}</Label>
                    <div className='relative'>
                      <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                      <Input
                        type='password'
                        required
                        minLength={32}
                        maxLength={256}
                        value={setupToken}
                        onChange={(e) => setSetupToken(e.target.value)}
                        className='pl-10'
                        autoComplete='off'
                        spellCheck={false}
                        placeholder={t('setup.token_placeholder')}
                      />
                    </div>
                    <p className='text-xs text-muted-foreground break-keep'>
                      {t('setup.token_help')}
                    </p>
                  </div>

                  <div className='space-y-2'>
                    <Label>{t('signup.name')}</Label>
                    <div className='relative'>
                      <User className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                      <Input
                        type='text'
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className='pl-10'
                        placeholder={t('signup.name_placeholder')}
                      />
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label>{t('auth.email')}</Label>
                    <div className='relative'>
                      <Mail className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                      <Input
                        type='email'
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className='pl-10'
                        placeholder={t('auth.email_placeholder')}
                      />
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label>{t('auth.password')}</Label>
                    <div className='relative'>
                      <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                      <Input
                        type='password'
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className='pl-10'
                        placeholder={t('setup.password_placeholder')}
                      />
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label>{t('signup.password_confirm')}</Label>
                    <div className='relative'>
                      <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                      <Input
                        type='password'
                        required
                        minLength={6}
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className='pl-10'
                        placeholder={t('signup.password_confirm_placeholder')}
                      />
                    </div>
                  </div>

                  <Button
                    type='submit'
                    disabled={loading}
                    className='w-full'
                    size='lg'
                  >
                    {loading ? (
                      <>
                        <Loader2 className='h-5 w-5 animate-spin' />
                        {t('setup.creating')}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className='h-5 w-5' />
                        {t('setup.create_admin')}
                      </>
                    )}
                  </Button>
                </CardContent>

                <CardFooter className='justify-center border-t border-border'>
                  <a
                    href='/login'
                    className='text-sm text-primary hover:text-primary/80'
                  >
                    {t('setup.back_to_login')}
                  </a>
                </CardFooter>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
