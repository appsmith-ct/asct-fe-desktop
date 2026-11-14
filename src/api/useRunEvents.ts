import { useEffect, useRef, useState } from 'react'

import { engineWsUrl } from './client'

/** Mirrors `appsmith.core.events.Event` (the discriminated union `WS /runs/{id}/events` streams)
 * — hand-synced, not generated: the OpenAPI document is REST-only and says nothing about this
 * route's message shapes.
 */
export type RunEvent =
  | { kind: 'node_started'; run_id: string; node: string; at: string }
  | { kind: 'node_finished'; run_id: string; node: string; status: 'success' | 'failed'; at: string }
  | {
      kind: 'llm_call_recorded'
      run_id: string
      node: string
      role: string
      retry_index: number
      validation_outcome: string
      at: string
    }
  | { kind: 'artifact_written'; run_id: string; artifact_kind: string; artifact_id: string; version: number; at: string }
  | { kind: 'gate_reached'; run_id: string; gate: string; at: string }
  | { kind: 'metrics_updated'; run_id: string; metrics: Record<string, number>; at: string }

export type NodeStatus = 'running' | 'success' | 'failed'

/** Live node-status map + a capped event log, kept across the run's lifetime — the Pipeline
 * screen's React Flow nodes read `nodeStatus`; the Runs screen's call inspector can read `events`
 * directly if a live feed is useful there too.
 */
export function useRunEvents(runId: string | null, maxEvents = 200) {
  const [connected, setConnected] = useState(false)
  const [nodeStatus, setNodeStatus] = useState<Record<string, NodeStatus>>({})
  const [events, setEvents] = useState<RunEvent[]>([])
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!runId) return undefined

    setNodeStatus({})
    setEvents([])

    const socket = new WebSocket(engineWsUrl(`/runs/${runId}/events`))
    socketRef.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onmessage = (event: MessageEvent<string>) => {
      const parsed = JSON.parse(event.data) as RunEvent
      setEvents((prev) => [...prev.slice(-(maxEvents - 1)), parsed])
      if (parsed.kind === 'node_started') {
        setNodeStatus((prev) => ({ ...prev, [parsed.node]: 'running' }))
      } else if (parsed.kind === 'node_finished') {
        setNodeStatus((prev) => ({ ...prev, [parsed.node]: parsed.status }))
      }
    }

    return () => socket.close()
  }, [runId, maxEvents])

  return { connected, nodeStatus, events }
}
