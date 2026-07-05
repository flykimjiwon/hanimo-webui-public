import logger from '@/lib/logger';
/**
 * Client-side utility for detecting real IP address
 */

/**
 * Detect client's real IP address using WebRTC
 */
export async function getClientRealIP() {
  return new Promise((resolve) => {
    try {
      if (!window.RTCPeerConnection) {
        resolve(null);
        return;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      const ips = new Set();
      let timeout;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate.candidate;
          const ipMatch = candidate.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
          
          if (ipMatch) {
            const ip = ipMatch[0];
            if (!isLocalIP(ip)) {
              ips.add(ip);
            }
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'completed' || pc.iceConnectionState === 'connected') {
          clearTimeout(timeout);
          pc.close();
          resolve(ips.size > 0 ? Array.from(ips)[0] : null);
        }
      };

      timeout = setTimeout(() => {
        pc.close();
        resolve(ips.size > 0 ? Array.from(ips)[0] : null);
      }, 5000);

      pc.createDataChannel('dummy');
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timeout);
          pc.close();
          resolve(null);
        });

    } catch (error) {
      resolve(null);
    }
  });
}

/**
 * IP lookup via server-side API
 * (bypasses internal network SSL certificate issues)
 */
export async function getIPFromExternalService() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/api/client-ip', {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.ip && !isLocalIP(data.ip)) {
        return data.ip;
      }
    }
  } catch (error) {
    logger.warn('[ClientIP] Failed to get IP via server API:', error.message);
  }

  return null;
}

function isLocalIP(ip) {
  if (!ip) return true;
  
  if (ip === '127.0.0.1' || ip === '::1') return true;
  
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  
  const first = parseInt(parts[0]);
  const second = parseInt(parts[1]);
  
  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  
  return false;
}

/**
 * Detect client IP using the best available method
 */
export async function detectClientIP() {
  try {
    const webrtcIP = await getClientRealIP();
    if (webrtcIP && !isLocalIP(webrtcIP)) {
      return webrtcIP;
    }

    const externalIP = await getIPFromExternalService();
    if (externalIP && !isLocalIP(externalIP)) {
      return externalIP;
    }

    return null;
  } catch (error) {
    return null;
  }
}