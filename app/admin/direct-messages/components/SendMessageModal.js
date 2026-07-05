'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { X, Search, Users, Building, Send, Check, Loader2 } from '@/components/icons';
import { useTranslation } from '@/hooks/useTranslation';

export default function SendMessageModal({ isOpen, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [recipientType, setRecipientType] = useState('multiple');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // 사용자 목록 조회
  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        limit: '1000',
        search: searchTerm,
        department: departmentFilter,
      });

      const response = await fetch(`/api/admin/users?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);

        const deptSet = new Set();
        data.users.forEach((user) => {
          if (user.department) {
            deptSet.add(user.department);
          }
        });
        setDepartments(Array.from(deptSet).sort());
      }
    } catch (error) {
      logger.error(t('admin_send_dm.fetch_users_error'), error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, departmentFilter, t]);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen, fetchUsers]);

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setRecipientType('multiple');
      setSelectedUsers([]);
      setSelectedDepartment('');
      setTitle('');
      setContent('');
      setError('');
    }
  }, [isOpen]);

  const handleUserToggle = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const filteredUsers = getFilteredUsers();
    const allSelected = filteredUsers.every((user) =>
      selectedUsers.includes(user.id)
    );

    if (allSelected) {
      // 전체 해제
      setSelectedUsers((prev) =>
        prev.filter((id) => !filteredUsers.some((user) => user.id === id))
      );
    } else {
      // 전체 선택
      const newSelected = [...selectedUsers];
      filteredUsers.forEach((user) => {
        if (!newSelected.includes(user.id)) {
          newSelected.push(user.id);
        }
      });
      setSelectedUsers(newSelected);
    }
  };

  const getFilteredUsers = () => {
    return users.filter((user) => {
      const matchesSearch =
        !searchTerm ||
        user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDepartment =
        !departmentFilter || user.department === departmentFilter;
      return matchesSearch && matchesDepartment;
    });
  };

  const handleSubmit = async () => {
    setError('');

    if (!title.trim()) {
      setError(t('admin_send_dm.title_required'));
      return;
    }
    if (!content.trim()) {
      setError(t('admin_send_dm.content_required'));
      return;
    }

    if (recipientType === 'multiple' && selectedUsers.length === 0) {
      setError(t('admin_send_dm.recipient_required'));
      return;
    }
    if (recipientType === 'department' && !selectedDepartment) {
      setError(t('admin_send_dm.group_required'));
      return;
    }

    try {
      setSending(true);
      const token = localStorage.getItem('token');

      const body = {
        title: title.trim(),
        content: content.trim(),
        recipientType,
        recipientIds:
          recipientType === 'multiple' ? selectedUsers : undefined,
        department:
          recipientType === 'department' ? selectedDepartment : undefined,
      };

      const response = await fetch('/api/admin/direct-messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t('admin_send_dm.send_error'));
      }

      onSuccess?.(data.message);
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = getFilteredUsers();
  const allFilteredSelected =
    filteredUsers.length > 0 &&
    filteredUsers.every((user) => selectedUsers.includes(user.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="relative bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {t('admin_send_dm.title')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 발송 대상 선택 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              {t('admin_send_dm.target')}
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recipientType"
                  value="multiple"
                  checked={recipientType === 'multiple'}
                  onChange={(e) => setRecipientType(e.target.value)}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm text-foreground">
                  {t('admin_send_dm.individual')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recipientType"
                  value="department"
                  checked={recipientType === 'department'}
                  onChange={(e) => setRecipientType(e.target.value)}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm text-foreground">
                  {t('admin_send_dm.by_group')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="recipientType"
                  value="all"
                  checked={recipientType === 'all'}
                  onChange={(e) => setRecipientType(e.target.value)}
                  className="w-4 h-4 text-primary"
                />
                <span className="text-sm text-foreground">
                  {t('admin_send_dm.all')}
                </span>
              </label>
            </div>
          </div>

          {/* 개별 선택 모드 */}
          {recipientType === 'multiple' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('admin_send_dm.group_filter')}
                  </label>
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground"
                  >
                    <option value="">{t('admin_send_dm.all_groups')}</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept.replaceAll('부서', '그룹')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('admin_send_dm.search')}
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={t('admin_send_dm.search_placeholder')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* 사용자 목록 */}
              <div className="border border-border rounded-lg max-h-48 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {t('admin_send_dm.no_users')}
                  </div>
                ) : (
                  <>
                    <div className="sticky top-0 bg-muted px-4 py-2 border-b border-border">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={handleSelectAll}
                          className="w-4 h-4 text-primary rounded"
                        />
                        <span className="text-sm font-medium text-foreground">
                          {t('admin_send_dm.select_all', { count: filteredUsers.length })}
                        </span>
                      </label>
                    </div>
                    {filteredUsers.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={() => handleUserToggle(user.id)}
                           className="w-4 h-4 text-primary rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {user.name || t('admin_send_dm.no_name')}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                            {user.department && ` · ${user.department.replaceAll('부서', '그룹')}`}
                          </p>
                        </div>
                      </label>
                    ))}
                  </>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {t('admin_send_dm.selected_count')} <span className="font-medium text-primary">{selectedUsers.length}</span>{t('admin_send_dm.count_suffix')}
              </p>
            </div>
          )}


          {recipientType === 'department' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                <Building className="inline h-4 w-4 mr-1" />
                {t('admin_send_dm.select_group')}
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground"
              >
                <option value="">{t('admin_send_dm.select_group_placeholder')}</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept.replaceAll('부서', '그룹')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 전체 발송 안내 */}
          {recipientType === 'all' && (
            <div className="bg-muted border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Users className="h-5 w-5" />
                <p className="text-sm font-medium">
                  {t('admin_send_dm.all_users_notice', { count: users.length })}
                </p>
              </div>
            </div>
          )}

          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('admin_send_dm.label_title')} <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('admin_send_dm.title_placeholder')}
              className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground"
              maxLength={255}
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('admin_send_dm.label_content')} <span className="text-destructive">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('admin_send_dm.content_placeholder')}
              rows={5}
              className="w-full px-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-card text-foreground resize-none"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-muted">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('admin_send_dm.sending')}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                {t('admin_send_dm.send')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
