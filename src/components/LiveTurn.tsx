import { useEffect, useRef, useState } from 'react'

function approxTokens(text: string): number {
  return text ? Math.max(1, Math.floor(text.length / 4)) : 0
}

/** The in-progress assistant turn: a pulsing "thinking" indicator the instant the turn starts,
 * then the model's reasoning (collapsible, open while it's still arriving) and its final answer,
 * both filling in live as `reasoning_delta`/`content_delta` frames arrive over the chat WS, plus
 * a ticking tokens/elapsed/tokens-per-second row. Unmounted once the turn's final state frame
 * replaces it with a normal chat bubble (see Chat.tsx), so the ticking interval's lifetime is
 * just this component's mount span -- no separate start/stop wiring needed.
 */
export function LiveTurn({
  reasoning,
  content,
  startedAt,
}: {
  reasoning: string
  content: string
  startedAt: number | null
}) {
  const [now, setNow] = useState(() => Date.now())
  const reasoningRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 150)
    return () => clearInterval(id)
  }, [])

  // The box has its own scroll (max-h-40) so it doesn't grow the whole bubble unboundedly, but
  // that means new text arriving below the fold needs an explicit nudge to stay in view -- left
  // alone, the box stays pinned at the top forever once reasoning overflows it.
  useEffect(() => {
    const el = reasoningRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [reasoning])

  const elapsedMs = startedAt ? Math.max(now - startedAt, 0) : 0
  const tokens = approxTokens(reasoning) + approxTokens(content)
  const tokensPerSec = elapsedMs > 0 ? tokens / (elapsedMs / 1000) : 0

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-2 rounded-lg bg-muted px-3 py-2 text-sm">
        {!reasoning && !content && (
          <span className="flex items-center gap-1" aria-label="Thinking">
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </span>
        )}

        {reasoning && (
          <details className="rounded-md border border-border/60 bg-background/40" open>
            <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted-foreground">
              Reasoning
            </summary>
            <pre
              ref={reasoningRef}
              className="max-h-40 overflow-y-auto px-2 pb-2 text-xs whitespace-pre-wrap text-muted-foreground"
            >
              {reasoning}
            </pre>
          </details>
        )}

        {content && <div>{content}</div>}

        {(reasoning || content) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            <span>{tokens} tokens</span>
            <span>·</span>
            <span>{(elapsedMs / 1000).toFixed(1)}s</span>
            <span>·</span>
            <span>{tokensPerSec.toFixed(1)} tok/s</span>
          </div>
        )}
      </div>
    </div>
  )
}
