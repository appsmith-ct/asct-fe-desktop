# asct-fe-desktop

The UI for [Appsmith-CT](https://github.com/appsmith-ct/asct-app) — React + TypeScript, built with Vite,
eventually packaged with Tauri v2. It is an observer and controller of engine runs: it talks to the
`asct-be-engine` process over REST and WebSocket and never calls a model directly.

This repository is normally used as a submodule of [asct-app](https://github.com/appsmith-ct/asct-app), which
holds the full implementation specification under `docs/`. See that spec before making UI/UX changes here.

## Requirements

- Node.js 22
- [pnpm](https://pnpm.io/) 9

## Setup

```bash
pnpm install
```

## Develop

```bash
pnpm dev
```

Runs against a local `asct-be-engine` instance (see that repo's README) — until M8 this is a plain local web
app in the browser; the Tauri shell (`src-tauri/`) is added last.

## Build, lint, test

```bash
pnpm build       # tsc -b && vite build
pnpm lint        # oxlint
pnpm run e2e     # Playwright acceptance smoke test — starts its own engine + UI instances
```

To regenerate the TypeScript API client after the engine's OpenAPI document changes:

```bash
pnpm run gen-api  # reads ../docs/api/openapi.json, writes src/api/generated/schema.d.ts
```

For a visual feedback loop while building a screen (not a substitute for `pnpm run e2e`):

```bash
node scripts/screenshot.mjs /projects my-screenshot   # against a running `pnpm dev`
```

## Layout

```
src/            React app
src-tauri/      Tauri v2 shell (placeholder until M8)
e2e/            Playwright acceptance test (playwright.config.ts starts the engine + UI itself)
scripts/        Dev-loop helpers (screenshot.mjs, interact-and-shot.mjs)
```

Current status: see `asct-app/docs/PROGRESS.md`.
