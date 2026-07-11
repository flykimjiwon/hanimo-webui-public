import assert from 'node:assert/strict';
import test from 'node:test';

import { detectImageMagic } from '../../app/lib/security/image-magic.mjs';

test('detectImageMagic recognizes fixed image types and extensions', () => {
  assert.deepEqual(detectImageMagic(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), {
    type: 'jpeg',
    mime: 'image/jpeg',
    extension: '.jpg',
    decodedBytes: 4,
  });
  assert.equal(detectImageMagic(Uint8Array.from([0x00, 0x01, 0x02])), null);
  assert.equal(detectImageMagic(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mime, 'image/png');
  assert.equal(detectImageMagic(Buffer.from('GIF89a')).extension, '.gif');
  assert.equal(detectImageMagic(Buffer.from('RIFFxxxxWEBP')).mime, 'image/webp');
});

test('detectImageMagic enforces decoded byte guard', () => {
  assert.throws(
    () => detectImageMagic(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), { maxDecodedBytes: 3 }),
    /Decoded image exceeds size limit/
  );
  assert.throws(
    () => detectImageMagic(Uint8Array.from([0x00, 0x01, 0x02, 0x03]), { maxDecodedBytes: 3 }),
    /Decoded image exceeds size limit/
  );
});
