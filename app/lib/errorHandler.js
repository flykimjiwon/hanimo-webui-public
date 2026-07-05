import logger from '@/lib/logger';
import { NextResponse } from 'next/server';
import { logAppError } from '@/lib/appErrorLogger';

/**
 * Create a standardized error response
 */
export function createErrorResponse(error, status = 500) {
  const errorResponse = {
    success: false,
    error: error.message || error,
    timestamp: new Date().toISOString(),
    status
  };

  // Include detailed info only in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  logger.error(`[ERROR ${status}]`, error);
  if (status >= 500) {
    logAppError({
      source: 'server',
      level: 'error',
      message: error.message || String(error),
      stack: error.stack,
      context: { status },
    });
  } else if (status >= 400) {
    logger.warn(`[WARN ${status}]`, error.message || error);
  }

  return NextResponse.json(errorResponse, { status });
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(data, status = 200) {
  const successResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(successResponse, { status });
}

/**
 * Authentication error response
 */
export function createAuthError(message = 'Authentication required.') {
  return createErrorResponse(new Error(message), 401);
}

/**
 * Authorization error response
 */
export function createForbiddenError(message = 'Access denied.') {
  return createErrorResponse(new Error(message), 403);
}

/**
 * Not-found error response
 */
export function createNotFoundError(message = 'Requested resource not found.') {
  return createErrorResponse(new Error(message), 404);
}

/**
 * Validation error response
 */
export function createValidationError(message) {
  return createErrorResponse(new Error(message), 400);
}

/**
 * Server error response
 */
export function createServerError(error, message = 'Internal server error.') {
  return createErrorResponse(error || new Error(message), 500);
}

/**
 * API error handling helper (compatible with existing routes)
 */
export function handleApiError(error, context = '') {
  if (context) {
    logger.error(`[API ERROR] ${context}`, error);
  } else {
    logger.error('[API ERROR]', error);
  }
  return createServerError(error);
}

/**
 * Wrap an async function and handle errors automatically
 */
export function withErrorHandler(handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error.name === 'ValidationError') {
        return createValidationError(error.message);
      }
      if (error.name === 'UnauthorizedError') {
        return createAuthError(error.message);
      }
      if (error.name === 'ForbiddenError') {
        return createForbiddenError(error.message);
      }
      if (error.name === 'NotFoundError') {
        return createNotFoundError(error.message);
      }
      
      return createServerError(error);
    }
  };
}

/**
 * Custom error classes
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Access denied.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Requested resource not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}
