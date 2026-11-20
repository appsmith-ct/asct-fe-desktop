import { useCallback, useEffect, useRef, useState } from 'react'

import { engineWsUrl } from './client'

export interface ProjectBriefDraft {
  goal: string
  users: string[]
  features: string[]
  constraints: string[]
  integrations: string[]
  non_functional_needs: string[]
  open_questions: string[]
  ready_to_build: boolean
  [key: string]: unknown
}

export interface ChatTurn {
  role: 'assistant' | 'user'
  text: string
}

type ServerTurn = { role: 'assistant' | 'user'; content: string }

type ServerFrame =
  | {
      kind: 'question' | 'ready'
      text: string
      brief: ProjectBriefDraft
      history?: ServerTurn[]
    }
  | { kind: 'turn_started' }
  | { kind: 'reasoning_delta' | 'content_delta'; text: string }

export type ChatConnectionStatus = 'connecting' | 'open' | 'closed'

/** A question frame tagged with a sequence number so a repeated question (the intake agent
 * asking the same clarifying question twice in a row is a legitimate, not-infrequent outcome)
 * still looks like a new value to React — a plain string would compare equal to the previous
 * one and the state update would be dropped, silently eating a real server turn.
 */
export interface ChatQuestion {
  text: string
  seq: number
}

/** `WS /projects/{id}/chat` (spec section 9) — one question/answer turn per message, matching
 * `appsmith.api.routers.chat.chat_ws`: the server sends a `{kind, text, brief}` frame after
 * connecting and after every answer, settling into `kind: "ready"` once the brief is frozen.
 * While a turn is in flight it also sends a live-typing sequence: one `turn_started` frame the
 * moment the answer is received, then any number of `reasoning_delta`/`content_delta` frames
 * (hand-synced with the engine's frame shapes, not generated -- these two WS routes aren't in
 * the OpenAPI document, see root CLAUDE.md) before the turn's final state frame.
 *
 * The hook owns the rendered transcript (`turns`) rather than leaving the page to accumulate one.
 * The page's copy lived only in React state, so a refresh or a trip to another screen showed an
 * empty chat above a conversation that was entirely intact on the engine side — the state frame
 * now replays it, and the only place that can sensibly reconcile a replay against the message the
 * user just typed is here, where both arrive.
 */
function toTurns(history: ServerTurn[] | undefined): ChatTurn[] {
  return (history ?? []).map((turn) => ({ role: turn.role, text: turn.content }))
}

/** The replayed transcript, plus the question in this frame if the replay doesn't already end
 * with it.
 *
 * Both cases are real and they differ. Reconnecting mid-conversation replays a history whose
 * last entry *is* the question being re-sent, so appending it would show it twice. Connecting to
 * a brand new project replays nothing at all, but the opening "What would you like to build?"
 * still has to appear — assuming the replay always covered it silently swallowed the first
 * question of every conversation.
 */
function hydrate(history: ServerTurn[] | undefined, question: string): ChatTurn[] {
  const turns = toTurns(history)
  const last = turns[turns.length - 1]
  if (question && !(last && last.role === 'assistant' && last.text === question)) {
    turns.push({ role: 'assistant', text: question })
  }
  return turns
}

export function useChatSocket(projectId: string | null) {
  const [status, setStatus] = useState<ChatConnectionStatus>('connecting')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState<ChatQuestion | null>(null)
  const [brief, setBrief] = useState<ProjectBriefDraft | null>(null)
  const [readyToBuild, setReadyToBuild] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveContent, setLiveContent] = useState('')
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!projectId) return undefined

    setStatus('connecting')
    setTurns([])
    setQuestion(null)
    setBrief(null)
    setReadyToBuild(false)
    setIsThinking(false)
    setLiveReasoning('')
    setLiveContent('')
    setTurnStartedAt(null)

    const socket = new WebSocket(engineWsUrl(`/projects/${projectId}/chat`))
    socketRef.current = socket
    let seq = 0
    // The first state frame of a connection carries the whole conversation the engine has
    // checkpointed; every later one carries it too, but by then the local list is already the
    // same thing plus whatever the user has typed. So hydrate once and append after that —
    // replacing on every frame would be correct but would throw away the optimistic user
    // message between send and the server's reply.
    let hydrated = false

    socket.onopen = () => setStatus('open')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerFrame
      switch (message.kind) {
        case 'turn_started':
          setIsThinking(true)
          setLiveReasoning('')
          setLiveContent('')
          setTurnStartedAt(Date.now())
          break
        case 'reasoning_delta':
          setLiveReasoning((prev) => prev + message.text)
          break
        case 'content_delta':
          setLiveContent((prev) => prev + message.text)
          break
        case 'ready':
          setIsThinking(false)
          setReadyToBuild(true)
          setBrief(message.brief)
          if (!hydrated) {
            hydrated = true
            setTurns(toTurns(message.history))
          }
          break
        case 'question':
          seq += 1
          setIsThinking(false)
          setQuestion({ text: message.text, seq })
          setBrief(message.brief ?? null)
          if (hydrated) {
            setTurns((prev) => [...prev, { role: 'assistant', text: message.text }])
          } else {
            hydrated = true
            setTurns(hydrate(message.history, message.text))
          }
          break
      }
    }

    return () => socket.close()
  }, [projectId])

  const sendAnswer = useCallback((text: string) => {
    // Appended locally as well as sent: the engine only reports it back on the *next* state
    // frame, which is a whole model turn away, and a chat that swallows what you just typed for
    // ten seconds reads as broken.
    setTurns((prev) => [...prev, { role: 'user', text }])
    socketRef.current?.send(JSON.stringify({ text }))
  }, [])

  return {
    status,
    turns,
    question,
    brief,
    readyToBuild,
    sendAnswer,
    isThinking,
    liveReasoning,
    liveContent,
    turnStartedAt,
  }
}
