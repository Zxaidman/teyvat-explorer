# Teyvat Explorer

**Version 0.4.0** — local-first Genshin Impact exploration tracker.

## How map data loads

No manual download or import is required.

- GitHub Actions fetches the latest snapshot from [kxxoling/genshin-map-data](https://github.com/kxxoling/genshin-map-data) on every deployment and once daily.
- The validated snapshot is published as static JSON alongside the GitHub Pages app.
- On first visit, the app downloads the manifest and the three data files, then stores the parsed markers and metadata in IndexedDB.
- On later visits, it checks the small manifest. If the upstream commit has not changed, it reuses the local data. If it changed, it downloads and atomically replaces the cached snapshot.
- Your collected/missing progress is stored separately and is preserved when map data updates.

Map tiles continue to load from the official tile CDN specified in the snapshot metadata. The app does not download or re-host the large tile pyramid.

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

The sync script writes `public/data/manifest.json`, `meta.json`, `labels.json` and `points.json`. These generated files are not committed to the source repository; the Pages workflow publishes them as part of the deployment artifact.

## Map and progress behavior

The point schema is validated against upstream records: `id`, `labelId`, `x`, `y`, and optional `z`. Labels provide category names. Underground points (`z != 0`) are retained but not rendered until a floor selector is implemented.

Progress is local to the current browser profile. Use **Export progress** to back it up before clearing browser storage or moving to another device. Automatic map updates do not clear progress.

## Deployment

The repository deploys to [GitHub Pages](https://zxaidman.github.io/teyvat-explorer/). A daily scheduled workflow refreshes the published map dataset. You can also trigger the workflow manually from the Actions tab.

## Privacy and attribution

The application does not request HoYoverse credentials, cookies or authentication tokens. It does not connect to a player account or infer unopened chests from a UID.

Map data is sourced from https://github.com/kxxoling/genshin-map-data. Genshin Impact and its related assets belong to HoYoverse. This is an independent, unofficial project.
