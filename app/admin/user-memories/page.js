'use client';

import PageHead from '@/components/admin/PageHead';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useAlert } from '@/contexts/AlertContext';
import { Brain, Search, RotateCcw, Trash2, Settings, RefreshCw } from '@/components/icons';

export default function UserMemoriesPage() {
  const { token } = useAdminAuth();
  const { showAlert } = useAlert();

  const [users, setUsers] = useState([]);
  const [, setSettings] = useState({ modelId: '', intervalMinutes: 60 });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState('all'); // all | with | without
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [indexing, setIndexing] = useState(false);
  const [indexResults, setIndexResults] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);

  // Settings form
  const [editModelId, setEditModelId] = useState('');
  const [editInterval, setEditInterval] = useState(60);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/user-memories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setUsers(data.users || []);
      setSettings(data.settings || { modelId: '', intervalMinutes: 60 });
      setEditModelId(data.settings?.modelId || '');
      setEditInterval(data.settings?.intervalMinutes || 60);
    } catch (err) {
      showAlert('Failed to load user memories.', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, showAlert]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredUsers = users.filter((u) => {
    if (filter === 'with' && !u.hasMemory) return false;
    if (filter === 'without' && u.hasMemory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q) ||
             (u.department || '').toLowerCase().includes(q);
    }
    return true;
  });

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/admin/user-memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ modelId: editModelId, intervalMinutes: editInterval }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      setSettings(data.settings);
      showAlert('Settings saved.', 'success');
      setShowSettings(false);
    } catch {
      showAlert('Failed to save settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleIndex = async (reindex = false) => {
    const ids = selectedUsers.length > 0 ? selectedUsers : filteredUsers.map((u) => u.user_id);
    if (ids.length === 0) { showAlert('No users selected.', 'warning'); return; }
    if (ids.length > 50) { showAlert('Maximum 50 users per batch.', 'warning'); return; }

    setIndexing(true);
    setIndexResults(null);
    try {
      const res = await fetch('/api/admin/user-memories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds: ids, reindex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Indexing failed');
      setIndexResults(data);
      showAlert(data.message, 'success');
      fetchData();
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      setIndexing(false);
    }
  };

  const handleDeleteMemory = async (userId) => {
    if (!confirm('Reset this user\'s memory? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/user-memories?userId=${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      showAlert('Memory reset.', 'success');
      fetchData();
    } catch {
      showAlert('Failed to reset memory.', 'error');
    }
  };

  const toggleSelect = (userId) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredUsers.map((u) => u.user_id);
    if (selectedUsers.length === visibleIds.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(visibleIds);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const usersWithMemory = users.filter((u) => u.hasMemory).length;
  const totalIndexed = users.reduce((s, u) => s + (u.indexed_count || 0), 0);

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow='메모리'
        title='사용자 메모리'
        sub='전체 사용자의 대화 메모리 인덱싱을 관리합니다.'
        actions={
          <>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Settings className="h-4 w-4" /> 설정
            </button>
            <button
              onClick={fetchData}
              className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">Total Users</div>
          <div className="text-2xl font-bold text-foreground mt-1">{users.length}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">With Memory</div>
          <div className="text-2xl font-bold text-primary mt-1">{usersWithMemory}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-sm text-muted-foreground">Total Indexed Messages</div>
          <div className="text-2xl font-bold text-primary mt-1">{totalIndexed.toLocaleString()}</div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Memory Indexing Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Summarization Model ID</label>
              <input
                value={editModelId}
                onChange={(e) => setEditModelId(e.target.value)}
                placeholder="e.g. llama3:8b"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Batch Interval (minutes)</label>
              <input
                type="number"
                value={editInterval}
                onChange={(e) => setEditInterval(Number(e.target.value))}
                min={5}
                max={1440}
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowSettings(false)} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Index Results */}
      {indexResults && (
        <div className="bg-[var(--hn-good-soft)] border border-[var(--hn-good)] rounded-xl p-4">
          <div className="font-medium text-[var(--hn-good)] mb-2">{indexResults.message}</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            {indexResults.results?.map((r, i) => (
              <div key={i}>
                <div className={`px-2 py-1 rounded ${
                  r.status === 'success' ? 'bg-[var(--hn-good-soft)] text-[var(--hn-good)]'
                  : r.status === 'skip' ? 'bg-muted text-muted-foreground'
                  : 'bg-[var(--hn-error-soft)] text-[var(--hn-error)]'
                }`}>
                  {r.status === 'success' ? `+${r.indexed}` : r.reason}
                </div>
                {r.status === 'error' && r.detail && (
                  <div className="mt-1 p-2 bg-[var(--hn-error-soft)] border border-[var(--hn-error)] rounded text-[10px] text-[var(--hn-error)] space-y-0.5">
                    {r.detail.statusCode && <div><span className="font-semibold">Status:</span> {r.detail.statusCode}</div>}
                    {r.detail.endpoint && <div><span className="font-semibold">Endpoint:</span> {r.detail.endpoint}</div>}
                    {r.detail.model && <div><span className="font-semibold">Model:</span> {r.detail.model}</div>}
                    {r.detail.provider && <div><span className="font-semibold">Provider:</span> {r.detail.provider}</div>}
                    {r.detail.responseTime != null && <div><span className="font-semibold">Response time:</span> {r.detail.responseTime}ms</div>}
                    {r.detail.errorBody && (
                      <div className="mt-1 break-all">
                        <span className="font-semibold">Response:</span>{' '}
                        <code className="text-[9px] bg-[var(--hn-error-soft)] px-1 py-0.5 rounded">{r.detail.errorBody}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, department..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm"
          />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {[['all', 'All'], ['with', 'With Memory'], ['without', 'Without']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-2 text-sm transition-colors ${
                filter === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => handleIndex(false)}
          disabled={indexing}
          className="px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          <Brain className="h-4 w-4" />
          {indexing ? 'Indexing...' : `Index${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ' All'}`}
        </button>
        <button
          onClick={() => handleIndex(true)}
          disabled={indexing}
          className="px-3 py-2 text-sm rounded-lg border border-primary text-primary hover:bg-primary/10 disabled:opacity-50 flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" /> Reindex
        </button>
      </div>

      {/* User Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-input"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Messages</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Indexed</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Updated</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredUsers.map((user) => (
              <tr key={user.user_id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.user_id)}
                    onChange={() => toggleSelect(user.user_id)}
                    className="rounded border-input"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{user.name || '—'}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.department || '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{user.totalMessages}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono ${user.indexed_count > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                    {user.indexed_count}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {user.updated_at ? new Date(user.updated_at).toLocaleString() : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {user.hasMemory && (
                      <>
                        <button
                          onClick={() => setExpandedUserId(expandedUserId === user.user_id ? null : user.user_id)}
                          className="p-1.5 rounded hover:bg-primary/10 transition-colors text-primary"
                          title="View memory"
                          aria-label="View memory"
                        >
                          <Brain className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMemory(user.user_id)}
                          className="p-1.5 rounded hover:bg-[var(--hn-error-soft)] transition-colors text-[var(--hn-error)]"
                          title="Reset memory"
                          aria-label="Reset memory"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Expanded Memory View */}
      {expandedUserId && (() => {
        const user = users.find((u) => u.user_id === expandedUserId);
        if (!user) return null;
        return (
          <div className="bg-card border border-primary/40 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">
                Memory: {user.name || user.email}
              </h3>
              <button
                onClick={() => setExpandedUserId(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded-lg p-4 max-h-[400px] overflow-y-auto text-foreground">
              {user.memory || '(empty)'}
            </pre>
            <div className="mt-2 text-xs text-muted-foreground">
              Indexed: {user.indexed_count} messages | Last updated: {user.updated_at ? new Date(user.updated_at).toLocaleString() : 'Never'}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
