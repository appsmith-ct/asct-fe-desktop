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
}

/** Shows what one or more LLM calls actually did: the model's hidden reasoning where the
 * profile exposes it (a non-standard `reasoning_content` field some local "thinking" models
 * attach -- see `appsmith.core.reasoning_chat_model` on the engine side), plus the raw
 * prompt/response. There's no separate notion of "tool calls" rendered here: a role that
 * doesn't use the tool-calling agent loop (like intake) never has any, and for a role that
 * does, the call it made *is* the tool call -- it shows up in `response` as the structured
 * action the model chose, same as everything else.
 */
export function CallObservability({ calls }: { calls: ObservedCall[] }) {
  if (calls.length === 0) {
    return <p className="text-sm text-muted-foreground">No model calls yet.</p>
  }

  return (
    <div className="space-y-2">
      {[...calls].reverse().map((call, i) => (
        <details key={i} className="rounded-md border text-sm" open={i === 0}>
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2">
            <span className="font-mono text-xs text-muted-foreground">{call.node}</span>
            <Badge variant={call.validation_outcome === 'success' ? 'success' : 'destructive'}>
              {call.validation_outcome}
            </Badge>
            {call.retry_index > 0 && (
              <Badge variant="outline">retry {call.retry_index}</Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {call.input_tokens}/{call.output_tokens} tok · {Math.round(call.latency_ms)}ms
            </span>
          </summary>
          <div className="space-y-3 border-t px-3 py-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Reasoning {call.reasoning ? `(~${approxTokens(call.reasoning)} tok)` : ''}
              </div>
              {call.reasoning ? (
                <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                  {call.reasoning}
                </pre>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  No reasoning content exposed by this model/profile.
                </p>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Prompt (input)</div>
              <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                {call.prompt}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">Response (output)</div>
              <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                {call.response}
              </pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  )
}

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
