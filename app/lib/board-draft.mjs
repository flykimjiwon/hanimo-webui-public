const BOARD_DRAFT_KEY = 'hanimo-board-draft-v1';
const BOARD_CATEGORIES = new Set(['notice', 'post']);
const LEGACY_BOARD_CATEGORIES = new Set(['doc', 'ask', 'share']);

function normalizeCategory(category) {
  if (BOARD_CATEGORIES.has(category)) return category;
  if (LEGACY_BOARD_CATEGORIES.has(category)) return 'post';
  return null;
}

function draftKey(ownerId) {
  const owner = String(ownerId || '').trim();
  return owner ? `${BOARD_DRAFT_KEY}:${owner}` : null;
}

export function loadBoardDraft(storage, ownerId) {
  try {
    const key = draftKey(ownerId);
    if (!key) return null;
    const parsed = JSON.parse(storage.getItem(key));
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.title !== 'string' || typeof parsed.content !== 'string') return null;
    const category = normalizeCategory(parsed.category);
    if (!category) return null;
    if (!Number.isFinite(parsed.savedAt)) return null;
    return { ...parsed, category };
  } catch {
    return null;
  }
}

export function saveBoardDraft(storage, ownerId, draft, savedAt = Date.now()) {
  try {
    const key = draftKey(ownerId);
    if (!key) return false;
    storage.setItem(key, JSON.stringify({
      title: String(draft.title || ''),
      content: String(draft.content || ''),
      category: BOARD_CATEGORIES.has(draft.category) ? draft.category : 'post',
      savedAt,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearBoardDraft(storage, ownerId) {
  try {
    const key = draftKey(ownerId);
    if (!key) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
