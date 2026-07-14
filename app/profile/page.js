'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  Mail,
  Building,
  Phone,
  Lock,
  Save,
  ArrowLeft,
  Eye,
  EyeOff,
} from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';
import dynamic from 'next/dynamic';
const AlertModal = dynamic(() => import('@/components/ui/modal').then(m => m.AlertModal), { ssr: false });
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import {
  DEPARTMENT_CATALOG,
  normalizeDepartment,
} from '@/lib/departments.mjs';

export default function ProfilePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'error',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userRole, setUserRole] = useState('');

  // 기본 정보
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');
  const [cell, setCell] = useState('');

  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);

  const departments = DEPARTMENT_CATALOG.map(({ value, labelKey }) => ({
    value,
    label: t(labelKey),
  }));

  // 현재 사용자 정보 조회
  const fetchUserInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login?redirect=' + encodeURIComponent(window.location.pathname));
        return;
      }

      const response = await fetch('/api/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('profile.fetch_failed'));
      }

      const data = await response.json();
      setName(data.user.name || '');
      setEmail(data.user.email || '');
      setDepartment(normalizeDepartment(data.user.department));
      setCell(data.user.cell || '');
      try {
        const payload = decodeJWTPayload(token);
        setUserRole(payload.role || '');
      } catch (_) {
        // role decode is best-effort; profile still works without it
      }
    } catch (error) {
      logger.error('Failed to fetch user info:', error);
      setErrorModal({
        isOpen: true,
        title: t('profile.fetch_failed'),
        message: error.message || t('profile.fetch_error_message'),
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  // 프로필 업데이트
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    // 비밀번호 변경 시 검증
    if (changePassword) {
      if (!currentPassword) {
        setErrorModal({
          isOpen: true,
          title: t('profile.input_error'),
          message: t('profile.enter_current_password'),
          type: 'warning',
        });
        setSaving(false);
        return;
      }

      if (newPassword.length < 6) {
        setErrorModal({
          isOpen: true,
          title: t('profile.input_error'),
          message: t('profile.new_password_too_short'),
          type: 'warning',
        });
        setSaving(false);
        return;
      }

      if (newPassword !== confirmPassword) {
        setErrorModal({
          isOpen: true,
          title: t('profile.input_error'),
          message: t('profile.new_password_mismatch'),
          type: 'warning',
        });
        setSaving(false);
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');
      const updateData = {
        name,
        department,
        cell,
      };

      // 비밀번호 변경이 요청된 경우
      if (changePassword) {
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
      }

      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('profile.update_failed'));
      }

      toast.success(t('profile.update_success'));

      // 비밀번호 변경 폼 초기화
      if (changePassword) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setChangePassword(false);
      }
    } catch (error) {
      logger.error('Profile update failed:', error);
      setErrorModal({
        isOpen: true,
        title: t('profile.update_failed'),
        message: error.message || t('profile.update_failed'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchUserInfo();
  }, [fetchUserInfo]);

  if (loading) {
    return (
      <div className='min-h-screen bg-background flex items-center justify-center'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background transition-colors duration-200 pb-8'>
      <div className='w-full max-w-full md:max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 pt-8 pb-16'>
        <Button
          variant='ghost'
          onClick={() => router.push('/')}
          className='mb-4 -ml-2'
        >
          <ArrowLeft className='h-4 w-4 mr-1' />
          {t('profile.back_to_chat')}
        </Button>
        <PageHead
          eyebrow='내 계정'
          title={t('profile.title')}
          sub={t('profile.subtitle')}
        />

        {/* 아바타 헤더 */}
        <div className='flex items-center gap-4 mb-5'>
          <div className='inline-flex items-center justify-center w-16 h-16 rounded-[18px] bg-primary text-primary-foreground text-[22px] font-bold select-none'>
            {name ? name[0] : '?'}
          </div>
          <div>
            <p className='text-[17px] font-bold text-foreground'>{name}</p>
            <p className='text-[13px] text-muted-foreground'>{email}</p>
            {userRole === 'admin' && (
              <span className='text-[11px] font-bold text-[var(--hn-error)] bg-[var(--hn-error-soft)] px-[7px] py-[2px] rounded-full'>관리자</span>
            )}
          </div>
        </div>

        {/* 프로필 폼 + 환경설정 그리드 */}
        <div className='grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4 items-start'>

        {/* 프로필 폼 */}
        <Card className='py-0 gap-0'>
          <CardContent className='p-6'>
            <form onSubmit={handleSubmit} className='space-y-6'>
              {/* 기본 정보 섹션 */}
              <div className='space-y-4'>
                <h3 className='text-lg font-medium text-foreground pb-2'>
                  {t('profile.basic_info')}
                </h3>
                <Separator className='-mt-2' />

                {/* 이름 */}
                <div className='space-y-2'>
                  <Label htmlFor='profile-name'>{t('profile.name')}</Label>
                  <div className='relative'>
                    <User className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='profile-name'
                      type='text'
                      autoComplete='name'
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className='pl-10'
                      placeholder={t('profile.name_placeholder')}
                    />
                  </div>
                </div>

                {/* 이메일 (읽기 전용) */}
                <div className='space-y-2'>
                  <Label htmlFor='profile-email'>{t('profile.email')}</Label>
                  <div className='relative'>
                    <Mail className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='profile-email'
                      type='email'
                      autoComplete='username'
                      value={email}
                      readOnly
                      className='pl-10 bg-muted text-muted-foreground cursor-not-allowed'
                      placeholder={t('profile.email')}
                    />
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {t('profile.email_read_only')}
                  </p>
                </div>

                {/* 부서 */}
                <div className='space-y-2'>
                  <Label htmlFor='profile-department'>{t('signup.group')}</Label>
                  <div className='relative'>
                    <Building className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <select
                      id='profile-department'
                      required
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className='flex h-9 w-full rounded-md border border-input bg-transparent pl-10 pr-4 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'
                    >
                      <option value=''>{t('signup.group_placeholder')}</option>
                      {departments.map((dept) => (
                        <option key={dept.value} value={dept.value}>
                          {dept.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cell */}
                <div className='space-y-2'>
                  <Label htmlFor='profile-cell'>{t('profile.cell')}</Label>
                  <div className='relative'>
                    <Phone className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                    <Input
                      id='profile-cell'
                      type='text'
                      required
                      value={cell}
                      onChange={(e) => setCell(e.target.value)}
                      className='pl-10'
                      placeholder={t('profile.cell_placeholder')}
                    />
                  </div>
                </div>
              </div>

              {/* 비밀번호 변경 섹션 */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between pb-2'>
                  <h3 className='text-lg font-medium text-foreground'>
                    {t('profile.change_password')}
                  </h3>
                  <Button
                    type='button'
                    variant='link'
                    size='sm'
                    onClick={() => setChangePassword(!changePassword)}
                  >
                    {changePassword ? t('common.cancel') : t('profile.change_password')}
                  </Button>
                </div>
                <Separator className='-mt-2' />

                {changePassword && (
                  <div className='space-y-4 bg-muted p-4 rounded-lg'>
                    {/* 현재 비밀번호 */}
                    <div className='space-y-2'>
                      <Label htmlFor='profile-current-password'>{t('profile.current_password')}</Label>
                      <div className='relative'>
                        <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                        <Input
                          id='profile-current-password'
                          type={showCurrentPassword ? 'text' : 'password'}
                          autoComplete='current-password'
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className='pl-10 pr-10'
                          placeholder={t('profile.current_password_placeholder')}
                        />
                        <button
                          type='button'
                          aria-label={t(showCurrentPassword ? 'profile.hide_password' : 'profile.show_password')}
                          onClick={() =>
                            setShowCurrentPassword(!showCurrentPassword)
                          }
                          className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                        >
                          {showCurrentPassword ? (
                            <EyeOff className='h-4 w-4' />
                          ) : (
                            <Eye className='h-4 w-4' />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 새 비밀번호 */}
                    <div className='space-y-2'>
                      <Label htmlFor='profile-new-password'>{t('profile.new_password')}</Label>
                      <div className='relative'>
                        <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                        <Input
                          id='profile-new-password'
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete='new-password'
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className='pl-10 pr-10'
                          placeholder={t('profile.new_password_placeholder')}
                        />
                        <button
                          type='button'
                          aria-label={t(showNewPassword ? 'profile.hide_password' : 'profile.show_password')}
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                        >
                          {showNewPassword ? (
                            <EyeOff className='h-4 w-4' />
                          ) : (
                            <Eye className='h-4 w-4' />
                          )}
                        </button>
                      </div>
                      <p className='text-xs text-muted-foreground'>
                        {t('profile.password_min_length')}
                      </p>
                    </div>

                    {/* 새 비밀번호 확인 */}
                    <div className='space-y-2'>
                      <Label htmlFor='profile-confirm-password'>{t('profile.confirm_password')}</Label>
                      <div className='relative'>
                        <Lock className='absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground' />
                        <Input
                          id='profile-confirm-password'
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete='new-password'
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className='pl-10 pr-10'
                          placeholder={t('profile.confirm_password_placeholder')}
                        />
                        <button
                          type='button'
                          aria-label={t(showConfirmPassword ? 'profile.hide_password' : 'profile.show_password')}
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                          className='absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground'
                        >
                          {showConfirmPassword ? (
                            <EyeOff className='h-4 w-4' />
                          ) : (
                            <Eye className='h-4 w-4' />
                          )}
                        </button>
                      </div>
                      {confirmPassword && newPassword !== confirmPassword && (
                        <p className='text-xs text-destructive'>
                          {t('profile.password_mismatch')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 저장 버튼 */}
              <Separator />
              <div className='flex justify-end'>
                <Button
                  type='submit'
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2'></div>
                      {t('profile.saving')}
                    </>
                  ) : (
                    <>
                      <Save className='h-4 w-4 mr-2' />
                      {t('profile.save_changes')}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 환경설정 카드 */}
        <Card className='py-0 gap-0'>
          <CardContent className='p-6'>
            <h3 className='text-[15px] font-semibold mb-2'>{t('profile.preferences')}</h3>
            <p className='text-sm text-muted-foreground break-keep'>
              <span className='block'>{t('profile.preferences_coming_soon')}</span>
              <span className='block'>{t('profile.preferences_unavailable')}</span>
            </p>
          </CardContent>
        </Card>

        </div>{/* end grid */}
      </div>

      {/* 에러 모달 */}
      <AlertModal
        isOpen={errorModal.isOpen}
        onClose={() =>
          setErrorModal({
            isOpen: false,
            title: '',
            message: '',
            type: 'error',
          })
        }
        title={errorModal.title}
        message={errorModal.message}
        type={errorModal.type}
      />

    </div>
  );
}
