'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TokenManager } from '@/lib/tokenManager';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { useTranslation } from '@/hooks/useTranslation';

const MESSAGE_LIMIT = 20;

const decodeToken = (token) => {
  try {
    return decodeJWTPayload(token);
  } catch (e) {
    return null;
  }
};

// 시간 포맷 함수
const formatTime = (dateString, t, lang) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  // 1분 미만
  if (diff < 60000) {
    return t('chat_widget.just_now');
  }
  // 1시간 미만
  if (diff < 3600000) {
    return t('chat_widget.minutes_ago', { minutes: Math.floor(diff / 60000) });
  }
  // 24시간 미만
  if (diff < 86400000) {
    return t('chat_widget.hours_ago', { hours: Math.floor(diff / 3600000) });
  }
  // 24시간 이상
  const locale = lang === 'en' ? 'en-US' : 'ko-KR';
  return date.toLocaleDateString(locale, { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function ChatWidget() {
  const { t, lang } = useTranslation();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [myId, setMyId] = useState(null);
  const [myEmail, setMyEmail] = useState(null);
  const [myName, setMyName] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [chatWidgetEnabled, setChatWidgetEnabled] = useState(false);
  const [sending, setSending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isTabActive, setIsTabActive] = useState(true);

  const messagesEndRef = useRef(null);
  const messagesRef = useRef([]);

  const POLL_INTERVAL_ACTIVE = 3000;
  const POLL_INTERVAL_INACTIVE = 10000;

  const redirectToLogin = async () => {
    const loginUrl = await TokenManager.getLoginUrl(window.location.pathname);
    window.location.href = loginUrl;
  };

  useEffect(() => {
    setMounted(true);
    const checkAuth = () => {
      const token = localStorage.getItem('token');
      setIsLoggedIn(!!token);
      if (token) {
        const payload = decodeToken(token);
        setMyId(payload?.sub || null);
        setMyEmail(payload?.email || null);
        let storedName = null;
        try {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            storedName = parsedUser?.name || null;
          }
        } catch (error) {
          storedName = null;
        }
        setMyName(payload?.name || storedName || null);
      } else {
        setMyId(null);
        setMyEmail(null);
        setMyName(null);
      }
    };
    checkAuth();
    window.addEventListener('storage', checkAuth);
    window.addEventListener('focus', checkAuth);
    return () => {
      window.removeEventListener('storage', checkAuth);
      window.removeEventListener('focus', checkAuth);
    };
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      setIsTabActive(document.visibilityState === 'visible');
    };
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 채팅 위젯 설정 확인
  useEffect(() => {
    const fetchChatWidgetSettings = async () => {
      try {
        const response = await fetch('/api/public/settings');
        if (response.ok) {
          const data = await response.json();
          setChatWidgetEnabled(
            data.chatWidgetEnabled !== undefined ? data.chatWidgetEnabled : false
          );
        }
      } catch (error) {
        logger.error('채팅 위젯 설정 로드 실패:', error);
        setChatWidgetEnabled(false); // 기본값: 비활성화
      }
    };
    fetchChatWidgetSettings();
  }, []);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // 자동 스크롤 로직
  useEffect(() => {
    if (isOpen && autoScroll) {
      scrollToBottom('auto');
    }
  }, [messages, isOpen, autoScroll]);

  const getOldestMessageDate = () => messages.length > 0 ? messages[0].createdAt : null;

  const fetchLatestMessages = async (options = {}) => {
    const { since } = options;
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const params = new URLSearchParams({ limit: String(MESSAGE_LIMIT) });
      if (since) {
        params.set('since', since);
      }
      const res = await fetch(`/api/webapp-chat?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) {
        logger.warn('토큰 만료 또는 인증 실패 - 자동 로그아웃');
        localStorage.removeItem('token');
        redirectToLogin();
        return;
      }
      if (res.status === 204) {
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (since) {
          if (data.length > 0) {
            setMessages(prev => [...prev, ...data]);
          }
        } else {
          setMessages(data);
          setHasMore(data.length === MESSAGE_LIMIT);
        }
      }
    } catch (error) {
      logger.error('Error fetching latest messages:', error);
    }
  };

  const loadMoreMessages = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    const token = localStorage.getItem('token');
    const oldestDate = getOldestMessageDate();
    if (!token || !oldestDate) {
      setIsLoadingMore(false);
      return;
    }
    try {
      const res = await fetch(`/api/webapp-chat?limit=${MESSAGE_LIMIT}&before=${oldestDate}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401) {
        logger.warn('토큰 만료 또는 인증 실패 - 자동 로그아웃');
        localStorage.removeItem('token');
        redirectToLogin();
        return;
      }
      if (res.ok) {
        const olderMessages = await res.json();
        setMessages(prev => [...olderMessages, ...prev]);
        setHasMore(olderMessages.length === MESSAGE_LIMIT);
      }
    } catch (error) {
      logger.error('Error loading more messages:', error);
    }
    setIsLoadingMore(false);
  };

  useEffect(() => {
    let intervalId;
    if (isOpen && isLoggedIn) {
      const latest = messagesRef.current[messagesRef.current.length - 1]?.createdAt || null;
      fetchLatestMessages(latest ? { since: latest } : {});
      const interval = isTabActive ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_INACTIVE;
      intervalId = setInterval(() => {
        const newest = messagesRef.current[messagesRef.current.length - 1]?.createdAt || null;
        fetchLatestMessages(newest ? { since: newest } : {});
      }, interval);
    } else {
      if (intervalId) clearInterval(intervalId);
    }
    return () => clearInterval(intervalId);
  }, [isOpen, isLoggedIn, isTabActive]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (newMessage.trim() === '' || sending) return;
    
    const messageText = newMessage.trim();
    const token = localStorage.getItem('token');
    
    if (!token) {
      logger.warn('토큰이 없습니다.');
      return;
    }
    
    setSending(true);
    
    // 낙관적 업데이트: 즉시 UI에 메시지 추가
    const optimisticMessage = {
      _id: `temp-${Date.now()}`,
      userId: myId,
      email: myEmail,
      name: myName || myEmail?.split('@')[0] || t('chat_widget.me'),
      text: messageText,
      roomId: 'general',
      createdAt: new Date().toISOString(),
      isOptimistic: true,
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');
    
    // 즉시 스크롤
    setTimeout(() => scrollToBottom('smooth'), 50);
    
    try {
      const res = await fetch('/api/webapp-chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ text: messageText, roomId: 'general' }),
      });
      
      if (res.status === 401) {
        logger.warn('토큰 만료 또는 인증 실패 - 자동 로그아웃');
        localStorage.removeItem('token');
        redirectToLogin();
        return;
      }
      
      if (res.ok) {
        // 서버에서 최신 메시지를 가져와서 낙관적 메시지를 실제 메시지로 교체
        await fetchLatestMessages();
        setTimeout(() => scrollToBottom('smooth'), 100);
      } else {
        // 전송 실패 시 낙관적 메시지 제거
        setMessages(prev => prev.filter(msg => msg._id !== optimisticMessage._id));
        logger.error('메시지 전송 실패:', res.statusText);
        alert(t('chat_widget.send_failed'));
      }
    } catch (error) {
      // 에러 발생 시 낙관적 메시지 제거
      setMessages(prev => prev.filter(msg => msg._id !== optimisticMessage._id));
      logger.error('Error sending message:', error);
      alert(t('chat_widget.send_error'));
    } finally {
      setSending(false);
    }
  };

  const showChatWidget = isLoggedIn && chatWidgetEnabled;

  if (!mounted) {
    return null;
  }

  return (
    <>
      {showChatWidget && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-4">
          {isOpen && (
            <Card className="w-80 h-[768px] py-0 gap-0 overflow-hidden shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between bg-primary text-primary-foreground p-3 rounded-t-xl gap-2">
                <CardTitle className="text-lg text-primary-foreground">{t('chat_widget.title')}</CardTitle>
                <label className="flex items-center text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="mr-1 h-4 w-4 rounded accent-primary"
                  />
                  {t('chat_widget.auto_scroll')}
                </label>
              </CardHeader>
              <CardContent className="flex-1 p-4 overflow-y-auto bg-muted space-y-4">
                {hasMore && (
                  <div className="text-center">
                    <Button variant="link" onClick={loadMoreMessages} disabled={isLoadingMore} className="text-sm">
                      {isLoadingMore ? t('common.loading') : t('chat_widget.load_older')}
                    </Button>
                  </div>
                )}
                {messages.map((msg) => {
                  const isMyMessage = msg.userId === myId;
                  const displayName =
                    msg.name ||
                    (isMyMessage ? myName : null) ||
                    msg.email?.split('@')[0] ||
                    t('chat_widget.anonymous_user');
                  const isOptimistic = msg.isOptimistic || false;
                  
                  return (
                    <div key={msg._id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} ${isOptimistic ? 'opacity-60' : ''}`}>
                      <div className={`max-w-[85%] flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-baseline gap-2 mb-1 ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                          <p className={`text-xs font-medium ${isMyMessage ? 'text-primary' : 'text-muted-foreground'}`}>
                            {displayName}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(msg.createdAt, t, lang)}
                          </span>
                        </div>
                        <div className={`px-4 py-2 rounded-lg inline-block break-words ${isMyMessage ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </CardContent>
              <form onSubmit={handleSendMessage} className="p-2 border-t border-border flex items-center bg-background">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !sending) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder={sending ? t('chat_widget.sending') : t('chat_widget.input_placeholder')}
                  className={`flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground bg-background ${sending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={sending}
                  autoComplete="off"
                />
                <Button 
                  type="submit" 
                  size="icon"
                  className="ml-2 rounded-full"
                  disabled={sending}
                  title={t('chat_widget.send_button_title')}
                >
                  <Send size={18} className={sending ? 'animate-pulse' : ''} />
                </Button>
              </form>
            </Card>
          )}
          <Button 
            onClick={() => setIsOpen(!isOpen)} 
            size="icon"
            className="mt-4 ml-auto size-16 rounded-full shadow-lg"
            aria-label={isOpen ? t('chat_widget.close_chat') : t('chat_widget.open_chat')}
          >
            {isOpen ? <X size={30} /> : <MessageCircle size={30} />}
          </Button>
        </div>
      )}
    </>
  );
}
