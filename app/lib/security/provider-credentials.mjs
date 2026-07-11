import { decryptOptionalSecret, encryptOptionalSecret } from './secret-box.mjs';

export function buildGeminiModelsUrl(baseUrl) {
  return `${normalizeGeminiBaseUrl(baseUrl)}/v1beta/models`;
}

export function normalizeGeminiBaseUrl(baseUrl) {
  const base = String(baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  return base.replace(/\/v1beta$/, '');
}

export function buildGeminiGenerateUrl(baseUrl, model, action = 'generateContent') {
  return `${normalizeGeminiBaseUrl(baseUrl)}/v1beta/models/${model}:${action}`;
}

export function chooseOpenAICompatibleKey(endpointKey, globalKey, environmentKey) {
  return endpointKey || globalKey || environmentKey || '';
}

export function encryptProviderSecret(value, options = {}) {
  return encryptOptionalSecret(value, options);
}

export function decryptProviderSecret(value, options = {}) {
  if (value && !String(value).startsWith('hmo_box_v1.')) {
    return String(value);
  }
  return decryptOptionalSecret(value, options);
}

export function encryptProviderEndpoints(endpoints = [], options = {}) {
  return (Array.isArray(endpoints) ? endpoints : []).map((endpoint) => ({
    ...endpoint,
    apiKey: encryptProviderSecret(endpoint?.apiKey, options),
  }));
}

export function decryptProviderEndpoints(endpoints = [], options = {}) {
  return (Array.isArray(endpoints) ? endpoints : []).map((endpoint) => ({
    ...endpoint,
    apiKey: decryptProviderSecret(endpoint?.apiKey, options),
  }));
}
