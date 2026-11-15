import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, useMap } from 'react-leaflet';
import type { Marker, OfficialMeta } from './types';
import { gameToPixel, officialTileUrl } from './map/officialTiles';

class OfficialGridLayer extends L.GridLayer {
  private readonly meta: OfficialMeta;

  constructor(meta: OfficialMeta) {
    super({ tileSize: 256, minZoom: meta.minZoom, maxZoom: meta.maxZoom, noWrap: true });
    this.meta = meta;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => done(undefined, image);
    image.onerror = () => done(new Error('Official map tile failed to load'), image);
    image.src = officialTileUrl(this.meta, coords.x, coords.y, coords.z);
    return image;
  }
}

function OfficialTiles({ meta }: { meta: OfficialMeta }) {
  const map = useMap();
  useEffect(() => {
    const layer = new OfficialGridLayer(meta);
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, meta]);
  return null;
}

function MarkerLayer({ markers, meta, onSelect }: {
  markers: Marker[];
  meta: OfficialMeta;
  onSelect: (marker: Marker) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup();
    for (const marker of markers) {
      // Underground markers remain in the imported dataset until floor switching is implemented.
      if (marker.z !== undefined && marker.z !== 0) continue;
      const pixel = gameToPixel(meta, marker.x, marker.y);
      const pin = L.circleMarker([meta.totalSize[1] - pixel.y, pixel.x], {
        radius: 5, color: '#f1d28b', weight: 1, fillColor: '#9b6b35', fillOpacity: 0.9,
      });
      pin.bindTooltip(marker.name);
      pin.on('click', () => onSelect(marker));
      group.addLayer(pin);
    }
    group.addTo(map);
    return () => { map.removeLayer(group); };
  }, [map, markers, meta, onSelect]);
  return null;
}

export default function MapView({ markers, meta, onSelect }: {
  markers: Marker[];
  meta: OfficialMeta;
  onSelect: (marker: Marker) => void;
}) {
  const bounds: L.LatLngBoundsExpression = [[0, 0], [meta.totalSize[1], meta.totalSize[0]]];
  return (
    <MapContainer crs={L.CRS.Simple} bounds={bounds} minZoom={meta.minZoom} maxZoom={meta.maxZoom}
      maxBounds={bounds} maxBoundsViscosity={0.8}
      style={{ height: '100%', width: '100%', background: '#182a28' }}>
      <OfficialTiles meta={meta} />
      <MarkerLayer markers={markers} meta={meta} onSelect={onSelect} />
    </MapContainer>
  );
}