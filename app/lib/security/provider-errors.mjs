import { randomUUID } from 'node:crypto';

import { redactRecursive } from './redaction.mjs';

export function createProviderFailure(
  error,
  publicMessage = 'The configured model provider is unavailable.',
  correlationId = randomUUID()
) {
  const log = redactRecursive({
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error || 'Unknown provider error'),
  });

  return {
    correlationId,
    headers: { 'X-Request-Id': correlationId },
    log,
    openAI: {
      error: {
        message: publicMessage,
        type: 'server_error',
        correlation_id: correlationId,
      },
    },
    web: {
      error: publicMessage,
      correlation_id: correlationId,
    },
  };
}
