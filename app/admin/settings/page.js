'use client';


import logger from '@/lib/logger';
import PageHead from '@/components/admin/PageHead';

import { useState, useEffect } from 'react';
import { PenLine } from 'lucide-react';
import { Upload, Save, RefreshCw, Globe, MessageCircle, Lightbulb, Trash2, ImageIcon, Code } from '@/components/icons';
import { THEME_PRESETS } from '@/lib/themePresets';
import Image from 'next/image'; // Image 컴포넌트 임포트
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const BRANDING_EVENT_NAME = 'hanimo-webui-site-branding-updated';

export default function SettingsPage() {
  const { alert, confirm } = useAlert();
  const { t } = useTranslation();
  const [tooltipEnabled, setTooltipEnabled] = useState(true);
  const [tooltipMessage, setTooltipMessage] = useState(
    t('admin.tooltip_default')
  );
  const [chatWidgetEnabled, setChatWidgetEnabled] = useState(false);
  const [profileEditEnabled, setProfileEditEnabled] = useState(false);
  const [boardEnabled, setBoardEnabled] = useState(true);
  const [supportContacts, setSupportContacts] = useState([]);
  const [supportContactsEnabled, setSupportContactsEnabled] = useState(true);
  const [siteTitle, setSiteTitle] = useState('hanimo-webui');
  const [siteDescription, setSiteDescription] = useState('hanimo-webui');
  const [faviconUrl, setFaviconUrl] = useState(null);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [roomNameGenerationModel, setRoomNameGenerationModel] = useState('gemma3:4b');
  const [maxImagesPerMessage, setMaxImagesPerMessage] = useState(5);
  const [maxUserQuestionLength, setMaxUserQuestionLength] = useState(300000);
  const [imageAnalysisModel, setImageAnalysisModel] = useState('');
  const [imageAnalysisPrompt, setImageAnalysisPrompt] = useState(
    t('chat.image_analysis_prompt')
  );
  const [drawEnabled, setDrawEnabled] = useState(false);
  const [drawModel, setDrawModel] = useState('');
  const DEFAULT_DRAW_PROMPT = `Generate a complete HTML page based on the user's request. Always wrap the response in a \`\`\`html code block.

[Allowed resources]
- Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>)
- Plain HTML + inline CSS + vanilla JavaScript
- Canvas API, SVG for charts/graphs/diagrams

[Forbidden]
- Any external CDN, URL, or library not listed above

[Rules]
- Build clean, modern UI using Tailwind CSS
- Implement charts/graphs directly with Canvas API (bar, line, pie, donut, etc.)
- Implement diagrams/flowcharts directly with SVG
- Prefer dark mode support (Tailwind dark: classes or prefers-color-scheme)
- Apply responsive design
- Use CSS transitions/animations or requestAnimationFrame for motion`;
  const [drawSystemPrompt, setDrawSystemPrompt] = useState(DEFAULT_DRAW_PROMPT);
  const [endpoints, setEndpoints] = useState(''); // 콤마 구분 문자열
  const [endpointType, setEndpointType] = useState('ollama'); // 'ollama' | 'openai-compatible'
  const [openaiCompatBase, setOpenaiCompatBase] = useState('');
  const [openaiCompatApiKeyInput, setOpenaiCompatApiKeyInput] = useState('');
  const [clearOpenaiKey, setClearOpenaiKey] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState(null); // 현재 저장 중인 섹션 추적
  const [loginType, setLoginType] = useState('local'); // 'local' | 'sso'
  const [apiConfigExample, setApiConfigExample] = useState('');
  const [apiCurlExample, setApiCurlExample] = useState('');
  const [themePreset, setThemePreset] = useState('amber-soft');
  const [themeColors, setThemeColors] = useState({});
  const [themeCustomPrimary, setThemeCustomPrimary] = useState('#e5a63b');
  const [ghostModeEnabled, setGhostModeEnabled] = useState(false);
  const [ghostBubbleEnabled, setGhostBubbleEnabled] = useState(true);

  // 설정 로드
  useEffect(() => {
    fetchSettings();
    fetchAvailableModels();
  }, []);

  // 사용 가능한 모델 목록 로드 (관리자 모델 설정 기준)
  const fetchAvailableModels = async () => {
    try {
      setModelsLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/models', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const categories = data?.modelConfig?.categories || {};

        const groupedModels = Object.entries(categories).map(
          ([categoryKey, category]) => {
            const serverName = category.label || categoryKey;
            const models = Array.isArray(category.models)
              ? category.models
              : [];

            // label 기준으로 중복 제거 (같은 label은 라운드로빈으로 하나만 표시)
            const seenLabels = new Set();
            const uniqueModels = [];

            models.forEach((model) => {
              const modelName = model.modelName || model.id || '';
              const label = model.label || modelName;

              if (!seenLabels.has(label)) {
                seenLabels.add(label);
                const isMultimodal =
                  modelName.includes('llava') ||
                  modelName.includes('gemma3') ||
                  modelName.includes('bakllava') ||
                  modelName.includes('vision') ||
                  modelName.includes('multimodal');
                uniqueModels.push({
                  id: model.id || modelName,
                  label: label,
                  tooltip: model.tooltip || '',
                  isMultimodal,
                });
              }
            });

            return {
              serverName,
              provider: 'config',
              models: uniqueModels.sort((a, b) => a.label.localeCompare(b.label)),
            };
          }
        );

        setAvailableModels(groupedModels);
        logger.info(t('admin_settings.log_models_loaded'), groupedModels);
      } else {
        logger.warn(t('admin_settings.log_models_load_failed'), response.status);
        setAvailableModels([]);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_models_load_failed'), error);
      setAvailableModels([]);
    } finally {
      setModelsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/settings', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTooltipEnabled(
          data.tooltipEnabled !== undefined ? data.tooltipEnabled : true
        );
        setTooltipMessage(
          data.tooltipMessage || t('admin.tooltip_default')
        );
        setChatWidgetEnabled(
          data.chatWidgetEnabled !== undefined ? data.chatWidgetEnabled : false
        );
        setProfileEditEnabled(
          data.profileEditEnabled !== undefined ? data.profileEditEnabled : false
        );
        setBoardEnabled(
          data.boardEnabled !== undefined ? data.boardEnabled : true
        );
        setSupportContacts(Array.isArray(data.supportContacts) ? data.supportContacts : []);
        setSupportContactsEnabled(
          data.supportContactsEnabled !== undefined
            ? data.supportContactsEnabled
            : true
        );
      setSiteTitle(data.siteTitle || 'hanimo-webui');
      setSiteDescription(data.siteDescription || 'hanimo-webui');
          setFaviconUrl(data.faviconUrl || null);
          setRoomNameGenerationModel(data.roomNameGenerationModel || 'gemma3:4b');
          setMaxImagesPerMessage(data.maxImagesPerMessage || 5);
          setMaxUserQuestionLength(data.maxUserQuestionLength || 300000);
          setImageAnalysisModel(data.imageAnalysisModel || '');
          setImageAnalysisPrompt(
            data.imageAnalysisPrompt || t('chat.image_analysis_prompt')
          );
          setDrawEnabled(
            data.drawEnabled !== undefined ? data.drawEnabled : false
          );
          setDrawModel(data.drawModel || '');
          setDrawSystemPrompt(data.drawSystemPrompt || DEFAULT_DRAW_PROMPT);
        setGhostModeEnabled(
          data.ghostModeEnabled !== undefined ? data.ghostModeEnabled : false
        );
        setGhostBubbleEnabled(
          data.ghostBubbleEnabled !== undefined ? data.ghostBubbleEnabled : true
        );
        setEndpoints(
          typeof data.endpoints === 'string'
            ? data.endpoints
            : 'http://localhost:11434'
        );
        setEndpointType(data.endpointType || 'ollama');
        setOpenaiCompatBase(data.openaiCompatBase || '');
        setOpenaiCompatApiKeyInput('');
        setClearOpenaiKey(false);
        setLoginType(data.loginType || 'local');
        setApiConfigExample(data.apiConfigExample || '');
        setApiCurlExample(data.apiCurlExample || '');
        setThemePreset(data.themePreset || 'amber-soft');
        setThemeColors(data.themeColors || {});
        if (data.themeColors?.light?.['--primary']) {
          setThemeCustomPrimary(data.themeColors.light['--primary']);
        }
      } else {
        setTooltipEnabled(true);
        setTooltipMessage(t('admin.tooltip_default'));
        setChatWidgetEnabled(true);
        setBoardEnabled(true);
        setSupportContacts([]);
        setSupportContactsEnabled(true);
      setSiteTitle('hanimo-webui');
      setSiteDescription('hanimo-webui');
        setFaviconUrl(null);
        setRoomNameGenerationModel('gemma3:4b');
        setDrawEnabled(false);
        setDrawModel('');
        setDrawSystemPrompt(DEFAULT_DRAW_PROMPT);
        setMaxUserQuestionLength(300000);
        setEndpoints('http://localhost:11434');
        setEndpointType('ollama');
        setOpenaiCompatBase('');
        setOpenaiCompatApiKeyInput('');
        setClearOpenaiKey(false);
        setLoginType('local');
        setApiConfigExample('');
        setApiCurlExample('');
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_load_failed'), error);
      setTooltipEnabled(true);
      setTooltipMessage(t('admin.tooltip_default'));
      setChatWidgetEnabled(false);
      setProfileEditEnabled(false);
      setBoardEnabled(true);
      setSupportContacts([]);
      setSupportContactsEnabled(true);
      setSiteTitle('hanimo-webui');
      setSiteDescription('hanimo-webui');
        setFaviconUrl(null);
        setDrawEnabled(false);
        setDrawModel('');
        setDrawSystemPrompt(DEFAULT_DRAW_PROMPT);
        setEndpoints('http://localhost:11434');
        setMaxUserQuestionLength(300000);
      setEndpointType('ollama');
      setOpenaiCompatBase('');
      setOpenaiCompatApiKeyInput('');
      setClearOpenaiKey(false);
      setLoginType('local');
      setApiConfigExample('');
      setApiCurlExample('');
    } finally {
      setLoading(false);
    }
  };

  const saveDrawSettings = async () => {
    try {
      setSavingSection('draw');
      const token = localStorage.getItem('token');
      const body = {
        drawEnabled,
        drawModel,
        drawSystemPrompt,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert('Draw settings saved.', 'success', 'Save complete');
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn(t('admin_settings.log_catch_failed'), error.message);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  // 개별 섹션 저장 함수들
  const saveSiteBranding = async () => {
    try {
      setSavingSection('branding');
      const token = localStorage.getItem('token');
      const body = {
        siteTitle,
        siteDescription,
        faviconUrl,
        boardEnabled,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        window.dispatchEvent(
          new CustomEvent(BRANDING_EVENT_NAME, {
            detail: {
              siteTitle,
              siteDescription,
              faviconUrl,
            },
          })
        );
        alert(t('admin_settings.branding_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn(t('admin_settings.log_catch_failed'), error.message);
  }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveTheme = async () => {
    try {
      setSavingSection('theme');
      const token = localStorage.getItem('token');
      const body = { themePreset, themeColors };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        window.dispatchEvent(
          new CustomEvent('hanimo-webui-theme-updated', {
            detail: { themePreset, themeColors },
          })
        );
        alert(t('admin_settings.theme_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          logger.warn('Failed to parse error response', e.message);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error('Failed to save theme:', error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };


  const saveChatWidget = async () => {
    try {
      setSavingSection('widget');
      const token = localStorage.getItem('token');
      const body = {
        chatWidgetEnabled,
        profileEditEnabled,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.widget_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn(t('admin_settings.log_catch_failed'), error.message);
  }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  // 채팅 위젯 이력 미노출 처리
  const deleteChatHistory = async () => {
    const confirmed = await confirm(
      t('admin_settings.confirm_hide_chat'),
      t('admin_settings.confirm_hide_chat_title')
    );
    
    if (!confirmed) return;

    try {
      setSavingSection('widget-delete');
      const token = localStorage.getItem('token');
      const response = await fetch('/api/webapp-chat', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        alert(
          data.message || t('admin_settings.chat_history_hidden'),
          'success',
          t('admin_settings.process_complete')
        );
      } else {
        let errorMessage = t('admin_settings.history_hide_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn(t('admin_settings.log_catch_failed'), error.message);
  }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_chat_history_hide_failed'), error);
      alert(
        error.message || t('admin_settings.chat_history_hide_error'),
        'error',
        t('admin_settings.process_failed')
      );
    } finally {
      setSavingSection(null);
    }
  };

  const saveRoomNameSettings = async () => {
    try {
      setSavingSection('roomName');
      const token = localStorage.getItem('token');
      const body = {
        roomNameGenerationModel,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.room_name_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn(t('admin_settings.log_catch_failed'), error.message);
  }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveImageSettings = async () => {
    try {
      setSavingSection('image');
      const token = localStorage.getItem('token');
      const body = {
        maxImagesPerMessage,
        imageAnalysisModel,
        imageAnalysisPrompt,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.image_settings_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn(t('admin_settings.log_catch_failed'), error.message);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveQuestionLengthSettings = async () => {
    try {
      setSavingSection('questionLength');
      const token = localStorage.getItem('token');
      const body = {
        maxUserQuestionLength,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.question_length_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn(t('admin_settings.log_catch_failed'), error.message);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveTooltipSettings = async () => {
    try {
      setSavingSection('tooltip');
      const token = localStorage.getItem('token');
      const body = {
        tooltipEnabled,
        tooltipMessage,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.tooltip_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
    // 에러 발생 시 무시 (선택적 작업)
    logger.warn(t('admin_settings.log_catch_failed'), error.message);
  }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveLoginTypeSettings = async () => {
    try {
      setSavingSection('loginType');
      const token = localStorage.getItem('token');
      const body = {
        loginType,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.login_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn(t('admin_settings.log_catch_failed'), error.message);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveApiTokenExamples = async () => {
    try {
      setSavingSection('apiTokenExamples');
      const token = localStorage.getItem('token');
      const body = {
        apiConfigExample,
        apiCurlExample,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.api_examples_saved'), 'success', t('admin_settings.save_complete'));
        fetchSettings();
      } else {
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn(t('admin_settings.log_catch_failed'), error.message);
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveGhostSettings = async () => {
    try {
      setSavingSection('ghost');
      const token = localStorage.getItem('token');
      const body = {
        ghostModeEnabled,
        ghostBubbleEnabled,
      };
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || t('errors.save_failed'));
      }
      await alert(t('common.save_success'), 'success');
    } catch (error) {
      await alert(error.message, 'error', t('errors.title'));
    } finally {
      setSavingSection(null);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem('token');
      const body = {
        tooltipEnabled,
        tooltipMessage,
        chatWidgetEnabled,
        boardEnabled,
        supportContacts,
        supportContactsEnabled,
        siteTitle,
        siteDescription,
        faviconUrl,
        roomNameGenerationModel,
        endpointType,
      };
      if (endpointType === 'ollama') {
        body.endpoints = endpoints;
      } else {
        body.openaiCompatBase = openaiCompatBase;
        if (clearOpenaiKey) {
          body.openaiCompatApiKey = '';
        } else if (openaiCompatApiKeyInput.trim()) {
          body.openaiCompatApiKey = openaiCompatApiKeyInput.trim();
        }
      }
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        alert(t('admin_settings.all_settings_saved'), 'success', t('admin_settings.save_complete'));
        // 저장 후 키 입력 상태 초기화 및 재조회
        setOpenaiCompatApiKeyInput('');
        setClearOpenaiKey(false);
        fetchSettings();
      } else {
        // 에러 응답 본문 읽기
        let errorMessage = t('admin_settings.settings_save_failed');
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (error) {
          logger.warn(t('admin_settings.log_catch_error'), error.message);
          // JSON 파싱 실패 시 기본 메시지 사용
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error(t('admin_settings.log_settings_save_failed'), error);
      alert(error.message || t('admin_settings.settings_save_failed'), 'error', t('admin_settings.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleFaviconUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setFaviconUploading(true);
      const formData = new FormData();
      formData.append('favicon', file);

      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/upload-favicon', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setFaviconUrl(data.faviconUrl);
        alert(t('admin_settings.favicon_uploaded'), 'success', t('admin_settings.upload_complete'));
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || t('admin_settings.favicon_upload_error'));
      }
    } catch (error) {
      logger.error(t('admin_settings.log_favicon_upload_failed'), error);
      alert(t('admin_settings.favicon_upload_failed_detail', { message: error.message }), 'error', t('admin_settings.upload_failed'));
    } finally {
      setFaviconUploading(false);
    }
  };

  const addSupportContact = () => {
    setSupportContacts((prev) => [
      ...(prev || []),
      { department: '', name: '', phone: '' },
    ]);
  };

  const updateSupportContact = (index, field, value) => {
    setSupportContacts((prev) => {
      const next = [...(prev || [])];
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return next;
    });
  };

  const removeSupportContact = (index) => {
    setSupportContacts((prev) => {
      const next = [...(prev || [])];
      next.splice(index, 1);
      return next;
    });
  };

  return (
    <div className='space-y-6'>
      <PageHead
        eyebrow='워크스페이스'
        title={t('admin.settings')}
        sub={t('admin_settings.page_description')}
      />

      {/* 사이트 브랜딩 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <Globe className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.site_branding')}
            </h2>
          </div>
          <button
            onClick={saveSiteBranding}
            disabled={savingSection === 'branding' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'branding' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.site_title_label')}
            </label>
            <input
              type='text'
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
              placeholder='hanimo-webui'
              maxLength={50}
              disabled={loading}
            />
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.site_title_hint', { length: siteTitle.length })}
            </p>
          </div>

          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.site_description_label')}
            </label>
            <textarea
              value={siteDescription}
              onChange={(e) => setSiteDescription(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
              placeholder='hanimo-webui'
              maxLength={200}
              rows={2}
              disabled={loading}
            />
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.site_description_hint', { length: siteDescription.length })}
            </p>
          </div>

          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.favicon_label')}
            </label>
            <div className='flex items-center gap-4'>
              {faviconUrl && (
                <div className='flex items-center gap-2'>
                  <Image
                    src={faviconUrl}
                    alt='Current favicon'
                    width={32}
                    height={32}
                    className='w-8 h-8 rounded'
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <span className='text-sm text-muted-foreground'>
                    {t('admin_settings.current_favicon')}
                  </span>
                </div>
              )}
              <label className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 px-4 py-2 cursor-pointer disabled:opacity-50'>
                <Upload className='h-4 w-4' />
                {faviconUploading ? t('admin_settings.uploading') : t('admin_settings.favicon_upload_btn')}
                <input
                  type='file'
                  accept='.ico,.png,.svg'
                  onChange={handleFaviconUpload}
                  className='hidden'
                  disabled={faviconUploading || loading}
                />
              </label>
            </div>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.favicon_hint')}
            </p>
          </div>

          <div className='border border-border rounded-lg p-4 bg-muted'>
            <h4 className='text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.preview')}
            </h4>
            <div className='flex items-center gap-3 p-2 bg-background rounded border'>
              {faviconUrl ? (
                <Image
                  src={faviconUrl}
                  alt='Favicon preview'
                  width={16}
                  height={16}
                  className='w-4 h-4'
                />
              ) : (
                <div className='w-4 h-4 bg-muted rounded'></div>
              )}
              <span className='text-sm font-medium text-foreground'>
                {siteTitle}
              </span>
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              {t('admin_settings.browser_tab_preview')}
            </p>
          </div>

          <div className='border border-border rounded-lg p-4 bg-muted'>
            <h4 className='text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.free_board')}
            </h4>
            <div className='flex items-center justify-between'>
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  {t('admin_settings.free_board_use')}
                </label>
                <p className='text-sm text-muted-foreground'>
                  {t('admin_settings.free_board_desc')}
                </p>
              </div>
              <button
                onClick={() => setBoardEnabled(!boardEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                  boardEnabled
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
                disabled={loading}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                    boardEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 로그인 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <Globe className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.login_settings')}
            </h2>
          </div>
          <button
            onClick={saveLoginTypeSettings}
            disabled={savingSection === 'loginType' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'loginType' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-foreground mb-3'>
              {t('admin_settings.default_login_method')}
            </label>
            <div className='flex flex-wrap items-center gap-4'>
              <label className='inline-flex items-center gap-2 text-sm text-foreground cursor-pointer'>
                <input
                  type='radio'
                  name='login-type'
                  value='local'
                  checked={loginType === 'local'}
                  onChange={() => setLoginType('local')}
                  className='accent-primary'
                  disabled={loading}
                />
                <span className='font-medium'>{t('admin_settings.normal_login')}</span>
                <span className='text-muted-foreground'>{t('admin_settings.normal_login_desc')}</span>
              </label>
              <label className='inline-flex items-center gap-2 text-sm text-foreground cursor-pointer'>
                <input
                  type='radio'
                  name='login-type'
                  value='sso'
                  checked={loginType === 'sso'}
                  onChange={() => setLoginType('sso')}
                  className='accent-primary'
                  disabled={loading}
                />
                <span className='font-medium'>{t('admin_settings.sso_login')}</span>
                <span className='text-muted-foreground'>{t('admin_settings.sso_login_desc')}</span>
              </label>
            </div>
            <p className='text-sm text-muted-foreground mt-2'>
              {t('admin_settings.login_redirect_desc')}
            </p>
          </div>

          <div className='border border-border rounded-lg p-4 bg-muted'>
            <h4 className='text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.login_page_url')}
            </h4>
            <ul className='text-sm text-muted-foreground space-y-1'>
              <li>• {t('admin_settings.normal_login_url')} <code className='bg-muted px-1 rounded'>/login</code></li>
              <li>• {t('admin_settings.sso_login_url')} <code className='bg-muted px-1 rounded'>/sso</code></li>
            </ul>
          </div>
        </div>
      </div>

      {/* 담당자 정보 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <MessageCircle className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.support_contacts')}
            </h2>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-3'>
          <div className='flex items-center justify-between border border-border rounded-lg p-3 bg-muted'>
            <div>
              <p className='text-sm font-medium text-foreground'>
                {t('admin_settings.login_display')}
              </p>
              <p className='text-xs text-muted-foreground'>
                {t('admin_settings.login_display_desc')}
              </p>
            </div>
            <button
              onClick={() =>
                setSupportContactsEnabled(!supportContactsEnabled)
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                supportContactsEnabled
                  ? 'bg-primary'
                  : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                  supportContactsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {supportContacts.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('admin_settings.no_contacts')}
            </p>
          ) : (
            supportContacts.map((contact, index) => (
              <div
                key={`support-${index}`}
                className='grid grid-cols-1 md:grid-cols-4 gap-3 items-center border border-border rounded-lg p-3 bg-muted'
              >
                <input
                  type='text'
                  value={contact.department || ''}
                  onChange={(e) =>
                    updateSupportContact(index, 'department', e.target.value)
                  }
                  className='px-3 py-2 border border-input rounded-md bg-background text-foreground'
                  placeholder={t('admin_settings.group_placeholder')}
                />
                <input
                  type='text'
                  value={contact.name || ''}
                  onChange={(e) =>
                    updateSupportContact(index, 'name', e.target.value)
                  }
                  className='px-3 py-2 border border-input rounded-md bg-background text-foreground'
                  placeholder={t('admin_settings.name_placeholder')}
                />
                <input
                  type='text'
                  value={contact.phone || ''}
                  onChange={(e) =>
                    updateSupportContact(index, 'phone', e.target.value)
                  }
                  className='px-3 py-2 border border-input rounded-md bg-background text-foreground'
                  placeholder={t('admin_settings.phone_placeholder')}
                />
                <button
                  onClick={() => removeSupportContact(index)}
                  className='inline-flex items-center justify-center rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm px-3 py-2'
                >
                  {t('common.delete')}
                </button>
              </div>
            ))
          )}

          <button
            onClick={addSupportContact}
            className='inline-flex items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none text-sm px-3 py-2'
          >
            {t('admin_settings.add_contact')}
          </button>
        </div>
      </div>

      {/* 디자인 테마 섹션 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <div className='h-5 w-5 rounded-full bg-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.design_theme')}
            </h2>
          </div>
        </div>
        <p className='text-sm text-muted-foreground mb-6'>
          {t('admin_settings.design_theme_desc')}
        </p>

        {/* 프리셋 팔레트 그리드 */}
        <div className='mb-6'>
          <p className='text-sm font-medium text-foreground mb-3'>
            {t('admin_settings.preset_palettes')}
          </p>
          <div className='grid grid-cols-3 gap-3'>
            {Object.values(THEME_PRESETS).map((preset) => (
              <button
                key={preset.id}
                data-testid={`theme-swatch-${preset.id}`}
                onClick={() => {
                  setThemePreset(preset.id);
                  setThemeColors({ light: preset.light, dark: preset.dark });
                  setThemeCustomPrimary(preset.light['--primary'] || '#e5a63b');
                  if (preset.light) {
                    Object.entries(preset.light).forEach(([varName, value]) => {
                      document.documentElement.style.setProperty(varName, value);
                    });
                  }
                }}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer text-left ${
                  themePreset === preset.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 bg-background'
                }`}
              >
                <div
                  className='h-8 w-8 rounded-full flex-shrink-0'
                  style={{ backgroundColor: preset.preview }}
                />
                <span className='text-sm font-medium text-foreground'>
                  {preset.nameKo}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 커스텀 색상 입력 */}
        <div className='mb-6'>
          <p className='text-sm font-medium text-foreground mb-2'>
            {t('admin_settings.custom_color')}
          </p>
          <p className='text-xs text-muted-foreground mb-3'>
            {t('admin_settings.custom_color_desc')}
          </p>
          <div className='flex items-center gap-3'>
            <input
              type='color'
              value={themeCustomPrimary}
              onChange={(e) => {
                const hex = e.target.value;
                setThemeCustomPrimary(hex);
                setThemePreset('custom');
                const customColors = {
                  light: { '--primary': hex, '--ring': hex, '--chart-1': hex, '--sidebar-primary': hex },
                  dark: { '--primary': hex, '--ring': hex, '--chart-1': hex, '--sidebar-primary': hex },
                };
                setThemeColors(customColors);
                document.documentElement.style.setProperty('--primary', hex);
              }}
              className='h-10 w-16 rounded border border-border cursor-pointer'
            />
            <Input
              type='text'
              value={themeCustomPrimary}
              onChange={(e) => {
                const hex = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(hex)) {
                  setThemeCustomPrimary(hex);
                  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
                    setThemePreset('custom');
                    const customColors = {
                      light: { '--primary': hex, '--ring': hex, '--chart-1': hex, '--sidebar-primary': hex },
                      dark: { '--primary': hex, '--ring': hex, '--chart-1': hex, '--sidebar-primary': hex },
                    };
                    setThemeColors(customColors);
                    document.documentElement.style.setProperty('--primary', hex);
                  }
                }
              }}
              placeholder='#e5a63b'
              className='w-32 font-mono text-sm'
            />
            <span className='text-sm text-muted-foreground'>
              {t('admin_settings.primary_color')}
            </span>
          </div>
        </div>

        {/* 차트 색상 */}
        <div className='border-t border-border pt-4 mt-2'>
          <p className='text-sm font-medium text-foreground mb-1'>{t('admin_settings.chart_colors')}</p>
          <p className='text-xs text-muted-foreground mb-3'>{t('admin_settings.chart_colors_desc')}</p>
          <div className='space-y-2'>
            {[1, 2, 3].map((n) => {
              const varName = `--chart-${n}`;
              const lightVal = themeColors?.light?.[varName] || '';
              const darkVal = themeColors?.dark?.[varName] || '';
              return (
                <div key={n} className='flex items-center gap-3 flex-wrap'>
                  <span className='text-sm text-muted-foreground w-14'>{t('admin_settings.chart_label')} {n}</span>
                  <div className='flex items-center gap-1.5'>
                    <span className='text-xs text-muted-foreground'>L</span>
                    <input
                      type='color'
                      value={lightVal || '#e5a63b'}
                      onChange={(e) => {
                        const hex = e.target.value;
                        setThemeColors((prev) => ({ ...prev, light: { ...prev?.light, [varName]: hex } }));
                        document.documentElement.style.setProperty(varName, hex);
                      }}
                      className='w-7 h-7 rounded border border-border cursor-pointer'
                    />
                    <input
                      type='text'
                      value={lightVal}
                      onChange={(e) => {
                        const hex = e.target.value;
                        if (/^#[0-9a-fA-F]{0,6}$/.test(hex)) {
                          setThemeColors((prev) => ({ ...prev, light: { ...prev?.light, [varName]: hex } }));
                          if (/^#[0-9a-fA-F]{6}$/.test(hex)) document.documentElement.style.setProperty(varName, hex);
                        }
                      }}
                      className='w-24 text-xs px-2 py-1 border border-border rounded bg-background text-foreground font-mono'
                      placeholder='#e5a63b'
                    />
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <span className='text-xs text-muted-foreground'>D</span>
                    <input
                      type='color'
                      value={darkVal || '#f5be5b'}
                      onChange={(e) => {
                        const hex = e.target.value;
                        setThemeColors((prev) => ({ ...prev, dark: { ...prev?.dark, [varName]: hex } }));
                      }}
                      className='w-7 h-7 rounded border border-border cursor-pointer'
                    />
                    <input
                      type='text'
                      value={darkVal}
                      onChange={(e) => {
                        const hex = e.target.value;
                        if (/^#[0-9a-fA-F]{0,6}$/.test(hex)) {
                          setThemeColors((prev) => ({ ...prev, dark: { ...prev?.dark, [varName]: hex } }));
                        }
                      }}
                      className='w-24 text-xs px-2 py-1 border border-border rounded bg-background text-foreground font-mono'
                      placeholder='#f5be5b'
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 저장/초기화 버튼 */}
        <div className='flex items-center gap-3'>
          <Button
            onClick={saveTheme}
            disabled={savingSection === 'theme'}
            className='flex items-center gap-2'
          >
            <Save className='h-4 w-4' />
            {savingSection === 'theme' ? t('common.saving') : t('admin_settings.apply_theme')}
          </Button>
          <Button
            variant='outline'
            onClick={async () => {
              const confirmed = await confirm(
                t('admin_settings.theme_reset_confirm'),
                t('admin_settings.theme_reset'),
                'warning'
              );
              if (confirmed) {
                setThemePreset('amber-soft');
                const defaultPreset = THEME_PRESETS['amber-soft'];
                setThemeColors({ light: defaultPreset.light, dark: defaultPreset.dark });
                setThemeCustomPrimary(defaultPreset.light['--primary'] || '#e5a63b');
                if (defaultPreset.light) {
                  Object.entries(defaultPreset.light).forEach(([varName, value]) => {
                    document.documentElement.style.setProperty(varName, value);
                  });
                }
              }
            }}
            className='flex items-center gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            {t('admin_settings.theme_reset')}
          </Button>
        </div>
      </div>

      {/* 채팅 위젯 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <MessageCircle className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.chat_widget_title')}
            </h2>
          </div>
          <button
            onClick={saveChatWidget}
            disabled={savingSection === 'widget' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'widget' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_settings.chat_widget_enable')}
              </label>
              <p className='text-sm text-muted-foreground'>
                {t('admin_settings.chat_widget_desc')}
              </p>
            </div>
            <button
              onClick={() => setChatWidgetEnabled(!chatWidgetEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                chatWidgetEnabled
                  ? 'bg-primary'
                  : 'bg-muted'
              }`}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                  chatWidgetEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className='flex items-center justify-between'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_settings.profile_edit_menu')}
              </label>
              <p className='text-sm text-muted-foreground'>
                {t('admin_settings.profile_edit_desc')}
              </p>
            </div>
            <button
              onClick={() => setProfileEditEnabled(!profileEditEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                profileEditEnabled
                  ? 'bg-primary'
                  : 'bg-muted'
              }`}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                  profileEditEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className='border border-border rounded-lg p-4 bg-muted'>
            <h4 className='text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.chat_widget_info')}
            </h4>
            <ul className='text-sm text-muted-foreground space-y-1'>
              <li>• {t('admin_settings.chat_widget_info_1')}</li>
              <li>• {t('admin_settings.chat_widget_info_2')}</li>
              <li>• {t('admin_settings.chat_widget_info_3')}</li>
              <li>• {t('admin_settings.chat_widget_info_4')}</li>
            </ul>
          </div>

          <div className='border border-[color-mix(in_oklch,var(--hn-error)_28%,transparent)] rounded-lg p-4 bg-[var(--hn-error-soft)]'>
            <h4 className='text-sm font-medium text-[var(--hn-error)] mb-2'>
              {t('admin_settings.danger_zone')}
            </h4>
            <p className='text-sm text-[var(--hn-error)] mb-3'>
              {t('admin_settings.danger_zone_desc')}
            </p>
            <p className='text-xs text-[var(--hn-error)] mb-3'>
              {'ℹ️ '}{t('admin_settings.danger_zone_info')}
            </p>
            <button
              onClick={deleteChatHistory}
              disabled={savingSection === 'widget-delete' || loading}
              className='inline-flex items-center justify-center rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
            >
              <Trash2 className='h-3.5 w-3.5' />
              {savingSection === 'widget-delete' ? t('common.processing') : t('admin_settings.hide_chat_history')}
            </button>
          </div>
        </div>
      </div>
      {/* 대화방명 생성 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <MessageCircle className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.room_name_settings')}
            </h2>
          </div>
          <button
            onClick={saveRoomNameSettings}
            disabled={savingSection === 'roomName' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'roomName' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <div className='flex items-center justify-between mb-2'>
              <label className='block text-sm font-medium text-foreground'>
                {t('admin_settings.room_name_model')}
              </label>
              <button
                onClick={fetchAvailableModels}
                disabled={modelsLoading}
                className='flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50'
                title={t('admin_settings.refresh_models_title')}
              >
                <RefreshCw
                  className={`h-3 w-3 ${
                    modelsLoading ? 'animate-spin' : ''
                  }`}
                />
                {t('admin_settings.refresh')}
              </button>
            </div>
            <select
              value={roomNameGenerationModel}
              onChange={(e) => setRoomNameGenerationModel(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
              disabled={loading || modelsLoading}
            >
              {modelsLoading ? (
                <option value=''>{t('admin_settings.models_loading')}</option>
              ) : availableModels.length === 0 ? (
                <option value='gemma3:4b'>{t('admin_settings.default_model')}</option>
              ) : (
                <>
                  {availableModels.map((server) => (
                    <optgroup
                      key={server.serverName}
                      label={`📡 ${server.serverName} (${server.provider})`}
                    >
                      {server.models.map((model) => (
                        <option key={model.label} value={model.label}>
                          {model.label}{' '}
                          {model.isMultimodal ? t('admin_settings.multimodal') : t('admin_settings.text_only')}
                          {model.tooltip ? ` - ${model.tooltip}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </>
              )}
            </select>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.room_name_model_desc')}
            </p>
          </div>
        </div>
      </div>

      {/* 질문 길이 제한 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <MessageCircle className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.question_length_title')}
            </h2>
          </div>
          <button
            onClick={saveQuestionLengthSettings}
            disabled={savingSection === 'questionLength' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'questionLength' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-2'>
          <label className='block text-sm font-medium text-foreground'>
            {t('admin_settings.max_question_length')}
          </label>
          <input
            type='number'
            min={1000}
            max={1000000}
            value={maxUserQuestionLength}
            onChange={(e) =>
              setMaxUserQuestionLength(
                Number(e.target.value || 0)
              )
            }
            className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
          />
          <p className='text-sm text-muted-foreground'>
            {t('admin_settings.question_length_desc')}
          </p>
        </div>
      </div>

      {/* 이미지 업로드 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <ImageIcon className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.image_upload_settings')}
            </h2>
          </div>
          <button
            onClick={saveImageSettings}
            disabled={savingSection === 'image' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'image' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.max_images_label')}
            </label>
            <input
              type='number'
              min='1'
              max='20'
              value={maxImagesPerMessage}
              onChange={(e) => setMaxImagesPerMessage(Number(e.target.value))}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
              disabled={loading}
            />
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.max_images_hint')}
            </p>
          </div>

          <div>
            <div className='flex items-center justify-between mb-2'>
              <label className='block text-sm font-medium text-foreground'>
                {t('admin_settings.image_analysis_model')}
              </label>
              <button
                onClick={fetchAvailableModels}
                disabled={modelsLoading}
                className='flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50'
                title={t('admin_settings.refresh_models_title')}
              >
                <RefreshCw
                  className={`h-3 w-3 ${
                    modelsLoading ? 'animate-spin' : ''
                  }`}
                />
                {t('admin_settings.refresh')}
              </button>
            </div>
            <select
              value={imageAnalysisModel}
              onChange={(e) => setImageAnalysisModel(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
              disabled={loading || modelsLoading}
            >
              <option value=''>{t('admin_settings.no_selection')}</option>
              {modelsLoading ? (
                <option value=''>{t('admin_settings.models_loading')}</option>
              ) : availableModels.length === 0 ? (
                <option value=''>{t('admin_settings.no_models')}</option>
              ) : (
                <>
                  {availableModels.map((server) => (
                    <optgroup
                      key={server.serverName}
                      label={`📡 ${server.serverName} (${server.provider})`}
                    >
                      {server.models.map((model) => (
                        <option key={model.label} value={model.label}>
                          {model.label}{' '}
                          {model.isMultimodal ? t('admin_settings.multimodal') : t('admin_settings.text_only')}
                          {model.tooltip ? ` - ${model.tooltip}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </>
              )}
            </select>
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.image_analysis_model_desc')}
            </p>
          </div>
          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.image_analysis_prompt_label')}
            </label>
            <textarea
              value={imageAnalysisPrompt}
              onChange={(e) => setImageAnalysisPrompt(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
              rows='2'
              placeholder={t('admin_settings.image_analysis_prompt_placeholder')}
              disabled={loading}
            />
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.image_analysis_prompt_desc')}
            </p>
          </div>
        </div>
      </div>

      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <PenLine className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              Draw (Canvas)
            </h2>
          </div>
          <button
            onClick={saveDrawSettings}
            disabled={savingSection === 'draw' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'draw' ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                Enable Draw mode
              </label>
              <p className='text-sm text-muted-foreground'>
                Let users generate interactive HTML canvas content like charts and dashboards.
              </p>
            </div>
            <button
              onClick={() => setDrawEnabled(!drawEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                drawEnabled ? 'bg-primary' : 'bg-muted'
              }`}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                  drawEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {drawEnabled && (
            <>
              <div>
                <div className='flex items-center justify-between mb-2'>
                  <label className='block text-sm font-medium text-foreground'>
                    Draw model
                  </label>
                  <button
                    onClick={fetchAvailableModels}
                    disabled={modelsLoading}
                    className='flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50'
                    title='Refresh model list'
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`}
                    />
                    Refresh
                  </button>
                </div>
                <select
                  value={drawModel}
                  onChange={(e) => setDrawModel(e.target.value)}
                  className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
                  disabled={loading || modelsLoading}
                >
                  <option value=''>No fixed model (use user-selected model)</option>
                  {modelsLoading ? (
                    <option value=''>Loading models...</option>
                  ) : availableModels.length === 0 ? (
                    <option value=''>No models available</option>
                  ) : (
                    availableModels.map((server) => (
                      <optgroup
                        key={server.serverName}
                        label={`${server.serverName} (${server.provider})`}
                      >
                        {server.models.map((model) => (
                          <option key={model.label} value={model.label}>
                            {model.label}
                            {model.tooltip ? ` - ${model.tooltip}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
                <p className='text-sm text-muted-foreground mt-1'>
                  Choose the model used for Draw mode. If empty, the current chat model is used.
                </p>
              </div>

              <div>
                <label className='block text-sm font-medium text-foreground mb-2'>
                  Draw system prompt
                </label>
                <Textarea
                  value={drawSystemPrompt}
                  onChange={(e) => setDrawSystemPrompt(e.target.value)}
                  className='w-full min-h-[140px]'
                  placeholder='Enter the system prompt for Draw mode.'
                  disabled={loading}
                />
                <p className='text-sm text-muted-foreground mt-1'>
                  This prompt is sent to the model whenever Draw mode is active.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 사용자 안내 툴팁 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <Lightbulb className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.tooltip_settings')}
            </h2>
          </div>
          <button
            onClick={saveTooltipSettings}
            disabled={savingSection === 'tooltip' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'tooltip' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                {t('admin_settings.tooltip_enable')}
              </label>
              <p className='text-sm text-muted-foreground'>
                {t('admin_settings.tooltip_enable_desc')}
              </p>
            </div>
            <button
              onClick={() => setTooltipEnabled(!tooltipEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                tooltipEnabled ? 'bg-primary' : 'bg-muted'
              }`}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                  tooltipEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {tooltipEnabled && (
            <div>
              <label className='block text-sm font-medium text-foreground mb-2'>
                {t('admin_settings.tooltip_message_label')}
              </label>
              <input
                type='text'
                value={tooltipMessage}
                onChange={(e) => setTooltipMessage(e.target.value)}
                className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground'
                placeholder={t('admin.tooltip_default')}
                maxLength={100}
                disabled={loading}
              />
              <p className='text-sm text-muted-foreground mt-1'>
                {t('admin_settings.tooltip_message_hint', { length: tooltipMessage.length })}
              </p>
            </div>
          )}

          {/* 툴팁 미리보기 */}
          <div className='border border-border rounded-lg p-4 bg-muted'>
            <h4 className='text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.preview')}
            </h4>
            <div className='relative inline-block'>
              <div className='flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-xs'>
                {t('admin_settings.model_select')}
              </div>
              {tooltipEnabled && (
                <div className='absolute -top-14 left-1/2 transform -translate-x-1/2 z-10'>
                  <div className='relative bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm whitespace-nowrap animate-bounce'>
                    {tooltipMessage}
                    {/* 말풍선 꼬리 */}
                    <div className='absolute top-full left-1/2 transform -translate-x-1/2 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-primary'></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* API 키 페이지 예시 설정 */}
      <div className='bg-card border border-border rounded-xl shadow-sm p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-3'>
            <Code className='h-5 w-5 text-primary' />
            <h2 className='text-lg font-semibold text-foreground'>
              {t('admin_settings.api_key_examples_title')}
            </h2>
          </div>
          <button
            onClick={saveApiTokenExamples}
            disabled={savingSection === 'apiTokenExamples' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'apiTokenExamples' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <p className='text-sm text-muted-foreground mb-4'>
          {t('admin_settings.api_key_examples_desc')}
        </p>

        <div className='space-y-4'>
          <div className='bg-primary/10 border border-primary/30 rounded-lg p-3 mb-4'>
            <p className='text-sm text-primary'>
              <strong>{t('admin_settings.placeholder_info')}</strong> <code className='bg-primary/20 px-1 rounded'>{'{{KEY}}'}</code> {t('admin_settings.placeholder_info_desc')}
            </p>
          </div>

          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.vscode_config_label')}
            </label>
            <textarea
              value={apiConfigExample}
              onChange={(e) => setApiConfigExample(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-mono text-sm'
              rows='10'
              placeholder={`name: Local Agent
version: 1.0.0
schema: v1
models:
  - title: "My Chat Model"
    provider: "openai"
    model: "gemma3:4b"
    apiKey: "{{KEY}}"
    baseUrl: "http://localhost:3000/v1"`}
              disabled={loading}
            />
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.vscode_config_hint')}
            </p>
          </div>

          <div>
            <label className='block text-sm font-medium text-foreground mb-2'>
              {t('admin_settings.curl_example_label')}
            </label>
            <textarea
              value={apiCurlExample}
              onChange={(e) => setApiCurlExample(e.target.value)}
              className='w-full px-3 py-2 border border-input rounded-md bg-background text-foreground font-mono text-sm'
              rows='6'
              placeholder={`curl -X POST http://localhost:3000/v1/chat/completions ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer {{KEY}}" ^
  -d "{\\"model\\": \\"gemma3:4b\\", \\"messages\\": [{\\"role\\": \\"user\\", \\"content\\": \\"Hello!\\"}], \\"stream\\": true}"`}
              disabled={loading}
            />
            <p className='text-sm text-muted-foreground mt-1'>
              {t('admin_settings.curl_example_hint')}
            </p>
          </div>
        </div>
      </div>

      {/* Ghost Mode 설정 */}
      <div className='bg-card shadow rounded-lg p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div>
            <h2 className='text-lg font-semibold text-foreground'>
              Ghost Mode
            </h2>
          </div>
          <button
            onClick={saveGhostSettings}
            disabled={savingSection === 'ghost' || loading}
            className='inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 text-sm px-3 py-1.5'
          >
            <Save className='h-3.5 w-3.5' />
            {savingSection === 'ghost' ? t('common.saving') : t('common.save')}
          </button>
        </div>

        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div>
              <label className='block text-sm font-medium text-foreground mb-1'>
                Enable Ghost Mode
              </label>
              <p className='text-sm text-muted-foreground'>
                Show ghost mode button on the main screen. When active, chat messages are not logged to analytics.
              </p>
            </div>
            <button
              onClick={() => setGhostModeEnabled(!ghostModeEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                ghostModeEnabled ? 'bg-primary' : 'bg-muted'
              }`}
              disabled={loading}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                  ghostModeEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {ghostModeEnabled && (
            <div className='flex items-center justify-between'>
              <div>
                <label className='block text-sm font-medium text-foreground mb-1'>
                  Show speech bubble tooltip
                </label>
                <p className='text-sm text-muted-foreground'>
                  A speech bubble appears periodically above the ghost mode button.
                </p>
              </div>
              <button
                onClick={() => setGhostBubbleEnabled(!ghostBubbleEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out ${
                  ghostBubbleEnabled ? 'bg-primary' : 'bg-muted'
                }`}
                disabled={loading}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-200 ease-in-out ${
                    ghostBubbleEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
