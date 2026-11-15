import type { OfficialMeta } from '../types';

export function zoomSuffix(zoom: number): string {
  return `${zoom < 0 ? 'N' : 'P'}${Math.abs(zoom)}`;
}

export function officialTileUrl(meta: OfficialMeta, x: number, y: number, zoom: number): string {
  return meta.tileUrlTemplate
    .replace(/\{mapId\}/g, String(meta.mapId))
    .replace(/\{mapVersion\}/g, meta.mapVersion)
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y))
    .replace(/\{suffix\}/g, zoomSuffix(zoom));
}

// The upstream snapshot stores game-space coordinates; the renderer uses map pixels.
export function gameToPixel(meta: OfficialMeta, x: number, y: number) {
  return { x: x + meta.origin[0], y: y + meta.origin[1] };
}

export function tileGridSize(meta: OfficialMeta, zoom: number) {
  const scale = 2 ** zoom;
  return {
    cols: Math.floor((meta.totalSize[0] * scale) / 256),
    rows: Math.floor((meta.totalSize[1] * scale) / 256),
  };
}