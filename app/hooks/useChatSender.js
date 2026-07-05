'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { sendChatMessage, saveMessageToHistory } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

// 사용자 질문 길이 검증
const DEFAULT_MAX_USER_QUESTION_LENGTH = 300000;
function validateUserQuestion(
  userPrompt,
  maxLength = DEFAULT_MAX_USER_QUESTION_LENGTH,
  t
) {
  if (!userPrompt || typeof userPrompt !== 'string') {
    return {
      valid: false,
      error: t('chat_sender.enter_question'),
    };
  }

  if (userPrompt.length > maxLength) {
    return {
      valid: false,
      error: t('chat_sender.question_too_long', { maxLength: maxLength.toLocaleString(), currentLength: userPrompt.length.toLocaleString() }),
    };
  }
  return { valid: true };
}

function coerceDeltaText(delta) {
  if (!delta) return '';
  if (typeof delta === 'string') return delta;
  if (Array.isArray(delta)) {
    return delta
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        return item.text || '';
      })
      .join('');
  }
  if (typeof delta === 'object') {
    return delta.text || '';
  }
  return '';
}

function extractStreamDelta(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const choiceDelta = parsed.choices?.[0]?.delta?.content;
  if (choiceDelta) return choiceDelta;
  const choiceText = parsed.choices?.[0]?.text;
  if (choiceText) return choiceText;
  if (parsed.type === 'response.output_text.delta') {
    return coerceDeltaText(parsed.delta);
  }
  if (parsed.type === 'response.output_text.done') {
    return coerceDeltaText(parsed.text || parsed.delta);
  }
  if (parsed.output_text?.delta) {
    return coerceDeltaText(parsed.output_text.delta);
  }
  return '';
}

function toUserFriendlyError(message = '', t) {
  const lower = message.toLowerCase();
  if (lower.includes('insufficient_quota') || lower.includes('exceeded your current quota')) {
    return t('chat_sender.quota_exceeded');
  }
  if (lower.includes('rate_limit') || lower.includes('too many requests') || lower.includes('http 429')) {
    return t('chat_sender.rate_limited');
  }
  return message || t('chat_sender.temporary_error');
}

async function consumeStreamResponse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulatedText = '';
  const contentType = res.headers.get('content-type') || '';
  const isSSE = contentType.includes('text/event-stream');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      if (isSSE) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            break;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = extractStreamDelta(parsed);
            if (delta) {
              accumulatedText += delta;
            }
          } catch (e) {
            continue;
          }
        }
      } else {
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (error) {
          continue;
        }
        if (parsed.response !== undefined) {
          accumulatedText += parsed.response;
        }
      }
    }
  }

  if (buffer.trim()) {
    if (isSSE) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            const delta = extractStreamDelta(parsed);
            if (delta) {
              accumulatedText += delta;
            }
          } catch (_) {
            logger.warn('[Catch] 작업 실패:', _.message);
          }
        }
      }
    } else {
      try {
        const last = JSON.parse(buffer);
        if (last.response) {
          accumulatedText += last.response;
        }
      } catch (_) {
        logger.warn('[Catch] 작업 실패:', _.message);
      }
    }
  }

  return accumulatedText;
}

export function useChatSender({
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
  selectedImages = [],
  setSelectedImages,
  imageHistoryByRoom = {},
  setImageHistoryByRoom,
  imageAnalysisModel = '',
  imageAnalysisPrompt = '',
  maxUserQuestionLength = DEFAULT_MAX_USER_QUESTION_LENGTH,
  customInstruction = '',
  customInstructionActive = false,
  userMemory = '',
  drawMode = false,
  drawSystemPrompt = '',
    ghostMode = false,
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const abortControllerRef = useRef(null);
  const lastSubmitTime = useRef(0);
  const assistantIdxRef = useRef(null);
  const isFirstMessageRef = useRef(false);
  const firstUserMessageRef = useRef('');
  const messagesRef = useRef(messages); // 최신 messages 값을 저장하는 ref
  const roomNameGeneratedRef = useRef(new Set()); // 방 이름이 생성된 roomId 추적
  const roomsRef = useRef(rooms);
  const loadRoomsRef = useRef(loadRooms);
  const modelOptionsRef = useRef(modelOptions);
  const selectedImagesRef = useRef(selectedImages);
  const imageHistoryByRoomRef = useRef(imageHistoryByRoom);
  const selectedModelRef = useRef(selectedModel);
  const imageAnalysisModelRef = useRef(imageAnalysisModel);
  const imageAnalysisPromptRef = useRef(imageAnalysisPrompt);
  const maxUserQuestionLengthRef = useRef(maxUserQuestionLength);
  const customInstructionRef = useRef(customInstruction);
  const customInstructionActiveRef = useRef(customInstructionActive);
  const userMemoryRef = useRef(userMemory);
  const drawModeRef = useRef(drawMode);
  const drawSystemPromptRef = useRef(drawSystemPrompt);

  // 방이 변경될 때 첫 메시지 플래그 리셋
  useEffect(() => {
    isFirstMessageRef.current = false;
    firstUserMessageRef.current = '';
    // roomNameGeneratedRef는 유지 (같은 방에서 다시 들어와도 방 이름이 이미 생성되었으면 재생성하지 않음)
  }, [currentRoom]);

  // messages가 변경될 때마다 ref 업데이트
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => { roomsRef.current = rooms; }, [rooms]);
  useEffect(() => { loadRoomsRef.current = loadRooms; }, [loadRooms]);
  useEffect(() => { modelOptionsRef.current = modelOptions; }, [modelOptions]);
  useEffect(() => { selectedImagesRef.current = selectedImages; }, [selectedImages]);
  useEffect(() => { imageHistoryByRoomRef.current = imageHistoryByRoom; }, [imageHistoryByRoom]);
  useEffect(() => { selectedModelRef.current = selectedModel; }, [selectedModel]);
  useEffect(() => { imageAnalysisModelRef.current = imageAnalysisModel; }, [imageAnalysisModel]);
  useEffect(() => { imageAnalysisPromptRef.current = imageAnalysisPrompt; }, [imageAnalysisPrompt]);
  useEffect(() => { maxUserQuestionLengthRef.current = maxUserQuestionLength; }, [maxUserQuestionLength]);
  useEffect(() => { customInstructionRef.current = customInstruction; }, [customInstruction]);
  useEffect(() => { customInstructionActiveRef.current = customInstructionActive; }, [customInstructionActive]);
  useEffect(() => { userMemoryRef.current = userMemory; }, [userMemory]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { drawSystemPromptRef.current = drawSystemPrompt; }, [drawSystemPrompt]);
  const ghostModeRef = useRef(ghostMode);
  useEffect(() => { ghostModeRef.current = ghostMode; }, [ghostMode]);

  const performAPICall = useCallback(
    async (
      currentSelectedModel,
      userQuestion,
      currentMessagesForHistory,
      userImages = [],
      questionOverride = ''
    ) => {
      if (abortControllerRef.current) return;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      let accumulatedText = '';

      const currentModelOptions = modelOptionsRef.current;

      logger.info('[performAPICall] 전달받은 모델 UUID:', currentSelectedModel);
      logger.info(
        '[performAPICall] 사용 가능한 모델 옵션:',
        currentModelOptions.map((m) => ({
          id: m.id,
          modelName: m.modelName,
          label: m.label,
        }))
      );

      const selectedModelInfo = currentModelOptions.find(
        (model) => model.id === currentSelectedModel
      );

      logger.info('[performAPICall] 찾은 모델 정보:', selectedModelInfo);

      const apiEndpoint = '/api/webapp-generate';

      // 모델명 또는 UUID 전송
      const model = selectedModelInfo?.modelName || currentSelectedModel;

      logger.info(
        '[performAPICall] 전송할 모델:',
        model,
        '(UUID:',
        currentSelectedModel,
        ')'
      );

      // 전달받은 메시지 히스토리 사용
      const currentMessages = currentMessagesForHistory || [];
      const questionForPayload = questionOverride || userQuestion;
      const activeCustomInstruction = customInstructionActiveRef.current
        ? customInstructionRef.current
        : '';
      const isDrawMode = drawModeRef.current;
      const activeDrawPrompt = isDrawMode ? drawSystemPromptRef.current : '';
      const activeMemory = userMemoryRef.current ? `[User Memory]\n${userMemoryRef.current}` : '';
      const combinedInstruction = [activeMemory, activeCustomInstruction, activeDrawPrompt]
        .filter(Boolean)
        .join('\n\n');
      const payload = {
        model: model, // RAG는 UUID, 일반 모델은 model_name 전송
        question: questionForPayload,
        prompt: questionForPayload, // 서버에서는 question을 우선 사용
        multiturnHistory: currentMessages,
        images: userImages,
        stream: true,
        options: { temperature: 0.7, max_length: 500 },
        roomId: currentRoom,
        clientIP: clientIP,
        customInstruction: combinedInstruction,
        drawMode: isDrawMode,
      };

      try {
        const extraHeaders = {};
        if (ghostModeRef.current) {
          extraHeaders['X-Ghost-Mode'] = 'true';
        }
        const res = await sendChatMessage(
          apiEndpoint,
          payload,
          controller.signal,
          extraHeaders
        );
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        const contentType = res.headers.get('content-type') || '';
        const isSSE = contentType.includes('text/event-stream');

        let streamErrorMessage = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            if (isSSE) {
              // SSE 형식 처리: data: {...} 또는 data: [DONE]
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  break;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed?.error) {
                    streamErrorMessage = toUserFriendlyError(
                      parsed.error?.message || t('chat_sender.request_failed'),
                      t
                    );
                    break;
                  }
                  const delta = extractStreamDelta(parsed);
                  if (delta) {
                    accumulatedText += delta;
                    setMessages((prev) => {
                      const copy = [...prev];
                      const idx = assistantIdxRef.current;
                      if (copy[idx]) {
                        copy[idx] = {
                          ...copy[idx],
                          text: accumulatedText,
                          isTyping: false,
                        };
                      } else {
                        copy.push({
                          role: 'assistant',
                          text: accumulatedText,
                          model: currentSelectedModel,
                          timestamp: new Date().toISOString(),
                          isTyping: false,
                          roomId: currentRoom,
                        });
                      }
                      return copy;
                    });
                  }
                } catch (e) {
                  // JSON 파싱 실패는 무시
                  continue;
                }
              }
            } else {
              // JSONL 형식 처리: {response: "..."}
              let parsed;
              try {
                parsed = JSON.parse(line);
              } catch (error) {
    logger.warn('[Loop] 항목 처리 실패 (건너뜀):', error.message);
    continue;
  }
              if (parsed.response !== undefined) {
                accumulatedText += parsed.response;
                setMessages((prev) => {
                  const copy = [...prev];
                  const idx = assistantIdxRef.current;
                  if (copy[idx]) {
                    copy[idx] = {
                      ...copy[idx],
                      text: accumulatedText,
                      isTyping: false,
                    };
                  } else {
                    copy.push({
                      role: 'assistant',
                      text: accumulatedText,
                      model: currentSelectedModel,
                      timestamp: new Date().toISOString(),
                      isTyping: false,
                      roomId: currentRoom,
                    });
                  }
                  return copy;
                });
              }
            }
            if (streamErrorMessage) break;
          }
          if (streamErrorMessage) break;
        }

        // 남은 버퍼 처리
        if (buffer.trim() && !streamErrorMessage) {
          if (isSSE) {
            if (buffer.startsWith('data: ')) {
              const data = buffer.slice(6).trim();
              if (data !== '[DONE]') {
                try {
                  const parsed = JSON.parse(data);
                    const delta = extractStreamDelta(parsed);
                    if (delta) {
                      accumulatedText += delta;
                    }
                  } catch (_) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn('[Catch] 작업 실패:', _.message);
  }
              }
            }
          } else {
            try {
              const last = JSON.parse(buffer);
              if (last.response) {
                accumulatedText += last.response;
              }
            } catch (_) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn('[Catch] 작업 실패:', _.message);
            }
          }
        }

        if (streamErrorMessage) {
          const errorText = t('chat_sender.request_notice', { message: streamErrorMessage });
          setMessages((prev) => {
            const copy = [...prev];
            const idx = assistantIdxRef.current;
            if (copy[idx]) {
              copy[idx] = {
                ...copy[idx],
                text: errorText,
                isTyping: false,
              };
            }
            return copy;
          });
          try {
            await saveMessageToHistory(currentRoom, {
              role: 'assistant',
              text: errorText,
              model: currentSelectedModel,
            });
          } catch (saveError) {
            logger.warn('에러 메시지 저장 실패:', saveError);
          }
        } else if (accumulatedText.trim()) {
          // Assistant 메시지 저장 (모델 정보 포함)
          const messagePayload = {
            role: 'assistant',
            text: accumulatedText,
            model: currentSelectedModel, // 모델 UUID
            ...(isDrawMode && { drawMode: true }),
          };

          logger.info(
            '[performAPICall] Assistant 메시지 DB 저장 모델:',
            currentSelectedModel
          );

          let savedMessage = null;
          try {
            savedMessage = await saveMessageToHistory(
              currentRoom,
              messagePayload
            );
          } catch (saveError) {
            logger.error('메시지 저장 실패:', {
              error: saveError.message,
              roomId: currentRoom,
              role: 'assistant',
            });
            // 저장 실패 시에도 피드백 버튼이 영구 비활성화되지 않도록 임시 처리
            // 실제 피드백은 저장되지 않지만 UI는 정상 작동
            logger.warn(
              '⚠️ 메시지가 DB에 저장되지 않았습니다. 피드백 기능이 제한될 수 있습니다.'
            );
          }

          // 저장된 메시지의 _id를 메시지에 추가하고 방 이름 생성 로직 실행
          setMessages((prev) => {
            const copy = [...prev];
            const idx = assistantIdxRef.current;
            if (copy[idx]) {
              // createSuccessResponse는 { success: true, data: {...} } 형태로 반환
              const messageId =
                savedMessage?.data?.message?._id || savedMessage?.message?._id;

              if (messageId) {
                // 정상 저장된 경우
                copy[idx] = {
                  ...copy[idx],
                  _id: messageId,
                  feedback: null,
                };
              } else {
                // 저장 실패한 경우 - 임시 ID 설정하여 피드백 버튼이 계속 disabled로 남지 않도록 함
                // 단, 'temp-' 접두사로 실제 DB ID가 아님을 표시
                logger.warn(
                  '⚠️ 메시지 ID를 찾을 수 없습니다. 응답 구조:',
                  savedMessage
                );
                copy[idx] = {
                  ...copy[idx],
                  _id: `temp-${Date.now()}-${Math.random()
                    .toString(36)
                    .substr(2, 9)}`,
                  feedback: null,
                  _saveError: true, // 저장 실패 플래그
                };
              }
            }

            // assistant 응답 완료 후 방 이름 생성 (비동기 처리, 블로킹하지 않음)
            // setMessages 콜백 내부에서 직접 메시지 확인
            (async () => {
              try {
                // 이미 이 방의 이름이 생성되었는지 확인
                if (roomNameGeneratedRef.current.has(currentRoom)) {
                  logger.info('방 이름 생성 스킵: 이미 생성됨', {
                    currentRoom,
                  });
                  return;
                }

                // setMessages의 콜백 내부에서 직접 메시지 확인 (최신 상태 보장)
                const currentRoomMessages = copy.filter((m) => {
                  // isTyping이 false인 메시지만
                  if (m.isTyping) return false;

                  // roomId가 있으면 현재 방과 일치하는지 확인
                  if (m.roomId) {
                    return m.roomId === currentRoom;
                  }

                  // roomId가 없는 메시지는 제외 (정확한 방 구분을 위해)
                  return false;
                });

                logger.info('방 이름 생성 체크:', {
                  currentRoom,
                  totalMessages: copy.length,
                  currentRoomMessages: currentRoomMessages.length,
                  messages: currentRoomMessages.map((m) => ({
                    role: m.role,
                    hasText: !!m.text,
                    textLength: m.text?.length || 0,
                    roomId: m.roomId,
                  })),
                });

                const userMessages = currentRoomMessages.filter(
                  (m) => m.role === 'user'
                );
                const assistantMessages = currentRoomMessages.filter(
                  (m) =>
                    m.role === 'assistant' && m.text && m.text.trim().length > 0
                );

                const isFirstMessage =
                  userMessages.length === 1 && assistantMessages.length === 1;

                if (!isFirstMessage) {
                  logger.info('방 이름 생성 스킵: 첫 메시지가 아님', {
                    userCount: userMessages.length,
                    assistantCount: assistantMessages.length,
                    currentRoom,
                    totalMessages: currentRoomMessages.length,
                  });
                  return;
                }

                const token = localStorage.getItem('token');
                if (!token) {
                  logger.warn('방 이름 생성 스킵: 토큰 없음');
                  return;
                }

                let currentRoomData = null;

                try {
                  const roomsResponse = await fetch('/api/webapp-chat/room', {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  });
                  if (roomsResponse.ok) {
                    const roomsData = await roomsResponse.json();
                    currentRoomData = roomsData.rooms?.find(
                      (r) => r._id === currentRoom
                    );
                  }
                } catch (e) {
                  logger.warn('방 목록 조회 실패, 클로저 값 사용:', e);
                  currentRoomData = roomsRef.current?.find((r) => r._id === currentRoom);
                }

                logger.info('방 이름 생성 시도:', {
                  currentRoom,
                  roomName: currentRoomData?.name,
                  isNewChat: currentRoomData?.name === 'New Chat',
                });

                if (currentRoomData && currentRoomData.name === 'New Chat') {
                  // 방 이름 생성 API 호출 (assistant 응답 완료 후 비동기로 실행)
                  logger.info('방 이름 생성 API 호출 시작:', {
                    roomId: currentRoom,
                    userMessageLength: userQuestion.length,
                    assistantMessageLength: accumulatedText.length,
                  });

                  const response = await fetch(
                    '/api/webapp-chat/generate-room-name',
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        roomId: currentRoom,
                        userMessage: userQuestion,
                        assistantMessage: accumulatedText,
                      }),
                    }
                  );

                  logger.info('방 이름 생성 API 응답 상태:', response.status);

                  if (response.ok) {
                    const result = await response.json();
                    logger.info('방 이름 생성 API 응답:', result);

                    if (result.success && result.roomName) {
                      // 방 이름 생성 완료 표시 (중복 실행 방지)
                      roomNameGeneratedRef.current.add(currentRoom);

                      // 방 목록 새로고침 (로딩 상태 변경 없이)
                      if (loadRoomsRef.current) {
                        await loadRoomsRef.current(true);
                      }
                      logger.info('방 이름 자동 생성 완료:', result.roomName);
                    } else {
                      logger.warn('방 이름 생성 실패: success가 false', result);
                    }
                  } else {
                    const errorText = await response.text();
                    logger.warn(
                      '방 이름 생성 API 실패:',
                      response.status,
                      errorText
                    );
                  }
                } else {
                  logger.info('방 이름 생성 스킵: New Chat이 아님', {
                    roomName: currentRoomData?.name,
                    hasRoomData: !!currentRoomData,
                  });
                }
              } catch (error) {
                logger.error('방 이름 생성 중 오류:', error);
                logger.error('방 이름 생성 오류 상세:', error);
                // 오류가 발생해도 채팅은 계속 진행되도록 함
              }
            })();

            return copy;
          });
        } else {
          setMessages((prev) => {
            const copy = [...prev];
            const idx = assistantIdxRef.current;
            if (copy[idx]) {
              copy[idx] = {
                ...copy[idx],
                text: t('chat_sender.no_response'),
                isTyping: false,
              };
            }
            return copy;
          });
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          // 응답 중단 시 첫 메시지 플래그 리셋 (다음 메시지에서 방 제목 재생성 가능)
          roomNameGeneratedRef.current.delete(currentRoom);
          logger.info('응답 중단: 방 제목 생성 플래그 리셋', { currentRoom });

          setMessages((prev) => {
            const copy = [...prev];
            if (copy[assistantIdxRef.current]) {
              copy[assistantIdxRef.current] = {
                ...copy[assistantIdxRef.current],
                text: copy[assistantIdxRef.current].text + '\n' + t('chat_sender.response_stopped'),
                roomId: currentRoom,
              };
            }
            return copy;
          });
        } else {
          const errorMessage = e?.message || '';
          const isQuotaError =
            /insufficient_quota|exceeded your current quota/i.test(
              errorMessage
            );
          const isNotFoundError = /http 404|not found/i.test(errorMessage);
          if (isQuotaError || isNotFoundError) {
            logger.warn('API 호출 경고:', e);
          } else {
            logger.error('API 호출 에러:', e);
          }

          // 에러 메시지 정규화: 원본 모델 이름을 정규화된 이름으로 대체
          let normalizedMessage = errorMessage || 'unknown error';

          // "models/" 접두사가 포함된 모델 이름을 정규화
          // 예: "model 'models/gemini-2.0-flash' not found" -> "model 'gemini-2.0-flash' not found"
          if (normalizedMessage && currentSelectedModel) {
            // 현재 선택된 모델 이름 정규화
            let normalizedModelName = currentSelectedModel.trim();
            if (normalizedModelName.startsWith('models/')) {
              normalizedModelName = normalizedModelName.substring(7);
            }
            normalizedModelName = normalizedModelName.split(':')[0].trim();
            normalizedModelName = normalizedModelName.split('/').pop().trim();

            // 에러 메시지에서 원본 모델 이름 패턴 찾아서 정규화
            // 1. 따옴표로 감싸진 모델 이름 패턴 (예: 'models/gemini-2.0-flash')
            const quotedModelPattern = /(['"])(models\/[^'"]+)\1/gi;
            normalizedMessage = normalizedMessage.replace(
              quotedModelPattern,
              (match, quote, modelName) => {
                // 모델 이름에서 "models/" 접두사 제거
                const normalized = modelName.startsWith('models/')
                  ? modelName.substring(7)
                  : modelName;
                return `${quote}${normalized}${quote}`;
              }
            );

            // 2. 따옴표 없이 사용된 모델 이름 패턴도 처리
            const unquotedModelPattern = /models\/([a-zA-Z0-9_\-:.]+)/g;
            normalizedMessage = normalizedMessage.replace(
              unquotedModelPattern,
              (match, modelName) => {
                return modelName.split(':')[0].trim();
              }
            );
          }

          const displayMessage = toUserFriendlyError(normalizedMessage, t);
          const errorText = t('chat_sender.request_notice', { message: displayMessage });
          setMessages((prev) => {
            const copy = [...prev];
            copy[assistantIdxRef.current] = {
              role: 'assistant',
              text: errorText,
              model: currentSelectedModel, // 모델 UUID
              isTyping: false,
              roomId: currentRoom,
            };
            return copy;
          });
          try {
            await saveMessageToHistory(currentRoom, {
              role: 'assistant',
              text: errorText,
              model: currentSelectedModel,
            });
          } catch (saveError) {
            logger.warn('에러 메시지 저장 실패:', saveError);
          }
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [currentRoom, clientIP, setMessages, inputRef, t]
  );

  const performAPICallRef = useRef(performAPICall);
  useEffect(() => { performAPICallRef.current = performAPICall; }, [performAPICall]);

  const sendMessage = useCallback(
    async (currentInput) => {
      let userQuestion = currentInput.trim();
      const currentSelectedImages = selectedImagesRef.current;
      const currentImageAnalysisPrompt = imageAnalysisPromptRef.current;
      const currentMaxLen = maxUserQuestionLengthRef.current;
      const hasImages = Array.isArray(currentSelectedImages) && currentSelectedImages.length > 0;
      if (!userQuestion && hasImages) {
        userQuestion =
          currentImageAnalysisPrompt?.trim() || t('chat.image_analysis_prompt');
      }
      if (!userQuestion || !currentRoom || loading) return;
      if (Date.now() - lastSubmitTime.current < 300) return;
      lastSubmitTime.current = Date.now();
      const currentSelectedModel = selectedModelRef.current;
      const responseModel = currentSelectedModel;
      const analysisModel = imageAnalysisModelRef.current;
      const modelInfoForLimit = modelOptionsRef.current.find(
        (model) => model.id === responseModel || model.modelName === responseModel
      );
      const multiturnUnlimited = modelInfoForLimit?.multiturnUnlimited === true;
      const multiturnLimit =
        Number.parseInt(modelInfoForLimit?.multiturnLimit, 10) || null;

      if (hasImages && !analysisModel) {
        const errorMsg = t('chat_sender.image_model_not_set');
        alert(errorMsg);
        return;
      }

      // 디버깅: 메시지 전송 시 선택된 모델 로깅
      logger.info('[sendMessage] 현재 선택된 모델:', responseModel);
      logger.info('[sendMessage] 모델 로딩 상태:', modelsLoading);

      if (modelsLoading || !responseModel) {
        const errorMsg = modelsLoading
          ? t('chat_sender.model_loading')
          : t('chat_sender.select_model');
        alert(errorMsg);
        return;
      }
      const userValidation = validateUserQuestion(
        userQuestion,
        currentMaxLen,
        t
      );
      if (!userValidation.valid) {
        alert(userValidation.error);
        return;
      }
      const displayUserQuestion = userQuestion;
      const isDrawActive = drawModeRef.current;
      const userMsg = {
        role: 'user',
        text: displayUserQuestion,
        roomId: currentRoom,
        ...(isDrawActive && { drawMode: true }),
      };
      const userTurnIndex =
        messagesRef.current.filter(
          (m) => m.roomId === currentRoom && m.role === 'user' && !m.isTyping
        ).length + 1;
      const roomImageHistory = imageHistoryByRoomRef.current[currentRoom] || [];
      const minTurnIndex =
        multiturnUnlimited || !multiturnLimit
          ? -Infinity
          : userTurnIndex - multiturnLimit;
      const recentAnalyses = roomImageHistory
        .filter((entry) => entry.turnIndex >= minTurnIndex)
        .map((entry) => entry.analysis)
        .filter(Boolean);
      const analysisBlock =
        recentAnalyses.length > 0
          ? `[image_analysis]\n${recentAnalyses
              .map((text, index) => `- ${index + 1}. ${text}`)
              .join('\n')}\n[/image_analysis]`
          : '';
      const imagesForRequest =
        hasImages && responseModel === analysisModel ? currentSelectedImages : [];
      const shouldUseAnalysisOnly =
        hasImages && analysisModel && analysisModel !== responseModel;
      if (imagesForRequest.length > 0) {
        logger.info('[sendMessage] 전송 이미지:', {
          count: imagesForRequest.length,
          images: imagesForRequest.map((image, index) => ({
            index: index + 1,
            name: image.name || 'unknown',
            size: Number.isFinite(image.size) ? image.size : null,
            type: image.type || image.mimeType || null,
          })),
        });
      }

      if (hasImages && setImageHistoryByRoom) {
        setImageHistoryByRoom((prev) => {
          const next = { ...prev };
          const existing = next[currentRoom] || [];
          next[currentRoom] = [
            ...existing,
            { turnIndex: userTurnIndex, images: currentSelectedImages },
          ];
          return next;
        });
      }

      setInput('');
      if (setSelectedImages) {
        setSelectedImages([]);
      }
      setLoading(true);

      // 현재 방의 마지막 모델 저장
      if (currentRoom && responseModel) {
        try {
          const roomModels = JSON.parse(
            localStorage.getItem('roomModels') || '{}'
          );
          roomModels[currentRoom] = responseModel; // 모델 UUID 저장
          localStorage.setItem('roomModels', JSON.stringify(roomModels));
          logger.info(
            '[sendMessage] localStorage에 모델 저장:',
            responseModel
          );
        } catch (error) {
          logger.error('방별 모델 저장 실패:', error);
        }
      }

      // 사용자 메시지 저장
      try {
        const selectedModelInfoForSave = modelOptionsRef.current.find(
          (model) => model.id === responseModel
        );
        const modelNameForHistory =
          selectedModelInfoForSave?.modelName || responseModel;
        const messagePayload = {
          role: 'user',
          text: userMsg.text,
          model: modelNameForHistory,
          ...(isDrawActive && { drawMode: true }),
        };

        logger.info(
          '[sendMessage] DB에 저장할 메시지 모델:',
          responseModel
        );
        await saveMessageToHistory(currentRoom, messagePayload);
      } catch (error) {
        logger.error('User 메시지 DB 저장 실패:', error);
      }

      // UI 업데이트 및 API 호출
      setMessages((prevMessages) => {
        const newMessages = [...prevMessages, userMsg];
        assistantIdxRef.current = newMessages.length;

        // 현재 방의 메시지 히스토리 구성 (방금 추가된 사용자 메시지 제외)
        // multiturnLimit 설정에 따라 기억할 메시지 개수 제어
        let currentRoomMessages = prevMessages.filter(
          (m) => m.roomId === currentRoom && !m.isTyping
        );

        // 멀티턴 제한 적용
        if (!multiturnUnlimited && multiturnLimit) {
          // user 메시지 개수로 턴 계산
          const userMessages = currentRoomMessages.filter((m) => m.role === 'user');
          if (userMessages.length > multiturnLimit) {
            // 최근 multiturnLimit 개의 턴만 유지
            const startTurnIndex = userMessages.length - multiturnLimit;
            const startMessageIndex = currentRoomMessages.findIndex(
              (m) => m === userMessages[startTurnIndex]
            );
            currentRoomMessages = currentRoomMessages.slice(startMessageIndex);
          }
        }

        const startRequest = async () => {
          let analysisText = null;
          if (hasImages && analysisModel && shouldUseAnalysisOnly) {
            try {
              const analysisQuestion =
                currentImageAnalysisPrompt?.trim() || t('chat.image_analysis_prompt');
              const analysisPayload = {
                model: analysisModel,
                question: analysisQuestion,
                prompt: analysisQuestion,
                requestPurpose: 'image-analysis',
                multiturnHistory: [],
                images: currentSelectedImages,
                stream: true,
                options: { temperature: 0.2, max_length: 800 },
                roomId: currentRoom,
                clientIP: clientIP,
              };
              const analysisRes = await sendChatMessage(
                '/api/webapp-generate',
                analysisPayload
              );
              analysisText = await consumeStreamResponse(analysisRes);
              if (analysisText) {
                setImageHistoryByRoom?.((prev) => {
                  const next = { ...prev };
                  const existing = next[currentRoom] || [];
                  next[currentRoom] = existing.map((entry) =>
                    entry.turnIndex === userTurnIndex
                      ? { ...entry, analysis: analysisText }
                      : entry
                  );
                  return next;
                });
              }
            } catch (error) {
              logger.error('이미지 분석 실패:', error);
            }
          }

          const mergedAnalyses = analysisText
            ? [...recentAnalyses, analysisText]
            : recentAnalyses;
          const combinedAnalysisBlock =
            mergedAnalyses.length > 0
              ? `[image_analysis]\n${mergedAnalyses
                  .map((text, index) => `- ${index + 1}. ${text}`)
                  .join('\n')}\n[/image_analysis]`
              : '';
          const finalQuestion = combinedAnalysisBlock
            ? `${combinedAnalysisBlock}\n\n${displayUserQuestion}`
            : displayUserQuestion;

          performAPICallRef.current(
            responseModel,
            displayUserQuestion,
            currentRoomMessages,
            shouldUseAnalysisOnly ? [] : imagesForRequest,
            finalQuestion
          );
        };

        startRequest();
        return [
          ...newMessages,
          {
            role: 'assistant',
            text: '',
            model: responseModel,
            isTyping: true,
            roomId: currentRoom,
            ...(isDrawActive && { drawMode: true }),
          },
        ];
      });
    },
    [
      setImageHistoryByRoom,
      setSelectedImages,
      currentRoom,
      loading,
      modelsLoading,
      setMessages,
      clientIP,
      t,
    ]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const el = inputRef?.current;
        const start = el?.selectionStart ?? input.length;
        const end = el?.selectionEnd ?? input.length;
        const nextValue = `${input.slice(0, start)}\n${input.slice(end)}`;
        setInput(nextValue);
        requestAnimationFrame(() => {
          if (!el) return;
          const pos = start + 1;
          el.setSelectionRange(pos, pos);
        });
        return;
      }
      if (e.key === 'Enter' && e.shiftKey) {
        return;
      }
      if (
        e.key === 'Enter' &&
        !loading &&
        (input.trim() ||
          (Array.isArray(selectedImagesRef.current) && selectedImagesRef.current.length > 0))
      ) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [loading, sendMessage, input, inputRef, setInput]
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setLoading(false);
  }, []);

  return {
    input,
    setInput,
    loading,
    sendMessage,
    handleKeyDown,
    stopStreaming,
  };
}
