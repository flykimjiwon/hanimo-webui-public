import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { verifyToken, requireAuth, requireAdmin } from './auth';
import {
  createErrorResponse,
  createAuthError,
  createForbiddenError,
  createValidationError,
  createNotFoundError,
  createServerError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from './errorHandler';
import { isValidUUID } from './utils';

/**
 * Wrap API route handlers to provide common error handling and auth validation
 * 
 * @param {Function} handler - API handler function
 * @param {object} options - options
 * @param {boolean} options.requireAuth - whether auth is required (default: false)
 * @param {boolean} options.requireAdmin - whether admin privileges are required (default: false)
 * @param {string} options.logPrefix - log prefix
 * @returns {Function} wrapped handler function
 */
export function withApiHandler(handler, options = {}) {
  const {
    requireAuth: needsAuth = false,
    requireAdmin: needsAdmin = false,
    logPrefix = '[API]',
  } = options;

  return async (request, context) => {
    try {
      // Auth validation
      if (needsAdmin) {
        const adminResult = requireAdmin(request);
        if (!adminResult) {
          return createForbiddenError('Admin privileges required.');
        }
        // Add user info to context
        context.user = adminResult.user;
      } else if (needsAuth) {
        const authResult = requireAuth(request);
        if (!authResult) {
          return createAuthError('Authentication required.');
        }
        // Add user info to context
        context.user = authResult.user;
      }

      // Execute handler
      const result = await handler(request, context);

      // Return as-is if NextResponse is already returned
      if (result instanceof NextResponse) {
        return result;
      }

      // Convert plain object to success response
      return NextResponse.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Handle custom errors
      if (error instanceof ValidationError) {
        return createValidationError(error.message);
      }
      if (error instanceof UnauthorizedError) {
        return createAuthError(error.message);
      }
      if (error instanceof ForbiddenError) {
        return createForbiddenError(error.message);
      }
      if (error instanceof NotFoundError) {
        return createNotFoundError(error.message);
      }

      // Handle generic errors
      logger.error(`${logPrefix} Error:`, error);
      return createServerError(error);
    }
  };
}

/**
 * UUID validation middleware
 * @param {string} id - UUID to validate
 * @param {string} fieldName - field name (for error message)
 * @throws {ValidationError} if UUID is invalid
 */
export function validateUUID(id, fieldName = 'ID') {
  if (!id) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  if (!isValidUUID(id)) {
    throw new ValidationError(`Invalid ${fieldName}.`);
  }
}

/**
 * API handler wrapper that requires authentication
 */
export function withAuth(handler, logPrefix) {
  return withApiHandler(handler, {
    requireAuth: true,
    logPrefix,
  });
}

/**
 * API handler wrapper that requires admin privileges
 */
export function withAdmin(handler, logPrefix) {
  return withApiHandler(handler, {
    requireAdmin: true,
    logPrefix,
  });
}

/**
 * Request body validation helper
 * @param {Request} request - Next.js Request object
 * @param {Array<string>} requiredFields - required field list
 * @returns {Promise<object>} parsed request body
 * @throws {ValidationError} if required fields are missing
 */
export async function validateRequestBody(request, requiredFields = []) {
  try {
    const body = await request.json();
    
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        throw new ValidationError(`${field} field is required.`);
      }
    }
    
    return body;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError('Failed to parse request body.');
  }
}

/**
 * Query parameter validation helper
 * @param {URLSearchParams} searchParams - URLSearchParams object
 * @param {Array<string>} requiredParams - required parameter list
 * @returns {object} parsed query parameters
 * @throws {ValidationError} if required parameters are missing
 */
export function validateQueryParams(searchParams, requiredParams = []) {
  const params = {};
  
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  
  for (const param of requiredParams) {
    if (!params[param]) {
      throw new ValidationError(`${param} parameter is required.`);
    }
  }
  
  return params;
}
