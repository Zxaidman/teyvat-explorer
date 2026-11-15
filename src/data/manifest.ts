export interface OfficialManifest {
  schemaVersion: number;
  source: string;
  sourceCommit: string;
  sourceUpdatedAt: string | null;
  syncedAt: string;
  gameVersion: string | null;
  mapVersion: string;
  pointCount: number;
  files: { meta: string; labels: string; points: string };
}
