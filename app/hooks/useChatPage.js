'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChat } from '@/hooks/useChat';
import { useModelManager, loadRoomModel } from '@/hooks/useModelManager';
import { useChatSender } from '@/hooks/useChatSender';
import { useTranslation } from '@/hooks/useTranslation';
import { detectClientIP } from '@/lib/clientIP';
import { decodeJWTPayload } from '@/lib/jwtUtils';
import { useAlert } from '@/contexts/AlertContext';
import { TokenManager } from '@/lib/tokenManager';
import { logger } from '@/lib/logger';

/**
 * Shared hook encapsulating the common state, effects, and handlers
 * used across chat/page.js, chat1/page.js, chat2/page.js, chat3/page.js.
 *
 * @param {Object} options
 * @param {boolean} [options.enableTranslation=false] - When true, use translated strings for errors/prompts.
 * @param {Function|null} [options.onSettingsLoaded=null] - Callback invoked after admin settings load (receives raw data).
 * @param {Object} [options.extraSenderParams={}] - Extra params forwarded to useChatSender (e.g. drawMode, drawSystemPrompt).
 */
export function useChatPage({
  enableTranslation = false,
  onSettingsLoaded = null,
  extraSenderParams = {},
} = {}) {
  const router = useRouter();
  const { alert } = useAlert();
  // Always call — only use output when enableTranslation is true
  const { t } = useTranslation();

  // ---------- Auth state ----------
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('user');
  const [authChecked, setAuthChecked] = useState(false);

  // ---------- App state ----------
  const [clientIP, setClientIP] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [maxImagesPerMessage, setMaxImagesPerMessage] = useState(5);
  const [imageAnalysisModel, setImageAnalysisModel] = useState('');
  const [imageAnalysisPrompt, setImageAnalysisPrompt] = useState('이 이미지를 설명해줘.');
  const [imageHistoryByRoom, setImageHistoryByRoom] = useState({});
  const [maxUserQuestionLength, setMaxUserQuestionLength] = useState(300000);
  const [profileEditEnabled, setProfileEditEnabled] = useState(false);
  const [boardEnabled, setBoardEnabled] = useState(true);

  // ---------- UI state ----------
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // ---------- Refs ----------
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const lastRestoredRoomRef = useRef(null);

  // ---------- Core hooks ----------
  const {
    rooms,
    currentRoom,
    messages,
    setMessages,
    loading: chatLoading,
    createRoom,
    renameRoom: originalRenameRoom,
    deleteRoom: originalDeleteRoom,
    switchRoom,
    clearSession,
    loadRooms,
  } = useChat();

  // renameRoom wrapper — handles errors via alert modal
  const renameRoom = async (roomId, newName) => {
    try {
      await originalRenameRoom(roomId, newName);
    } catch (error) {
      const title = enableTranslation
        ? t('sidebar.room_rename_failed')
        : '채팅방 이름 변경 실패';
      alert(error.message, 'error', title);
    }
  };

  // deleteRoom wrapper — handles errors via alert modal, silently handles 404
  const deleteRoom = async (roomId) => {
    try {
      return await originalDeleteRoom(roomId);
    } catch (error) {
      const is404Error =
        error?.status === 404 ||
        (typeof error?.message === 'string' &&
          (error.message.includes('404') ||
            error.message.includes('채팅방을 찾을 수 없습니다')));

      if (is404Error) {
        return true;
      }

      const errorType = error.type || 'error';
      const warningTitle = enableTranslation ? t('common.warning') : '경고';
      const errorTitle = enableTranslation ? t('errors.title') : '오류';
      alert(
        error.message,
        errorType,
        errorType === 'warning' ? warningTitle : errorTitle
      );
      return false;
    }
  };

  // ---------- Model manager ----------
  const {
    modelOptions,
    modelConfig,
    selectedModel,
    setSelectedModel,
    setSelectedModelWithRoom,
    restoreRoomModel,
    modelsLoading,
    userDefaultModelId,
    saveUserDefaultModel,
  } = useModelManager(userRole);

  // ---------- Chat sender ----------
  const {
    input,
    setInput,
    loading,
    sendMessage,
    handleKeyDown,
    stopStreaming,
  } = useChatSender({
    currentRoom,
    messages,
    setMessages,
    modelOptions,
    selectedModel,
    modelsLoading,
    clientIP,
    inputRef,
    renameRoom,
    rooms,
    loadRooms,
    selectedImages,
    setSelectedImages,
    imageHistoryByRoom,
    setImageHistoryByRoom,
    imageAnalysisModel,
    imageAnalysisPrompt,
    maxUserQuestionLength,
    ...extraSenderParams,
  });

  // ---------- Effects ----------

  // Auth check — JWT decode, redirect to /login if missing/invalid
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        const loginUrl = await TokenManager.getLoginUrl(window.location.pathname);
        router.replace(loginUrl);
        return;
      }
      try {
        const payload = decodeJWTPayload(token);
        setUserEmail(payload.email || '');
        setUserRole(payload.role || 'user');
        setAuthChecked(true);
      } catch (error) {
        logger.error('토큰 파싱 실패:', error);
        const loginUrl = await TokenManager.getLoginUrl(window.location.pathname);
        router.replace(loginUrl);
      }
    };
    checkAuth();
  }, [router]);

  // Client IP detection
  useEffect(() => {
    detectClientIP()
      .then(setClientIP)
      .catch((err) => logger.error('클라이언트 IP 감지 실패:', err));
  }, []);

  // Admin settings fetch
  useEffect(() => {
    let isMounted = true;
    const defaultPrompt = enableTranslation
      ? t('chat.image_analysis_prompt')
      : '이 이미지를 설명해줘.';
    fetch('/api/admin/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !isMounted) return;
        setMaxImagesPerMessage(data.maxImagesPerMessage || 5);
        setImageAnalysisModel(data.imageAnalysisModel || '');
        setImageAnalysisPrompt(data.imageAnalysisPrompt || defaultPrompt);
        setMaxUserQuestionLength(data.maxUserQuestionLength || 300000);
        setProfileEditEnabled(
          data.profileEditEnabled !== undefined ? data.profileEditEnabled : false
        );
        setBoardEnabled(
          data.boardEnabled !== undefined ? data.boardEnabled : true
        );
        if (onSettingsLoaded) {
          onSettingsLoaded(data);
        }
      })
      .catch((error) => logger.error('설정 로드 실패:', error.message));
    return () => {
      isMounted = false;
    };
  // t and onSettingsLoaded are stable; enableTranslation is a prop-like boolean
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableTranslation]);

  // Room model restoration on room change
  useEffect(() => {
    if (currentRoom && modelOptions.length > 0 && !modelsLoading) {
      if (lastRestoredRoomRef.current === currentRoom) return;
      const savedModel = loadRoomModel(currentRoom);
      if (savedModel && savedModel === selectedModel) {
        lastRestoredRoomRef.current = currentRoom;
        return;
      }
      const availableModelIds = modelOptions.map((m) => m.id);
      restoreRoomModel(currentRoom, availableModelIds);
      lastRestoredRoomRef.current = currentRoom;
    }
  }, [currentRoom, modelOptions, modelsLoading, restoreRoomModel, selectedModel]);

  // Image reset on room change
  useEffect(() => {
    setSelectedImages([]);
    setImageHistoryByRoom({});
  }, [currentRoom]);

  // Input focus when load completes
  useEffect(() => {
    if (!currentRoom) return;
    if (loading || chatLoading || modelsLoading) return;
    inputRef.current?.focus();
  }, [loading, chatLoading, modelsLoading, currentRoom]);

  // Scrollbar visibility check
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const checkScrollbar = () => {
      setShowScrollButtons(container.scrollHeight > container.clientHeight);
    };

    checkScrollbar();
    container.addEventListener('scroll', checkScrollbar, { passive: true });
    window.addEventListener('resize', checkScrollbar);
    return () => {
      container.removeEventListener('scroll', checkScrollbar);
      window.removeEventListener('resize', checkScrollbar);
    };
  }, [messages]);

  // IntersectionObserver for isAtBottom
  useEffect(() => {
    const container = listRef.current || null;
    const target = bottomRef.current;
    if (!target || typeof window === 'undefined') return;

    if (!('IntersectionObserver' in window)) {
      const handleScroll = () => {
        if (!container) return;
        const { scrollTop, scrollHeight, clientHeight } = container;
        setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50);
      };
      container?.addEventListener('scroll', handleScroll, { passive: true });
      return () => container?.removeEventListener('scroll', handleScroll);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsAtBottom(entry.isIntersecting);
      },
      { root: container, rootMargin: '0px 0px 50px 0px', threshold: 0.01 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [messages]);

  // ---------- Handlers ----------

  const handleLogout = async () => {
    clearSession();
    await TokenManager.logout();
  };

  const scrollToBottom = () => {
    const container = listRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      setIsAtBottom(true);
    }
  };

  const scrollToTop = () => {
    const container = listRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return {
    // Auth
    userEmail,
    userRole,
    authChecked,
    // App state
    clientIP,
    selectedImages,
    setSelectedImages,
    maxImagesPerMessage,
    imageAnalysisModel,
    imageAnalysisPrompt,
    imageHistoryByRoom,
    setImageHistoryByRoom,
    maxUserQuestionLength,
    profileEditEnabled,
    boardEnabled,
    // UI state
    showScrollButtons,
    isAtBottom,
    setIsAtBottom,
    // Refs
    bottomRef,
    inputRef,
    listRef,
    lastRestoredRoomRef,
    // useChat
    rooms,
    currentRoom,
    messages,
    setMessages,
    chatLoading,
    createRoom,
    renameRoom,
    deleteRoom,
    switchRoom,
    clearSession,
    loadRooms,
    // useModelManager
    modelOptions,
    modelConfig,
    selectedModel,
    setSelectedModel,
    setSelectedModelWithRoom,
    restoreRoomModel,
    modelsLoading,
    userDefaultModelId,
    saveUserDefaultModel,
    // useChatSender
    input,
    setInput,
    loading,
    sendMessage,
    handleKeyDown,
    stopStreaming,
    // Handlers
    handleLogout,
    scrollToBottom,
    scrollToTop,
  };
}
