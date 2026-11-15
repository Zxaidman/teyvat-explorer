# Teyvat Explorer 0.2.1

Local-first Genshin Impact exploration tracker. This release focuses on official snapshot metadata validation, official world-coordinate mapping, real tile URL generation and safe progress retention.

## Requirements
- Node.js 20+
- npm 10+

## Run
```bash
npm install
npm run typecheck
npm run build
npm run dev
```

## Load official data
Download the `teyvat-full-<tag>.tar.gz` release asset from https://github.com/kxxoling/genshin-map-data/releases and extract it locally. Import `data/teyvat/points.json` and `data/teyvat/meta.json` in the application.

The current official metadata format contains `mapId`, `mapVersion`, `origin`, `totalSize`, `minZoom`, `maxZoom`, `tileUrlTemplate`, and `cdnTileUrlTemplate`. This app maps world coordinates using `origin` and `totalSize` and generates tile URLs from the CDN template. It does not bundle or redistribute tile assets.

## State semantics
- Collected: manually confirmed by the player.
- Missing: manually confirmed not collected.
- Unknown: no reliable observation.

Progress is stored separately in IndexedDB and survives marker refreshes when stable upstream IDs remain unchanged.

## Security
No UID lookup, HoYoverse login, cookies or authentication tokens are used. Public profile statistics do not enumerate every unopened chest.

## Attribution
Map snapshot: https://github.com/kxxoling/genshin-map-data. Genshin Impact and related assets remain properties of HoYoverse. Teyvat Explorer is an independent, unofficial project.
