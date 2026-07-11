function normalizeOrigin(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return null;
  }
}

export function allowedRequestOrigins(request, env = process.env) {
  const origins = new Set();
  const requestOrigin = normalizeOrigin(request.url);
  if (requestOrigin) origins.add(requestOrigin);

  const configured = [env.HANIMO_PUBLIC_URL, ...(env.HANIMO_ALLOWED_ORIGINS || '').split(',')];
  for (const value of configured) {
    const origin = normalizeOrigin(value?.trim());
    if (origin) origins.add(origin);
  }
  return origins;
}

export function isSameOriginRequest(request, env = process.env) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!origin) return fetchSite !== 'cross-site';
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && allowedRequestOrigins(request, env).has(normalized));
}

export function isUnsafeMethod(method = 'GET') {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method).toUpperCase());
}
