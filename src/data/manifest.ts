export interface OfficialManifest {
  schemaVersion: number;
  source: string;
  sourceCommit: string;
  sourceUpdatedAt: string | null;
  syncedAt: string;
  gameVersion: string | null;
  mapVersion: string;
  pointCount: number;
  checksums: Record<'meta.json' | 'labels.json' | 'points.json', string>;
  files: { meta: './meta.json'; labels: './labels.json'; points: './points.json' };
}

export async function verifySnapshotFile(content: string, expectedHex: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(expectedHex) || !globalThis.crypto?.subtle) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  const actualHex = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  return actualHex === expectedHex.toLowerCase();
}
