import logger from '@/lib/logger';
import { NextResponse } from 'next/server';

// API to detect client IP on server side
// Extract directly from request headers without calling external IP services

export async function GET(request) {
  try {
    // 1. Check x-forwarded-for when behind proxy/load balancer
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const ip = forwarded.split(',')[0].trim();
      if (ip && !isLocalIP(ip)) {
        return NextResponse.json({ ip, source: 'x-forwarded-for' });
      }
    }

    // 2. Check x-real-ip header
    const realIP = request.headers.get('x-real-ip');
    if (realIP && !isLocalIP(realIP)) {
      return NextResponse.json({ ip: realIP, source: 'x-real-ip' });
    }

    // 3. cf-connecting-ip (Cloudflare)
    const cfIP = request.headers.get('cf-connecting-ip');
    if (cfIP && !isLocalIP(cfIP)) {
      return NextResponse.json({ ip: cfIP, source: 'cf-connecting-ip' });
    }

    // 4. true-client-ip (Akamai, Cloudflare Enterprise)
    const trueClientIP = request.headers.get('true-client-ip');
    if (trueClientIP && !isLocalIP(trueClientIP)) {
      return NextResponse.json({ ip: trueClientIP, source: 'true-client-ip' });
    }

    // 5. Try retrieving IP from external service (no SSL issue from server-side calls)
    const externalIP = await getIPFromExternalService();
    if (externalIP) {
      return NextResponse.json({ ip: externalIP, source: 'external-service' });
    }

    // If IP cannot be detected
    return NextResponse.json({ ip: null, source: 'not-detected' });

  } catch (error) {
    logger.error('[Client IP API] Error:', error.message);
    return NextResponse.json({ ip: null, source: 'error', error: error.message });
  }
}

// Retrieve from external IP services (server-side)
async function getIPFromExternalService() {
  const services = [
    { url: 'https://api.ipify.org?format=json', parser: (d) => d.ip },
    { url: 'https://ipapi.co/json/', parser: (d) => d.ip },
    { url: 'https://httpbin.org/ip', parser: (d) => d.origin },
  ];

  for (const service of services) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(service.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'hanimo-webui/1.0',
        },
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const ip = service.parser(data);
        if (ip && !isLocalIP(ip)) {
          return ip;
        }
      }
    } catch (error) {
      // Try next service
      continue;
    }
  }

  return null;
}

// Check local/private IP
function isLocalIP(ip) {
  if (!ip) return true;

  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;

  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);

  // Private IP ranges
  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;

  return false;
}
