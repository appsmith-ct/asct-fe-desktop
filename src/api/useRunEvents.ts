import { useEffect, useRef, useState } from 'react'

import { engineWsUrl } from './client'

/** Mirrors `appsmith.core.events.Event` (the discriminated union `WS /runs/{id}/events` streams)
 * — hand-synced, not generated: the OpenAPI document is REST-only and says nothing about this
 * route's message shapes.
 */
export type RunEvent =
  | {
      kind: 'node_started'
      run_id: string
      node: string
      parent?: string | null
      component_id?: string | null
      at: string
    }
  | {
      kind: 'node_finished'
      run_id: string
      node: string
      status: 'success' | 'failed'
      parent?: string | null
      component_id?: string | null
      at: string
    }
  | {
      kind: 'llm_call_recorded'
      run_id: string
      node: string
      role: string
      retry_index: number
      validation_outcome: string
      at: string
    }
  | {
      kind: 'llm_delta'
      run_id: string
      node: string
      role: string
      delta_kind: 'reasoning' | 'content'
      text: string
      at: string
    }
  | { kind: 'artifact_written'; run_id: string; artifact_kind: string; artifact_id: string; version: number; at: string }
  | { kind: 'gate_reached'; run_id: string; gate: string; at: string }
  | { kind: 'metrics_updated'; run_id: string; metrics: Record<string, number>; at: string }

export type NodeStatus = 'running' | 'success' | 'failed'

export interface LiveStep {
  node: string
  status: NodeStatus
  parent: string | null
  componentId: string | null
  startedAt: string | null
}

/** The call currently streaming: which node and role is talking, and what has arrived so far. */
export interface LiveCall {
  node: string
  role: string
  reasoning: string
  content: string
  startedAt: number
}

/** A node and the component it belongs to identify a step together — `tl_plan` for the backend
 * and `tl_plan` for the frontend are two different steps sharing a name. Matches how the engine
 * keys them in `RunHandle.nodes`, so REST state and live events merge without translation.
 */
export function stepKey(node: string, componentId: string | null | undefined): string {
  return componentId ? `${node}@${componentId}` : node
}

// Reasoning runs to tens of thousands of characters per call (3k-30k, measured). The live view
// only ever shows the tail, and keeping the whole thing in React state for a run that makes
// dozens of calls is pure cost.
const MAX_LIVE_CHARS = 8000

function appendCapped(previous: string, addition: string): string {
  const next = previous + addition
  return next.length > MAX_LIVE_CHARS ? next.slice(next.length - MAX_LIVE_CHARS) : next
}

/** Live step statuses, the call currently streaming, and a capped event log, for as long as this
 * screen is mounted.
 *
 * The engine replays its recent events when this connects (`EventBus`'s backlog), so a client
 * that arrives mid-run — which is every client, since starting a run and navigating to the
 * Pipeline screen are two separate steps — sees what already happened rather than only what
 * happens next. `GET /runs/{id}` remains the authoritative answer for step state; this is the
 * fresher of the two between polls, and the only source for token deltas, which are deliberately
 * not backlogged.
 */
export function useRunEvents(runId: string | null, maxEvents = 200) {
  const [connected, setConnected] = useState(false)
  const [steps, setSteps] = useState<Record<string, LiveStep>>({})
  const [live, setLive] = useState<LiveCall | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!runId) return undefined

    setSteps({})
    setLive(null)
    setEvents([])

    const socket = new WebSocket(engineWsUrl(`/runs/${runId}/events`))
    socketRef.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onmessage = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as RunEvent
      // Deltas are thousands of frames per call — logging them would evict everything else from
      // the capped log and tell the reader nothing the live view isn't already showing.
      if (parsed.kind !== 'llm_delta') {
        setEvents((prev) => [...prev.slice(-(maxEvents - 1)), parsed])
      }

      if (parsed.kind === 'node_started' || parsed.kind === 'node_finished') {
        const key = stepKey(parsed.node, parsed.component_id)
        const status: NodeStatus = parsed.kind === 'node_started' ? 'running' : parsed.status
        setSteps((prev) => ({
          ...prev,
          [key]: {
            node: parsed.node,
            status,
            parent: parsed.parent ?? null,
            componentId: parsed.component_id ?? null,
            startedAt: parsed.kind === 'node_started' ? parsed.at : (prev[key]?.startedAt ?? null),
          },
        }))
        // Whatever was streaming belonged to the node that just ended.
        if (parsed.kind === 'node_finished') {
          setLive((prev) => (prev && prev.node === parsed.node ? null : prev))
        }
      } else if (parsed.kind === 'llm_delta') {
        setLive((prev) =>
          prev && prev.node === parsed.node && prev.role === parsed.role
            ? {
                ...prev,
                reasoning:
                  parsed.delta_kind === 'reasoning'
                    ? appendCapped(prev.reasoning, parsed.text)
                    : prev.reasoning,
                content:
                  parsed.delta_kind === 'content'
                    ? appendCapped(prev.content, parsed.text)
                    : prev.content,
              }
            : {
                node: parsed.node,
                role: parsed.role,
                reasoning: parsed.delta_kind === 'reasoning' ? parsed.text : '',
                content: parsed.delta_kind === 'content' ? parsed.text : '',
                startedAt: Date.now(),
              },
        )
      }
    }

    return () => socket.close()
  }, [runId, maxEvents])

  return { connected, steps, live, events }
}
