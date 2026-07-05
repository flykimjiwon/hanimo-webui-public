/**
 * Extracts the client IP address from a Next.js Request.
 * Finds the real IP while considering proxies, load balancers, and CDNs.
 */
export function getClientIP(request) {
  // 1. x-forwarded-for header (most common)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // The first IP is the original client IP (when behind proxy chains)
    return forwarded.split(',')[0].trim();
  }

  // 2. x-real-ip header (used by nginx, etc.)
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }

  // 3. x-client-ip header
  const clientIP = request.headers.get('x-client-ip');
  if (clientIP) {
    return clientIP.trim();
  }

  // 4. cf-connecting-ip header (Cloudflare)
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) {
    return cfIP.trim();
  }

  // 5. x-cluster-client-ip header
  const clusterIP = request.headers.get('x-cluster-client-ip');
  if (clusterIP) {
    return clusterIP.trim();
  }

  // 6. Fallback for development environments
  // Direct access to connection info is limited in Next.js
  return '127.0.0.1'; // localhost fallback
}

/**
 * Validate and normalize IP address
 */
export function normalizeIP(ip) {
  if (!ip) return '127.0.0.1';
  
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 regex (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  const trimmedIP = ip.trim();
  
  if (ipv4Regex.test(trimmedIP) || ipv6Regex.test(trimmedIP)) {
    return trimmedIP;
  }
  
  // Return localhost when IP is invalid
  return '127.0.0.1';
}

/**
 * Additional utility for IP metadata (optional)
 */
export function getIPInfo(ip) {
  const normalizedIP = normalizeIP(ip);
  
  return {
    ip: normalizedIP,
    isLocal: normalizedIP === '127.0.0.1' || normalizedIP === '::1',
    isPrivate: isPrivateIP(normalizedIP)
  };
}

/**
 * Check whether an IP address is private
 */
function isPrivateIP(ip) {
  if (!ip) return true;
  
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  
  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);
  
  // 10.0.0.0/8
  if (first === 10) return true;
  
  // 172.16.0.0/12
  if (first === 172 && second >= 16 && second <= 31) return true;
  
  // 192.168.0.0/16
  if (first === 192 && second === 168) return true;
  
  return false;
}
