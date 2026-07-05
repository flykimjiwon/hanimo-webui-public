'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  Mail,
  Building,
  Users,
  Calendar,
  X,
  HelpCircle,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import UserDetailModal from './components/UserDetailModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/useTranslation';

export default function UsersPage() {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const { isReadOnly } = useAdminAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [departments, setDepartments] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [editingUser, setEditingUser] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const [selectedDetailUser, setSelectedDetailUser] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [roleDropdownUserId, setRoleDropdownUserId] = useState(null);
  const roleDropdownRef = useRef(null);

  const [editForm, setEditForm] = useState({
    name: '',
    department: '',
    cell: '',
  });

  const DEFAULT_DEPTS = ['개발팀', '마케팅팀', '재무팀', '운영팀', '프로덕트팀', '기타'];

  useEffect(() => {
    function handleClickOutside(e) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target)) {
        setRoleDropdownUserId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/admin/departments', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : { departments: [] })
      .then(({ departments: rows = [] }) => {
        const seen = new Map();
        rows.forEach(({ department, auth_type }) => {
        seen.set(
          `${department}|${auth_type}`,
          auth_type === 'sso'
            ? `${department.replaceAll('부서', '그룹')}(SSO)`
            : `${department.replaceAll('부서', '그룹')}(${t('admin_users.auth_local')})`
        );
        });
        DEFAULT_DEPTS.forEach((dept) => {
          if (!seen.has(`${dept}|local`)) seen.set(`${dept}|local`, `${dept}(${t('admin_users.auth_local')})`);
        });
        setDepartments(
          Array.from(seen.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
        );
      })
      .catch(() => {
      setDepartments(
        DEFAULT_DEPTS.map((d) => ({
          value: `${d}|local`,
          label: `${d.replaceAll('부서', '그룹')}(${t('admin_users.auth_local')})`,
        }))
      );
      });
  }, [t]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const [deptName, authType] = deptFilter ? deptFilter.split('|') : ['', ''];
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        search: searchTerm,
        department: deptName,
        role: selectedRole,
      });
      if (authType) params.set('authType', authType);

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(t('admin_users.fetch_data_error'));
      }

      const data = await response.json();
      setUsers(data.users);
      setTotalPages(data.pagination.totalPages);
      setTotalCount(data.pagination.totalCount);
    } catch (error) {
      logger.error(t('admin_users.fetch_data_error'), error);
      alert(t('admin_users.fetch_data_failed'), 'error', t('admin.fetch_error'));
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    searchTerm,
    deptFilter,
    selectedRole,
    alert,
    t,
  ]);

  const updateUserRole = async (userId, newRole) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || t('admin_users.role_change_error'));
      }

      fetchUsers();
      alert(
        result.message || t('admin.role_changed', { role: newRole }),
        'success',
        t('admin.change_complete')
      );
    } catch (error) {
      logger.error(t('admin_users.role_change_error'), error);
      alert(error.message || t('admin.role_change_failed'), 'error', t('admin.change_failed'));
    }
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      department: user.department || '',
      cell: user.employeePositionName || t('admin_users.default_position'),
    });
    setShowEditModal(true);
  };

  const updateUser = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${editingUser._id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_profile',
          name: editForm.name,
          department: editForm.department,
          cell: editForm.cell,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || t('admin_users.update_profile_error'));
      }

      fetchUsers();
      setShowEditModal(false);
      setEditingUser(null);
      alert(
        result.message || t('admin.user_updated'),
        'success',
        t('admin.update_complete')
      );
    } catch (error) {
      logger.error(t('admin_users.update_profile_error'), error);
      alert(
        error.message || t('admin.user_update_failed'),
        'error',
        t('admin.update_failed')
      );
    }
  };

  const deleteUser = async (userId, userEmail) => {
    const confirmed = await confirm(
      t('admin.user_delete_confirm', { email: userEmail }),
      t('admin_users.delete_confirm_title')
    );
    if (!confirmed) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || t('admin_users.delete_error'));
      }

      fetchUsers();
      alert(
        result.message || t('admin.user_deleted'),
        'success',
        t('admin.delete_complete')
      );
    } catch (error) {
      logger.error(t('admin_users.delete_error'), error);
      alert(
        error.message || t('admin.user_delete_failed'),
        'error',
        t('admin.delete_failed')
      );
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, deptFilter, selectedRole, pageSize]);

  useEffect(() => {
    fetchUsers();
  }, [
    currentPage,
    searchTerm,
    deptFilter,
    selectedRole,
    pageSize,
    fetchUsers,
  ]);

  useEffect(() => {
    if (showEditModal || showDetailModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showEditModal, showDetailModal]);

  const handleDoubleClick = (user) => {
    setSelectedDetailUser(user);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedDetailUser(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    };
    return date
      .toLocaleString('ko-KR', options)
      .replace(/\s*오전\s*|\s*오후\s*/g, ' ')
      .trim();
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') {
      return (
        <span className='inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--hn-error-soft)] text-[var(--hn-error)]'>
          {t('admin_users.admin_badge')}
        </span>
      );
    }
    if (role === 'manager') {
      return <Badge variant='outline' className='border-primary text-primary'>{t('admin_users.manager_badge')}</Badge>;
    }
    return <Badge variant='secondary'>{t('admin_users.user_badge')}</Badge>;
  };

  return (
    <div className='space-y-6 w-full max-w-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto'>
      <PageHead
        eyebrow='멤버'
        title={t('admin.users')}
        sub={t('admin.users_subtitle')}
        actions={
          <div className='text-right'>
            <div className='text-2xl font-bold text-primary leading-none'>
              {t('admin_users.count_suffix', { count: totalCount.toLocaleString() })}
            </div>
            <div className='text-xs text-muted-foreground mt-1'>
              {t('admin.total_users')}
            </div>
          </div>
        }
      />

      <div className='bg-card p-4 rounded-lg border border-border'>
        <div className='flex flex-col gap-4'>
          <div className='flex flex-col sm:flex-row gap-4'>
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
              <Input
                type='text'
                placeholder={t('admin.search_users')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='pl-10'
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}
              className='px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground'
            >
                      <option value=''>{t('admin.all_groups')}</option>
              {departments.map((dept) => (
                <option key={dept.value} value={dept.value}>
                  {dept.label}
                </option>
              ))}
            </select>

            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className='px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground'
            >
              <option value=''>{t('admin.all_roles')}</option>
              <option value='user'>{t('common.user')}</option>
              <option value='manager'>{t('admin_users.role_manager')}</option>
              <option value='admin'>{t('common.admin')}</option>
            </select>

            <select
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              className='px-3 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground min-w-[120px]'
            >
              <option value={10}>{t('admin.items_10')}</option>
              <option value={20}>{t('admin.items_20')}</option>
              <option value={50}>{t('admin.items_50')}</option>
            </select>
          </div>

          <div className='flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-3'>
            <div>
              {t('admin.showing_users', { total: totalCount.toLocaleString(), start: ((currentPage - 1) * pageSize + 1).toLocaleString(), end: Math.min(currentPage * pageSize, totalCount).toLocaleString() })}
            </div>
            <div>{totalPages > 0 && t('admin.page_info', { current: currentPage, total: totalPages })}</div>
          </div>
        </div>
      </div>

      <div className='bg-card rounded-lg border border-border overflow-hidden overflow-x-auto'>
        {loading ? (
          <div className='flex items-center justify-center h-32'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
          </div>
        ) : users.length === 0 ? (
          <div className='text-center py-12'>
            <Users className='mx-auto h-12 w-12 text-muted-foreground' />
            <h3 className='mt-2 text-sm font-medium text-foreground'>
              {t('admin_users.no_users')}
            </h3>
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('admin_users.change_search_hint')}
            </p>
          </div>
        ) : (
          <>
            <div className='bg-muted px-6 py-3 border-b border-border'>
              <div className='grid grid-cols-18 gap-4 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[1200px]'>
                <div className='col-span-4'>{t('admin_users.col_user_info')}</div>
                    <div className='col-span-2'>{t('admin_users.col_group')}</div>
                <div className='col-span-2'>{t('admin_users.col_position')}</div>
                <div className='col-span-1'>{t('admin_users.col_role')}</div>
                <div className='col-span-2'>{t('admin_users.col_login_type')}</div>
                <div className='col-span-2'>{t('admin_users.col_join_date')}</div>
                <div className='col-span-3 flex items-center gap-1'>
                  <span>{t('admin_users.col_last_access')}</span>
                  <div className='relative group'>
                    <HelpCircle className='w-3 h-3 text-muted-foreground cursor-help' />
                    <div className='pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-lg bg-popover text-popover-foreground text-[11px] px-3 py-2 opacity-0 group-hover:opacity-100 z-20 shadow-lg leading-relaxed'>
                      <p className='font-semibold mb-1 text-popover-foreground'>{t('admin_users.tooltip_record_method')}</p>
                      <p className='mb-1'>
                        <span className='text-[var(--hn-info)] font-medium'>{t('admin_users.tooltip_activity')}</span>
                        {' '}{t('admin_users.tooltip_activity_desc')}
                        <br />
                        <span className='text-muted-foreground'>{t('admin_users.tooltip_activity_dedup')}</span>
                      </p>
                      <p>
                            <span className='text-primary font-medium'>{t('admin_users.tooltip_login')}</span>
                        {' '}{t('admin_users.tooltip_login_desc')}
                      </p>
                      <p className='mt-1 text-muted-foreground border-t border-border pt-1'>
                        {t('admin_users.tooltip_priority')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className='col-span-2'>{t('admin_users.col_actions')}</div>
              </div>
            </div>

            <div className='divide-y divide-border'>
              {users.map((user) => (
                <div
                  key={user._id}
                  className='px-6 py-4 hover:bg-accent cursor-pointer transition-colors duration-150'
                  onDoubleClick={() => handleDoubleClick(user)}
                  title={t('admin_users.double_click_hint')}
                >
                  <div className='grid grid-cols-18 gap-4 items-center min-w-[1200px]'>
                    <div className='col-span-4'>
                      <div className='flex items-center'>
                        <div className='h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0'>
                          <span className='text-sm font-medium text-primary'>
                            {user.name?.charAt(0) ||
                              user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className='ml-3 min-w-0 flex-1'>
                          <div className='text-sm font-medium text-foreground'>
                            {user.name || t('auth.no_name')}
                            {user.authType === 'sso' && user.employeeNo && (
                              <span className='text-muted-foreground font-normal ml-1'>
                                ({user.employeeNo})
                              </span>
                            )}
                          </div>
                          <div className='text-sm text-muted-foreground flex items-center'>
                            <Mail className='h-3 w-3 mr-1 flex-shrink-0' />
                            <span className='truncate'>{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className='col-span-2'>
                      <div className='flex items-center text-sm text-foreground'>
                        <Building className='h-4 w-4 mr-1 text-muted-foreground flex-shrink-0' />
                            <span className='truncate'>
                              {user.department?.replaceAll('부서', '그룹') || t('admin_users.not_set')}
                            </span>
                      </div>
                    </div>

                    <div className='col-span-2'>
                      <span className='text-sm text-foreground truncate block'>
                        {user.employeePositionName || '-'}
                      </span>
                    </div>

                    <div className='col-span-1 relative'>
                      {!isReadOnly ? (
                        <div
                          className='cursor-pointer inline-flex'
                          onClick={() => setRoleDropdownUserId(roleDropdownUserId === user._id ? null : user._id)}
                          title={t('admin_users.change_role')}
                        >
                          {getRoleBadge(user.role)}
                        </div>
                      ) : getRoleBadge(user.role)}
                      {roleDropdownUserId === user._id && (
                        <div ref={roleDropdownRef} className='absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[110px]'>
                          {['admin', 'manager', 'user'].map((role) => (
                            <button
                              key={role}
                              onClick={() => { updateUserRole(user._id, role); setRoleDropdownUserId(null); }}
                              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${user.role === role ? 'text-primary font-medium' : 'text-foreground'}`}
                            >
                              {role === 'admin' ? t('admin_users.role_admin') : role === 'manager' ? t('admin_users.role_manager') : t('admin_users.role_user')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='col-span-2'>
                      <Badge variant={user.authType === 'sso' ? 'default' : 'secondary'}>
                        {user.authType === 'sso' ? 'SSO' : t('admin_users.auth_local')}
                      </Badge>
                    </div>

                    <div className='col-span-2'>
                      <div className='relative group inline-flex items-center text-sm text-muted-foreground'>
                        <span>{formatDate(user.createdAt)}</span>
                        <span className='pointer-events-none absolute left-0 top-full mt-1 rounded bg-popover text-popover-foreground text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap'>
                          {formatDate(user.createdAt)}
                        </span>
                      </div>
                    </div>

                    <div className='col-span-3'>
                      <div className='inline-flex flex-col text-sm text-muted-foreground gap-0.5'>
                        {user.lastActiveAt ? (
                          <span>
                            <span className='text-[10px] text-[var(--hn-info)] mr-1'>{t('admin_users.activity_label')}</span>
                            {formatDate(user.lastActiveAt)}
                          </span>
                        ) : (
                          <span className='text-muted-foreground text-xs'>{t('admin_users.no_activity')}</span>
                        )}
                        {user.lastLoginAt ? (
                          <span>
                            <span className='text-[10px] text-primary mr-1'>{t('admin_users.login_label')}</span>
                            {formatDate(user.lastLoginAt)}
                          </span>
                        ) : (
                          <span className='text-muted-foreground text-xs'>{t('admin_users.no_login')}</span>
                        )}
                      </div>
                    </div>

                    {!isReadOnly && (
                    <div className='col-span-2'>
                      <div className='flex items-center space-x-2'>
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          onClick={() => openEditModal(user)}
                          className='text-primary hover:text-primary hover:bg-primary/10'
                          title={t('admin_users.edit_user')}
                          aria-label={t('admin_users.edit_user')}
                        >
                          <Edit2 className='h-4 w-4' />
                        </Button>

                        {user.role === 'admin' ? (
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            onClick={() => updateUserRole(user._id, 'user')}
                            className='text-muted-foreground hover:text-foreground hover:bg-accent'
                            title={t('admin_users.revoke_admin')}
                            aria-label={t('admin_users.revoke_admin')}
                          >
                            <UserX className='h-4 w-4' />
                          </Button>
                        ) : (
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            onClick={() => updateUserRole(user._id, 'admin')}
                            className='text-primary hover:text-primary hover:bg-primary/10'
                            title={t('admin_users.grant_admin')}
                            aria-label={t('admin_users.grant_admin')}
                          >
                            <UserCheck className='h-4 w-4' />
                          </Button>
                        )}

                        <Button
                          variant='ghost'
                          size='icon-sm'
                          onClick={() => deleteUser(user._id, user.email)}
                          className='text-destructive hover:text-destructive hover:bg-destructive/10'
                          title={t('admin_users.delete_user')}
                          aria-label={t('admin_users.delete_user')}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className='flex items-center justify-center space-x-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            {t('common.previous')}
          </Button>

          <span className='px-4 py-2 text-sm font-medium text-foreground'>
            {currentPage} / {totalPages}
          </span>

          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={currentPage === totalPages}
          >
            {t('common.next')}
          </Button>
        </div>
      )}

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className='sm:max-w-lg lg:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{t('admin_users.edit_user')}</DialogTitle>
          </DialogHeader>

          <div className='space-y-4'>
            <div>
              <Label className='mb-1'>{t('auth.email')}</Label>
              <Input
                type='email'
                value={editingUser?.email || ''}
                readOnly
                className='cursor-not-allowed opacity-60'
              />
            </div>

            <div>
              <Label className='mb-1'>{t('admin_users.name_label')}</Label>
              <Input
                type='text'
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                placeholder={t('admin_users.name_placeholder')}
              />
            </div>

            <div>
                      <Label className='mb-1'>{t('admin_users.group_label')}</Label>
              <Input
                type='text'
                value={editForm.department}
                onChange={(e) =>
                  setEditForm({ ...editForm, department: e.target.value })
                }
                            placeholder={t('admin_users.group_placeholder')}
              />
            </div>

            <div>
              <Label className='mb-1'>{t('admin_users.position_label')}</Label>
              <Input
                type='text'
                value={editForm.cell}
                onChange={(e) =>
                  setEditForm({ ...editForm, cell: e.target.value })
                }
                placeholder={t('admin_users.position_placeholder')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowEditModal(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={updateUser}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showDetailModal && selectedDetailUser && (
        <UserDetailModal
          user={selectedDetailUser}
          onClose={closeDetailModal}
        />
      )}
    </div>
  );
}
