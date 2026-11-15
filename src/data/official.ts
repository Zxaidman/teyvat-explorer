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
  const mapVersion = typeof value.mapVersion === 'string' ? value.mapVersion : '';
  const minZoom = finiteNumber(value.minZoom);
  const maxZoom = finiteNumber(value.maxZoom);
  const tileUrlTemplate =
    typeof value.cdnTileUrlTemplate === 'string'
      ? value.cdnTileUrlTemplate
      : typeof value.tileUrlTemplate === 'string'
        ? value.tileUrlTemplate
        : '';

  if (
    mapId === undefined ||
    !mapVersion ||
    minZoom === undefined ||
    maxZoom === undefined ||
    !tileUrlTemplate ||
    !tileUrlTemplate.includes('{suffix}')
  ) {
    throw new Error('meta.json is missing required map ID, version, zoom or tile-template fields.');
  }

  return {
    mapId,
    mapVersion,
    origin: requiredPair(value.origin, 'origin'),
    totalSize: requiredPair(value.totalSize, 'totalSize'),
    minZoom,
    maxZoom,
    tileUrlTemplate,
  };
}

export function parseOfficialLabels(input: unknown): Map<number, string> {
  if (!Array.isArray(input)) throw new Error('labels.json must contain an array.');
  const labels = new Map<number, string>();
  const visit = (nodes: unknown[]) => {
    for (const node of nodes) {
      const item = object(node);
      if (!item) continue;
      const id = finiteNumber(item.id);
      if (id !== undefined && typeof item.name === 'string') labels.set(id, item.name);
      if (Array.isArray(item.children)) visit(item.children);
    }
  };
  visit(input);
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
    if (id === undefined || labelId === undefined || x === undefined || y === undefined) {
      skipped++;
      continue;
    }

    markers.push({
      id: `official:${id}`,
      sourceId: String(id),
      labelId,
      name: labels.get(labelId) ?? `Map point ${id}`,
      category: labels.get(labelId) ?? `Unknown category (${labelId})`,
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
        ...(skipped ? [`${skipped} records were skipped due to missing id, labelId or coordinates.`] : []),
        'Underground floor markers (z != 0) are retained but hidden until floor selection is implemented.',
      ],
    },
  };
}