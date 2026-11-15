import { describe, expect, it } from 'vitest';
import { gameToPixel, officialTileUrl, tileGridSize, zoomSuffix } from './officialTiles';
import type { OfficialMeta } from '../types';

const meta: OfficialMeta = {
  mapId: 2,
  mapVersion: 'eea752b746ae1f2e0c1988a574f2b7b0',
  origin: [24206, 8918],
  totalSize: [36864, 18432],
  minZoom: -3,
  maxZoom: 0,
  tileUrlTemplate:
    'https://act-webstatic.mihoyo.com/ys-map-op/map/{mapId}/{mapVersion}/{x}_{y}_{suffix}.webp',
};

describe('official tile scheme', () => {
  it('encodes negative and non-negative zoom suffixes', () => {
    expect(zoomSuffix(-3)).toBe('N3');
    expect(zoomSuffix(-1)).toBe('N1');
    expect(zoomSuffix(0)).toBe('P0');
  });

  it('substitutes all official tile URL placeholders', () => {
    expect(officialTileUrl(meta, 23, 8, -2)).toBe(
      'https://act-webstatic.mihoyo.com/ys-map-op/map/2/eea752b746ae1f2e0c1988a574f2b7b0/23_8_N2.webp',
    );
  });

  it('converts game coordinates to full-resolution map pixels', () => {
    const pixel = gameToPixel(meta, -7318.5, -5640.6);
    expect(pixel.x).toBeCloseTo(16887.5, 6);
    expect(pixel.y).toBeCloseTo(3277.4, 6);
  });

  it('calculates tile pyramid dimensions at each zoom', () => {
    expect(tileGridSize(meta, -3)).toEqual({ cols: 18, rows: 9 });
    expect(tileGridSize(meta, -2)).toEqual({ cols: 36, rows: 18 });
    expect(tileGridSize(meta, -1)).toEqual({ cols: 72, rows: 36 });
    expect(tileGridSize(meta, 0)).toEqual({ cols: 144, rows: 72 });
  });
});