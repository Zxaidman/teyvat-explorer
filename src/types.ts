export type ProgressState = 'unknown' | 'collected' | 'missing';

export interface Marker {
  id: string;
  sourceId: string;
  labelId: number;
  name: string;
  category: string;
  x: number;
  y: number;
  z?: number;
}

export interface ProgressRecord {
  markerId: string;
  state: ProgressState;
  updatedAt: string;
}

export interface OfficialMeta {
  mapId: number;
  mapVersion: string;
  origin: [number, number];
  totalSize: [number, number];
  minZoom: number;
  maxZoom: number;
  tileUrlTemplate: string;
}

export interface ImportReport {
  imported: number;
  skipped: number;
  warnings: string[];
}