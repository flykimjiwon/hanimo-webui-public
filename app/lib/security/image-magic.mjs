const MAX_DECODED_IMAGE_BYTES = 20 * 1024 * 1024;

const TYPES = {
  jpeg: { mime: 'image/jpeg', extension: '.jpg' },
  png: { mime: 'image/png', extension: '.png' },
  gif: { mime: 'image/gif', extension: '.gif' },
  webp: { mime: 'image/webp', extension: '.webp' },
};

function readBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('Image input must be bytes');
}

export function detectImageMagic(input, options = {}) {
  const bytes = readBytes(input);
  const maxDecodedBytes = options.maxDecodedBytes || MAX_DECODED_IMAGE_BYTES;
  if (bytes.byteLength > maxDecodedBytes) {
    throw new Error('Decoded image exceeds size limit');
  }
  let type = null;

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    type = 'jpeg';
  } else if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    type = 'png';
  } else if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    type = 'gif';
  } else if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    type = 'webp';
  }

  if (!type) return null;
  return { type, ...TYPES[type], decodedBytes: bytes.byteLength };
}
