import { ChevronRightIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'

export interface ObservedCall {
  node: string
  role: string
  profile_id: string
  prompt: string
  response: string
  input_tokens: number
  output_tokens: number
  latency_ms: number
  validation_outcome: string
  retry_index: number
  reasoning?: string | null
  created_at?: string
}

export interface ContextWindow {
  /** The profile's configured context size, or 0 if unknown. */
  size: number
  profileId: string
}

/** Every model call, newest first, each expandable to the full exchange — with the context
 * window it all has to fit inside shown above it.
 *
 * Replaces a sidebar panel that stacked reasoning, prompt and response into three fixed-height
 * scroll boxes inside a third scrolling column. Reading one call meant scrolling inside a box
 * inside a box, and nothing anywhere said *when* anything happened, which made it impossible to
 * line a call up against what you were doing at the time.
 *
 * The context figure is the single most useful number here and it was missing entirely: with a
 * 32k window and a thinking model that can spend thousands of tokens reasoning before it writes
 * anything, "how close is this to the edge" explains failures that are otherwise unexplainable.
 */
export function CallInspector({
  calls,
  contextWindow,
}: {
  calls: ObservedCall[]
  contextWindow?: ContextWindow
}) {
  const newestFirst = useMemo(() => [...calls].reverse(), [calls])
  const largestPrompt = useMemo(
    () => calls.reduce((most, call) => Math.max(most, call.input_tokens), 0),
    [calls],
  )

  return (
    <div className="space-y-4">
      {contextWindow && contextWindow.size > 0 && (
        <ContextGauge used={largestPrompt} window={contextWindow} />
      )}

      {calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">No model calls yet.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {newestFirst.map((call, i) => (
            <CallRow key={`${call.created_at}-${i}`} call={call} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  )
}

function ContextGauge({ used, window }: { used: number; window: ContextWindow }) {
  const pct = Math.min(100, Math.round((used / window.size) * 100))
  const tone = pct > 85 ? 'bg-destructive' : pct > 60 ? 'bg-warning' : 'bg-primary'
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Context window</span>
        <span className="font-mono text-xs text-muted-foreground">{window.profileId}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Largest prompt so far: ~{used.toLocaleString()} of {window.size.toLocaleString()} tokens (
        {pct}%). Token counts are the engine's own estimate, not the server's.
      </p>
    </div>
  )
}

function CallRow({ call, defaultOpen }: { call: ObservedCall; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const failed = call.validation_outcome !== 'success'

  return (
    <div className="text-sm">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
      >
        <ChevronRightIcon
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(call.created_at)}
        </span>
        <span className="font-mono text-xs">{call.node}</span>
        <Badge variant={failed ? 'destructive' : 'success'}>{call.validation_outcome}</Badge>
        {call.retry_index > 0 && <Badge variant="outline">retry {call.retry_index}</Badge>}
        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
          {call.input_tokens}→{call.output_tokens} tok · {(call.latency_ms / 1000).toFixed(1)}s
        </span>
      </button>

      {open && (
        <div className="border-t bg-muted/30 px-3 py-3">
          <CallDetail call={call} />
        </div>
      )}
    </div>
  )
}

/** One call's full detail. Exported so the Runs screen's per-call dialog shows exactly what the
 * Chat screen's inspector does — they were drifting apart as two hand-written copies, each with
 * its own set of cramped fixed heights.
 */
export function CallDetail({ call }: { call: ObservedCall }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">role</dt>
        <dd className="font-mono">{call.role}</dd>
        <dt className="text-muted-foreground">profile</dt>
        <dd className="font-mono">{call.profile_id}</dd>
        {call.created_at && (
          <>
            <dt className="text-muted-foreground">at</dt>
            <dd className="font-mono">{new Date(call.created_at).toLocaleString()}</dd>
          </>
        )}
      </dl>
      <Section
        label={`Reasoning${call.reasoning ? ` (~${approxTokens(call.reasoning)} tok)` : ''}`}
        body={call.reasoning}
        empty="No reasoning exposed by this model or profile."
      />
      <Section label="Prompt" body={call.prompt} />
      <Section label="Response" body={call.response} />
    </div>
  )
}

function Section({ label, body, empty }: { label: string; body?: string | null; empty?: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {body ? (
        // One scroll region, generous and uniform, rather than three different small ones —
        // the modal has the height to spend, which the old sidebar never did.
        <pre className="mt-1 max-h-80 overflow-auto rounded-md bg-background p-2 text-xs whitespace-pre-wrap">
          {body}
        </pre>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{empty ?? '(empty)'}</p>
      )}
    </div>
  )
}

function formatTime(iso?: string): string {
  if (!iso) return '--:--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString(undefined, { hour12: false })
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
