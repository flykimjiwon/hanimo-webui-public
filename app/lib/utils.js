import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"
import { randomUUID } from 'crypto';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Generate UUID (PostgreSQL compatible)
 */
export function generateUUID() {
  return randomUUID();
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
