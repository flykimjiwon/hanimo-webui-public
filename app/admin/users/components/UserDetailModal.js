'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

export default function UserDetailModal({ user, onClose }) {
    const { t } = useTranslation();
    if (!user) return null;

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    const InfoGroup = ({ title, children }) => (
        <div className='mb-6'>
            <h4 className='text-sm font-semibold text-foreground mb-3 pb-2 border-b border-border'>
                {title}
            </h4>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4'>
                {children}
            </div>
        </div>
    );

    const InfoItem = ({ label, value, fullWidth = false, className = '' }) => (
        <div className={`${fullWidth ? 'col-span-1 md:col-span-2' : ''} ${className}`}>
            <dt className='text-xs font-medium text-muted-foreground mb-1'>
                {label}
            </dt>
            <dd className='text-sm text-foreground break-all'>
                {value || '-'}
            </dd>
        </div>
    );

    return (
        <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className='max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0'>
                {/* 헤더 */}
                <DialogHeader className='p-4 border-b border-border'>
                    <DialogTitle className='flex items-center gap-3'>
                        {t('admin_user_detail.title')}
                        <Badge variant={user.authType === 'sso' ? 'default' : 'secondary'}>
                            {user.authType === 'sso' ? t('admin_user_detail.sso_account') : t('admin_user_detail.local_account')}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                {/* 본문 (스크롤 가능) */}
                <div className='flex-1 overflow-y-auto p-6'>
                    {/* 기본 정보 */}
                    <InfoGroup title={t('admin_user_detail.basic_profile')}>
                        <InfoItem
                            label={t('admin_user_detail.name')}
                            value={
                                user.authType === 'sso' && user.employeeNo
                                    ? `${user.name} (${user.employeeNo})`
                                    : user.name
                            }
                        />
                        <InfoItem label={t('admin_user_detail.email_company')} value={user.email} />
                        <InfoItem label={t('admin_user_detail.role')} value={user.role === 'admin' ? t('admin_user_detail.role_admin') : t('admin_user_detail.role_user')} />
                        <InfoItem label={t('admin_user_detail.account_type')} value={user.authType === 'sso' ? 'SSO' : t('admin_user_detail.account_local')} />
                    </InfoGroup>

                    {/* 조직 정보 */}
                    <InfoGroup title={t('admin_user_detail.org_info')}>
                        <InfoItem label={t('admin_user_detail.company_name')} value={user.companyName} />
                        <InfoItem label={t('admin_user_detail.company_code')} value={user.companyCode} />
                        <InfoItem label={t('admin_user_detail.group_company_id')} value={user.companyId} />
              <InfoItem label={t('admin_user_detail.group_name')} value={user.department} />
              <InfoItem label={t('admin_user_detail.group_id')} value={user.departmentId} />
              <InfoItem label={t('admin_user_detail.group_branch_no')} value={user.departmentNo} />
              <InfoItem label={t('admin_user_detail.group_path')} value={user.departmentLocation} fullWidth />
                    </InfoGroup>

                    {/* 사원 정보 */}
                    <InfoGroup title={t('admin_user_detail.employee_info')}>
                        <InfoItem label={t('admin_user_detail.employee_no')} value={user.employeeNo} />
                        <InfoItem label={t('admin_user_detail.employee_id')} value={user.employeeId} />
                        <InfoItem label={t('admin_user_detail.sso_user_id')} value={user.ssoUserId} />
                        <InfoItem label={t('admin_user_detail.position')} value={user.employeePositionName} />
                        <InfoItem
                            label={t('admin_user_detail.employee_type')}
                            value={
                                user.employeeClass === 'NORMAL' ? t('admin_user_detail.type_normal') :
                                user.employeeClass === 'EXECUTIVE' ? t('admin_user_detail.type_executive') :
                                user.employeeClass === 'OUTSOURCE_TEMP' ? t('admin_user_detail.type_outsource_temp') :
                                user.employeeClass === 'OUTSOURCE_RESIDENT' ? t('admin_user_detail.type_outsource_resident') :
                                user.employeeClass
                            }
                        />
                        <InfoItem label={t('admin_user_detail.security_level')} value={user.employeeSecurityLevel} />
                        <InfoItem label={t('admin_user_detail.lang_setting')} value={user.lang} />
                    </InfoGroup>

                    {/* 시스템 정보 */}
                    <InfoGroup title={t('admin_user_detail.system_info')}>
                        <InfoItem label={t('admin_user_detail.created_at')} value={formatDate(user.createdAt)} />
                        <InfoItem label={t('admin_user_detail.updated_at')} value={formatDate(user.updatedAt)} />
                        <InfoItem label={t('admin_user_detail.last_login')} value={formatDate(user.lastLoginAt)} />
                        <InfoItem label={t('admin_user_detail.last_activity')} value={formatDate(user.lastActiveAt)} />
                        <InfoItem label={t('admin_user_detail.login_blocked')} value={user.loginDenyYn === 'Y' ? t('admin_user_detail.blocked') : t('admin_user_detail.normal_status')} />
                        <InfoItem label={t('admin_user_detail.last_sso_response')} value={formatDate(user.ssoResponseDatetime)} />
                        <InfoItem label={t('admin_user_detail.auth_event_id')} value={user.authEventId} />
                        <InfoItem label={t('admin_user_detail.system_id')} value={user.id} fullWidth className='font-mono text-xs' />
                    </InfoGroup>
                </div>

                {/* 푸터 */}
                <DialogFooter className='p-4 border-t border-border bg-muted/50'>
                    <Button onClick={onClose}>
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
