'use client';

import { useEffect, useRef } from 'react';

const MAX_QUEUE = 20;
const DUPLICATE_WINDOW_MS = 10000;

export default function ClientErrorReporter() {
  const recentRef = useRef(new Map());
  const queueRef = useRef([]);
  const sendingRef = useRef(false);

  const shouldSkip = (signature) => {
    const now = Date.now();
    const last = recentRef.current.get(signature);
    if (last && now - last < DUPLICATE_WINDOW_MS) {
      return true;
    }
    recentRef.current.set(signature, now);
    return false;
  };

  const enqueue = (payload) => {
    if (!payload?.message) return;
    const signature = `${payload.message}::${payload.stack || ''}`;
    if (shouldSkip(signature)) return;

    queueRef.current.push(payload);
    if (queueRef.current.length > MAX_QUEUE) {
      queueRef.current.shift();
    }
    flushQueue();
  };

  const flushQueue = async () => {
    if (sendingRef.current || queueRef.current.length === 0) return;
    sendingRef.current = true;

    const payload = queueRef.current.shift();
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/logs/client-error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // 실패 시 다음 턴에 다시 시도
      queueRef.current.unshift(payload);
    } finally {
      sendingRef.current = false;
      if (queueRef.current.length > 0) {
        setTimeout(flushQueue, 300);
      }
    }
  };

  useEffect(() => {
    const handleError = (event) => {
      const error = event.error || {};
      enqueue({
        level: 'error',
        message: event.message || error.message || 'Unknown error',
        stack: error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        context: {
          type: 'window.error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const handleRejection = (event) => {
      const reason = event.reason || {};
      enqueue({
        level: 'error',
        message:
          reason.message ||
          (typeof reason === 'string' ? reason : 'Unhandled rejection'),
        stack: reason.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        context: {
          type: 'unhandledrejection',
        },
      });
    };

    const originalConsoleError = console.error;
    console.error = (...args) => {
      try {
        const message = args
          .map((arg) =>
            typeof arg === 'string' ? arg : JSON.stringify(arg)
          )
          .join(' ');
        enqueue({
          level: 'error',
          message,
          url: window.location.href,
          userAgent: navigator.userAgent,
          context: { type: 'console.error' },
        });
      } catch (error) {
        if (typeof originalConsoleError === 'function') {
          originalConsoleError(
            '[ClientErrorReporter] serialize failed:',
            error
          );
        }
      }
      originalConsoleError(...args);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      console.error = originalConsoleError;
    };
  }, []);

  return null;
}
