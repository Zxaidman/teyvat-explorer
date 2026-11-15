import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, useMap } from 'react-leaflet';
import type { Marker, OfficialMeta } from './types';
import { gameToPixel, officialTileUrl } from './map/officialTiles';

class OfficialGridLayer extends L.GridLayer {
  private readonly meta: OfficialMeta;

  constructor(meta: OfficialMeta) {
    super({
      tileSize: 256,
      minZoom: meta.minZoom,
      maxZoom: meta.maxZoom,
      noWrap: true,
      keepBuffer: 2,
      updateWhenIdle: true,
      updateWhenZooming: false,
    });
    this.meta = meta;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'eager';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => done(undefined, image);
    let usedCdnFallback = false;
    image.onerror = () => {
      if (!usedCdnFallback && this.meta.cdnTileUrlTemplate) {
        usedCdnFallback = true;
        const fallbackUrl = officialTileUrl(
          { ...this.meta, tileUrlTemplate: this.meta.cdnTileUrlTemplate },
          coords.x,
          coords.y,
          coords.z,
        );
        console.warn('[Teyvat Explorer] Local tile unavailable; trying official CDN', fallbackUrl);
        image.src = fallbackUrl;
        return;
      }
      const error = new Error(`Official map tile unavailable after local/CDN attempts: ${coords.z}/${coords.x}/${coords.y}`);
      console.error('[Teyvat Explorer] Tile failed', { coords, localUrl: tilePath, cdnFallback: this.meta.cdnTileUrlTemplate });
      done(error, image);
    };

    const tilePath = officialTileUrl(this.meta, coords.x, coords.y, coords.z);
    image.src = tilePath.startsWith('https://')
      ? tilePath
      : `${import.meta.env.BASE_URL}data/${tilePath}`;
    return image;
  }
}

function OfficialTiles({ meta }: { meta: OfficialMeta }) {
  const map = useMap();
  useEffect(() => {
    const layer = new OfficialGridLayer(meta);
    layer.addTo(map);
    layer.on('tileerror', (event: L.TileEvent) => {
      console.warn('[Teyvat Explorer] Tile failed to load', event.coords);
    });
    return () => { map.removeLayer(layer); };
  }, [map, meta]);
  return null;
}

type ScreenMarker = { marker: Marker; x: number; y: number };

class MarkerCanvasLayer extends L.Layer {
  private mapRef!: L.Map;
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private readonly buckets = new Map<string, Marker[]>();
  private readonly cellSize = 512;
  private onSelect: (marker: Marker) => void;

  constructor(
    markers: Marker[],
    private readonly meta: OfficialMeta,
    onSelect: (marker: Marker) => void,
  ) {
    super();
    this.onSelect = onSelect;
    for (const marker of markers) {
      if (marker.z !== undefined && marker.z !== 0) continue;
      const pixel = gameToPixel(meta, marker.x, marker.y);
      const key = this.key(pixel.x, pixel.y);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(marker);
      else this.buckets.set(key, [marker]);
    }
  }

  onAdd(map: L.Map): this {
    this.mapRef = map;
    this.canvas = L.DomUtil.create('canvas', 'teyvat-marker-canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '450';
    this.context = this.canvas.getContext('2d')!;
    map.getPanes().overlayPane.appendChild(this.canvas);
    map.on('moveend zoomend resize', this.redraw, this);
    map.on('click', this.handleClick, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off('moveend zoomend resize', this.redraw, this);
    map.off('click', this.handleClick, this);
    this.canvas.remove();
    this.buckets.clear();
    return this;
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  private visibleMarkers(): Marker[] {
    const bounds = this.mapRef.getBounds();
    const left = Math.max(0, bounds.getWest());
    const right = Math.min(this.meta.totalSize[0], bounds.getEast());
    const top = Math.max(0, this.meta.totalSize[1] - bounds.getNorth());
    const bottom = Math.min(this.meta.totalSize[1], this.meta.totalSize[1] - bounds.getSouth());
    const result: Marker[] = [];
    const x0 = Math.floor(left / this.cellSize);
    const x1 = Math.floor(right / this.cellSize);
    const y0 = Math.floor(top / this.cellSize);
    const y1 = Math.floor(bottom / this.cellSize);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const marker of bucket) {
          const pixel = gameToPixel(this.meta, marker.x, marker.y);
          if (pixel.x >= left && pixel.x <= right && pixel.y >= top && pixel.y <= bottom) result.push(marker);
        }
      }
    }
    return result;
  }

  private redraw = (): void => {
    if (!this.mapRef || !this.canvas) return;
    const size = this.mapRef.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(size.x * dpr);
    this.canvas.height = Math.round(size.y * dpr);
    this.canvas.style.width = `${size.x}px`;
    this.canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(this.canvas, this.mapRef.containerPointToLayerPoint([0, 0]));
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.context.clearRect(0, 0, size.x, size.y);

    const visible = this.visibleMarkers();
    const zoom = this.mapRef.getZoom();
    const cellPixels = zoom <= -3 ? 13 : visible.length > 7000 ? 11 : 0;
    if (cellPixels > 0) {
      const clusters = new Map<string, ScreenMarker[]>();
      for (const marker of visible) {
        const pixel = gameToPixel(this.meta, marker.x, marker.y);
        const point = this.mapRef.latLngToContainerPoint([this.meta.totalSize[1] - pixel.y, pixel.x]);
        if (point.x < -8 || point.y < -8 || point.x > size.x + 8 || point.y > size.y + 8) continue;
        const key = `${Math.floor(point.x / cellPixels)},${Math.floor(point.y / cellPixels)}`;
        const group = clusters.get(key);
        if (group) group.push({ marker, x: point.x, y: point.y });
        else clusters.set(key, [{ marker, x: point.x, y: point.y }]);
      }
      for (const group of clusters.values()) {
        const x = group.reduce((sum, item) => sum + item.x, 0) / group.length;
        const y = group.reduce((sum, item) => sum + item.y, 0) / group.length;
        this.drawDot(x, y, group.length > 1 ? 4.2 : 3.1);
        if (group.length >= 8 && zoom >= -3) {
          this.context.fillStyle = '#fff4d5';
          this.context.font = '9px system-ui';
          this.context.textAlign = 'center';
          this.context.fillText(String(group.length), x, y - 6);
        }
      }
      return;
    }

    for (const marker of visible) {
      const pixel = gameToPixel(this.meta, marker.x, marker.y);
      const point = this.mapRef.latLngToContainerPoint([this.meta.totalSize[1] - pixel.y, pixel.x]);
      if (point.x < -8 || point.y < -8 || point.x > size.x + 8 || point.y > size.y + 8) continue;
      this.drawDot(point.x, point.y, zoom >= -1 ? 5 : 3.5);
    }
  };

  private drawDot(x: number, y: number, radius: number): void {
    this.context.beginPath();
    this.context.arc(x, y, radius, 0, Math.PI * 2);
    this.context.fillStyle = '#a9763f';
    this.context.fill();
    this.context.lineWidth = 1;
    this.context.strokeStyle = '#f5d99a';
    this.context.stroke();
  }

  private handleClick = (event: L.LeafletMouseEvent): void => {
    const pixelX = event.latlng.lng;
    const pixelY = this.meta.totalSize[1] - event.latlng.lat;
    const worldRadius = 24 / (2 ** this.mapRef.getZoom());
    const x0 = Math.floor((pixelX - worldRadius) / this.cellSize);
    const x1 = Math.floor((pixelX + worldRadius) / this.cellSize);
    const y0 = Math.floor((pixelY - worldRadius) / this.cellSize);
    const y1 = Math.floor((pixelY + worldRadius) / this.cellSize);
    let nearest: Marker | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const clickPoint = this.mapRef.latLngToContainerPoint(event.latlng);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const marker of this.buckets.get(`${cx},${cy}`) ?? []) {
          const pixel = gameToPixel(this.meta, marker.x, marker.y);
          const point = this.mapRef.latLngToContainerPoint([this.meta.totalSize[1] - pixel.y, pixel.x]);
          const distance = point.distanceTo(clickPoint);
          if (distance < 18 && distance < nearestDistance) {
            nearest = marker;
            nearestDistance = distance;
          }
        }
      }
    }
    if (nearest) this.onSelect(nearest);
  };
}

function MarkerLayer({ markers, meta, onSelect }: {
  markers: Marker[];
  meta: OfficialMeta;
  onSelect: (marker: Marker) => void;
}) {
  const map = useMap();
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    const layer = new MarkerCanvasLayer(markers, meta, marker => selectRef.current(marker));
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, markers, meta]);
  return null;
}

function SelectedMarkerView({ marker, meta }: { marker: Marker | null; meta: OfficialMeta }) {
  const map = useMap();
  useEffect(() => {
    if (!marker) return;
    const pixel = gameToPixel(meta, marker.x, marker.y);
    const targetZoom = Math.max(map.getZoom(), -1);
    map.flyTo([meta.totalSize[1] - pixel.y, pixel.x], Math.min(targetZoom, meta.maxZoom), { duration: 0.35 });
  }, [map, marker, meta]);
  return null;
}

export default function MapView({ markers, meta, selectedMarker, onSelect }: {
  markers: Marker[];
  meta: OfficialMeta;
  selectedMarker: Marker | null;
  onSelect: (marker: Marker) => void;
}) {
  const bounds: L.LatLngBoundsExpression = [[0, 0], [meta.totalSize[1], meta.totalSize[0]]];
  return (
    <MapContainer crs={L.CRS.Simple} bounds={bounds} minZoom={meta.minZoom} maxZoom={meta.maxZoom}
      maxBounds={bounds} maxBoundsViscosity={0.8}
      preferCanvas
      style={{ height: '100%', width: '100%', background: '#182a28' }}>
      <OfficialTiles meta={meta} />
      <MarkerLayer markers={markers} meta={meta} onSelect={onSelect} />
      <SelectedMarkerView marker={selectedMarker} meta={meta} />
    </MapContainer>
  );
}
