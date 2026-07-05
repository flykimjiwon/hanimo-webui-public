/**
 * PII filter — open-source stub (no-op by default).
 *
 * The main chat backend (app/api/webapp-generate) calls detectAndMaskPII only
 * when a model opts in via `piiFilterRequest` / `piiFilterResponse`. In the
 * open-source build PII detection/masking is intentionally disabled (returns the
 * text unchanged) so the chat works out of the box with zero external services.
 *
 * To enable PII masking, replace this with a real implementation that returns the
 * same shape: { detected, detectedCnt, maskedText, items }.
 *
 * Author: Kim Jiwon (김지원) https://github.com/flykimjiwon · License: Apache-2.0
 *
 * @param {string} text - input text
 * @param {object} [options] - reserved for real implementations
 * @returns {Promise<{detected: boolean, detectedCnt: number, maskedText: string, items: Array}>}
 */
export async function detectAndMaskPII(text /* , options = {} */) {
  return {
    detected: false,
    detectedCnt: 0,
    maskedText: text ?? '',
    items: [],
  };
}

export default { detectAndMaskPII };
