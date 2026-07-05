import logger from '@/lib/logger';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { JWT_SECRET } from './config';
import { createAuthError, createForbiddenError } from './errorHandler';
import { query } from './postgres';
/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || 
                     request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
}

/**
 * Verify the Bearer token in the Authorization header,
 * return payload (decoded token) if valid, otherwise null.
 * 
 * @param {Request} request - Next.js Request object
 * @returns {object|null} Decoded token payload or null
 */
export function verifyToken(request) {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET || process.env.JWT_SECRET);
    // Use sub (subject) as user ID according to JWT standard
    // id is also provided for backward compatibility, but sub is recommended
    return { ...payload, id: payload.sub, userId: payload.sub };
  } catch (error) {
    logger.error('JWT token verification failed:', error.message);
    return null;
  }
}

/**
 * Return token verification result object (compatible with format used in some files)
 * @param {Request} request - Next.js Request object
 * @returns {{valid: boolean, user?: object, error?: string}}
 */
export function verifyTokenWithResult(request) {
  const token = extractBearerToken(request);
  
  if (!token) {
    return { valid: false, error: 'No authentication token.' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET || process.env.JWT_SECRET);
    // Map JWT `sub` -> id/userId (login signs the user id into `sub`).
    // Without this, routes using auth.user.id get undefined (e.g. workflows user_id=null).
    return {
      valid: true,
      user: { ...decoded, id: decoded.id || decoded.sub, userId: decoded.userId || decoded.sub },
    };
  } catch (error) {
    return { valid: false, error: 'Invalid token.' };
  }
}

/**
 * Verify admin privileges
 * @param {Request} request - Next.js Request object
 * @returns {{valid: boolean, user?: object, error?: string}} | NextResponse
 */
export function verifyAdminWithResult(request) {
  const token = extractBearerToken(request);
  
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET || process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return { valid: false, error: 'Admin privileges required' };
    }
    // Map JWT `sub` -> id/userId (login signs the user id into `sub`).
    // Without this, routes using auth.user.id get undefined (e.g. workflows user_id=null).
    return {
      valid: true,
      user: { ...decoded, id: decoded.id || decoded.sub, userId: decoded.userId || decoded.sub },
    };
  } catch (error) {
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Verify admin or manager privileges
 */
export function verifyAdminOrManagerWithResult(request) {
  const token = extractBearerToken(request);
  
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET || process.env.JWT_SECRET);
    if (!['admin', 'manager'].includes(decoded.role)) {
      return { valid: false, error: 'Admin or manager privileges required' };
    }
    // Map JWT `sub` -> id/userId (login signs the user id into `sub`).
    // Without this, routes using auth.user.id get undefined (e.g. workflows user_id=null).
    return {
      valid: true,
      user: { ...decoded, id: decoded.id || decoded.sub, userId: decoded.userId || decoded.sub },
    };
  } catch (error) {
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Middleware for API routes that require authentication
 * @param {Request} request - Next.js Request object
 * @returns {object|null} {user: object} or null (when authentication fails)
 */
export function requireAuth(request) {
  const payload = verifyToken(request);
  if (!payload) {
    return null;
  }
  return { user: payload };
}

/**
 * Middleware for API routes that require admin privileges
 * @param {Request} request - Next.js Request object
 * @returns {object|null} {user: object} or null (when auth/permission fails)
 */
export function requireAdmin(request) {
  const payload = verifyToken(request);
  if (!payload) {
    return null;
  }
  if (payload.role !== 'admin') {
    return null;
  }
  return { user: payload };
}

/**
 * Update last activity timestamp (10-minute throttle)
 * DB query: perform actual update only when last_active_at < NOW() - 10 minutes
 * @param {string} userId - User UUID
 */
export async function updateLastActive(userId) {
  if (!userId) return;
  try {
    await query(
      `UPDATE users SET last_active_at = NOW()
       WHERE id = $1
         AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '10 minutes')`,
      [userId]
    );
  } catch (err) {
    logger.warn('[Auth] updateLastActive failed:', err.message);
  }
}
