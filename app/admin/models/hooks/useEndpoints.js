'use client';


import logger from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { TokenManager } from '@/lib/tokenManager';
import { useAlert } from '@/contexts/AlertContext';
import { useTranslation } from '@/hooks/useTranslation';
import { normalizeBase } from '../model-utils';

export function useEndpoints() {
  const { alert } = useAlert();
  const { t } = useTranslation();

  const [endpoints, setEndpoints] = useState([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [manualPresetBaseUrl, setManualPresetBaseUrl] = useState(
    'https://api.openai.com'
  );
  const [manualPresetApiBase, setManualPresetApiBase] = useState(
    'https://api.openai.com'
  );
  const [savingPresetSettings, setSavingPresetSettings] = useState(false);

  const buildManualPreset = (type) => {
    const baseUrl = normalizeBase(manualPresetBaseUrl);
    const apiBase = normalizeBase(manualPresetApiBase);
    if (type === 'openai-compatible') {
      return JSON.stringify(
        {
          method: 'POST',
          url: `${apiBase}/v1/chat/completions`,
          headers: {
            Authorization: 'Bearer {{OPENAI_API_KEY}}',
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: '{{messages}}',
            stream: true,
          },
          stream: true,
          responseMapping: {
            path: 'choices[0].message.content',
          },
        },
        null,
        2
      );
    }
    if (type === 'responses') {
      return JSON.stringify(
        {
          url: `${baseUrl}/v1/responses`,
          body: {
            input: '{{message}}',
            model: 'gpt-4',
            stream: true,
          },
          method: 'POST',
          stream: true,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer {{OPENAI_API_KEY}}',
          },
          responseMapping: {
            path: 'output[0].content[0].text',
          },
        },
        null,
        2
      );
    }
    return '';
  };

  const fetchEndpointsFromSettings = useCallback(async () => {
    try {
      const res = await TokenManager.safeFetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setManualPresetBaseUrl(
          data.manualPresetBaseUrl || 'https://api.openai.com'
        );
        setManualPresetApiBase(
          data.manualPresetApiBase || 'https://api.openai.com'
        );
        const list = Array.isArray(data.customEndpoints)
          ? data.customEndpoints
              .filter((e) => e.isActive !== false)
              .map((e) => ({
                name: e.name || '',
                url: e.url,
                provider:
                  e.provider === 'openai-compatible'
                    ? 'openai-compatible'
                    : e.provider === 'gemini'
                    ? 'gemini'
                    : 'ollama',
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
                return { name: '', url: entry, provider: 'ollama' };
              });
        setEndpoints(list);
        if (list.length > 0) {
          const currentEndpointExists = list.some(
            (e) => e.url === selectedEndpoint
          );
          if (!currentEndpointExists) {
            setSelectedEndpoint(list[0].url);
          }
        } else {
          setSelectedEndpoint('');
        }
      }
    } catch (e) {
      logger.warn(t('admin_models.console_server_list_failed'), e.message);
    }
  }, [selectedEndpoint, t]);

  const fetchAvailableModels = useCallback(async () => {
    try {
      setModelsLoading(true);
      const ep = selectedEndpoint;

      if (!ep || !ep.trim()) {
        logger.warn(t('admin_models.console_no_endpoint'));
        setAvailableModels([]);
        return;
      }

      if (ep === 'manual') {
        setAvailableModels([]);
        return;
      }

      if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
        logger.warn(t('admin_models.console_invalid_endpoint'), ep);
        setAvailableModels([]);
        return;
      }

      const normalizeUrl = (url) => {
        try {
          const urlObj = new URL(url.trim());
          return `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}${
            urlObj.port ? `:${urlObj.port}` : ''
          }${urlObj.pathname.replace(/\/+$/, '')}`;
        } catch (error) {
          logger.warn('[Catch]', error.message);
          return url.trim().toLowerCase().replace(/\/+$/, '');
        }
      };

      const normalizedEp = normalizeUrl(ep);
      const endpointConfig = endpoints.find(
        (e) => normalizeUrl(e.url) === normalizedEp
      );
      const provider =
        endpointConfig?.provider === 'openai-compatible'
          ? 'openai-compatible'
          : endpointConfig?.provider === 'gemini'
          ? 'gemini'
          : 'ollama';

      if (provider !== 'ollama' && provider !== 'model-server') {
        logger.info(`${provider} provider - skip model list query`);
        setAvailableModels([]);
        return;
      }

      const url = `/api/model-servers/models?endpoint=${encodeURIComponent(
        ep
      )}&provider=${provider}`;
      const response = await TokenManager.safeFetch(url);

      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.models || []);
      } else {
        let errorMessage = t('admin_models.model_list_load_failed_title');
        let errorType = null;
        let errorDetails = null;

        try {
          const responseText = await response.text();
          if (responseText) {
            try {
              const errorData = JSON.parse(responseText);
              errorMessage =
                errorData.error || errorData.message || errorMessage;
              errorType = errorData.errorType;
              errorDetails = errorData.details;
            } catch (parseError) {
              errorMessage = responseText.substring(0, 200) || errorMessage;
            }
          }
        } catch (readError) {
          logger.warn(t('admin_models.console_error_response_read_failed'), readError);
        }

        logger.error(t('admin_models.console_model_list_failed'), {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorType,
          errorDetails,
        });

        setAvailableModels([]);

        if (response.status === 400 || response.status === 500) {
          const alertType = response.status === 400 ? 'warning' : 'error';
          let displayMessage = errorMessage;
          if (errorType === 'connection') {
            displayMessage =
              errorMessage || t('admin_models.server_connection_failed');
          } else if (errorType === 'timeout') {
            displayMessage =
              errorMessage || t('admin_models.server_connection_timeout');
          } else if (errorType === 'http_error') {
            displayMessage =
              errorMessage || t('admin_models.server_error');
          }

          alert(
            displayMessage || t('admin_models.invalid_server_settings'),
            alertType,
            t('admin_models.model_list_load_failed_title')
          );
        }
      }
    } catch (error) {
      logger.error(t('admin_models.console_model_list_failed'), error);
      setAvailableModels([]);
      alert(t('admin_models.model_list_load_error'), 'error', t('common.error'));
    } finally {
      setModelsLoading(false);
    }
  }, [selectedEndpoint, endpoints, alert, t]);

  const saveManualPresetSettings = async () => {
    try {
      setSavingPresetSettings(true);
      const res = await TokenManager.safeFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualPresetBaseUrl,
          manualPresetApiBase,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || t('admin_models.settings_save_failed'));
      }
      alert(t('admin_models.preset_url_saved'), 'success', t('admin_models.save_complete'));
    } catch (error) {
      alert(
        error.message || t('admin_models.preset_url_save_failed'),
        'error',
        t('admin_models.save_failed_title')
      );
    } finally {
      setSavingPresetSettings(false);
    }
  };

  // Re-fetch models when selectedEndpoint changes
  useEffect(() => {
    if (
      selectedEndpoint &&
      selectedEndpoint.trim() &&
      selectedEndpoint !== 'manual' &&
      (selectedEndpoint.startsWith('http://') ||
        selectedEndpoint.startsWith('https://'))
    ) {
      fetchAvailableModels();
    } else {
      setAvailableModels([]);
    }
  }, [selectedEndpoint, fetchAvailableModels]);

  return {
    endpoints,
    selectedEndpoint,
    setSelectedEndpoint,
    availableModels,
    setAvailableModels,
    modelsLoading,
    manualPresetBaseUrl,
    setManualPresetBaseUrl,
    manualPresetApiBase,
    setManualPresetApiBase,
    savingPresetSettings,
    buildManualPreset,
    fetchEndpointsFromSettings,
    fetchAvailableModels,
    saveManualPresetSettings,
  };
}
