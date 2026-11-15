import { describe, expect, it } from 'vitest';
import { gameToPixel, officialTileUrl, tileGridSize, zoomSuffix } from './officialTiles';
import { parseOfficialMeta, parseOfficialLabels, parseOfficialPoints } from '../data/official';
import type { OfficialMeta } from '../types';

// Grounded in the upstream genshin-map-data v7.2.0 meta.json.
const meta: OfficialMeta = {
  mapId: 2,
  mapVersion: 'bd70cde160dbd523926208d9fa8961a1',
  origin: [24207, 16411],
  totalSize: [36864, 32768],
  minZoom: -4,
  maxZoom: 0,
  tileUrlTemplate:
    'tiles/{x}_{y}_{suffix}.webp',
};

describe('official tile scheme', () => {
  it('encodes negative and non-negative zoom suffixes', () => {
    expect(zoomSuffix(-4)).toBe('N4');
    expect(zoomSuffix(-3)).toBe('N3');
    expect(zoomSuffix(-1)).toBe('N1');
    expect(zoomSuffix(0)).toBe('P0');
  });

  it('substitutes all official tile URL placeholders', () => {
    expect(officialTileUrl(meta, 23, 8, -2)).toBe(
      'tiles/23_8_N2.webp',
    );
  });

  it('converts game coordinates to full-resolution map pixels', () => {
    const pixel = gameToPixel(meta, -7318.5, -5640.6);
    expect(pixel.x).toBeCloseTo(16888.5, 6);
    expect(pixel.y).toBeCloseTo(10770.4, 6);
  });

  it('calculates tile pyramid dimensions using current official map dimensions', () => {
    expect(tileGridSize(meta, -4)).toEqual({ cols: 9, rows: 8 });
    expect(tileGridSize(meta, -3)).toEqual({ cols: 18, rows: 16 });
    expect(tileGridSize(meta, -2)).toEqual({ cols: 36, rows: 32 });
    expect(tileGridSize(meta, -1)).toEqual({ cols: 72, rows: 64 });
    expect(tileGridSize(meta, 0)).toEqual({ cols: 144, rows: 128 });
  });
});

describe('official snapshot import validation', () => {
  it('accepts the upstream v7.2.0 metadata shape', () => {
    expect(parseOfficialMeta({
      mapId: 2,
      mapVersion: 'bd70cde160dbd523926208d9fa8961a1',
      origin: [24207, 16411],
      totalSize: [36864, 32768],
      minZoom: -4,
      maxZoom: 0,
      tileUrlTemplate: 'tiles/{x}_{y}_{suffix}.webp',
      cdnTileUrlTemplate: meta.tileUrlTemplate,
    })).toEqual(meta);
  });

  it('rejects invalid zoom ranges and insecure tile URLs', () => {
    expect(() => parseOfficialMeta({
      mapId: 2, mapVersion: 'v', origin: [0, 0], totalSize: [1, 1],
      minZoom: 1, maxZoom: -1, cdnTileUrlTemplate: meta.tileUrlTemplate,
    })).toThrow(/zoom range/);
    expect(() => parseOfficialMeta({
      mapId: 2, mapVersion: 'v', origin: [0, 0], totalSize: [1, 1],
      minZoom: -1, maxZoom: 0, tileUrlTemplate: 'http://example.com/{x}_{y}_{suffix}',
    })).toThrow(/tiles\\/ path or use HTTPS/);
  });

  it('walks nested labels and skips duplicate or malformed point records', () => {
    const labels = parseOfficialLabels([{ id: 1, name: 'Collectibles', children: [{ id: 2, name: 'Anemoculus' }] }]);
    const result = parseOfficialPoints([
      { id: 10, labelId: 2, x: 1.5, y: -2, z: 0 },
      { id: 10, labelId: 2, x: 3, y: 4 },
      { id: 'bad', labelId: 2, x: 1, y: 1 },
    ], labels);
    expect(result.markers).toHaveLength(1);
    expect(result.markers[0]).toMatchObject({ id: 'official:10', name: 'Anemoculus', x: 1.5, y: -2 });
    expect(result.report.skipped).toBe(2);
  });
});
