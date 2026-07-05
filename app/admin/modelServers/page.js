'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Activity,
  AlertCircle,
  Info,
  RefreshCw,
  Pause,
  Play,
  Zap,
  HelpCircle,
  ChevronUp,
  Edit,
  X,
  Trash2,
  Copy,
  Check,
} from '@/components/icons';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';

export default function ModelServersPage() {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const [modelServers, setmodelServers] = useState([]);
  const [realTimeStatus, setRealTimeStatus] = useState([]); // 실시간 상태
  const [serverStatusLoading, setServerStatusLoading] = useState({}); // 각 서버별 로딩 상태
  const [loading, setLoading] = useState(true);
  const [isPollingEnabled, setIsPollingEnabled] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [showHelpSection, setShowHelpSection] = useState(false);
  const [endpointNameInput, setEndpointNameInput] = useState('');
  const [endpointUrlInput, setEndpointUrlInput] = useState('http://localhost:11434');
  const [endpoints, setEndpoints] = useState([]); // [{name, url, provider}]
  const [savingEndpoints, setSavingEndpoints] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(null); // {originalUrl, name, url, provider}
  const [showAddForm, setShowAddForm] = useState(false); // 추가 폼 표시 여부
  const [errorHistory, setErrorHistory] = useState([]); // 오류 이력
  const [errorHistoryLoading, setErrorHistoryLoading] = useState(false);
  const [selectedEndpointForHistory, setSelectedEndpointForHistory] =
    useState(null); // 오류 이력 조회할 endpoint
  const [showErrorHistoryModal, setShowErrorHistoryModal] = useState(false);
  const [copiedTexts, setCopiedTexts] = useState(new Set()); // 복사된 텍스트 추적

  // 클립보드 복사 함수
  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTexts((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setCopiedTexts((prev) => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      logger.error('클립보드 복사 실패:', err);
      alert(t('admin_model_servers.clipboard_copy_failed'), 'error', t('common.error'));
    }
  };


  // 개별 서버 상태 조회
  const fetchServerStatus = useCallback(async (endpointUrl) => {
    try {
      setServerStatusLoading((prev) => ({ ...prev, [endpointUrl]: true }));
      const token = localStorage.getItem('token');

      if (!token) {
        logger.error('토큰이 없습니다. 로그인이 필요합니다.');
        return null;
      }

      const response = await fetch(
        `/api/admin/system-status/endpoint?url=${encodeURIComponent(
          endpointUrl
        )}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const data = await response.json();

        // API 응답 구조: { success: true, endpoint: { status, responseTime, modelsCount } }
        const endpointData = data.endpoint || data;

        // realTimeStatus 업데이트
        setRealTimeStatus((prev) => {
          const filtered = prev.filter((rt) => rt.url !== endpointUrl);
          return [
            ...filtered,
            {
              url: endpointUrl,
              status:
                endpointData.status === 'operational' ? 'healthy' : 'unhealthy',
              responseTime: endpointData.responseTime,
              modelCount: endpointData.modelsCount,
            },
          ];
        });

        return endpointData;
      } else {
        logger.error(`서버 상태 조회 실패 (${endpointUrl}):`, response.status);

        // 실패 시에도 상태 업데이트
        setRealTimeStatus((prev) => {
          const filtered = prev.filter((rt) => rt.url !== endpointUrl);
          return [
            ...filtered,
            {
              url: endpointUrl,
              status: 'unhealthy',
              responseTime: null,
              modelCount: 0,
            },
          ];
        });

        return null;
      }
    } catch (error) {
      // 네트워크 에러 감지 (fetch 실패, CORS, 연결 거부 등)
      const isNetworkError =
        error.name === 'TypeError' ||
        error.name === 'NetworkError' ||
        error.message?.includes('fetch') ||
        error.message?.includes('NetworkError') ||
        error.message?.includes('Failed to fetch');

      if (isNetworkError) {
        logger.warn(
          `네트워크 에러로 인한 서버 상태 조회 실패 (${endpointUrl}):`,
          error.message
        );
        // 네트워크 에러는 일시적일 수 있으므로 기존 상태 유지
        // 상태를 업데이트하지 않고 null 반환
        return null;
      }

      // 네트워크 에러가 아닌 경우에만 상태를 'unhealthy'로 업데이트
      logger.error(`서버 상태 조회 중 에러 (${endpointUrl}):`, error.message);

      setRealTimeStatus((prev) => {
        const filtered = prev.filter((rt) => rt.url !== endpointUrl);
        return [
          ...filtered,
          {
            url: endpointUrl,
            status: 'unhealthy',
            responseTime: null,
            modelCount: 0,
          },
        ];
      });

      return null;
    } finally {
      setServerStatusLoading((prev) => ({ ...prev, [endpointUrl]: false }));
    }
  }, []);

  // Ollama 서버 목록 조회
  const fetchmodelServers = async (silentRefresh = false) => {
    try {
      if (!silentRefresh) {
        setLoading(true);
      }
      const token = localStorage.getItem('token');

      if (!token) {
        logger.error('토큰이 없습니다. 로그인이 필요합니다.');
        return;
      }

      const response = await fetch('/api/admin/instances', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        let data;
        try {
          const responseText = await response.text();
          if (!responseText || responseText.trim() === '') {
            logger.warn('빈 응답을 받았습니다.');
            data = {};
          } else {
            data = JSON.parse(responseText);
          }
        } catch (parseError) {
          logger.error('JSON 파싱 실패:', parseError);
          throw new Error(`응답 파싱 실패: ${parseError.message}`);
        }

        setmodelServers(data.modelServers || []);
        setRealTimeStatus(data.realTimeStatus || []);
        setLastRefresh(new Date());
      } else if (response.status === 401) {
        logger.error('토큰 인증 실패 (401). 토큰이 만료되었을 수 있습니다.');
        if (!silentRefresh) {
          // 자동 폴링이 아닌 경우만 사용자에게 알림
        }
      } else {
        logger.error('modelServers:', response.status, response.statusText);
      }
    } catch (error) {
      logger.error('Ollama 서버 목록 조회 실패:', error);
      if (!silentRefresh) {
        logger.error('Ollama 서버 데이터를 불러오는데 실패했습니다.');
      }
    } finally {
      if (!silentRefresh) {
        setLoading(false);
      }
    }
  };

  // 오류 이력 조회
  const fetchErrorHistory = async (endpointUrl) => {
    try {
      setErrorHistoryLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const url = `/api/admin/model-server-error-history?endpoint=${encodeURIComponent(
        endpointUrl
      )}&hours=168&limit=100`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        let data;
        try {
          const responseText = await response.text();
          if (!responseText || responseText.trim() === '') {
            data = { errors: [] };
          } else {
            data = JSON.parse(responseText);
          }
        } catch (parseError) {
          logger.error('오류 이력 JSON 파싱 실패:', parseError);
          data = { errors: [] };
        }
        setErrorHistory(data.errors || []);
      }
    } catch (error) {
      logger.error('오류 이력 조회 실패:', error);
    } finally {
      setErrorHistoryLoading(false);
    }
  };

  // 오류 이력 전체 삭제
  const deleteAllErrorHistory = async (endpointUrl) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert(
          t('admin_model_servers.auth_token_missing'),
          'warning',
          t('admin_model_servers.auth_error')
        );
        return;
      }

      const confirmed = await confirm(
        t('admin_model_servers.confirm_delete_all_errors_msg'),
        t('admin_model_servers.confirm_delete_all_errors_title')
      );

      if (!confirmed) {
        return;
      }

      const url = `/api/admin/model-server-error-history?endpoint=${encodeURIComponent(
        endpointUrl
      )}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        alert(
          t('admin_model_servers.errors_deleted', { count: data.deletedCount || 0 }),
          'success',
          t('admin_model_servers.delete_complete')
        );
        // 목록 새로고침
        await fetchErrorHistory(endpointUrl);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(
          errorData.error || t('admin_model_servers.error_history_delete_failed'),
          'error',
          t('admin_model_servers.delete_failed')
        );
      }
    } catch (error) {
      logger.error('오류 이력 삭제 실패:', error);
      alert(t('admin_model_servers.error_history_delete_error'), 'error', t('common.error'));
    }
  };

  // 설정에서 Ollama 서버 조회
  const fetchEndpointsFromSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings');
      if (response.ok) {
        let data;
        try {
          const responseText = await response.text();
          if (!responseText || responseText.trim() === '') {
            logger.warn('설정 조회: 빈 응답을 받았습니다.');
            data = {};
          } else {
            data = JSON.parse(responseText);
          }
        } catch (parseError) {
          logger.error('설정 JSON 파싱 실패:', parseError);
          data = {};
        }
        const listRaw = Array.isArray(data.customEndpoints)
          ? data.customEndpoints
              .filter((e) => !e.provider || e.provider === 'ollama')
              .map((e) => ({
                name: e.name || '',
                url: e.url,
                provider: 'ollama',
                isActive: e.isActive !== undefined ? e.isActive : true,
              }))
          : (data.ollamaEndpoints || '')
              .split(',')
              .map((e) => e.trim())
              .filter(Boolean)
              .map((entry) => {
                const m = entry.match(/^(.*?)\s*[|=｜＝]\s*(https?:\/\/.+)$/i);
                if (m) {
                  return {
                    name: m[1].trim(),
                    url: m[2].trim(),
                    provider: 'ollama',
                  };
                }
                return {
                  name: '',
                  url: entry,
                  provider: 'ollama',
                  isActive: true,
                };
              });
        // URL 정규화 함수 (trailing slash 제거, 소문자 변환)
        const normalizeUrl = (url) => {
          try {
            const urlObj = new URL(url.trim());
            return `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}${
              urlObj.port ? `:${urlObj.port}` : ''
            }${urlObj.pathname.replace(/\/+$/, '')}`;
          } catch (error) {
            logger.warn('[Catch] 에러 발생:', error.message);
            return url.trim().toLowerCase().replace(/\/+$/, '');
          }
        };

        // 중복 제거: 정규화된 URL 기준, 이름있는 항목 우선
        const byNormalizedUrl = new Map();
        const seenUrls = new Set();

        for (const ep of listRaw) {
          const normalizedUrl = normalizeUrl(ep.url);

          // 이미 본 URL이면 스킵
          if (seenUrls.has(normalizedUrl)) {
            continue;
          }

          const exist = byNormalizedUrl.get(normalizedUrl);
          if (!exist) {
            // 새로운 항목 추가
            byNormalizedUrl.set(normalizedUrl, ep);
            seenUrls.add(normalizedUrl);
          } else if (!exist.name && ep.name) {
            // 기존 항목에 이름이 없고 새 항목에 이름이 있으면 교체
            byNormalizedUrl.set(normalizedUrl, ep);
          }
        }

        setEndpoints(Array.from(byNormalizedUrl.values()));
      }
    } catch (e) {
      logger.warn('Ollama 서버 설정 조회 실패(무시):', e.message);
    }
  };

  const persistEndpoints = async (newList) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert(
        t('admin_model_servers.auth_token_missing'),
        'warning',
        t('admin_model_servers.auth_error')
      );
      return false;
    }
    setSavingEndpoints(true);
    try {
      // URL 정규화 함수 (trailing slash 제거, 소문자 변환)
      const normalizeUrl = (url) => {
        try {
          const urlObj = new URL(url.trim());
          return `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}${
            urlObj.port ? `:${urlObj.port}` : ''
          }${urlObj.pathname.replace(/\/+$/, '')}`;
        } catch (error) {
          logger.warn('[Catch] 에러 발생:', error.message);
          return url.trim().toLowerCase().replace(/\/+$/, '');
        }
      };

      // 중복 제거: 정규화된 URL 기준, 이름있는 항목 우선
      const byNormalizedUrl = new Map();
      const seenUrls = new Set();
      const seenNames = new Set(); // 이름 중복 체크용

      for (const ep of newList) {
        const normalizedUrl = normalizeUrl(ep.url);

        // 이름 중복 체크
        if (ep.name) {
          const normalizedName = ep.name.trim().toLowerCase();
          if (seenNames.has(normalizedName)) {
            alert(
              t('admin_model_servers.duplicate_name_with_value', { name: ep.name }),
              'warning',
              t('admin_model_servers.duplicate_error')
            );
            setSavingEndpoints(false);
            return false;
          }
          seenNames.add(normalizedName);
        }

        // 이미 본 URL이면 스킵
        if (seenUrls.has(normalizedUrl)) {
          continue;
        }

        const exist = byNormalizedUrl.get(normalizedUrl);
        if (!exist) {
          // 새로운 항목 추가
          byNormalizedUrl.set(normalizedUrl, ep);
          seenUrls.add(normalizedUrl);
        } else if (!exist.name && ep.name) {
          // 기존 항목에 이름이 없고 새 항목에 이름이 있으면 교체
          byNormalizedUrl.set(normalizedUrl, ep);
        }
      }

      const uniqueList = Array.from(byNormalizedUrl.values());

      const body = {
        // 신규 구조: customEndpoints를 저장, 하위호환 위해 ollamaEndpoints도 동기화됨
        customEndpoints: uniqueList.map((e) => ({
          name: e.name || '',
          url: e.url,
          provider: 'ollama',
          isActive: e.isActive !== undefined ? e.isActive : true,
        })),
      };
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let err = {};
        try {
          const errorText = await res.text();
          if (errorText && errorText.trim() !== '') {
            err = JSON.parse(errorText);
          }
        } catch (parseError) {
          logger.error('에러 응답 파싱 실패:', parseError);
        }
        throw new Error(err.error || t('admin_model_servers.server_save_failed'));
      }
      setEndpoints(uniqueList);
      // 저장 후 모니터 즉시 갱신 요청
      await fetch('/api/admin/instances?refresh=true', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      // 목록 재조회
      await fetchmodelServers(true);
      return true;
    } catch (e) {
      logger.error(e);
      alert(e.message, 'error', t('admin_model_servers.save_failed'));
      return false;
    } finally {
      setSavingEndpoints(false);
    }
  };

  const addEndpoint = async () => {
    const value = endpointUrlInput.trim();
    const name = endpointNameInput.trim();
    const provider = 'ollama';
    if (!name) {
      alert(t('admin_model_servers.enter_server_name'), 'warning', t('admin_model_servers.input_error'));
      return;
    }
    if (!value) {
      alert(t('admin_model_servers.enter_url'), 'warning', t('admin_model_servers.input_error'));
      return;
    }
    let urlObj;
    try {
      urlObj = new URL(value);
    } catch (error) {
      logger.warn('[Catch] 에러 발생:', error.message);
      alert(
        t('admin_model_servers.invalid_url'),
        'warning',
        t('admin_model_servers.url_format_error')
      );
      return;
    }
    if (!/^https?:$/.test(urlObj.protocol)) {
      alert(
        t('admin_model_servers.protocol_http_only'),
        'warning',
        t('admin_model_servers.protocol_error')
      );
      return;
    }
    // 포트 강제는 제거 (Ollama 기본 포트 예시는 안내로만 사용)
    if (endpoints.some((e) => e.url === value)) {
      alert(t('admin_model_servers.duplicate_url'), 'warning', t('admin_model_servers.duplicate_error'));
      return;
    }
    // 이름 중복 체크
    if (
      endpoints.some(
        (e) =>
          e.name && e.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
    ) {
      alert(t('admin_model_servers.duplicate_name'), 'warning', t('admin_model_servers.duplicate_error'));
      return;
    }
    const next = [
      ...endpoints,
      { name, url: value, provider, isActive: true },
    ];
    const ok = await persistEndpoints(next);
    if (ok) {
      setEndpointNameInput('');
      setEndpointUrlInput('');
      setShowAddForm(false);
    }
  };

  const removeEndpoint = async (endpointUrl) => {
    const next = endpoints.filter((e) => e.url !== endpointUrl);
    await persistEndpoints(next);
  };

  const startEditEndpoint = (ep) => {
    setEditingEndpoint({
      originalUrl: ep.url,
      name: ep.name || '',
      url: ep.url,
      provider: 'ollama',
      isActive: ep.isActive !== undefined ? ep.isActive : true, // 기본값은 활성화
    });
    setShowAddForm(false); // 수정 모드 시작 시 추가 폼 닫기
  };

  const cancelEditEndpoint = () => {
    setEditingEndpoint(null);
  };

  const saveEditEndpoint = async () => {
    if (!editingEndpoint) return;
    const name = (editingEndpoint.name || '').trim(); // 이름은 수정 불가이므로 그대로 사용
    const urlText = (editingEndpoint.url || '').trim();
    const provider = 'ollama';
    if (!name) {
      alert(t('admin_model_servers.server_name_missing'), 'warning', t('admin_model_servers.input_error'));
      return;
    }
    if (!urlText) {
      alert(t('admin_model_servers.enter_url'), 'warning', t('admin_model_servers.input_error'));
      return;
    }
    let urlObj;
    try {
      urlObj = new URL(urlText);
    } catch (error) {
      logger.warn('[Catch] 에러 발생:', error.message);
      alert(
        t('admin_model_servers.invalid_url'),
        'warning',
        t('admin_model_servers.url_format_error')
      );
      return;
    }
    if (!/^https?:$/.test(urlObj.protocol)) {
      alert(
        t('admin_model_servers.protocol_http_only'),
        'warning',
        t('admin_model_servers.protocol_error')
      );
      return;
    }
    // 포트 필수 제약은 제거
    // 다른 항목과 중복 URL 방지 (현재 편집 중인 항목 제외)
    if (
      endpoints.some(
        (e) => e.url === urlText && e.url !== editingEndpoint.originalUrl
      )
    ) {
      alert(t('admin_model_servers.duplicate_url'), 'warning', t('admin_model_servers.duplicate_error'));
      return;
    }
    // 이름은 수정 불가이므로 중복 체크 불필요
    const isActive =
      editingEndpoint.isActive !== undefined ? editingEndpoint.isActive : true;
    const next = endpoints.map((e) =>
      e.url === editingEndpoint.originalUrl
        ? { name, url: urlText, provider, isActive }
        : e
    );
    const ok = await persistEndpoints(next);
    if (ok) {
      setEditingEndpoint(null);
    }
  };

  useEffect(() => {
    fetchmodelServers();
    fetchEndpointsFromSettings();
  }, []);

  // 서버 목록이 로드되면 각 서버의 상태를 개별적으로 조회
  useEffect(() => {
    if (!endpoints || endpoints.length === 0) return;

    // 모든 서버의 상태를 병렬로 조회
    endpoints.forEach((ep) => {
      if (ep.url && ep.isActive !== false) {
        fetchServerStatus(ep.url);
      }
    });
  }, [endpoints.length, fetchServerStatus, endpoints]); // endpoints.length가 변경될 때만 실행

  // 폴링 설정 - 5분마다 자동 새로고침
  useEffect(() => {
    if (!isPollingEnabled) return;

    const interval = setInterval(() => {
      // 폴링 시에도 각 서버 상태를 개별적으로 조회
      endpoints.forEach((ep) => {
        if (ep.url && ep.isActive !== false) {
          fetchServerStatus(ep.url);
        }
      });
    }, 300000); // 5분

    return () => clearInterval(interval);
  }, [isPollingEnabled, endpoints, fetchServerStatus]);

  // 컴포넌트 언마운트 시 폴링 정리
  useEffect(() => {
    return () => setIsPollingEnabled(false);
  }, []);

  // 페이지 visibility 변경 시 폴링 상태 관리
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 페이지가 숨겨지면 폴링 일시 중지
        setIsPollingEnabled(false);
      } else {
        // 페이지가 다시 보이면 폴링 재시작 및 즉시 새로고침
        setIsPollingEnabled(true);
        fetchmodelServers(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const formatUptime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return t('admin_model_servers.uptime_days_hours', { days, hours: hours % 24 });
    if (hours > 0) return t('admin_model_servers.uptime_hours_mins', { hours, minutes: minutes % 60 });
    if (minutes > 0) return t('admin_model_servers.uptime_mins', { minutes });
    return t('admin_model_servers.uptime_secs', { seconds });
  };

  const formatMemory = (bytes) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}MB`;
  };


  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--hn-fg-muted)',
              marginBottom: 8,
            }}
          >
            인프라
          </div>
          <div className='flex items-center gap-3'>
            <h1
              className='font-bold'
              style={{
                fontSize: 'clamp(22px, 2.6vw, 28px)',
                letterSpacing: '-0.02em',
                color: 'var(--hn-fg)',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {t('admin_model_servers.title')}
            </h1>
            <button
              onClick={() => setShowHelpSection(!showHelpSection)}
              className='p-1 text-muted-foreground hover:text-foreground transition-colors'
              title={t('admin_model_servers.show_help')}
            >
              <HelpCircle className='h-5 w-5' />
            </button>
          </div>
          <p
            style={{
              marginTop: 6,
              fontSize: 13.5,
              color: 'var(--hn-fg-muted)',
              maxWidth: 640,
            }}
          >
            {t('admin_model_servers.subtitle')}
          </p>
        </div>
        <div className='flex items-center gap-3'>
          {/* 폴링 상태 표시 */}
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <div
              className={`w-2 h-2 rounded-full ${
                isPollingEnabled ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
              }`}
            ></div>
            <span>
              {isPollingEnabled
                ? t('admin_model_servers.auto_refresh_on')
                : t('admin_model_servers.auto_refresh_off')}
            </span>
            <span className='text-xs'>
              {t('admin_model_servers.last_update')}{' '}
              {lastRefresh.toLocaleTimeString('ko-KR', {
                timeZone: 'Asia/Seoul',
              })}
            </span>
          </div>

          {/* 폴링 제어 버튼 */}
          <button
            onClick={() => setIsPollingEnabled(!isPollingEnabled)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isPollingEnabled
                ? 'bg-muted text-muted-foreground hover:bg-accent dark:bg-muted dark:text-muted-foreground dark:hover:bg-accent'
                : 'bg-primary/10 text-primary hover:bg-primary/20 dark:bg-primary/10 dark:text-primary dark:hover:bg-primary/20'
            } flex items-center gap-1.5`}
          >
            {isPollingEnabled ? (
              <>
                <Pause className='h-3 w-3' />
                {t('admin_model_servers.stop')}
              </>
            ) : (
              <>
                <Play className='h-3 w-3' />
                {t('admin_model_servers.start')}
              </>
            )}
          </button>

          {/* 수동 새로고침 버튼 */}
          <button
            onClick={() => {
              endpoints.forEach((ep) => {
                if (ep.url && ep.isActive !== false) {
                  fetchServerStatus(ep.url);
                }
              });
            }}
            disabled={Object.values(serverStatusLoading).some(
              (loading) => loading
            )}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2'
          >
            <RefreshCw
              className={`h-4 w-4 ${
                Object.values(serverStatusLoading).some((loading) => loading)
                  ? 'animate-spin'
                  : ''
              }`}
            />
            {t('admin_model_servers.refresh_all')}
          </button>
        </div>
      </div>

      {/* 도움말 섹션 */}
      {showHelpSection && (
        <div className='bg-primary/10 rounded-lg p-6 border border-primary/20'>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-semibold text-foreground flex items-center gap-2'>
              <Info className='h-5 w-5' />
              {t('admin_model_servers.help_title')}
            </h3>
            <button
              onClick={() => setShowHelpSection(false)}
              className='text-primary hover:text-primary'
            >
              <ChevronUp className='h-5 w-5' />
            </button>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 gap-6 text-sm'>
            <div>
              <h4 className='font-semibold text-primary mb-2 flex items-center gap-2'>
                <Server className='h-4 w-4' />
                {t('admin_model_servers.help_mgmt_title')}
              </h4>
              <ul className='space-y-1.5 text-primary'>
                <li>• {t('admin_model_servers.help_mgmt_item1')}</li>
                <li>• {t('admin_model_servers.help_mgmt_item2')}</li>
                <li>• {t('admin_model_servers.help_mgmt_item3')}</li>
                <li>• {t('admin_model_servers.help_mgmt_item4')}</li>
                <li>• {t('admin_model_servers.help_mgmt_item5')}</li>
              </ul>
            </div>

            <div>
              <h4 className='font-semibold text-primary mb-2 flex items-center gap-2'>
                <Activity className='h-4 w-4' />
                {t('admin_model_servers.help_monitor_title')}
              </h4>
              <ul className='space-y-1.5 text-primary'>
                <li>
                  • <strong>{t('admin_model_servers.help_monitor_auto_refresh')}:</strong> {t('admin_model_servers.help_monitor_auto_refresh_desc')}
                </li>
                <li>
                  •{' '}
                  <span className='inline-flex items-center gap-1'>
                    <Activity className='h-3 w-3 text-primary' /> {t('admin_model_servers.help_monitor_green')}
                  </span>{' '}
                  {t('admin_model_servers.help_monitor_green_desc')}
                </li>
                <li>
                  •{' '}
                  <span className='inline-flex items-center gap-1'>
                    <Activity className='h-3 w-3 text-destructive' /> {t('admin_model_servers.help_monitor_red')}
                  </span>{' '}
                  {t('admin_model_servers.help_monitor_red_desc')}
                </li>
                <li>• {t('admin_model_servers.help_monitor_24h_log')}</li>
                <li>• {t('admin_model_servers.help_monitor_response_time')}</li>
              </ul>
            </div>

            <div>
              <h4 className='font-semibold text-primary mb-2 flex items-center gap-2'>
                <Zap className='h-4 w-4' />
                {t('admin_model_servers.help_api_title')}
              </h4>
              <ul className='space-y-1.5 text-primary'>
                <li>
                  • <strong>{t('admin_model_servers.help_api_integrated')}:</strong> /api/model-servers/generate
                </li>
                <li>• {t('admin_model_servers.help_api_roundrobin')}</li>
                <li>• {t('admin_model_servers.help_api_streaming')}</li>
                <li>• {t('admin_model_servers.help_api_local_only')}</li>
                <li>• {t('admin_model_servers.help_api_external_note')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Ollama 서버 관리 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6 mb-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-2'>
            <Server className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_model_servers.server_management')}
            </h2>
          </div>
          <button
            onClick={() => {
              if (editingEndpoint) {
                // 수정 모드가 활성화되어 있으면 먼저 취소
                cancelEditEndpoint();
              }
              setShowAddForm(!showAddForm);
            }}
            className='px-2 py-1 text-sm text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground border border-border rounded-md hover:bg-accent transition-colors flex items-center gap-1'
          >
            <Edit className='h-3 w-3' />
            {t('admin_model_servers.add')}
          </button>
        </div>

      {/* 등록된 Ollama 서버 현황 */}
        {endpoints.length > 0 && (
          <div className='mb-4'>
            <div className='mb-3 flex items-center justify-between'>
              <h3 className='text-sm font-semibold text-foreground'>
                {t('admin_model_servers.registered_servers', { count: endpoints.length })}
              </h3>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
              {endpoints.map((ep) => {
                let instance = null;
                let realTime = null;

                try {
                  const url = new URL(ep.url);
                  const epHost = url.hostname;
                  const epPort = url.port
                    ? parseInt(url.port, 10)
                    : url.protocol === 'https:'
                    ? 443
                    : 80;

                  // 실시간 상태에서 먼저 찾기 (URL 또는 host:port 기반)
                  realTime = realTimeStatus.find((rt) => {
                    // URL이 있으면 URL로 비교
                    if (rt.url) {
                      try {
                        const rtUrl = new URL(rt.url);
                        return (
                          rtUrl.hostname === epHost &&
                          parseInt(rtUrl.port || '80', 10) === epPort
                        );
                      } catch (error) {
                        logger.warn('[Catch] 에러 발생:', error.message);
                        // URL 파싱 실패 시 무시
                      }
                    }

                    // host와 port로 비교
                    if (rt.host && rt.port) {
                      const rtHost = rt.host.toString().trim();
                      const rtPort = parseInt(rt.port.toString(), 10);
                      return rtHost === epHost && rtPort === epPort;
                    }

                    // ID 형식으로 비교 (fallback)
                    if (rt.id) {
                      try {
                        // ID가 URL 형식인 경우
                        if (rt.id.includes('://')) {
                          const rtUrl = new URL(rt.id);
                          return (
                            rtUrl.hostname === epHost &&
                            parseInt(rtUrl.port || '80', 10) === epPort
                          );
                        }

                        // ID 형식: model-server-{hostname}-{port}
                        const idParts = rt.id.split('-');
                        if (idParts.length >= 4) {
                          // model-server-hostname-port 형식 (hostname에 하이픈이 있을 수 있음)
                          const rtHost = idParts.slice(2, -1).join('-');
                          const rtPort = parseInt(
                            idParts[idParts.length - 1],
                            10
                          );
                          return rtHost === epHost && rtPort === epPort;
                        } else if (idParts.length === 3) {
                          // 간단한 형식: hostname-port
                          const rtHost = idParts[1];
                          const rtPort = parseInt(idParts[2], 10);
                          return rtHost === epHost && rtPort === epPort;
                        }
                      } catch (error) {
                        logger.warn('[Catch] 에러 발생:', error.message);
                        // ID 파싱 실패 시 무시
                      }
                    }

                    return false;
                  });

                  // DB 인스턴스에서 찾기
                  instance = modelServers.find((i) => {
                    const iHost = (i.host || '').toString().trim();
                    const iPort = i.port
                      ? parseInt(i.port.toString(), 10)
                      : ep.url.includes('https')
                      ? 443
                      : 80;
                    return iHost === epHost && iPort === epPort;
                  });
                } catch (e) {
                  logger.warn(
                    '[modelServers] URL 파싱 실패:',
                    e?.message || e
                  );
                }

                // 실시간 상태 우선 사용, 없으면 DB 인스턴스 사용
                // 개별 서버 로딩 상태 확인
                const isServerLoading = serverStatusLoading[ep.url] || false;

                const isActive =
                  isServerLoading || loading
                    ? null
                    : realTime
                    ? realTime.status === 'healthy'
                    : instance?.isActive !== undefined
                    ? instance.isActive
                    : null;
                const modelCount =
                  realTime?.modelCount ?? instance?.modelCount ?? 0;
                const responseTime =
                  realTime?.responseTime ?? instance?.responseTime ?? null;

                // 상태 표시 결정: null이면 조회중, true면 정상, false면 오프라인
                const statusColor =
                  isActive === null
                    ? 'bg-muted-foreground'
                    : isActive
                    ? 'bg-primary'
                    : 'bg-destructive';
                const statusText =
                  isActive === null ? t('admin_model_servers.status_checking') : isActive ? t('admin_model_servers.status_normal') : t('admin_model_servers.status_offline');
                const statusIconColor =
                  isActive === null
                    ? 'text-muted-foreground'
                    : isActive
                    ? 'text-primary'
                    : 'text-destructive';

                const isEditing = editingEndpoint?.originalUrl === ep.url;
                const isInactive = ep.isActive === false;
                return (
                  <div
                    key={ep.url}
                    className={`group relative p-4 bg-card rounded-lg border transition-all ${
                      isEditing
                        ? 'border-primary bg-primary/10 shadow-md'
                        : isInactive
                        ? 'border-border bg-muted opacity-70 cursor-pointer hover:border-border dark:hover:border-border hover:shadow-sm'
                        : 'border-border cursor-pointer hover:border-primary/30 dark:hover:border-primary hover:shadow-md'
                    }`}
                  >
                    <div
                      onClick={() => startEditEndpoint(ep)}
                      className='flex-1'
                    >
                      {/* 헤더: 이름과 상태 */}
                      <div className='flex items-start justify-between mb-3'>
                        <div className='flex items-start gap-2.5 min-w-0 flex-1'>
                          <div
                            className={`h-3 w-3 rounded-full flex-shrink-0 mt-0.5 ${statusColor} ${
                              isInactive ? 'opacity-50' : ''
                            }`}
                          ></div>
                          <div className='min-w-0 flex-1'>
                            <div className='flex items-center gap-2 mb-1'>
                              <div
                                className={`text-sm font-semibold truncate ${
                                  isInactive
                                    ? 'text-muted-foreground'
                                    : 'text-foreground'
                                }`}
                              >
                                {ep.name || t('admin_model_servers.no_name')}
                              </div>
                              {isInactive && (
                                <span className='px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] font-medium rounded'>
                                  {t('admin_model_servers.inactive_badge')}
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-xs font-mono break-all ${
                                isInactive
                                  ? 'text-muted-foreground'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {ep.url}
                            </div>
                          </div>
                        </div>
                        <span className='ml-2 inline-flex items-center px-2 py-1 rounded text-[10px] font-medium border flex-shrink-0 bg-primary/10 border-primary/20 text-primary'>
                          Ollama
                        </span>
                      </div>

                      {/* 상태 정보 */}
                      <div className='flex items-center flex-wrap gap-2.5 text-xs mb-3'>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${
                            isActive === null
                              ? 'bg-muted text-muted-foreground'
                              : isActive
                              ? 'bg-primary/10 text-primary'
                              : 'bg-destructive/10 dark:bg-destructive/10/30 text-destructive'
                          }`}
                        >
                          <Activity
                            className={`h-3 w-3 ${statusIconColor} ${
                              isServerLoading ? 'animate-pulse' : ''
                            }`}
                          />
                          {statusText}
                        </span>
                        {/* 개별 서버 새로고침 버튼 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fetchServerStatus(ep.url);
                          }}
                          disabled={isServerLoading}
                          className='inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                          title={t('admin_model_servers.refresh_status')}
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${
                              isServerLoading ? 'animate-spin' : ''
                            }`}
                          />
                        </button>
                        {modelCount > 0 && (
                          <span className='inline-flex items-center gap-1.5 px-2 py-1 bg-muted text-muted-foreground rounded'>
                            <Server className='h-3 w-3' />
                            {t('admin_model_servers.model_count', { count: modelCount })}
                          </span>
                        )}
                        {responseTime !== null && (
                          <span className='px-2 py-1 bg-muted text-muted-foreground rounded'>
                            {responseTime}ms
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className='pt-3 border-t border-border flex items-center justify-between'>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setSelectedEndpointForHistory(ep.url);
                          setShowErrorHistoryModal(true);
                          await fetchErrorHistory(ep.url);
                        }}
                        className='text-xs text-muted-foreground hover:text-muted-foreground font-medium transition-colors flex items-center gap-1'
                      >
                        <AlertCircle className='h-3 w-3' />
                        {t('admin_model_servers.error_history_label')}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await confirm(
                            t('admin_model_servers.confirm_delete_server'),
                            t('admin_model_servers.confirm_delete_server_title')
                          );
                          if (confirmed) {
                            removeEndpoint(ep.url);
                          }
                        }}
                        disabled={savingEndpoints}
                        className='text-xs text-destructive hover:text-destructive font-medium transition-colors'
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className='mt-4 pt-4 border-t border-border'>
              <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm'>
                <div className='flex items-center gap-4'>
                  <span className='text-muted-foreground'>
                    {t('admin_model_servers.total_label')}{' '}
                    <span className='font-semibold text-foreground'>
                      {endpoints.length}
                    </span>
                    {t('admin_model_servers.servers_unit')}
                  </span>
                  <span className='text-muted-foreground'>•</span>
                  <span className='text-muted-foreground'>
                    {t('admin_model_servers.active_label')}{' '}
                    <span className='font-semibold text-primary'>
                      {endpoints.filter((e) => e.isActive !== false).length}
                    </span>
                    {t('admin_model_servers.unit_count')}
                  </span>
                  {endpoints.filter((e) => e.isActive === false).length > 0 && (
                    <>
                      <span className='text-muted-foreground'>
                        •
                      </span>
                      <span className='text-muted-foreground'>
                        {t('admin_model_servers.inactive_label')}{' '}
                        <span className='font-semibold text-muted-foreground'>
                          {endpoints.filter((e) => e.isActive === false).length}
                        </span>
                        {t('admin_model_servers.unit_count')}
                      </span>
                    </>
                  )}
                </div>
                <span className='text-muted-foreground'>
                  {
                    endpoints.filter((ep) => {
                      try {
                        const url = new URL(ep.url);
                        const epHost = url.hostname;
                        const epPort = url.port
                          ? parseInt(url.port, 10)
                          : url.protocol === 'https:'
                          ? 443
                          : 80;

                        // 실시간 상태 확인
                        const realTime = realTimeStatus.find((rt) => {
                          // URL이 있으면 URL로 비교
                          if (rt.url) {
                            try {
                              const rtUrl = new URL(rt.url);
                              return (
                                rtUrl.hostname === epHost &&
                                parseInt(rtUrl.port || '80', 10) === epPort
                              );
                            } catch (error) {
                              logger.warn('[Catch] 에러 발생:', error.message);
                              // URL 파싱 실패 시 무시
                            }
                          }

                          // host와 port로 비교
                          if (rt.host && rt.port) {
                            const rtHost = rt.host.toString().trim();
                            const rtPort = parseInt(rt.port.toString(), 10);
                            return rtHost === epHost && rtPort === epPort;
                          }

                          // ID 형식으로 비교 (fallback)
                          if (rt.id) {
                            try {
                              // ID가 URL 형식인 경우
                              if (rt.id.includes('://')) {
                                const rtUrl = new URL(rt.id);
                                return (
                                  rtUrl.hostname === epHost &&
                                  parseInt(rtUrl.port || '80', 10) === epPort
                                );
                              }

                              // ID 형식: model-server-{hostname}-{port}
                              const idParts = rt.id.split('-');
                              if (idParts.length >= 4) {
                                const rtHost = idParts.slice(2, -1).join('-');
                                const rtPort = parseInt(
                                  idParts[idParts.length - 1],
                                  10
                                );
                                return rtHost === epHost && rtPort === epPort;
                              } else if (idParts.length === 3) {
                                const rtHost = idParts[1];
                                const rtPort = parseInt(idParts[2], 10);
                                return rtHost === epHost && rtPort === epPort;
                              }
                            } catch (error) {
                              logger.warn('[Catch] 에러 발생:', error.message);
                              // ID 파싱 실패 시 무시
                            }
                          }

                          return false;
                        });

                        if (realTime && realTime.status === 'healthy') {
                          return true;
                        }

                        // DB 인스턴스 확인
                        return modelServers.some((i) => {
                          const iHost = (i.host || '').toString().trim();
                          const iPort = i.port
                            ? parseInt(i.port.toString(), 10)
                            : ep.url.includes('https')
                            ? 443
                            : 80;
                          return (
                            iHost === epHost && iPort === epPort && i.isActive
                          );
                        });
                      } catch (e) {
                        return false;
                      }
                    }).length
                  }
                  /{endpoints.length}{t('admin_model_servers.healthy_servers')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 수정 모달 */}
        {editingEndpoint && (
          <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
            {/* 배경 오버레이 */}
            <div
              className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
              onClick={() => setEditingEndpoint(null)}
            />
            {/* 모달 내용 */}
            <div
              className='relative bg-card rounded-lg shadow-xl w-full max-w-full md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl mx-4 p-6'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center justify-between mb-4'>
                <h3 className='text-lg font-semibold text-foreground'>
                  {t('admin_model_servers.edit_server_title')}
                </h3>
                <button
                  onClick={cancelEditEndpoint}
                  disabled={savingEndpoints}
                  className='text-muted-foreground hover:text-foreground transition-colors'
                >
                  <X className='h-5 w-5' />
                </button>
              </div>
              <div className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1 flex items-center gap-2'>
                    <span>
                      {t('admin_model_servers.server_name_label')} <span className='text-destructive'>*</span>
                    </span>
                    <div className='group relative'>
                      <HelpCircle className='h-4 w-4 text-muted-foreground hover:text-foreground cursor-help' />
                      <div className='absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-10'>
                        <div className='bg-foreground dark:bg-muted text-white text-xs rounded-lg py-2 px-3 shadow-lg whitespace-nowrap max-w-xs'>
                          <div className='font-semibold mb-1'>
                            {t('admin_model_servers.name_readonly_title')}
                          </div>
                          <div>{t('admin_model_servers.name_readonly_line1')}</div>
                          <div>{t('admin_model_servers.name_readonly_line2')}</div>
                          <div className='absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-foreground dark:border-t-muted'></div>
                        </div>
                      </div>
                    </div>
                  </label>
                  <input
                    type='text'
                    value={editingEndpoint.name}
                    placeholder='예: My Server, GPU-1'
                    className='w-full px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground cursor-not-allowed'
                    readOnly
                    maxLength={50}
                    required
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1'>
                    URL
                  </label>
                  <input
                    type='text'
                    value={editingEndpoint.url}
                    onChange={(e) =>
                      setEditingEndpoint({
                        ...editingEndpoint,
                        url: e.target.value,
                      })
                    }
                    placeholder='예: http://localhost:11434'
                    className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
                    disabled={savingEndpoints}
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1'>
                    Provider
                  </label>
                  <input
                    type='text'
                    value='ollama'
                    className='w-full px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground cursor-not-allowed'
                    readOnly
                  />
                </div>
                <div>
                  <label className='flex items-center gap-2 text-sm font-medium text-foreground'>
                    <input
                      type='checkbox'
                      checked={
                        editingEndpoint.isActive !== undefined
                          ? editingEndpoint.isActive
                          : true
                      }
                      onChange={(e) =>
                        setEditingEndpoint({
                          ...editingEndpoint,
                          isActive: e.target.checked,
                        })
                      }
                      className='w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring'
                      disabled={savingEndpoints}
                    />
                    <span>{t('admin_model_servers.active_checkbox')}</span>
                  </label>
                  <p className='text-xs text-muted-foreground mt-1 ml-6'>
                    {t('admin_model_servers.inactive_roundrobin_note')}
                  </p>
                </div>
                <div className='flex items-center justify-end gap-2 pt-2'>
                  <button
                    onClick={cancelEditEndpoint}
                    disabled={savingEndpoints}
                    className='inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={saveEditEndpoint}
                    disabled={savingEndpoints}
                    className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 추가 모달 */}
        {showAddForm && !editingEndpoint && (
          <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
            {/* 배경 오버레이 */}
            <div
              className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
              onClick={() => setEditingEndpoint(null)}
            />
            {/* 모달 내용 */}
            <div
              className='relative bg-card rounded-lg shadow-xl w-full max-w-full md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl mx-4 p-6'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center justify-between mb-4'>
                <h3 className='text-lg font-semibold text-foreground'>
                  {t('admin_model_servers.add_server_title')}
                </h3>
                <button
                  onClick={() => setShowAddForm(false)}
                  disabled={savingEndpoints}
                  className='text-muted-foreground hover:text-foreground transition-colors'
                >
                  <X className='h-5 w-5' />
                </button>
              </div>
              <div className='space-y-4'>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1 flex items-center gap-2'>
                    <span>
                      {t('admin_model_servers.server_name_label')} <span className='text-destructive'>*</span>
                    </span>
                    <div className='group relative'>
                      <HelpCircle className='h-4 w-4 text-muted-foreground hover:text-foreground cursor-help' />
                      <div className='absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-10'>
                        <div className='bg-foreground dark:bg-muted text-white text-xs rounded-lg py-2 px-3 shadow-lg whitespace-nowrap max-w-xs'>
                          <div className='font-semibold mb-1'>
                            {t('admin_model_servers.roundrobin_help_title')}
                          </div>
                          <div>{t('admin_model_servers.roundrobin_help_line1')}</div>
                          <div>{t('admin_model_servers.roundrobin_help_line2')}</div>
                          <div className='absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-foreground dark:border-t-muted'></div>
                        </div>
                      </div>
                    </div>
                  </label>
                  <input
                    type='text'
                    value={endpointNameInput}
                    onChange={(e) => setEndpointNameInput(e.target.value)}
                    placeholder='예: My Server, GPU-1'
                    className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
                    disabled={savingEndpoints}
                    maxLength={50}
                    required
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1'>
                    URL
                  </label>
                  <input
                    type='text'
                    value={endpointUrlInput}
                    onChange={(e) => setEndpointUrlInput(e.target.value)}
                    placeholder='예: http://localhost:11434'
                    className='w-full px-3 py-2 border border-border rounded-md bg-background text-foreground'
                    disabled={savingEndpoints}
                  />
                </div>
                <div>
                  <label className='block text-sm font-medium text-foreground mb-1'>
                    Provider
                  </label>
                  <input
                    type='text'
                    value='ollama'
                    className='w-full px-3 py-2 border border-border rounded-md bg-muted text-muted-foreground cursor-not-allowed'
                    readOnly
                  />
                </div>
                <div className='flex items-center justify-end gap-2 pt-2'>
                  <button
                    onClick={() => setShowAddForm(false)}
                    disabled={savingEndpoints}
                    className='inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={addEndpoint}
                    disabled={savingEndpoints}
                    className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
                  >
                    {t('admin_model_servers.add')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 오류 이력 모달 */}
      {showErrorHistoryModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          {/* 배경 오버레이 */}
          <div
            className='absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity'
            onClick={() => {
              setShowErrorHistoryModal(false);
              setErrorHistory([]);
            }}
          />
          {/* 모달 내용 */}
          <div className='relative bg-card rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col'>
            <div className='flex items-center justify-between p-4 border-b border-border'>
              <h2 className='text-lg font-semibold text-foreground'>
                {t('admin_model_servers.error_history_for', { endpoint: selectedEndpointForHistory })}
              </h2>
              <div className='flex items-center gap-2'>
                {errorHistory.length > 0 && (
                  <button
                    onClick={() =>
                      deleteAllErrorHistory(selectedEndpointForHistory)
                    }
                    disabled={errorHistoryLoading}
                    className='px-3 py-1.5 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed'
                  >
                    <Trash2 className='h-4 w-4' />
                    {t('admin_model_servers.delete_all')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowErrorHistoryModal(false);
                    setErrorHistory([]);
                    setSelectedEndpointForHistory(null);
                  }}
                  className='text-muted-foreground hover:text-foreground'
                >
                  <X className='h-5 w-5' />
                </button>
              </div>
            </div>
            <div className='p-4 overflow-y-auto flex-1'>
              {errorHistoryLoading ? (
                <div className='flex items-center justify-center py-8'>
                  <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
                </div>
              ) : errorHistory.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground'>
                  {t('admin_model_servers.no_errors_7days')}
                </div>
              ) : (
                <div className='space-y-3'>
                  {errorHistory.map((error) => {
                    const metadata = error.metadata || {};
                    const stack = metadata.stack || null;
                    const hasStack = stack && stack.trim().length > 0;

                    return (
                      <div
                        key={error.id}
                        className='p-3 bg-destructive/10 border border-destructive/20 rounded-lg'
                      >
                        <div className='flex items-start justify-between mb-2'>
                          <div className='flex-1'>
                            <div className='flex items-center gap-2 mb-1 flex-wrap'>
                              <span className='text-xs font-medium text-destructive'>
                                {error.errorType || 'Unknown'}
                              </span>
                              <span className='text-xs text-muted-foreground'>
                                {new Date(error.checkedAt).toLocaleString(
                                  'ko-KR',
                                  { timeZone: 'Asia/Seoul' }
                                )}
                              </span>
                              {error.responseTime !== null && (
                                <span className='text-xs text-muted-foreground'>
                                  ({error.responseTime}ms)
                                </span>
                              )}
                              {metadata.name && (
                                <span className='text-xs text-muted-foreground font-medium'>
                                  {metadata.name}
                                </span>
                              )}
                            </div>
                            <p className='text-sm text-destructive break-words mb-2'>
                              {error.errorMessage}
                            </p>

                            {/* 스택 트레이스 표시 */}
                            {hasStack && (
                              <details className='mt-2'>
                                <summary className='text-xs text-muted-foreground cursor-pointer hover:text-foreground font-medium'>
                                  {t('admin_model_servers.view_stack_trace')}
                                </summary>
                                <div className='relative mt-2'>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        stack,
                                        `stack-${error.id}`
                                      )
                                    }
                                    className='absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground hover:bg-accent rounded transition-colors'
                                    title={t('admin_model_servers.copy_to_clipboard')}
                                  >
                                    {copiedTexts.has(`stack-${error.id}`) ? (
                                      <Check className='w-4 h-4 text-primary' />
                                    ) : (
                                      <Copy className='w-4 h-4' />
                                    )}
                                  </button>
                                  <pre className='text-xs text-foreground overflow-x-auto bg-muted p-3 pr-10 rounded border border-border whitespace-pre-wrap break-words'>
                                    {stack}
                                  </pre>
                                </div>
                              </details>
                            )}

                            {/* 기타 메타데이터 (스택 제외) */}
                            {metadata &&
                              Object.keys(metadata).filter(
                                (key) => key !== 'stack'
                              ).length > 0 && (
                                <details className='mt-2'>
                                  <summary className='text-xs text-muted-foreground cursor-pointer hover:text-foreground'>
                                    {t('admin_model_servers.view_details')}
                                  </summary>
                                  <div className='relative mt-2'>
                                    {(() => {
                                      const metadataText = JSON.stringify(
                                        Object.fromEntries(
                                          Object.entries(metadata).filter(
                                            ([key]) => key !== 'stack'
                                          )
                                        ),
                                        null,
                                        2
                                      );
                                      return (
                                        <>
                                          <button
                                            onClick={() =>
                                              copyToClipboard(
                                                metadataText,
                                                `metadata-${error.id}`
                                              )
                                            }
                                            className='absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground hover:bg-accent rounded transition-colors'
                                            title={t('admin_model_servers.copy_to_clipboard')}
                                          >
                                            {copiedTexts.has(
                                              `metadata-${error.id}`
                                            ) ? (
                                              <Check className='w-4 h-4 text-primary' />
                                            ) : (
                                              <Copy className='w-4 h-4' />
                                            )}
                                          </button>
                                          <pre className='text-xs text-muted-foreground overflow-x-auto bg-muted p-2 pr-10 rounded'>
                                            {metadataText}
                                          </pre>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </details>
                              )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
