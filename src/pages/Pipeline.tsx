import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon, PlayIcon, XCircleIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api/client'
import { useRunEvents } from '@/api/useRunEvents'
import { MilestoneGate, type ChangeRequestSummary } from '@/components/MilestoneGate'
import { MilestoneRail, type MilestoneProgress } from '@/components/MilestoneRail'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// The first pass through the graph. The engine's loop also runs `ba_change` and `sa_delta` on a
// change-request pass, but they're no-ops without an open change request and showing two
// permanently-idle nodes would misrepresent the normal case — the loop edge back from
// `next_milestone` is what carries the information that there *is* a cycle, and the Milestones
// panel is where a user actually reads their progress through it.
const NODE_ORDER = ['ba', 'sa', 'build_milestone', 'milestone_demo', 'next_milestone']
const NODE_LABEL: Record<string, string> = {
  ba: 'Business Analyst',
  sa: 'Software Architect',
  build_milestone: 'Build milestone',
  milestone_demo: 'Milestone demo',
  next_milestone: 'Next milestone',
}

type Status = 'idle' | 'running' | 'success' | 'failed'

function PipelineNode({ data }: NodeProps<Node<{ label: string; status: Status }>>) {
  const icon = {
    idle: <CircleDashedIcon className="size-4 text-muted-foreground" />,
    running: <Loader2Icon className="size-4 animate-spin text-primary" />,
    success: <CheckCircle2Icon className="size-4 text-success" />,
    failed: <XCircleIcon className="size-4 text-destructive" />,
  }[data.status]

  return (
    <div className="flex min-w-44 items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      {icon}
      <span className="text-sm font-medium">{data.label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { pipeline: PipelineNode }

export default function PipelinePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { nodeStatus: liveStatus } = useRunEvents(projectId ?? null)
  const [runStatus, setRunStatus] = useState<{
    status: string
    next_gate: string | null
    error: string | null
  } | null>(null)
  const [milestones, setMilestones] = useState<MilestoneProgress[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [changeRequests, setChangeRequests] = useState<ChangeRequestSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const flow = useRef<ReactFlowInstance | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [calls, setCalls] = useState<
    { node: string; role: string; validation_outcome: string; retry_index: number; response: string }[]
  >([])

  async function refreshStatus() {
    if (!projectId) return
    const { data } = await api.GET('/runs/{run_id}', { params: { path: { run_id: projectId } } })
    if (data) {
      setRunStatus({
        status: data.status,
        next_gate: data.next_gate ?? null,
        error: data.error ?? null,
      })
    }
    // Polled alongside the status rather than only on change: a milestone finishing is exactly
    // the moment this panel has to update, and that shows up as new artifacts on the engine
    // side, not as a status transition the UI can watch for.
    const milestonesResponse = await api.GET('/runs/{run_id}/milestones', {
      params: { path: { run_id: projectId } },
    })
    if (milestonesResponse.data) {
      setMilestones(milestonesResponse.data.milestones)
      setCurrentIndex(milestonesResponse.data.current_index)
      setChangeRequests(milestonesResponse.data.change_requests)
    }
  }

  useEffect(() => {
    void refreshStatus()
    const interval = setInterval(refreshStatus, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    void api
      .GET('/runs/{run_id}/llm-calls', { params: { path: { run_id: projectId } } })
      .then(({ data }) => setCalls(data ?? []))
  }, [projectId, runStatus?.status])

  const resolvedStatus: Record<string, Status> = useMemo(() => {
    // Plain `||=` doesn't work here: every node already defaults to the *truthy* string 'idle'
    // before these fallbacks run, so `result.ba ||= 'success'` would never actually fire. Keep
    // unknown nodes as `undefined` (via `??=`, which only assigns when null/undefined) until the
    // very end, where everything still unset finally becomes 'idle'.
    const result: Partial<Record<string, Status>> = { ...liveStatus }
    // ba/sa already ran if we're paused at (or past) the after_sa gate, even on a page refresh
    // where the WS live feed never saw it happen — the one thing the event stream can't tell us
    // after the fact, `GET /runs/{id}` can.
    if (runStatus?.status === 'paused_at_gate' || runStatus?.status === 'done') {
      result.ba ??= 'success'
      result.sa ??= 'success'
    }
    if (runStatus?.status === 'done') {
      result.build_milestone ??= 'success'
      result.milestone_demo ??= 'success'
      result.next_milestone ??= 'success'
    }
    // Parked at the milestone gate means this milestone's build and demo both finished — the
    // gate interrupts *before* `next_milestone`, so that one hasn't run for this round.
    if (runStatus?.next_gate === 'after_milestone') {
      result.build_milestone ??= 'success'
      result.milestone_demo ??= 'success'
    }
    if (runStatus?.status === 'failed') {
      // the exact failing node is ambiguous from status alone — attribute it to whichever node
      // has no success status yet, so at least one node visibly flags the problem.
      const firstUnresolved = NODE_ORDER.find((n) => result[n] !== 'success')
      if (firstUnresolved) result[firstUnresolved] ??= 'failed'
    }
    return Object.fromEntries(NODE_ORDER.map((node) => [node, result[node] ?? 'idle']))
  }, [liveStatus, runStatus])

  const nodes: Node[] = NODE_ORDER.map((id, i) => ({
    id,
    type: 'pipeline',
    position: { x: i * 220, y: 80 },
    data: { label: NODE_LABEL[id], status: resolvedStatus[id] },
  }))
  const edges: Edge[] = NODE_ORDER.slice(0, -1).map((id, i) => ({
    id: `${id}-${NODE_ORDER[i + 1]}`,
    source: id,
    target: NODE_ORDER[i + 1],
  }))

  async function startRun() {
    if (!projectId) return
    await api.POST('/projects/{project_id}/runs', { params: { path: { project_id: projectId } } })
    await refreshStatus()
  }

  async function approveGate() {
    if (!projectId) return
    await api.POST('/runs/{run_id}/control', {
      params: { path: { run_id: projectId } },
      body: { action: 'approve_gate' },
    })
    await refreshStatus()
  }

  const atMilestoneGate =
    runStatus?.status === 'paused_at_gate' && runStatus.next_gate === 'after_milestone'

  // `fitView` on <ReactFlow> only fits once, at mount. Everything that can appear *around* the
  // canvas afterwards — the milestone gate banner above it, the Milestones panel beside it —
  // shrinks the pane without React Flow re-fitting, which leaves the nodes rendered correctly but
  // scrolled clean out of view: a blank dotted canvas that only comes back on a page reload.
  // Caught by screenshotting the gate state; the build and the lint were both perfectly happy.
  //
  // Observing the pane's own size rather than listing the state changes that can affect it: the
  // list was wrong once already (an effect keyed on `atMilestoneGate` fires before the browser has
  // laid the new size out, so it re-fits to the size it's trying to replace), and a ResizeObserver
  // can't go stale as more panels get added. `requestAnimationFrame` defers the fit to after
  // layout, and ResizeObserver only fires once the new size is real.
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => flow.current?.fitView({ padding: 0.2 }))
    })
    observer.observe(pane)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  async function submitChangeRequest(text: string) {
    if (!projectId) return
    await api.POST('/runs/{run_id}/control', {
      params: { path: { run_id: projectId } },
      body: { action: 'change_request', text },
    })
    await refreshStatus()
  }

  const nodeCalls = selected ? calls.filter((c) => matchesNode(c.node, selected)) : []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h1 className="text-lg font-semibold">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            {runStatus ? `status: ${runStatus.status}` : 'no run started yet'}
          </p>
        </div>
        {!runStatus && (
          <Button size="sm" onClick={startRun}>
            <PlayIcon className="size-4" /> Start run
          </Button>
        )}
        {runStatus?.status === 'paused_at_gate' && runStatus.next_gate !== 'after_milestone' && (
          <div className="flex items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
            <span className="text-sm">
              Paused at gate <Badge variant="warning">{runStatus.next_gate}</Badge>
            </span>
            <Button size="sm" onClick={approveGate}>
              Approve
            </Button>
          </div>
        )}
        {runStatus?.status === 'failed' && runStatus.error && (
          <Badge variant="destructive" className="max-w-md truncate">
            {runStatus.error}
          </Badge>
        )}
      </div>

      {atMilestoneGate && (
        <div className="border-b p-4">
          <MilestoneGate
            changeRequests={changeRequests}
            onSubmitChangeRequest={submitChangeRequest}
            onApprove={approveGate}
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div ref={paneRef} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              flow.current = instance
            }}
            onNodeClick={(_, node) => setSelected(node.id)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className="flex w-80 shrink-0 flex-col overflow-hidden border-l">
          <Card className="flex max-h-1/2 flex-col overflow-hidden rounded-none border-0">
            <CardHeader>
              <CardTitle className="text-sm">Milestones</CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              <MilestoneRail milestones={milestones} currentIndex={currentIndex} />
            </CardContent>
          </Card>

          {selected && (
          <Card className="flex flex-1 flex-col overflow-y-auto rounded-none border-0 border-t">
            <CardHeader>
              <CardTitle className="text-sm">{NODE_LABEL[selected] ?? selected}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nodeCalls.length === 0 ? (
                <p className="text-xs text-muted-foreground">No LLM calls recorded yet.</p>
              ) : (
                nodeCalls.map((call, i) => (
                  <div key={i} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{call.node}</span>
                      <Badge variant={call.validation_outcome === 'success' ? 'success' : 'destructive'}>
                        {call.validation_outcome}
                      </Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      role: {call.role} · retry {call.retry_index}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function matchesNode(callNode: string, selectedNode: string): boolean {
  // `milestone_demo` and `next_milestone` make no LLM calls at all, by design — every fact on a
  // MilestoneDemo is something the engine already knows for certain, so there's nothing for a
  // model to be asked. Their inspector panel being empty is correct, not a gap.
  if (selectedNode === 'milestone_demo' || selectedNode === 'next_milestone') return false
  if (selectedNode === 'build_milestone') return callNode !== 'ba' && callNode !== 'sa'
  return callNode === selectedNode
}
