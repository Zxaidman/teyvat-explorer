import { useEffect, useMemo, useState } from 'react';
import MapView from './MapView';
import {
  getMarkers, getProgress, getSetting, replaceOfficialSnapshot, saveProgress,
} from './db';
import { parseOfficialLabels, parseOfficialMeta, parseOfficialPoints } from './data/official';
import type { OfficialManifest } from './data/manifest';
import { verifySnapshotFile } from './data/manifest';
import type { Marker, OfficialMeta, ProgressRecord, ProgressState } from './types';

const MANIFEST_URL = `${import.meta.env.BASE_URL}data/manifest.json`;

async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Map data request failed (${response.status}).`);
  return response.text();
}

async function fetchVerifiedJson(url: string, expectedHash: string, signal: AbortSignal): Promise<unknown> {
  const content = await fetchText(url, signal);
  if (!(await verifySnapshotFile(content, expectedHash))) throw new Error('Downloaded map data failed its SHA-256 integrity check.');
  return JSON.parse(content) as unknown;
}

export default function App() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});
  const [meta, setMeta] = useState<OfficialMeta | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [stateFilter, setStateFilter] = useState('unresolved');
  const [floorFilter, setFloorFilter] = useState('surface');
  const [status, setStatus] = useState('Loading your saved map data…');
  const [selectedMarker, setSelectedMarker] = useState<Marker | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function initialise() {
      let savedSnapshotAvailable = false;
      try {
        const [savedMarkers, savedProgress, savedMeta, savedSource] = await Promise.all([
          getMarkers(), getProgress(), getSetting('officialMeta'), getSetting('officialSourceCommit'),
        ]);
        if (!active) return;
        savedSnapshotAvailable = savedMarkers.length > 0;
        setMarkers(savedMarkers);
        setProgress(Object.fromEntries(savedProgress.map((r: ProgressRecord) => [r.markerId, r.state])));
        if (savedMeta?.value) setMeta(savedMeta.value as OfficialMeta);
        setStatus(savedMarkers.length
          ? `Loaded ${savedMarkers.length.toLocaleString()} cached markers. Checking for map updates…`
          : 'Fetching the official map for your first visit…');

        const manifestUrl = new URL(MANIFEST_URL, window.location.href);
        const manifestText = await fetchText(manifestUrl.toString(), controller.signal);
        const manifest = JSON.parse(manifestText) as OfficialManifest;
        if (
          manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
          manifest.source !== 'kxxoling/genshin-map-data' ||
          !manifest.files?.meta || !manifest.files?.labels || !manifest.files?.points ||
          !manifest.checksums?.['meta.json'] || !manifest.checksums?.['labels.json'] || !manifest.checksums?.['points.json']
        ) throw new Error('The published map manifest is invalid.');

        if (savedSource?.value === manifest.sourceCommit && savedMarkers.length > 0) {
          if (active) setStatus(`Map is up to date · game ${manifest.gameVersion ?? 'current'} · ${manifest.pointCount.toLocaleString()} points.`);
          return;
        }

        const resolveDataUrl = (path: string) => {
          if (!['./meta.json', './labels.json', './points.json'].includes(path)) {
            throw new Error('Map manifest contains an unexpected data path.');
          }
          return new URL(path, manifestUrl).toString();
        };
        const [metaValue, labelsValue, pointsValue] = await Promise.all([
          fetchVerifiedJson(resolveDataUrl(manifest.files.meta), manifest.checksums['meta.json'], controller.signal),
          fetchVerifiedJson(resolveDataUrl(manifest.files.labels), manifest.checksums['labels.json'], controller.signal),
          fetchVerifiedJson(resolveDataUrl(manifest.files.points), manifest.checksums['points.json'], controller.signal),
        ]);
        const parsedMeta = parseOfficialMeta(metaValue);
        const parsedLabels = parseOfficialLabels(labelsValue);
        const parsedPoints = parseOfficialPoints(pointsValue, parsedLabels);
        await replaceOfficialSnapshot(
          parsedPoints.markers, parsedMeta, [...parsedLabels.entries()], manifest.sourceCommit,
        );
        if (!active) return;
        setMarkers(parsedPoints.markers);
        setMeta(parsedMeta);
        setSelectedMarker(null);
        setStatus(
          `Updated to game ${manifest.gameVersion ?? 'latest'} · ${parsedPoints.report.imported.toLocaleString()} markers · source ${manifest.sourceCommit.slice(0, 7)}.`,
        );
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
        const detail = error instanceof Error ? error.message : 'Unknown map sync error.';
        setStatus(savedSnapshotAvailable
          ? `Using saved map data; automatic update failed: ${detail}`
          : `Could not load the official map data: ${detail}`);
      }
    }

    void initialise();
    return () => { active = false; controller.abort(); };
  // Run once on startup; map data is refreshed from the published manifest.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => [...new Set(markers.map(m => m.category))].sort(), [markers]);
  const filtered = useMemo(() => markers.filter(marker => {
    const matchesCategory = category === 'All' || marker.category === category;
    const state = progress[marker.id] ?? 'unknown';
    const matchesState = stateFilter === 'all' ||
      (stateFilter === 'unresolved' ? state !== 'collected' : state === stateFilter);
    const isUnderground = marker.z !== undefined && marker.z !== 0;
    const matchesFloor = floorFilter === 'all' ||
      (floorFilter === 'underground' ? isUnderground : !isUnderground);
    const matchesSearch = `${marker.name} ${marker.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesState && matchesFloor && matchesSearch;
  }), [markers, category, stateFilter, floorFilter, progress, search]);

  async function setMarkerState(marker: Marker, state: ProgressState) {
    const record = { markerId: marker.id, state, updatedAt: new Date().toISOString() };
    await saveProgress(record);
    setProgress(current => ({ ...current, [marker.id]: state }));
  }

  function exportProgress() {
    const payload = { schemaVersion: 1, exportedAt: new Date().toISOString(),
      progress: Object.entries(progress).map(([markerId, state]) => ({ markerId, state })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'teyvat-explorer-progress.json'; anchor.click();
    URL.revokeObjectURL(url);
  }

  const collected = Object.values(progress).filter(value => value === 'collected').length;
  const missing = Object.values(progress).filter(value => value === 'missing').length;
  const unknown = markers.length - collected - missing;

  return (
    <main>
      <header>
        <div className="brand">✦ TEYVAT EXPLORER<small>VERSION 0.4.0 · AUTOMATIC MAP SYNC</small></div>
        <nav><button onClick={exportProgress}>Export progress</button></nav>
      </header>
      <section className="intro"><div><small>PLAYER WORKSPACE · ASIA SERVER</small><h1>Explore Teyvat</h1><p>Official map tiles, automatically updated collectibles and locally saved progress.</p></div></section>
      <section className="stats"><article><b>{markers.length.toLocaleString()}</b>Map markers</article><article><b>{collected}</b>Collected</article><article><b>{missing}</b>Marked missing</article><article><b>{unknown.toLocaleString()}</b>Unknown</article></section>
      <p className="status" role="status" aria-live="polite">{status}</p>
      <section className="workspace">
        <div className="map"><div className="map-heading"><div><small>OFFICIAL TEYVAT MAP</small><b>{meta ? `Map ${meta.mapId} · ${meta.mapVersion.slice(0, 8)}` : 'Loading official map…'}</b></div></div>
          <div className="map-canvas">{meta ? <MapView markers={filtered} meta={meta} onSelect={setSelectedMarker}/> :
            <div className="empty"><b>Preparing your map</b><p>The latest official map data is downloaded automatically on first visit.</p></div>}</div>
        </div>
        <aside className="panel"><small>MARKER EXPLORER</small><h2>Find collectibles</h2><p className="filter-hint">Filter by category, floor and collection status. Zoom in to reveal individual markers.</p>
          <input placeholder="Search marker category" value={search} onChange={e => setSearch(e.target.value)}/>
          <select value={category} onChange={e => setCategory(e.target.value)}><option>All</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
          <select aria-label="Floor visibility" value={floorFilter} onChange={e => setFloorFilter(e.target.value)}><option value="surface">Surface</option><option value="underground">Underground</option><option value="all">All floors</option></select>
          <select aria-label="Collection status" value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="unresolved">Not collected</option><option value="all">All states</option><option value="collected">Collected</option><option value="missing">Missing</option><option value="unknown">Unknown</option></select>
          <div className="marker-list">{filtered.slice(0, 1200).map(marker => <button key={marker.id} className={selectedMarker?.id === marker.id ? 'active' : ''} onClick={() => setSelectedMarker(marker)}><b>{marker.name}</b><small>{marker.category}</small><i>{progress[marker.id] ?? 'unknown'}</i></button>)}</div>
          {selectedMarker && <div className="detail"><small>SELECTED MARKER</small><b>{selectedMarker.name}</b><div><button onClick={() => setMarkerState(selectedMarker, 'collected')}>Collected</button><button onClick={() => setMarkerState(selectedMarker, 'missing')}>Missing</button><button onClick={() => setMarkerState(selectedMarker, 'unknown')}>Reset</button></div></div>}
        </aside>
      </section>
      <footer>Map data auto-synced from kxxoling/genshin-map-data · Progress stored locally in IndexedDB · No HoYoverse login required</footer>
    </main>
  );
}
