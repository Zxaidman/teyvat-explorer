import type { Marker, OfficialMeta, ImportReport } from '../types';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function requiredPair(value: unknown, field: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`Official metadata field "${field}" must contain two numbers.`);
  }
  const a = finiteNumber(value[0]);
  const b = finiteNumber(value[1]);
  if (a === undefined || b === undefined) {
    throw new Error(`Official metadata field "${field}" contains invalid coordinates.`);
  }
  return [a, b];
}

export function parseOfficialMeta(input: unknown): OfficialMeta {
  const value = object(input);
  if (!value) throw new Error('meta.json must contain a JSON object.');

  const mapId = finiteNumber(value.mapId);
  const mapVersion = typeof value.mapVersion === 'string' ? value.mapVersion.trim() : '';
  const minZoom = finiteNumber(value.minZoom);
  const maxZoom = finiteNumber(value.maxZoom);
  // Prefer the release-relative tile pyramid, which we publish with the app.
  // CDN is only a fallback for older snapshots without bundled tiles.
  const tileUrlTemplate =
    typeof value.tileUrlTemplate === 'string' && value.tileUrlTemplate.trim()
      ? value.tileUrlTemplate.trim()
      : typeof value.cdnTileUrlTemplate === 'string'
        ? value.cdnTileUrlTemplate.trim()
        : '';
  const origin = requiredPair(value.origin, 'origin');
  const totalSize = requiredPair(value.totalSize, 'totalSize');

  if (
    mapId === undefined || mapId <= 0 ||
    !mapVersion ||
    minZoom === undefined || maxZoom === undefined ||
    !Number.isInteger(minZoom) || !Number.isInteger(maxZoom) || minZoom > maxZoom ||
    !tileUrlTemplate.includes('{suffix}') ||
    !tileUrlTemplate.includes('{x}') ||
    !tileUrlTemplate.includes('{y}')
  ) {
    throw new Error('meta.json is missing valid map ID, version, zoom range or tile-template fields.');
  }
  if (totalSize.some(size => !Number.isFinite(size) || size <= 0)) {
    throw new Error('Official metadata totalSize must contain positive dimensions.');
  }
  if (origin.some(coordinate => !Number.isFinite(coordinate))) {
    throw new Error('Official metadata origin contains invalid coordinates.');
  }
  if (!tileUrlTemplate.startsWith('tiles/') && !tileUrlTemplate.startsWith('https://')) {
    throw new Error('Official tile URL must be a snapshot-relative tiles/ path or use HTTPS.');
  }

  return { mapId, mapVersion, origin, totalSize, minZoom, maxZoom, tileUrlTemplate };
}

export function parseOfficialLabels(input: unknown): Map<number, string> {
  if (!Array.isArray(input)) throw new Error('labels.json must contain an array.');
  const labels = new Map<number, string>();
  const visit = (nodes: unknown[]) => {
    for (const node of nodes) {
      const item = object(node);
      if (!item) continue;
      const id = finiteNumber(item.id);
      if (id !== undefined && typeof item.name === 'string' && item.name.trim()) {
        labels.set(id, item.name.trim());
      }
      if (Array.isArray(item.children)) visit(item.children);
    }
  };
  visit(input);
  if (labels.size === 0) throw new Error('labels.json did not contain any valid labels.');
  return labels;
}

export function parseOfficialPoints(
  input: unknown,
  labels: Map<number, string>,
): { markers: Marker[]; report: ImportReport } {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('points.json must contain a non-empty array. Existing data was not changed.');
  }

  const markers: Marker[] = [];
  const seenIds = new Set<string>();
  let skipped = 0;
  for (const point of input) {
    const item = object(point);
    if (!item) {
      skipped++;
      continue;
    }
    const id = finiteNumber(item.id);
    const labelId = finiteNumber(item.labelId);
    const x = finiteNumber(item.x);
    const y = finiteNumber(item.y);
    if (
      id === undefined || labelId === undefined || x === undefined || y === undefined ||
      !Number.isInteger(id) || !Number.isInteger(labelId)
    ) {
      skipped++;
      continue;
    }

    const sourceId = String(id);
    if (seenIds.has(sourceId)) {
      skipped++;
      continue;
    }
    seenIds.add(sourceId);

    const label = labels.get(labelId);
    markers.push({
      id: `official:${sourceId}`,
      sourceId,
      labelId,
      name: label ?? `Map point ${sourceId}`,
      category: label ?? `Unknown category (${labelId})`,
      x,
      y,
      ...(finiteNumber(item.z) !== undefined ? { z: finiteNumber(item.z) } : {}),
    });
  }

  if (markers.length === 0) {
    throw new Error('No valid official point records found. Existing data was not changed.');
  }

  return {
    markers,
    report: {
      imported: markers.length,
      skipped,
      warnings: [
        ...(skipped ? [`${skipped} records were skipped due to invalid or duplicate IDs, labels or coordinates.`] : []),
        'Underground floor markers (z != 0) are retained but hidden until floor selection is implemented.',
      ],
    },
  };
}
