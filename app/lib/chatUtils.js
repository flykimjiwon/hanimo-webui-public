'use client';

/**
 * Shared utility functions used across chat2 and chat3 pages.
 */

let _imgIdCounter = 0;

export function generateImageId() {
  if (typeof crypto !== 'undefined') {
    if (crypto.randomUUID) return crypto.randomUUID();
    if (crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  }
  return `${Date.now()}-${++_imgIdCounter}`;
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export function formatRoomTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString('ko-KR');
}

export function isEditableTarget(element) {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase();
  return tag === 'textarea' || tag === 'input';
}

export function getModelLabel(modelId, modelOptions) {
  if (!modelId) return null;
  if (modelId.includes('__')) {
    const parts = modelId.split('__');
    if (parts.length >= 2) return parts[1];
  }
  const exactMatch = modelOptions.find((m) => m.uniqueKey === modelId || m.id === modelId);
  if (exactMatch?.label) return exactMatch.label;
  const idMatch = modelOptions.find((m) => m.id === modelId);
  if (idMatch?.label) return idMatch.label;
  if (modelId.includes('-')) {
    const parts = modelId.split('-');
    const possibleModelId = parts[parts.length - 1];
    const serverRemovedMatch = modelOptions.find((m) => m.id === possibleModelId);
    if (serverRemovedMatch?.label) return serverRemovedMatch.label;
  }
  if (modelId.includes(':')) {
    const baseName = modelId.split(':')[0];
    const baseMatch = modelOptions.find(
      (m) => m.id && (m.id.startsWith(baseName + ':') || m.id === baseName)
    );
    if (baseMatch?.label) return baseMatch.label;
  }
  return modelId;
}

export function getModelServerName(modelId, modelOptions) {
  if (!modelId) return null;
  const exactMatch = modelOptions.find((m) => m.uniqueKey === modelId || m.id === modelId);
  if (exactMatch?.endpoint) {
    try {
      const url = new URL(exactMatch.endpoint);
      const hostname = url.hostname;
      if (hostname && hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        return hostname;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
