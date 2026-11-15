import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './MapView';
import { getMarkers, getProgress, getSetting, replaceMarkers, saveProgress, saveSetting } from './db';
import { parseOfficialLabels, parseOfficialMeta, parseOfficialPoints } from './data/official';
import type { Marker, OfficialMeta, ProgressRecord, ProgressState } from './types';

export default function App() {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressState>>({});
  const [meta, setMeta] = useState<OfficialMeta | null>(null);
  const [labels, setLabels] = useState<Map<number, string>>(new Map());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [stateFilter, setStateFilter] = useState('unresolved');
  const [status, setStatus] = useState('Import official points.json, labels.json and meta.json to load the map.');
  const [selectedMarker, setSelectedMarker] = useState<Marker | null>(null);
  const pointsInput = useRef<HTMLInputElement>(null);
  const labelsInput = useRef<HTMLInputElement>(null);
  const metaInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getMarkers(), getProgress(), getSetting('officialMeta'), getSetting('officialLabels')])
      .then(([savedMarkers, savedProgress, savedMeta, savedLabels]) => {
        setMarkers(savedMarkers);
        setProgress(Object.fromEntries(savedProgress.map((r: ProgressRecord) => [r.markerId, r.state])));
        if (savedMeta?.value) setMeta(savedMeta.value as OfficialMeta);
        if (savedLabels?.value) setLabels(new Map(savedLabels.value as [number, string][]));
      })
      .catch(() => setStatus('Local database could not be opened.'));
  }, []);

  const categories = useMemo(() => [...new Set(markers.map(m => m.category))].sort(), [markers]);
  const filtered = useMemo(() => markers.filter(marker => {
    const matchesCategory = category === 'All' || marker.category === category;
    const state = progress[marker.id] ?? 'unknown';
    const matchesState = stateFilter === 'all' ||
      (stateFilter === 'unresolved' ? state !== 'collected' : state === stateFilter);
    const matchesSearch = `${marker.name} ${marker.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesState && matchesSearch;
  }), [markers, category, stateFilter, progress, search]);

  async function importMeta(file?: File) {
    if (!file) return;
    try {
      const parsed = parseOfficialMeta(JSON.parse(await file.text()));
      await saveSetting('officialMeta', parsed);
      setMeta(parsed);
      setStatus(`Map metadata loaded: game map ${parsed.mapId}, version ${parsed.mapVersion}, ${parsed.totalSize.join(' × ')} pixels.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Metadata import failed.');
    }
  }

  async function importLabels(file?: File) {
    if (!file) return;
    try {
      const parsed = parseOfficialLabels(JSON.parse(await file.text()));
      await saveSetting('officialLabels', [...parsed.entries()]);
      setLabels(parsed);
      setStatus(`Loaded ${parsed.size} marker labels. Re-import points.json to apply category names.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Labels import failed.');
    }
  }

  async function importPoints(file?: File) {
    if (!file) return;
    try {
      const parsed = parseOfficialPoints(JSON.parse(await file.text()), labels);
      await replaceMarkers(parsed.markers);
      setMarkers(parsed.markers);
      setSelectedMarker(null);
      setStatus(`Imported ${parsed.report.imported.toLocaleString()} points; skipped ${parsed.report.skipped}. ${parsed.report.warnings.join(' ')}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Point import failed. Existing data was preserved.');
    }
  }

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
        <div className="brand">✦ TEYVAT EXPLORER<small>VERSION 0.2.2 · VERIFIED TILE SCHEME</small></div>
        <nav>
          <button onClick={exportProgress}>Export progress</button>
          <button onClick={() => metaInput.current?.click()}>Import meta.json</button>
          <button onClick={() => labelsInput.current?.click()}>Import labels.json</button>
          <button onClick={() => pointsInput.current?.click()}>Import points.json</button>
          <input hidden ref={metaInput} type="file" accept="application/json" onChange={e => importMeta(e.target.files?.[0])}/>
          <input hidden ref={labelsInput} type="file" accept="application/json" onChange={e => importLabels(e.target.files?.[0])}/>
          <input hidden ref={pointsInput} type="file" accept="application/json" onChange={e => importPoints(e.target.files?.[0])}/>
        </nav>
      </header>
      <section className="intro"><div><small>PLAYER WORKSPACE · ASIA SERVER</small><h1>Explore Teyvat</h1><p>Official map tiles, collectible filters and your manually verified progress.</p></div><aside><small>UID · DISPLAY ONLY</small><b>877172691</b></aside></section>
      <section className="stats"><article><b>{markers.length.toLocaleString()}</b>Imported markers</article><article><b>{collected}</b>Collected</article><article><b>{missing}</b>Marked missing</article><article><b>{unknown.toLocaleString()}</b>Unknown</article></section>
      <p className="status">{status}</p>
      <section className="workspace">
        <div className="map"><div className="map-heading"><div><small>OFFICIAL TEYVAT MAP</small><b>{meta ? `Map ${meta.mapId} · ${meta.mapVersion.slice(0, 8)}` : 'Map metadata not loaded'}</b></div></div>
          <div className="map-canvas">{meta ? <MapView markers={filtered} meta={meta} onSelect={setSelectedMarker}/> :
            <div className="empty"><b>Load official snapshot data</b><p>Import meta.json, labels.json and points.json from the extracted snapshot.</p><a href="https://github.com/kxxoling/genshin-map-data/releases" target="_blank" rel="noreferrer">Download official map snapshot ↗</a></div>}</div>
        </div>
        <aside className="panel"><small>MARKER EXPLORER</small><h2>Find collectibles</h2>
          <input placeholder="Search marker category" value={search} onChange={e => setSearch(e.target.value)}/>
          <select value={category} onChange={e => setCategory(e.target.value)}><option>All</option>{categories.map(item => <option key={item}>{item}</option>)}</select>
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="unresolved">Not collected</option><option value="all">All states</option><option value="collected">Collected</option><option value="missing">Missing</option><option value="unknown">Unknown</option></select>
          <div className="marker-list">{filtered.slice(0, 1200).map(marker => <button key={marker.id} className={selectedMarker?.id === marker.id ? 'active' : ''} onClick={() => setSelectedMarker(marker)}><b>{marker.name}</b><small>{marker.category}</small><i>{progress[marker.id] ?? 'unknown'}</i></button>)}</div>
          {selectedMarker && <div className="detail"><small>SELECTED MARKER</small><b>{selectedMarker.name}</b><div><button onClick={() => setMarkerState(selectedMarker, 'collected')}>Collected</button><button onClick={() => setMarkerState(selectedMarker, 'missing')}>Missing</button><button onClick={() => setMarkerState(selectedMarker, 'unknown')}>Reset</button></div></div>}
        </aside>
      </section>
      <footer>Local IndexedDB storage · No HoYoverse credentials requested · Underground layers are retained but not yet rendered</footer>
    </main>
  );
}