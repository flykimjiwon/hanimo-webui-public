import logger from '@/lib/logger';
import { decodeJWTPayload } from '@/lib/jwtUtils';

/**
 * Token management utility (improved version 2026-02-27)
 *
 * Changes:
 * - Handle JWT expiration checks with local decoding (remove server round trip)
 * - Automatically run silent refresh 15 minutes before access token expiration
 * - On 401 response, try refresh and retry; logout on failure
 * - Manage refresh token with httpOnly cookie (not directly accessible in TokenManager)
 */

export class TokenManager {
  static instance = null;
  static refreshTimer = null;
  static originalFetch = null;
  static isInterceptorActive = false;
  static isRefreshing = false;
  static pendingQueue = [];

  constructor() {
    if (TokenManager.instance) {
      return TokenManager.instance;
    }
    TokenManager.instance = this;
    this.listeners = [];
  }

  // ─────────────────────────────────────────────
  // Local JWT decoding (check expiration without server request)
  // ─────────────────────────────────────────────

  /**
    * Decode the access token in localStorage locally and check expiration
    * Process immediately without a server round trip
   */
  static decodeLocalToken(token = null) {
    const authToken = token || localStorage.getItem('token');
    if (!authToken) return null;

    try {
      return decodeJWTPayload(authToken);
    } catch {
      return null;
    }
  }

  /**
    * Return remaining seconds until token expiration. 0 or less if expired.
   */
  static getTokenExpiresIn(token = null) {
    const payload = TokenManager.decodeLocalToken(token);
    if (!payload?.exp) return -1;
    return payload.exp - Math.floor(Date.now() / 1000);
  }

  // ─────────────────────────────────────────────
  // Silent Refresh
  // ─────────────────────────────────────────────

  /**
    * Issue a new access token by calling /api/auth/refresh
    * Automatically sends refresh token from httpOnly cookie
    * @returns {boolean} Success flag
   */
  static async silentRefresh() {
    if (TokenManager.isRefreshing) {
      // If refresh is already in progress, wait until it finishes
      return new Promise((resolve) => {
        TokenManager.pendingQueue.push(resolve);
      });
    }

    TokenManager.isRefreshing = true;

    try {
      const response = await (TokenManager.originalFetch || fetch)('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',   // automatically send httpOnly cookie
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          // Resolve waiting requests as successful
          TokenManager.pendingQueue.forEach((resolve) => resolve(true));
          TokenManager.pendingQueue = [];

          // Reschedule refresh timer based on new token
          TokenManager.scheduleRefresh();
          return true;
        }
      }

      // Refresh failure (token expired/revoked)
      TokenManager.pendingQueue.forEach((resolve) => resolve(false));
      TokenManager.pendingQueue = [];
      return false;

    } catch (err) {
      logger.error('[TokenManager] silent refresh error:', err);
      TokenManager.pendingQueue.forEach((resolve) => resolve(false));
      TokenManager.pendingQueue = [];
      return false;
    } finally {
      TokenManager.isRefreshing = false;
    }
  }

  // ─────────────────────────────────────────────
  // Timer-based auto refresh
  // ─────────────────────────────────────────────

  /**
    * Schedule silent refresh 15 minutes before token expiration
   */
  static scheduleRefresh() {
    if (TokenManager.refreshTimer) {
      clearTimeout(TokenManager.refreshTimer);
      TokenManager.refreshTimer = null;
    }

    const expiresIn = TokenManager.getTokenExpiresIn();

    if (expiresIn <= 0) {
      logger.info('[TokenManager] Token expired - logging out immediately');
      TokenManager.logout();
      return;
    }

    // Run refresh 15 minutes (900s) before expiry. If less than 15 minutes remain, run immediately.
    const REFRESH_BEFORE_EXPIRY = 15 * 60; // 15 minutes (seconds)
    const delay = Math.max(0, (expiresIn - REFRESH_BEFORE_EXPIRY) * 1000);

    logger.info(
      `[TokenManager] Token refresh scheduled: in ${Math.floor(delay / 1000 / 60)} min (${Math.floor(expiresIn / 60)} min until expiry)`
    );

    TokenManager.refreshTimer = setTimeout(async () => {
      const success = await TokenManager.silentRefresh();
      if (!success) {
        logger.info('[TokenManager] silent refresh failed - logging out');
        TokenManager.logout();
      }
    }, delay);
  }

  // ─────────────────────────────────────────────
  // Initialization & logout
  // ─────────────────────────────────────────────

  /**
    * Initialize on page load
   */
  static async initializeTokenValidation() {
    const expiresIn = TokenManager.getTokenExpiresIn();

    if (expiresIn <= 0) {
      // Already expired - try refresh
      const refreshed = await TokenManager.silentRefresh();
      if (!refreshed) {
        TokenManager.logout();
        return false;
      }
    } else {
      // Valid - schedule refresh timer
      TokenManager.scheduleRefresh();
    }

    // Enable global fetch interceptor
    TokenManager.enableGlobalFetchInterceptor();
    return true;
  }

  /**
    * Return login URL based on loginType setting
   */
  static async getLoginUrl(redirectPath = null) {
    try {
      const response = await fetch('/api/public/settings');
      if (response.ok) {
        const data = await response.json();
        const baseUrl = data.loginType === 'sso' ? '/sso' : '/login';
        return TokenManager._appendRedirect(baseUrl, redirectPath);
      }
    } catch (error) {
      logger.error('Failed to fetch loginType setting:', error);
    }
    return TokenManager._appendRedirect('/login', redirectPath);
  }

  static _appendRedirect(baseUrl, redirectPath) {
    if (
      redirectPath &&
      redirectPath.startsWith('/') &&
      !redirectPath.startsWith('//') &&
      redirectPath !== baseUrl &&
      redirectPath !== '/login' &&
      redirectPath !== '/sso'
    ) {
      return `${baseUrl}?redirect=${encodeURIComponent(redirectPath)}`;
    }
    return baseUrl;
  }

  /**
    * Logout - revoke refresh token + local cleanup
   */
  static async logout() {
    // Clear timer
    if (TokenManager.refreshTimer) {
      clearTimeout(TokenManager.refreshTimer);
      TokenManager.refreshTimer = null;
    }
    TokenManager.disableGlobalFetchInterceptor();

    // Request refresh token revoke on server (with cookie)
    try {
      await (TokenManager.originalFetch || fetch)('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');

    const loginUrl = await TokenManager.getLoginUrl();
    window.location.href = loginUrl;
  }

  // ─────────────────────────────────────────────
  // Global fetch interceptor (automatic refresh/retry on 401)
  // ─────────────────────────────────────────────

  static enableGlobalFetchInterceptor() {
    if (typeof window === 'undefined' || TokenManager.isInterceptorActive) {
      return;
    }

    TokenManager.originalFetch = window.fetch.bind(window);
    TokenManager.isInterceptorActive = true;

    window.fetch = async function (input, init = {}) {
      try {
        const response = await TokenManager.originalFetch(input, init);

        // Exclude auth-related endpoints from interceptor
        const url = input.toString();
        const isAuthEndpoint =
          url.includes('/api/auth/login') ||
          url.includes('/api/auth/register') ||
          url.includes('/api/auth/validate') ||
          url.includes('/api/auth/refresh') ||
          url.includes('/api/auth/logout');

        if (response.status === 401 && !isAuthEndpoint) {
          logger.info('[TokenManager] 401 detected - trying silent refresh:', url);
          const refreshed = await TokenManager.silentRefresh();

          if (refreshed) {
            // Retry original request with new token
            const newToken = localStorage.getItem('token');
            const retryInit = {
              ...init,
              headers: {
                ...(init.headers || {}),
                Authorization: `Bearer ${newToken}`,
              },
            };
            return TokenManager.originalFetch(input, retryInit);
          } else {
            logger.info('[TokenManager] refresh failed - logging out');
            setTimeout(() => TokenManager.logout(), 100);
          }
        }

        return response;
      } catch (error) {
        throw error;
      }
    };

    logger.info('[TokenManager] Global fetch interceptor enabled');
  }

  static disableGlobalFetchInterceptor() {
    if (typeof window === 'undefined' || !TokenManager.isInterceptorActive) {
      return;
    }
    if (TokenManager.originalFetch) {
      window.fetch = TokenManager.originalFetch;
      TokenManager.originalFetch = null;
    }
    TokenManager.isInterceptorActive = false;
    logger.info('[TokenManager] Global fetch interceptor disabled');
  }

  // ─────────────────────────────────────────────
  // Backward compatibility (for calls from existing code)
  // ─────────────────────────────────────────────

  /** @deprecated Replaced by silentRefresh + scheduleRefresh */
  static async validateToken(token = null) {
    const expiresIn = TokenManager.getTokenExpiresIn(token);
    if (expiresIn <= 0) {
      return { valid: false, reason: 'expired' };
    }
    const payload = TokenManager.decodeLocalToken(token);
    return {
      valid: true,
      user: { id: payload.sub, email: payload.email, name: payload.name, role: payload.role },
      tokenInfo: { exp: payload.exp, expiresIn },
    };
  }

  /** @deprecated Replaced by scheduleRefresh */
  static startPeriodicValidation() {
    TokenManager.scheduleRefresh();
  }

  /** @deprecated Replaced by clearTimeout(refreshTimer) */
  static stopPeriodicValidation() {
    if (TokenManager.refreshTimer) {
      clearTimeout(TokenManager.refreshTimer);
      TokenManager.refreshTimer = null;
    }
  }

  /**
    * Safe API request wrapper (existing code compatibility)
   */
  static async safeFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
      TokenManager.logout();
      throw new Error('No token provided.');
    }

    const headers = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
    if (headers['Content-Type'] === undefined) {
      delete headers['Content-Type'];
    }

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      // Global interceptor handles this, but safeFetch also handles it explicitly
      throw new Error('Authentication expired.');
    }
    return response;
  }
}

export const tokenManager = new TokenManager();
