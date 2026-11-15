import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repository = 'kxxoling/genshin-map-data';
const outputDir = join(process.cwd(), 'public', 'data');

async function fetchResponse(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(180_000),
    headers: { 'User-Agent': 'teyvat-explorer-map-sync' },
  });
  if (!response.ok) throw new Error(`Fetch failed (${response.status}): ${url}`);
  return response;
}
async function fetchJson(url) {
  return fetchResponse(url).then(response => response.json());
}
function assertMeta(meta) {
  if (!meta || !Number.isInteger(meta.mapId) || !meta.mapVersion ||
      !Array.isArray(meta.origin) || meta.origin.length !== 2 ||
      !Array.isArray(meta.totalSize) || meta.totalSize.length !== 2 ||
      !Number.isInteger(meta.minZoom) || !Number.isInteger(meta.maxZoom) ||
      meta.minZoom > meta.maxZoom ||
      !(meta.tileUrlTemplate?.startsWith('tiles/') || meta.cdnTileUrlTemplate?.startsWith('https://'))) {
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
async function findSnapshotRoot(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some(entry => entry.isFile() && entry.name === 'meta.json') &&
      entries.some(entry => entry.isDirectory() && entry.name === 'tiles')) return directory;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findSnapshotRoot(join(directory, entry.name));
    if (found) return found;
  }
  return null;
}

const release = await fetchJson(`https://api.github.com/repos/${repository}/releases/latest`);
const fullArchive = release.assets?.find(asset => asset.name.startsWith('teyvat-full-') && asset.name.endsWith('.tar.gz'));
if (!release.tag_name || !fullArchive?.browser_download_url) {
  throw new Error('Latest upstream release does not include its full map snapshot archive.');
}
const commit = await fetchJson(`https://api.github.com/repos/${repository}/commits/${release.tag_name}`);
if (!/^[a-f0-9]{40}$/.test(commit.sha ?? '')) throw new Error('Could not resolve the release commit SHA.');

const rawBase = `https://raw.githubusercontent.com/${repository}/${release.tag_name}/data/teyvat`;
const [meta, labels, points] = await Promise.all([
  fetchJson(`${rawBase}/meta.json`),
  fetchJson(`${rawBase}/labels.json`),
  fetchJson(`${rawBase}/points.json`),
]);
assertMeta(meta);
assertLabels(labels);
assertPoints(points);

const tempRoot = await import('node:fs/promises').then(fs => fs.mkdtemp(join(tmpdir(), 'teyvat-map-')));
try {
  const archivePath = join(tempRoot, 'snapshot.tar.gz');
  const archiveResponse = await fetchResponse(fullArchive.browser_download_url);
  await writeFile(archivePath, Buffer.from(await archiveResponse.arrayBuffer()));
  const extractDir = join(tempRoot, 'extracted');
  await mkdir(extractDir, { recursive: true });
  await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDir], { maxBuffer: 16 * 1024 * 1024 });
  const snapshotRoot = await findSnapshotRoot(extractDir);
  if (!snapshotRoot) throw new Error('Full upstream archive did not contain meta.json and tiles/.');
  const tileEntries = await readdir(join(snapshotRoot, 'tiles'));
  if (tileEntries.length === 0) throw new Error('Upstream archive contains no map tiles.');

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(join(snapshotRoot, 'tiles'), join(outputDir, 'tiles'), { recursive: true });
  try {
    await cp(join(snapshotRoot, 'icons'), join(outputDir, 'icons'), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const files = { 'meta.json': meta, 'labels.json': labels, 'points.json': points };
  const checksums = {};
  for (const [name, value] of Object.entries(files)) {
    const serialized = JSON.stringify(value);
    checksums[name] = createHash('sha256').update(serialized).digest('hex');
    const target = join(outputDir, name);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, serialized);
    await rename(temporary, target);
  }
  const manifest = {
    schemaVersion: 1,
    source: repository,
    sourceCommit: commit.sha,
    sourceTag: release.tag_name,
    sourceUpdatedAt: commit.commit?.committer?.date ?? null,
    syncedAt: new Date().toISOString(),
    gameVersion: meta.gameVersion ?? null,
    mapVersion: meta.mapVersion,
    pointCount: points.length,
    tileDirectoryCount: tileEntries.length,
    checksums,
    files: { meta: './meta.json', labels: './labels.json', points: './points.json' },
  };
  const manifestPath = join(outputDir, 'manifest.json');
  await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
  await rename(`${manifestPath}.tmp`, manifestPath);
  console.log(`Synced game ${meta.gameVersion ?? release.tag_name}: ${points.length.toLocaleString()} markers and ${tileEntries.length} tile groups from ${release.tag_name} (${commit.sha}).`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
