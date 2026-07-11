export function buildProxyHeaders({ bearerToken, contentType = 'application/json' } = {}) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  if (typeof bearerToken === 'string' && bearerToken.trim()) {
    headers.Authorization = `Bearer ${bearerToken.trim()}`;
  }
  return headers;
}
