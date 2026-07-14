import { timingSafeEqual } from 'node:crypto';

export function verifySetupToken(providedToken, configuredToken) {
  if (
    typeof providedToken !== 'string' ||
    typeof configuredToken !== 'string' ||
    configuredToken.length < 32
  ) {
    return false;
  }
  const provided = Buffer.from(providedToken);
  const configured = Buffer.from(configuredToken);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}
