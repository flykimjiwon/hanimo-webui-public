'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { X, Mail, MailOpen, Trash2, Clock, User, Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';

export default function DirectMessageModal({ isOpen, onClose, onUnreadCountChange }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { t, lang } = useTranslation();

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/direct-messages?limit=50', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      logger.error('쪽지 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen, fetchMessages]);

  const markAsRead = async (messageId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/direct-messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId ? { ...msg, isRead: true, readAt: new Date().toISOString() } : msg
          )
        );
        onUnreadCountChange?.();
      }
    } catch (error) {
      logger.error('읽음 처리 실패:', error);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      setDeleting(messageId);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/direct-messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
        if (selectedMessage?.id === messageId) {
          setSelectedMessage(null);
        }
        onUnreadCountChange?.();
      }
    } catch (error) {
      logger.error('쪽지 삭제 실패:', error);
    } finally {
      setDeleting(null);
    }
  };

  const handleSelectMessage = (message) => {
    setSelectedMessage(message);
    if (!message.isRead) {
      markAsRead(message.id);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const locale = lang === 'en' ? 'en-US' : 'ko-KR';

    if (diffDays === 0) {
      return date.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Seoul',
      });
    } else if (diffDays < 7) {
      return t('sidebar.days_ago', { days: diffDays });
    } else {
      return date.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        timeZone: 'Asia/Seoul',
      });
    }
  };

  const truncateText = (text, maxLength = 40) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const unreadCount = messages.filter((msg) => !msg.isRead).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-primary/10">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">
              {t('dm.title')}
            </h3>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mb-3 opacity-50" />
              <p>{t('dm.no_messages')}</p>
            </div>
          ) : selectedMessage ? (
            <div className="flex-1 overflow-y-auto p-4">
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-sm text-primary hover:underline mb-4"
              >
                {t('dm.back_to_list')}
              </button>

              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-semibold text-foreground">
                    {selectedMessage.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{selectedMessage.sender?.name || t('dm.sender')}</span>
                    <span>•</span>
                    <Clock className="h-4 w-4" />
                    <span>{formatDate(selectedMessage.createdAt)}</span>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedMessage.content}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={() => deleteMessage(selectedMessage.id)}
                    disabled={deleting === selectedMessage.id}
                  >
                    {deleting === selectedMessage.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-border cursor-pointer transition-colors ${
                    message.isRead
                      ? 'bg-card hover:bg-accent'
                      : 'bg-primary/10 hover:bg-primary/15'
                  }`}
                  onClick={() => handleSelectMessage(message)}
                >
                  <div className="flex-shrink-0 mt-1">
                    {message.isRead ? (
                      <MailOpen className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Mail className="h-5 w-5 text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${
                        message.isRead
                          ? 'font-medium text-foreground'
                          : 'font-bold text-foreground'
                      }`}>
                        {message.title}
                      </p>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDate(message.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {message.sender?.name || t('dm.sender')}
                    </p>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {truncateText(message.content)}
                    </p>
                  </div>

                  <Button
                    variant='ghost'
                    size='icon-xs'
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMessage(message.id);
                    }}
                    disabled={deleting === message.id}
                    title={t('common.delete')}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    {deleting === message.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-muted flex justify-end">
          <Button
            variant='outline'
            size='sm'
            onClick={onClose}
          >
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
