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
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  PlayIcon,
  SquareIcon,
  XCircleIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api/client'
import { useRunEvents } from '@/api/useRunEvents'
import { GateBanner } from '@/components/GateBanner'
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

/** Per-node progress as `GET /runs/{id}` reports it — the engine accumulates this from the same
 * events the WS streams, so it is answerable at any moment rather than only to a client that was
 * watching from the start.
 */
type RunNodeState = {
  node: string
  status: 'running' | 'success' | 'failed'
  started_at?: string | null
  finished_at?: string | null
}

type RunStatus = {
  status: string
  next_gate: string | null
  error: string | null
  nodes: RunNodeState[]
  // True between asking a run to stop and it actually stopping — the stop is cooperative on the
  // engine side (it lands at the next node, retry or streamed chunk), so there is a real window
  // where "stopping…" is the only honest thing to say.
  stop_requested: boolean
}

function PipelineNode({ data, selected }: NodeProps<Node<{ label: string; status: Status }>>) {
  const icon = {
    idle: <CircleDashedIcon className="size-4 text-muted-foreground" />,
    running: <Loader2Icon className="size-4 animate-spin text-primary" />,
    success: <CheckCircle2Icon className="size-4 text-success" />,
    failed: <XCircleIcon className="size-4 text-destructive" />,
  }[data.status]

  // `selected` is handed to every custom node by React Flow and was simply not being read, so
  // clicking a node opened the detail panel while leaving the node itself drawn identically to
  // its neighbours — the panel's own title was the only clue which box it belonged to. Kept
  // visually distinct from the *running* indicator (a spinning icon), since a node can be both.
  return (
    <div
      className={
        'flex min-w-44 items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm ' +
        (selected ? 'border-primary ring-2 ring-primary/40' : '')
      }
    >
      <Handle type="target" position={Position.Left} />
      {icon}
      <span className="text-sm font-medium">{data.label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { pipeline: PipelineNode }

/** Wall-clock since `startedAt`, ticking. The number matters as much as the spinner: a single
 * call against a real model legitimately takes minutes (211 seconds, measured), so "running" on
 * its own cannot distinguish slow from stuck, while "running for 3m 20s" can.
 */
function useElapsed(startedAt: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  if (!startedAt) return null
  const ms = Math.max(now - new Date(startedAt).getTime(), 0)
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}

function RunningIndicator({ node }: { node: RunNodeState | null }) {
  const elapsed = useElapsed(node?.started_at)

  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
      <Loader2Icon className="size-4 animate-spin text-primary" />
      <span className="text-sm">
        {node ? (
          <>
            Running <span className="font-medium">{NODE_LABEL[node.node] ?? node.node}</span>
            {elapsed ? <span className="text-muted-foreground"> · {elapsed}</span> : null}
          </>
        ) : (
          'Run in progress — starting up'
        )}
      </span>
    </div>
  )
}

export default function PipelinePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { nodeStatus: liveStatus } = useRunEvents(projectId ?? null)
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
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
        nodes: data.nodes ?? [],
        stop_requested: data.stop_requested ?? false,
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

  /** The node detail panel's call list.
   *
   * Refreshed on the same 3s tick as the status, but as its own request and only while a node is
   * actually selected. Two reasons it isn't just another line in `refreshStatus`: it carries
   * every call's full prompt and response, so it is by far the heaviest thing this screen
   * fetches, and anything that awaits `refreshStatus` (approving a gate, submitting a change
   * request) would then be waiting on it — which it was, long enough to leave the change-request
   * box stuck holding submitted text for seconds.
   *
   * It used to live in an effect keyed on the status *string*, which is `"running"` for the whole
   * duration of a run and so never changed: the list was fetched once at mount, when a freshly
   * started run has made no calls at all, and then not again until the run paused or ended.
   * Clicking a node mid-run showed an empty panel for the entire run.
   */
  async function refreshCalls(node: string | null) {
    if (!projectId || !node) return
    const { data } = await api.GET('/runs/{run_id}/llm-calls', {
      params: { path: { run_id: projectId } },
    })
    if (data) setCalls(data)
  }

  // A ref as well as state: the polling effect is created once per project and would otherwise
  // close over whichever node was selected at mount (usually none) forever.
  const selectedRef = useRef<string | null>(null)

  useEffect(() => {
    void refreshStatus()
    const interval = setInterval(() => {
      void refreshStatus()
      void refreshCalls(selectedRef.current)
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function selectNode(node: string) {
    setSelected(node)
    selectedRef.current = node
    // Immediately, not on the next tick: a panel that takes up to three seconds to show the
    // calls it has already got reads as an empty panel.
    void refreshCalls(node)
  }

  const resolvedStatus: Record<string, Status> = useMemo(() => {
    // Plain `||=` doesn't work here: every node already defaults to the *truthy* string 'idle'
    // before these fallbacks run, so `result.ba ||= 'success'` would never actually fire. Keep
    // unknown nodes as `undefined` (via `??=`, which only assigns when null/undefined) until the
    // very end, where everything still unset finally becomes 'idle'.
    //
    // The engine's own per-node report comes first and the live WS feed is layered over it: they
    // are built from the same events, so they agree, but the stream is the fresher of the two
    // between two 3s polls. The fallbacks below are what's left of the era when the WS feed was
    // the *only* source — they now only matter for a run whose engine restarted mid-flight.
    const result: Partial<Record<string, Status>> = {}
    for (const node of runStatus?.nodes ?? []) result[node.node] = node.status
    Object.assign(result, liveStatus)
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

  // Which node to name in the header. The engine reports the one that's actually running; if the
  // run is between nodes (or the report hasn't arrived yet) there simply isn't one to name, and
  // saying so beats guessing.
  const runningNode = useMemo(() => {
    const running = (runStatus?.nodes ?? []).filter((node) => node.status === 'running')
    return running.length > 0 ? running[running.length - 1] : null
  }, [runStatus])

  const nodes: Node[] = NODE_ORDER.map((id, i) => ({
    id,
    type: 'pipeline',
    position: { x: i * 220, y: 80 },
    data: { label: NODE_LABEL[id], status: resolvedStatus[id] },
    selected: id === selected,
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

  async function stopRun() {
    if (!projectId) return
    await api.POST('/runs/{run_id}/control', {
      params: { path: { run_id: projectId } },
      body: { action: 'stop' },
    })
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
  const atEarlyGate =
    runStatus?.status === 'paused_at_gate' && runStatus.next_gate !== 'after_milestone'

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
        {/* A run is usually already active by the time this screen loads — Chat's "Start build"
            posts the run and then navigates here — so the Start button is correctly hidden.
            Saying *why* it's hidden is the point: with only `status: running` in subtitle grey,
            the screen read as empty and unstartable, which is indistinguishable from broken. */}
        {!runStatus && (
          <Button size="sm" onClick={startRun}>
            <PlayIcon className="size-4" /> Start run
          </Button>
        )}
        {runStatus?.status === 'running' && (
          <div className="flex items-center gap-2">
            <RunningIndicator node={runningNode} />
            {/* The way out of a run that doesn't involve killing the engine. Safe to use: the
                engine checkpoints every node, so starting the run again picks up where this left
                off — worth saying outright, since "stop the build" reads like losing the work. */}
            <Button
              size="sm"
              variant="outline"
              disabled={runStatus.stop_requested}
              onClick={stopRun}
              title="Stops at the next step. Nothing is lost — starting the run again resumes from the last completed node."
            >
              <SquareIcon className="size-3" />
              {runStatus.stop_requested ? 'Stopping…' : 'Stop'}
            </Button>
          </div>
        )}
        {runStatus?.status === 'done' && <Badge variant="success">Run finished</Badge>}
        {runStatus?.status === 'stopped' && (
          <div className="flex items-center gap-2">
            <Badge variant="warning">stopped</Badge>
            <Button size="sm" onClick={startRun}>
              <PlayIcon className="size-4" /> Resume from checkpoint
            </Button>
          </div>
        )}
        {runStatus?.status === 'failed' && runStatus.error && (
          <Badge variant="destructive" className="max-w-md truncate">
            {runStatus.error}
          </Badge>
        )}
      </div>

      {atEarlyGate && projectId && (
        <div className="border-b p-4">
          <GateBanner
            projectId={projectId}
            gate={runStatus?.next_gate ?? ''}
            onApprove={approveGate}
          />
        </div>
      )}

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
            onNodeClick={(_, node) => selectNode(node.id)}
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

/** The node names every call made inside `build_milestone` is traced under.
 *
 * Matched as the part before the first `:` — the engine qualifies a call with the task, role,
 * attempt and review round it belongs to (`dev_implement:T2:dev_mid:0:review1`), and the agent
 * loop appends `:step<n>` on top of that.
 */
const BUILD_MILESTONE_NODES = new Set([
  'tl_plan',
  'scaffold',
  'dev_implement',
  'run_gates',
  'tl_review',
  'replan_task',
  'resolve_conflict',
  'component_e2e',
  'handoff',
  'qa_test_plan',
  'triage_bugs',
  'integrate_stage',
  'stage_components',
  'fan_out_components',
])

function matchesNode(callNode: string, selectedNode: string): boolean {
  // `milestone_demo` and `next_milestone` make no LLM calls at all, by design — every fact on a
  // MilestoneDemo is something the engine already knows for certain, so there's nothing for a
  // model to be asked. Their inspector panel being empty is correct, not a gap.
  if (selectedNode === 'milestone_demo' || selectedNode === 'next_milestone') return false
  // Matched by what the node actually owns, not by excluding `ba` and `sa`. That catch-all was
  // written when they were the only other LLM-calling nodes, and intake came later: clicking
  // "Build milestone" on a project whose build hadn't started listed the three `intake_turn`
  // calls from the chat, attributing the intake conversation to the component build.
  if (selectedNode === 'build_milestone') {
    return BUILD_MILESTONE_NODES.has(callNode.split(':')[0])
  }
  return callNode === selectedNode
}
