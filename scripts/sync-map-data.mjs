import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const upstream = 'https://raw.githubusercontent.com/kxxoling/genshin-map-data';
const commitUrl = 'https://api.github.com/repos/kxxoling/genshin-map-data/commits/main';
const outputDir = join(process.cwd(), 'public', 'data');

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    headers: { 'User-Agent': 'teyvat-explorer-map-sync' },
  });
  if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${url}`);
  return response.json();
}

function assertMeta(meta) {
  if (!meta || !Number.isInteger(meta.mapId) || !meta.mapVersion ||
      !Array.isArray(meta.origin) || meta.origin.length !== 2 ||
      !Array.isArray(meta.totalSize) || meta.totalSize.length !== 2 ||
      !Number.isInteger(meta.minZoom) || !Number.isInteger(meta.maxZoom) ||
      meta.minZoom > meta.maxZoom || !meta.cdnTileUrlTemplate?.startsWith('https://')) {
    throw new Error('Upstream meta.json failed schema validation.');
  }
}
function assertLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) throw new Error('Upstream labels.json is invalid.');
}
function assertPoints(points) {
  if (!Array.isArray(points) || points.length === 0) throw new Error('Upstream points.json is invalid.');
  const ids = new Set();
  for (const point of points) {
    if (!point || !Number.isSafeInteger(Number(point.id)) ||
        !Number.isSafeInteger(Number(point.labelId)) ||
        !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
      throw new Error('Upstream points.json contains an invalid point record.');
    }
    const id = String(point.id);
    if (ids.has(id)) throw new Error(`Upstream points.json contains duplicate point ID ${id}.`);
    ids.add(id);
  }
}

const commit = await fetchJson(commitUrl);
if (!/^[a-f0-9]{40}$/.test(commit.sha ?? '')) throw new Error('Could not resolve a valid upstream commit SHA.');
const snapshotBase = `${upstream}/${commit.sha}/data/teyvat`;
const [meta, labels, points] = await Promise.all([
  fetchJson(`${snapshotBase}/meta.json`),
  fetchJson(`${snapshotBase}/labels.json`),
  fetchJson(`${snapshotBase}/points.json`),
]);
assertMeta(meta);
assertLabels(labels);
assertPoints(points);

await mkdir(outputDir, { recursive: true });
const files = { 'meta.json': meta, 'labels.json': labels, 'points.json': points };
const checksums = {};
for (const [name, value] of Object.entries(files)) {
  const content = JSON.stringify(value);
  checksums[name] = createHash('sha256').update(content).digest('hex');
  const target = join(outputDir, name);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, target);
}
const manifest = {
  schemaVersion: 1,
  source: 'kxxoling/genshin-map-data',
  sourceCommit: commit.sha,
  sourceUpdatedAt: commit.commit?.committer?.date ?? null,
  syncedAt: new Date().toISOString(),
  gameVersion: meta.gameVersion ?? null,
  mapVersion: meta.mapVersion,
  pointCount: points.length,
  checksums,
  files: { meta: './meta.json', labels: './labels.json', points: './points.json' },
};
const manifestPath = join(outputDir, 'manifest.json');
await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
await rename(`${manifestPath}.tmp`, manifestPath);
console.log(`Synced ${points.length.toLocaleString()} points from upstream commit ${commit.sha} (map ${meta.mapVersion}).`);
