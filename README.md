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

## Build, lint

```bash
pnpm build
pnpm lint
```

## Layout

```
src/            React app
src-tauri/      Tauri v2 shell (placeholder until M8)
```

Current status: see `asct-app/docs/PROGRESS.md`.
