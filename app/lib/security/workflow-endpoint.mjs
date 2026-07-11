import { assertAllowedOutboundUrl } from './outbound-policy.mjs';
import { encryptOptionalSecret } from './secret-box.mjs';

export async function prepareWorkflowEndpoint({ endpointUrl, apiKey = '' } = {}, options = {}) {
  const normalizedEndpoint = await assertAllowedOutboundUrl(endpointUrl, options);
  const encryptedApiKey = encryptOptionalSecret(apiKey, options);
  return { normalizedEndpoint, encryptedApiKey };
}
