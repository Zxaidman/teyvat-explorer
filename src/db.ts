import { openDB } from 'idb';
import type { Marker, ProgressRecord } from './types';

const database = openDB('teyvat-explorer', 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'markerId' });
    if (!db.objectStoreNames.contains('markers')) db.createObjectStore('markers', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
  },
});

export async function getProgress(): Promise<ProgressRecord[]> {
  return (await database).getAll('progress') as Promise<ProgressRecord[]>;
}
export async function saveProgress(record: ProgressRecord): Promise<void> {
  await (await database).put('progress', record);
}
export async function replaceMarkers(markers: Marker[]): Promise<void> {
  const db = await database;
  const tx = db.transaction('markers', 'readwrite');
  await tx.store.clear();
  for (const marker of markers) await tx.store.put(marker);
  await tx.done;
}
export async function getMarkers(): Promise<Marker[]> {
  return (await database).getAll('markers') as Promise<Marker[]>;
}
export async function saveSetting(key: string, value: unknown): Promise<void> {
  await (await database).put('settings', { key, value });
}
export async function getSetting(key: string): Promise<{ key: string; value: unknown } | undefined> {
  return (await database).get('settings', key);
}
/**
 * Replaces marker data and its version metadata in one IndexedDB transaction.
 * User progress lives in a separate store and is deliberately preserved.
 */
export async function replaceOfficialSnapshot(
  markers: Marker[],
  meta: unknown,
  labels: [number, string][],
  sourceCommit: string,
): Promise<void> {
  const db = await database;
  const tx = db.transaction(['markers', 'settings'], 'readwrite');
  await tx.objectStore('markers').clear();
  const markerWrites = markers.map(marker => tx.objectStore('markers').put(marker));
  await Promise.all(markerWrites);
  await tx.objectStore('settings').put({ key: 'officialMeta', value: meta });
  await tx.objectStore('settings').put({ key: 'officialLabels', value: labels });
  await tx.objectStore('settings').put({ key: 'officialSourceCommit', value: sourceCommit });
  await tx.done;
}
