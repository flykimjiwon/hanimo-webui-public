'use client';

import { useState, useCallback, useRef } from 'react';

/**
 * Agent LLM generation (SSE streaming) hook
 * @param {string} apiEndpoint - API endpoint (e.g. '/api/webapp-virtual-meeting')
 * @returns {{ generate, loading, error, streamingText, abortGeneration }}
 */
export function useAgentGenerate(apiEndpoint) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const abortControllerRef = useRef(null);

  const abortGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  }, []);

  const generate = useCallback(
    async (body, { onDelta, onDone, onError, timeoutMs = 180000 } = {}) => {
      if (!apiEndpoint) return null;

      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError('');
      setStreamingText('');

      let accumulated = '';
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('token')
            : null;

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.error || `Request failed (HTTP ${response.status})`;
          setError(errorMessage);
          onError?.(errorMessage);
          setLoading(false);
          return null;
        }

        const contentType = response.headers.get('content-type') || '';

        // JSON response (non-streaming)
        if (contentType.includes('application/json')) {
          const data = await response.json();
          const text = data.text || data.response || data.content || JSON.stringify(data);
          setStreamingText(text);
          onDone?.(text);
          setLoading(false);
          return text;
        }

        // SSE streaming response
        if (!response.body) {
          const text = await response.text();
          setStreamingText(text);
          onDone?.(text);
          setLoading(false);
          return text;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue;

            const payload = trimmed.startsWith('data:')
              ? trimmed.slice(5).trim()
              : trimmed;
            if (!payload) continue;

            if (payload === '[DONE]') {
              onDone?.(accumulated);
              setLoading(false);
              clearTimeout(timeout);
              return accumulated;
            }

            try {
              const parsed = JSON.parse(payload);
              const delta = extractDelta(parsed);
              if (delta) {
                accumulated += delta;
                setStreamingText(accumulated);
                onDelta?.(delta, accumulated);
              }
            } catch {
              // treat as raw text if JSON parse fails
              accumulated += payload;
              setStreamingText(accumulated);
              onDelta?.(payload, accumulated);
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          const remaining = buffer.trim();
          if (remaining !== '[DONE]') {
            try {
              const parsed = JSON.parse(
                remaining.startsWith('data:') ? remaining.slice(5).trim() : remaining
              );
              const delta = extractDelta(parsed);
              if (delta) {
                accumulated += delta;
                setStreamingText(accumulated);
                onDelta?.(delta, accumulated);
              }
            } catch {
              // ignore
            }
          }
        }

        onDone?.(accumulated);
        setLoading(false);
        clearTimeout(timeout);
        return accumulated;
      } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          setError('Generation was cancelled.');
          onError?.('Generation was cancelled.');
        } else {
          const msg = err.message || 'An error occurred during generation.';
          setError(msg);
          onError?.(msg);
        }
        setLoading(false);
        return null;
      }
    },
    [apiEndpoint]
  );

  return { generate, loading, error, streamingText, abortGeneration };
}

function extractDelta(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';

  // OpenAI format
  const choiceDelta = parsed?.choices?.[0]?.delta?.content;
  if (typeof choiceDelta === 'string') return choiceDelta;

  const choiceText = parsed?.choices?.[0]?.text;
  if (typeof choiceText === 'string') return choiceText;

  // Ollama format
  const response = parsed?.response;
  if (typeof response === 'string') return response;

  const messageContent = parsed?.message?.content;
  if (typeof messageContent === 'string') return messageContent;

  // Generic
  const content = parsed?.content;
  if (typeof content === 'string') return content;

  return '';
}
