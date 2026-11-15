import { describe, expect, it } from 'vitest';
import { verifySnapshotFile } from './manifest';

describe('snapshot integrity', () => {
  it('accepts the expected SHA-256 digest', async () => {
    // SHA-256("hello")
    await expect(
      verifySnapshotFile('hello', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'),
    ).resolves.toBe(true);
  });

  it('rejects a mismatched digest and malformed hash', async () => {
    await expect(verifySnapshotFile('hello', '0'.repeat(64))).resolves.toBe(false);
    await expect(verifySnapshotFile('hello', 'not-a-hash')).resolves.toBe(false);
  });
});
