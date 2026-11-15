import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { Marker, OfficialMeta } from './types';
import { gameToPixel, officialTileUrl } from './map/officialTiles';

const OfficialGridLayer = L.GridLayer.extend({
  initialize(meta: OfficialMeta) {
    L.setOptions(this, { tileSize: 256, minZoom: meta.minZoom, maxZoom: meta.maxZoom, noWrap: true });
    (this as L.GridLayer & { meta: OfficialMeta }).meta = meta;
  },
  createTile(coords: L.Coords, done: L.DoneCallback) {
    const layer = this as L.GridLayer & { meta: OfficialMeta };
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => done(undefined, image);
    image.onerror = () => done(new Error('Map tile failed to load'), image);
    image.src = officialTileUrl(layer.meta, coords.x, coords.y, coords.z);
    return image;
  },
});

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
      // Underground markers are intentionally excluded until a floor switcher exists.
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
      maxBounds={bounds} maxBoundsViscosity={0.8} style={{ height: '100%', width: '100%', background: '#182a28' }}>
      <OfficialTiles meta={meta} />
      <MarkerLayer markers={markers} meta={meta} onSelect={onSelect} />
    </MapContainer>
  );
}

import { MapContainer } from 'react-leaflet';