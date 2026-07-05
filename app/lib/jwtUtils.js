import logger from '@/lib/logger';
/**
 * JWT utility functions
 * Safely handle JWT tokens that contain UTF-8 characters
 */

/**
 * Decode JWT token payload (UTF-8 safe)
 * @param {string} token - JWT token
 * @returns {object} Decoded payload object
 * @throws {Error} When token is invalid
 */
export function decodeJWTPayload(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid token.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token format.');
  }

  const base64Payload = parts[1];

  try {
    // Convert Base64URL to standard Base64
    const base64 = base64Payload.replace(/-/g, '+').replace(/_/g, '/');

    // Decode Base64 and convert to UTF-8 string
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // UTF-8 decoding
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(bytes);

    return JSON.parse(jsonString);
  } catch (error) {
    // Fallback for environments without TextDecoder
    try {
      const base64 = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(
        decodeURIComponent(
          atob(base64)
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
      );
    } catch (fallbackError) {
      throw new Error('Failed to decode token payload: ' + fallbackError.message);
    }
  }
}

/**
 * Check whether JWT token is expired
 * @param {string} token - JWT token
 * @returns {boolean} Expiration status (expired = true)
 */
export function isTokenExpired(token) {
  try {
    const payload = decodeJWTPayload(token);
    if (!payload.exp) {
      return false; // If no exp claim, treat as not expired
    }
    return Date.now() >= payload.exp * 1000;
  } catch (error) {
    return true; // Treat as expired if parsing fails
  }
}

/**
 * Extract user information from JWT token
 * @param {string} token - JWT token
 * @returns {object|null} User information or null
 */
export function getUserFromToken(token) {
  try {
    const payload = decodeJWTPayload(token);
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role || 'user',
      department: payload.department,
      cell: payload.cell,
      employeeNo: payload.employeeNo,
    };
  } catch (error) {
    logger.error('Failed to extract user information from token:', error);
    return null;
  }
}
