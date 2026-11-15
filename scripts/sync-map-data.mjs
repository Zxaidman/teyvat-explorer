import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const upstream = 'https://raw.githubusercontent.com/kxxoling/genshin-map-data/main/data/teyvat';
const commitUrl = 'https://api.github.com/repos/kxxoling/genshin-map-data/commits/main';
const outputDir = join(process.cwd(), 'public', 'data');

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'teyvat-explorer-map-sync' } });
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
  const sample = points.slice(0, Math.min(points.length, 100));
  if (sample.some(p => !p || !Number.isFinite(Number(p.id)) ||
      !Number.isFinite(Number(p.labelId)) || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y)))) {
    throw new Error('Upstream points.json contains invalid point records.');
  }
}

const [commit, meta, labels, points] = await Promise.all([
  fetchJson(commitUrl),
  fetchJson(`${upstream}/meta.json`),
  fetchJson(`${upstream}/labels.json`),
  fetchJson(`${upstream}/points.json`),
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
