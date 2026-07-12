const API_TOKEN_PREFIX = '/api/v1';

export function bypassesSessionJwt(pathname) {
  return pathname === API_TOKEN_PREFIX || pathname.startsWith(`${API_TOKEN_PREFIX}/`);
}
