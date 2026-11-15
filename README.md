# Teyvat Explorer

**Version 0.3.0** — local-first Genshin Impact exploration tracker.

## Development

Requirements: Node.js 22 and npm.

```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## Official snapshot setup

The latest verified upstream snapshot at this release is [v7.2.0](https://github.com/kxxoling/genshin-map-data/releases/tag/v7.2.0). Download the full archive (`teyvat-full-v7.2.0.tar.gz`) and extract it. The app validates metadata, label hierarchy, point IDs and coordinates before replacing imported records. Import these files in order:

1. `data/teyvat/meta.json`
2. `data/teyvat/labels.json`
3. `data/teyvat/points.json`

The point schema is validated against the upstream consumer's documented shape: `id`, `labelId`, `x`, `y`, and optional `z`. Labels provide category names. The official tile scheme uses `N3`, `N2`, `N1`, and `P0` zoom suffixes; the tile renderer substitutes these explicitly.

The v7.2.0 metadata uses `origin: [24207, 16411]`, `totalSize: [36864, 32768]` and zoom levels -4 through 0. The map uses the imported metadata `origin` and `totalSize` to transform game coordinates to map pixels. Do not reuse these dimensions for later snapshots without checking their `meta.json`. Underground points (`z != 0`) are retained but intentionally not drawn until a floor selector is implemented.

## Progress

Collected, missing and unknown states are stored separately in IndexedDB. Export progress regularly. Re-importing marker data does not clear progress.

## GitHub Pages

The repository is configured to build and deploy from `main` using GitHub Actions. In repository Settings → Pages, select **GitHub Actions** as the source. Once the first deployment succeeds, the site is available at:

https://zxaidman.github.io/teyvat-explorer/

## Privacy and attribution

The application does not request HoYoverse credentials, cookies or authentication tokens. It does not connect to a player account or infer unopened chests from a UID.

Map data and assets are sourced from https://github.com/kxxoling/genshin-map-data. Genshin Impact and its related assets belong to HoYoverse. This is an independent, unofficial project.
