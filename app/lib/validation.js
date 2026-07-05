/**
 * Input validation and security utility functions
 */

// Escape HTML special characters
export function escapeHtml(text) {
  if (typeof text !== 'string') return text;

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Basic validation to prevent SQL injection
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  // Remove dangerous SQL keywords
  const sqlKeywords =
    /\b(select|insert|update|delete|drop|create|alter|exec|execute|union|script|javascript|vbscript|onload|onerror)\b/gi;
  return input.replace(sqlKeywords, '');
}

// Validate string length
export function validateLength(text, minLength = 0, maxLength = 100000) {
  if (typeof text !== 'string')
    return { valid: false, error: 'Not a text value.' };
  if (text.length < minLength)
    return { valid: false, error: `Must be at least ${minLength} characters.` };
  if (text.length > maxLength)
    return { valid: false, error: `Up to ${maxLength} characters are allowed.` };
  return { valid: true };
}

// Validate email format
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format.' };
  }
  return { valid: true };
}

// Validate UUID format (used in PostgreSQL)
export function validateUUID(id) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return { valid: false, error: 'Invalid UUID format.' };
  }
  return { valid: true };
}

// Validate allowed role
export function validateRole(role) {
  const allowedRoles = ['user', 'assistant', 'admin'];
  if (!allowedRoles.includes(role)) {
    return { valid: false, error: 'Role not allowed.' };
  }
  return { valid: true };
}

// Validate allowed user role
export function validateUserRole(userRole) {
  const allowedUserRoles = ['user', 'admin'];
  if (!allowedUserRoles.includes(userRole)) {
    return { valid: false, error: 'User role not allowed.' };
  }
  return { valid: true };
}

// Validate AI model name
export function validateModel(model) {
  if (!model) return { valid: true }; // Model name is optional

  // Validate that only allowed characters are included (letters, numbers, hyphen, colon, dot, space, parentheses)
  // Extended: OpenAI/HuggingFace model names and labels (e.g., "Gemma 3 4B (copy)")
  const modelRegex = /^[a-zA-Z0-9_\-:./() ㄱ-ㅎ가-힣]+$/;
  if (!modelRegex.test(model)) {
    return { valid: false, error: 'Model name format not allowed.' };
  }

  if (model.length > 100) {
    return { valid: false, error: 'Model name cannot exceed 100 characters.' };
  }

  return { valid: true };
}

// Comprehensive message validation
export function validateMessage(messageData) {
  const { role, text, model, roomId } = messageData;

  // Validate role
  const roleValidation = validateRole(role);
  if (!roleValidation.valid) return roleValidation;

  // Validate text
  const textValidation = validateLength(text, 1, 100000);
  if (!textValidation.valid) return textValidation;

  // Validate model name
  const modelValidation = validateModel(model);
  if (!modelValidation.valid) return modelValidation;

  // Validate room ID
  if (roomId && roomId !== 'general') {
    const roomIdValidation = validateUUID(roomId);
    if (!roomIdValidation.valid) return roomIdValidation;
  }

  return { valid: true };
}

// Validate pagination parameters
export function validatePagination(page, limit) {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 20;

  if (pageNum < 1)
    return { valid: false, error: 'Page number must be 1 or greater.' };
  if (limitNum < 1 || limitNum > 100)
    return {
      valid: false,
      error: 'Items per page must be between 1 and 100.',
    };

  return { valid: true, page: pageNum, limit: limitNum };
}

// Validate date range
export function validateDateRange(dateRange) {
  const allowedRanges = ['1d', '7d', '30d', '90d', '365d', 'all'];
  if (!allowedRanges.includes(dateRange)) {
    return { valid: false, error: 'Date range not allowed.' };
  }
  return { valid: true };
}
