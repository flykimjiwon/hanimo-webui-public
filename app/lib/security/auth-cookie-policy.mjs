function protocolOf(value) {
  try {
    const protocol = new URL(String(value)).protocol;
    return protocol === 'http:' || protocol === 'https:' ? protocol : null;
  } catch {
    return null;
  }
}

export function effectiveRequestProtocol(request, env = process.env) {
  const configuredProtocol = protocolOf(env.HANIMO_PUBLIC_URL);
  let forwardedProtocol = null;

  if (env.HANIMO_TRUST_PROXY === 'true') {
    const forwardedValue = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      ?.toLowerCase();
    if (forwardedValue === 'http' || forwardedValue === 'https') {
      forwardedProtocol = `${forwardedValue}:`;
    }
  }

  const requestProtocol = protocolOf(request.url);
  const protocols = [configuredProtocol, forwardedProtocol, requestProtocol];
  return protocols.includes('https:') ? 'https:' : protocols.find(Boolean) || null;
}

export function shouldUseSecureAuthCookie(request, env = process.env) {
  return effectiveRequestProtocol(request, env) === 'https:';
}
