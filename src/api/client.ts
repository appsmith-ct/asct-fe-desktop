import createClient from 'openapi-fetch'

import type { paths } from './generated/schema'

/** The engine is a local sidecar process (spec section 4) — no auth, no remote origin. Override
 * via `VITE_ENGINE_URL` for a non-default port (e.g. the Playwright smoke test's fixtures).
 */
export const ENGINE_BASE_URL: string =
  (import.meta.env.VITE_ENGINE_URL as string | undefined) ?? 'http://127.0.0.1:8000'

export const api = createClient<paths>({ baseUrl: ENGINE_BASE_URL })

/** `ENGINE_BASE_URL` with its scheme swapped for the WebSocket equivalent — used by
 * `useChatSocket`/`useRunEvents`, since the OpenAPI document (REST-only) says nothing about the
 * two WS routes the engine also exposes.
 */
export function engineWsUrl(path: string): string {
  const wsBase = ENGINE_BASE_URL.replace(/^http/, 'ws')
  return `${wsBase}${path}`
}
