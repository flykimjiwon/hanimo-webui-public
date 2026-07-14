'use client';


import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus,
  Mail,
  Lock,
  Loader2,
  User,
  Building,
  Briefcase,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DEPARTMENT_CATALOG } from '@/lib/departments.mjs';

export default function SignUpPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const departments = [
    { value: '', label: t('signup.group_placeholder') },
    ...DEPARTMENT_CATALOG.map(({ value, labelKey }) => ({
      value,
      label: t(labelKey),
    })),
  ];

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError(t('signup.password_mismatch'));
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError(t('signup.password_too_short'));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, department, position }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t('signup.signup_failed'));
      }

      router.push('/login');
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
            background: 'linear-gradient(160deg, var(--hn-primary-soft) 0%, var(--hn-surface-2) 100%)',
            borderRight: '1px solid var(--hn-border)',
            padding: 'var(--hn-pad, 40px)',
          }}
        >
          <div>
            {/* Logo glyph + brand name */}
            <div className='flex items-center gap-3 mb-10'>
              <div
                aria-hidden='true'
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'var(--hn-primary)',
                  position: 'relative',
                  flexShrink: 0,
                  boxShadow: '0 6px 18px -6px rgba(245,166,35,.5)',
                }}
              >
                <span style={{ position: 'absolute', left: 8, right: 8, top: 12, height: 3, background: 'var(--hn-primary-fg)', borderRadius: 2 }} />
                <span style={{ position: 'absolute', left: 8, right: 8, top: 21, height: 3, background: 'var(--hn-primary-fg)', borderRadius: 2, opacity: 0.55 }} />
              </div>
              <span className='font-bold text-xl' style={{ color: 'var(--hn-fg)' }}>hanimo</span>
            </div>

            {/* Eyebrow */}
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--hn-fg-muted)', marginBottom: 12 }}>
              워크스페이스 가입
            </p>

            {/* H1 */}
            <p className='font-bold mb-8' style={{ fontSize: 26, lineHeight: 1.3, letterSpacing: '-0.02em', color: 'var(--hn-fg)' }}>
              팀에 합류하고<br />AI 워크스페이스를 시작하세요.
            </p>

            {/* Feature bullets */}
            <ul className='flex flex-col gap-3'>
              {[
                '회사 이메일로 안전하게 인증',
                '역할 기반 접근 제어',
                '데이터는 온프레미스에 보관',
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
                      background: 'var(--hn-primary)',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="var(--hn-primary-fg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className='text-sm' style={{ color: 'var(--hn-fg-muted)' }}>{text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer copyright */}
          <p className='text-xs' style={{ color: 'var(--hn-fg-muted)' }}>© 2025 hanimo</p>
        </div>

        {/* Right: form area */}
        <div className='flex-1 flex items-center justify-center px-4 py-8'>
        <div className='w-full max-w-md'>
          <div className='text-center mb-8'>
            <div
              aria-hidden='true'
              className='mx-auto mb-5'
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--hn-primary)',
                position: 'relative',
                boxShadow: '0 8px 24px -8px rgba(245,166,35,.45)',
              }}
            >
              <span style={{ position: 'absolute', left: 9, right: 9, top: 13, height: 3, background: 'var(--hn-primary-fg)', borderRadius: 2 }} />
              <span style={{ position: 'absolute', left: 9, right: 9, top: 22, height: 3, background: 'var(--hn-primary-fg)', borderRadius: 2, opacity: 0.55 }} />
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--hn-fg-muted)',
                marginBottom: 8,
              }}
            >
              계정 생성
            </div>
            <h1
              className='font-bold mb-2'
              style={{
                fontSize: 26,
                letterSpacing: '-0.02em',
                color: 'var(--hn-fg)',
              }}
            >
              {t('signup.title')}
            </h1>
            <p style={{ color: 'var(--hn-fg-muted)', fontSize: 14 }}>
              {t('signup.subtitle')}
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
              id='signup-form'
              data-testid='signup-form'
              onSubmit={handleSubmit}
            >
              <CardContent className='space-y-4'>
                {error && (
                  <Alert variant='destructive'>
                    <AlertDescription
                      id='signup-error'
                      data-testid='signup-error'
                    >
                      {error}
                    </AlertDescription>
                  </Alert>
                )}

                <div className='space-y-2'>
                  <Label htmlFor='signup-name'>
                    {t('signup.name')}
                  </Label>
                  <div className='relative'>
                    <User className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='signup-name'
                      data-testid='signup-name'
                      type='text'
                      autoComplete='name'
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className='pl-10'
                      placeholder={t('signup.name_placeholder')}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='signup-email'>
                    {t('auth.email')}
                  </Label>
                  <div className='relative'>
                    <Mail className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='signup-email'
                      data-testid='signup-email'
                      type='email'
                      autoComplete='email'
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className='pl-10'
                      placeholder={t('auth.email_placeholder')}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='signup-department'>
                    {t('signup.group')}
                  </Label>
                  <div className='relative'>
                    <Building className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <select
                      id='signup-department'
                      data-testid='signup-department'
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pl-10'
                    >
                      {departments.map((dept) => (
                        <option
                          key={dept.value}
                          value={dept.value}
                          className='bg-popover'
                        >
                          {dept.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='signup-position'>
                    {t('signup.position')}
                  </Label>
                  <div className='relative'>
                    <Briefcase className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='signup-position'
                      data-testid='signup-position'
                      type='text'
                      autoComplete='organization-title'
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className='pl-10'
                      placeholder={t('signup.position_placeholder')}
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='signup-password'>
                    {t('auth.password')}
                  </Label>
                  <div className='relative'>
                    <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='signup-password'
                      data-testid='signup-password'
                      type='password'
                      autoComplete='new-password'
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className='pl-10'
                      placeholder={t('signup.password_placeholder')}
                    />
                  </div>
                  <p
                    id='signup-password-hint'
                    data-testid='signup-password-hint'
                    className='text-xs text-muted-foreground'
                  >
                    {t('signup.password_hint')}
                  </p>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='signup-confirm-password'>
                    {t('signup.password_confirm')}
                  </Label>
                  <div className='relative'>
                    <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='signup-confirm-password'
                      data-testid='signup-confirm-password'
                      type='password'
                      autoComplete='new-password'
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className='pl-10'
                      placeholder={t('signup.password_confirm_placeholder')}
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p
                      id='signup-password-mismatch'
                      data-testid='signup-password-mismatch'
                      className='text-xs text-destructive'
                    >
                      {t('signup.password_mismatch')}
                    </p>
                  )}
                </div>

                <Button
                  id='signup-submit'
                  data-testid='signup-submit'
                  type='submit'
                  disabled={loading}
                  className='w-full'
                  size='lg'
                >
                  {loading ? (
                    <>
                      <Loader2
                        data-testid='signup-submit-loading'
                        className='h-5 w-5 animate-spin'
                      />
                      {t('common.processing')}
                    </>
                  ) : (
                    <>
                      <UserPlus className='h-5 w-5' />
                      {t('signup.submit')}
                    </>
                  )}
                </Button>
              </CardContent>

              <CardFooter className='justify-center border-t border-border'>
                <p className='text-sm text-muted-foreground'>
                  {t('auth.has_account')}{' '}
                  <a
                    id='signup-login-link'
                    data-testid='signup-login-link'
                    href='/login'
                    className='text-primary hover:text-primary/80 font-medium'
                  >
                    {t('auth.sign_in')}
                  </a>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
