function protocolOf(value) {
  try {
    return new URL(String(value)).protocol;
  } catch {
    return null;
  }
}

export function effectiveRequestProtocol(request, env = process.env) {
  const configuredProtocol = protocolOf(env.HANIMO_PUBLIC_URL);
  if (configuredProtocol) return configuredProtocol;

  if (env.HANIMO_TRUST_PROXY === 'true') {
    const forwardedProtocol = request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      ?.toLowerCase();
    if (forwardedProtocol === 'http' || forwardedProtocol === 'https') {
      return `${forwardedProtocol}:`;
    }
  }

  return protocolOf(request.url);
}

export function shouldUseSecureAuthCookie(request, env = process.env) {
  return effectiveRequestProtocol(request, env) === 'https:';
}
