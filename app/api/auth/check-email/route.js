import logger from '@/lib/logger';
import {
  authRateLimitConfig,
  consumeRateLimit,
  rateLimitKey,
  trustedClientAddress,
} from '@/lib/security/rate-limit.mjs';

const CHECK_EMAIL_ROUTE_RATE_KEY = rateLimitKey('auth:check-email', 'route');

function rateLimited(retryAfterSeconds) {
  return Response.json(
    { error: 'Too many email checks. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

export async function POST(request) {
  try {
    const { email } = await request.json();

    if (typeof email !== 'string' || !email.trim()) {
      return new Response(JSON.stringify({ error: 'Email is required.' }), {
        status: 400,
      });
    }

    // Normalize email to lowercase (prevent duplicates)
    const normalizedEmail = email.toLowerCase().trim();
    const limitConfig = authRateLimitConfig();
    const clientAddress = trustedClientAddress(request);
    const routeLimit = consumeRateLimit(CHECK_EMAIL_ROUTE_RATE_KEY, {
      limit: limitConfig.clientLimit,
      windowMs: limitConfig.windowMs,
    });
    const clientLimit = clientAddress
      ? consumeRateLimit(rateLimitKey('auth:check-email:client', clientAddress), {
          limit: limitConfig.clientLimit,
          windowMs: limitConfig.windowMs,
        })
      : { allowed: true, retryAfterSeconds: 0 };
    if (!routeLimit.allowed || !clientLimit.allowed) {
      return rateLimited(Math.max(
        routeLimit.retryAfterSeconds,
        clientLimit.retryAfterSeconds
      ));
    }

    return Response.json({
      checked: true,
      message: 'Email eligibility is confirmed when registration is submitted.',
    });
  } catch (error) {
    logger.error('Email validation error:', error);
    return new Response(
      JSON.stringify({ error: 'Server error occurred.' }),
      {
        status: 500,
      }
    );
  }
}
