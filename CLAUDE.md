# CLAUDE.md — asct-fe-desktop

This is the UI submodule of Appsmith-CT. It is normally checked out inside `asct-app/`, whose `docs/`
directory holds the authoritative implementation specification and the current milestone progress log
(`asct-app/docs/PROGRESS.md`). Read both before starting work here if they are reachable; this file only
covers conventions local to this repository.

## What this repo is

A React + TypeScript + Vite app, eventually wrapped by Tauri v2 (`src-tauri/`, added in M8). It is purely an
observer and controller of engine runs: it talks to `asct-be-engine` over REST for data and a WebSocket for
the live event stream, and never calls a model or touches the filesystem itself. Until M8 it runs as a
plain local web app in the browser — that's an accepted dev mode, not a shortcut to skip.

## Conventions

- `pnpm`, not `npm`/`yarn`.
- The engine is the source of truth for API shape: its OpenAPI document and event schema are exported to
  `asct-app/docs/api/`, and this repo's TypeScript client is generated from that, not hand-written against
  guessed shapes.
- `pnpm lint` (oxlint) and `pnpm build` (`tsc -b && vite build`) must both pass before a change is done.
- Tailwind for styling and React Flow for the pipeline graph view arrive with the actual screens (M6) — see
  the spec's section 9 before adding either ahead of that milestone.

## Build order

This repo is built milestone by milestone against the spec's section 10. The seven screens (Projects, Chat,
Pipeline, Artifacts, Workspace, Runs and metrics, Settings) and the full REST/WebSocket API land together in
M6; don't build a screen ahead of the engine endpoint it depends on existing.
