import logger from '@/lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react';
import { TokenManager } from '@/lib/tokenManager';
import { useTranslation } from '@/hooks/useTranslation';

export const useChat = () => {
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const createRoomRef = useRef(null);
  const { t } = useTranslation();

  // API 헬퍼 함수 - useCallback으로 메모이제이션하여 불필요한 재생성 방지
  const apiCall = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        if (text) {
          try {
            errorData = JSON.parse(text);
          } catch (parseError) {
            logger.error('JSON 파싱 오류:', parseError);
            errorData = { error: text };
          }
        } else {
          errorData = {};
        }
      } catch (e) {
        logger.error('JSON 파싱 오류:', e);
        errorData = { error: t('chat_hook.http_server_error', { status: response.status }) };
      }

      // 401 인증 에러 또는 403에서 shouldLogout 플래그가 있는 경우 자동 로그아웃
      if (response.status === 401 || (response.status === 403 && errorData.shouldLogout)) {
        logger.warn('토큰 만료 또는 인증 실패 - 자동 로그아웃');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // alert는 컴포넌트에서 처리하도록 에러로 전달
        const authError = new Error(errorData.message || t('chat_hook.auth_expired'));
        authError.isAuthError = true;
        throw authError;
      }

      // 상태 코드를 오류 메시지에 포함
      const errorMessage = errorData.error || errorData.message || t('errors.http_error', { status: response.status });
      const error = new Error(errorMessage);
      error.status = response.status;
      error.errorData = errorData; // 원본 에러 데이터도 포함
      throw error;
    }

    try {
      return await response.json();
    } catch (e) {
      logger.error('JSON 응답 파싱 오류:', e);
      return {};
    }
  }, [t]);

  const redirectToLogin = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const loginUrl = await TokenManager.getLoginUrl(window.location.pathname);
    window.location.href = loginUrl;
  }, []);

  // 채팅방 목록 로드 (DB 중심 - 세션 사용 안함)
  const loadRooms = useCallback(async (skipLoading = false) => {
    try {
      if (!skipLoading) {
        setLoading(true);
      }
      const data = await apiCall('/api/webapp-chat/room');
      setRooms(data.rooms || []);

      // 첫 번째 방 자동 선택 (메모리만 사용)
      // skipLoading이 true인 경우에는 현재 방을 유지 (방 이름 변경 시)
      if (!skipLoading && data.rooms?.length > 0) {
        setCurrentRoom(data.rooms[0]._id);
      } else if (data.rooms?.length === 0) {
        // DB에 방이 없으면 기본 방 생성
        if (createRoomRef.current) {
          await createRoomRef.current('New Chat');
        }
      }
    } catch (error) {
      logger.error('채팅방 로드 실패:', error);
      
      // 인증 오류인 경우 로그인 페이지로 리다이렉트
      if (error.isAuthError) {
        // 브라우저 환경에서만 리다이렉트
        if (typeof window !== 'undefined') {
          // 약간의 지연을 두어 사용자가 메시지를 볼 수 있도록 함
          setTimeout(() => {
            redirectToLogin();
          }, 100);
        }
        return; // 인증 오류 시 더 이상 진행하지 않음
      }
      
      // DB 실패 시 기본 방 생성 시도
      if (!skipLoading) {
        try {
          if (createRoomRef.current) {
            await createRoomRef.current('New Chat');
          }
        } catch (createError) {
          logger.error('기본 방 생성도 실패:', createError);
          // 완전히 실패한 경우 빈 상태로 둘기
          setRooms([]);
          setCurrentRoom(null);
        }
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  }, [apiCall, redirectToLogin]);

  // 새 채팅방 생성 (DB 전용)
  const createRoom = useCallback(async (name = 'New Chat') => {
    try {
      const data = await apiCall('/api/webapp-chat/room', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      const newRoom = data.room;
      
      // DB에서 전체 방 목록 재로드
      await loadRooms(true);
      
      // 새로 생성된 방으로 이동
      setCurrentRoom(newRoom._id);
      setMessages([]);

      return newRoom;
    } catch (error) {
      logger.error('채팅방 생성 실패:', error);
      
      // 인증 오류인 경우 로그인 페이지로 리다이렉트
      if (error.isAuthError && typeof window !== 'undefined') {
        setTimeout(() => {
          redirectToLogin();
        }, 100);
        return; // 인증 오류 시 더 이상 진행하지 않음
      }
      
      throw error;
    }
  }, [apiCall, loadRooms, redirectToLogin]);

  // createRoom 참조 업데이트
  useEffect(() => {
    createRoomRef.current = createRoom;
  }, [createRoom]);

  // 채팅 히스토리 로드 (DB 전용)
  const loadChatHistory = useCallback(async (roomId) => {
    if (!roomId) return;

    try {
      setLoading(true);
      
      // DB에서 히스토리 로드
      const data = await apiCall(`/api/webapp-chat/history/${roomId}`);
      if (data.history) {
        // DB 데이터를 프론트엔드 형식으로 변환
        const formattedMessages = data.history.map(msg => ({
          _id: msg._id,
          role: msg.role,
          text: msg.text,
          model: msg.model,
          timestamp: msg.createdAt,
          feedback: msg.feedback || null,
          roomId: msg.roomId || roomId, // roomId 포함 (API 응답에 없으면 파라미터 사용)
          ...(msg.drawMode && { drawMode: true }),
        }));
        
        setMessages(formattedMessages);

        // 히스토리에서 마지막 assistant 메시지의 모델을 찾아서 저장
        const lastAssistantMessage = formattedMessages
          .filter(msg => msg.role === 'assistant' && msg.model)
          .pop();
        
        if (lastAssistantMessage && lastAssistantMessage.model) {
          try {
            const roomModels = JSON.parse(localStorage.getItem('roomModels') || '{}');
            roomModels[roomId] = lastAssistantMessage.model;
            localStorage.setItem('roomModels', JSON.stringify(roomModels));
          } catch (error) {
            logger.error('방별 모델 저장 실패:', error);
          }
        }
      } else {
        setMessages([]);
      }
    } catch (error) {
      // 인증 오류인 경우 로그인 페이지로 리다이렉트
      if (error.isAuthError && typeof window !== 'undefined') {
        setTimeout(() => {
          redirectToLogin();
        }, 100);
        return; // 인증 오류 시 더 이상 진행하지 않음
      }
      
      // 404 오류는 심각한 오류가 아닌, 빈 히스토리로 간주합니다.
      if (!error.message.includes('404')) {
        logger.error('채팅 히스토리 로드 실패:', error);
      }
      setMessages([]); // 다른 종류의 오류 발생 시에도 메시지 목록을 비웁니다.
    } finally {
      setLoading(false);
    }
  }, [apiCall, redirectToLogin]);

  // 채팅방 이름 변경 (DB 중심)
  const renameRoom = useCallback(async (roomId, newName) => {
    try {
      await apiCall(`/api/webapp-chat/room/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName }),
      });

      // DB 업데이트 후 목록 재로드
      const data = await apiCall('/api/webapp-chat/room');
      setRooms(data.rooms || []);
    } catch (error) {
      logger.error('채팅방 이름 변경 실패:', error);
      
      // 인증 오류인 경우 로그인 페이지로 리다이렉트
      if (error.isAuthError && typeof window !== 'undefined') {
        setTimeout(() => {
          redirectToLogin();
        }, 100);
        return; // 인증 오류 시 더 이상 진행하지 않음
      }
      
      // 에러를 throw하여 컴포넌트에서 처리하도록 함
      throw new Error(t('chat_hook.rename_room_failed', { message: error.message }));
    }
  }, [apiCall, redirectToLogin, t]);

  // 채팅방 삭제 (DB 중심)
  const deleteRoom = useCallback(async (roomId) => {
    if (rooms.length <= 1) {
      const error = new Error(t('chat_hook.min_room_required'));
      error.type = 'warning';
      throw error;
    }

    // 기본 유효성 검사
    if (!roomId) {
      logger.error('삭제할 방 ID가 비어있음');
      const error = new Error(t('chat_hook.select_room_to_delete'));
      error.type = 'warning';
      throw error;
    }

    try {
      // DB에서 삭제
      await apiCall(`/api/webapp-chat/room/${roomId}`, {
        method: 'DELETE',
      });
      
      // 삭제 후 전체 목록 재로드
      const data = await apiCall('/api/webapp-chat/room');
      setRooms(data.rooms || []);
      
      // 현재 방이 삭제된 경우 다른 방으로 이동
      if (currentRoom === roomId) {
        if (data.rooms && data.rooms.length > 0) {
          const nextRoom = data.rooms[0];
          setCurrentRoom(nextRoom._id);
          await loadChatHistory(nextRoom._id);
        } else {
          // 모든 방이 삭제된 경우 새 방 생성
          await createRoom('New Chat');
        }
      }
      
      return true; // 성공
    } catch (error) {
      // 에러 정보를 더 명확하게 로깅
      const errorInfo = {
        message: error?.message || '알 수 없는 오류',
        status: error?.status || 'N/A',
        name: error?.name || 'Error',
        stack: error?.stack || '스택 정보 없음',
        isAuthError: error?.isAuthError || false,
        type: error?.type || 'error',
        fullError: error
      };
      
      logger.error('채팅방 삭제 실패:', errorInfo);
      
      // 인증 오류인 경우 로그인 페이지로 리다이렉트
      if (error?.isAuthError && typeof window !== 'undefined') {
        setTimeout(() => {
          redirectToLogin();
        }, 100);
        return false; // 인증 오류 시 실패로 처리
      }
      
      // 404 오류인 경우, 이미 삭제된 방일 수 있으므로 목록만 새로고침
      // 오류 메시지에 "채팅방을 찾을 수 없습니다"가 포함되어 있으면 404로 처리
      const is404Error = 
        error?.status === 404 || 
        (typeof error?.errorData?.error === 'string' && error.errorData.error.includes('채팅방을 찾을 수 없습니다')) ||
        (typeof error?.message === 'string' && (error.message.includes('404') || error.message.includes('채팅방을 찾을 수 없습니다')));
      
      if (is404Error) {
        logger.info('404 에러 감지 - 이미 삭제된 방으로 간주하고 목록 새로고침');
        try {
          // 목록 새로고침
          const data = await apiCall('/api/webapp-chat/room');
          setRooms(data.rooms || []);
          
          // 현재 방이 삭제된 경우 다른 방으로 이동
          if (currentRoom === roomId) {
            if (data.rooms && data.rooms.length > 0) {
              const nextRoom = data.rooms[0];
              setCurrentRoom(nextRoom._id);
              await loadChatHistory(nextRoom._id);
            } else {
              // 모든 방이 삭제된 경우 새 방 생성
              await createRoom('New Chat');
            }
          }
          
          // 이미 삭제된 방이므로 성공으로 간주 (사용자에게 알림하지 않음)
          return true;
        } catch (refreshError) {
          logger.error('목록 새로고침 실패:', refreshError);
          // 목록 새로고침 실패 시에도 조용히 처리
          return true; // 이미 삭제된 방이므로 성공으로 간주
        }
      }
      
      // 사용자에게 상세 오류 정보 제공
      const errorStatus = error?.status;
      const errorMsg = error?.message || t('chat_hook.unknown_error');
      let errorMessage;
      
      if (errorStatus === 400 || errorMsg.includes('400')) {
        errorMessage = t('chat_hook.delete_room_failed_reason', { reason: t('chat_hook.invalid_room_id') });
      } else if (errorStatus === 500 || errorMsg.includes('500')) {
        errorMessage = t('chat_hook.delete_room_failed_reason', { reason: t('chat_hook.server_error_occurred') });
      } else {
        errorMessage = t('chat_hook.delete_room_failed_reason', { reason: errorMsg });
      }
      
      // 에러를 throw하여 컴포넌트에서 처리하도록 함
      const deleteError = new Error(errorMessage);
      deleteError.type = 'error';
      throw deleteError;
    }
  }, [apiCall, rooms, currentRoom, loadChatHistory, createRoom, redirectToLogin, t]);

  // 메시지 추가 (DB 전용)
  const addMessage = useCallback(async (role, text, model = null) => {
    if (!currentRoom) {
      logger.error('메시지 저장 실패: currentRoom이 설정되지 않음');
      return;
    }

    try {
      // DB에 저장
      await apiCall(`/api/webapp-chat/history/${currentRoom}`, {
        method: 'POST',
        body: JSON.stringify({ role, text, model }),
      });
    } catch (error) {
      logger.error('메시지 DB 저장 실패:', error);
      
      // 인증 오류인 경우 로그인 페이지로 리다이렉트
      if (error.isAuthError && typeof window !== 'undefined') {
        setTimeout(() => {
          redirectToLogin();
        }, 100);
        return; // 인증 오류 시 더 이상 진행하지 않음
      }
      
      throw error;
    }
  }, [apiCall, currentRoom, redirectToLogin]);

  // 방 전환 (메모리만 사용)
  const switchRoom = useCallback((roomId) => {
    setCurrentRoom(roomId);
    loadChatHistory(roomId);
  }, [loadChatHistory]);

  // 세션 클리어 (로그아웃 시)
  const clearSession = useCallback(() => {
    // 상태 초기화 (메모리만)
    setRooms([]);
    setCurrentRoom(null);
    setMessages([]);
  }, []);

  // 초기 로드
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // 현재 방 변경 시 히스토리 로드
  useEffect(() => {
    if (currentRoom) {
      loadChatHistory(currentRoom);
    }
  }, [currentRoom, loadChatHistory]);

  return {
    rooms,
    currentRoom,
    messages,
    setMessages,
    loading,
    createRoom,
    renameRoom,
    deleteRoom,
    switchRoom,
    addMessage,
    clearSession,
    loadRooms,
    loadChatHistory
  };
};
