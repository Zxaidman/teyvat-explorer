# Teyvat Explorer

**Version 0.5.0** — local-first Genshin Impact exploration tracker.

## Automatic map data and tiles

No manual download or import is required.

- GitHub Actions checks the latest release from [kxxoling/genshin-map-data](https://github.com/kxxoling/genshin-map-data) on every deployment and once daily.
- The workflow downloads the complete official snapshot archive, validates the metadata, labels and point records, and publishes the map tile pyramid and marker data together on GitHub Pages.
- The map tiles are served from this project's Pages origin. The app no longer depends on the HoYoverse tile CDN being reachable from the visitor's browser.
- On first visit, the app downloads the manifest and JSON data, then stores parsed markers and metadata in IndexedDB.
- On later visits, it checks the small manifest. If the upstream release has not changed, it reuses local data. If it changed, it downloads and atomically replaces the cached snapshot.
- Your collected/missing progress is stored separately and is preserved when map data updates.

The full upstream snapshot currently adds approximately 85 MB to the Pages deployment. Browser tile caching reduces repeat downloads; the complete tile pyramid is not downloaded as one file by the browser.

## Map performance

- Marker drawing uses one viewport-aware Canvas layer rather than one Leaflet object per point.
- At overview zoom levels, nearby points are grouped into screen-space clusters; individual points appear as the user zooms in.
- Markers are spatially bucketed for viewport culling and click hit-testing.
- Surface and underground markers can be filtered independently.

## Development

Requirements: Node.js 22 and npm.

```bash
npm install
npm run typecheck
npm test
node scripts/sync-map-data.mjs
npm run build
npm run dev
```

The sync script writes `public/data/manifest.json`, `meta.json`, `labels.json`, `points.json`, `tiles/` and `icons/`. These generated files are not committed to the source repository; the Pages workflow publishes them as part of the deployment artifact.

## Progress and privacy

Progress is local to the current browser profile. Use **Export progress** to back it up before clearing browser storage or moving to another device. Automatic map updates do not clear progress.

The application does not request HoYoverse credentials, cookies or authentication tokens. It does not connect to a player account or infer unopened chests from a UID.

## Deployment

The repository deploys to [GitHub Pages](https://zxaidman.github.io/teyvat-explorer/). A daily scheduled workflow refreshes the published map dataset and tile pyramid. You can also trigger the workflow manually from the Actions tab.

## Attribution

Map data and tile snapshots are sourced from https://github.com/kxxoling/genshin-map-data. Genshin Impact and its related assets belong to HoYoverse. This is an independent, unofficial project.
