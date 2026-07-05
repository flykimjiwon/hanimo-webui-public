'use client';


import logger from '@/lib/logger';
import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Agent history management hook
 * @param {string} agentId - Agent ID
 * @param {object} options
 * @param {number} options.maxItems - Maximum items to keep (default 20)
 * @returns {{ history, loading, saveEntry, deleteEntry, refreshHistory }}
 */
export function useAgentHistory(agentId, { maxItems = 20 } = {}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const getToken = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  };

  const refreshHistory = useCallback(async () => {
    if (!agentId) return;
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/agents/history?agentId=${encodeURIComponent(agentId)}&limit=${maxItems}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (mountedRef.current) {
          setHistory(Array.isArray(data.items) ? data.items : []);
        }
      }
    } catch (error) {
      logger.warn('[useAgentHistory] Failed to load history:', error.message);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [agentId, maxItems]);

  const saveEntry = useCallback(
    async (entryId, { title, inputData, outputData, outputText, metadata } = {}) => {
      if (!agentId || !entryId) return null;
      const token = getToken();
      if (!token) return null;

      try {
        const response = await fetch('/api/agents/history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            agentId,
            entryId,
            title,
            inputData,
            outputData,
            outputText,
            metadata,
            maxItems,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          await refreshHistory();
          return data.item;
        }
        return null;
      } catch (error) {
        logger.warn('[useAgentHistory] Failed to save entry:', error.message);
        return null;
      }
    },
    [agentId, maxItems, refreshHistory]
  );

  const deleteEntry = useCallback(
    async (id) => {
      if (!id) return false;
      const token = getToken();
      if (!token) return false;

      try {
        const response = await fetch(
          `/api/agents/history?id=${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (response.ok) {
          if (mountedRef.current) {
            setHistory((prev) => prev.filter((item) => item.id !== id));
          }
          return true;
        }
        return false;
      } catch (error) {
        logger.warn('[useAgentHistory] Failed to delete entry:', error.message);
        return false;
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = true;
    refreshHistory();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshHistory]);

  return { history, loading, saveEntry, deleteEntry, refreshHistory };
}
