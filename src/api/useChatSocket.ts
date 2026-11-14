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

interface ChatTurnMessage {
  kind: 'question' | 'ready'
  text: string
  brief: ProjectBriefDraft
}

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
 * `appsmith.api.routers.chat.chat_ws` exactly: the server always sends a `{kind, text, brief}`
 * frame after connecting and after every answer, settling into `kind: "ready"` once the brief is
 * frozen.
 */
export function useChatSocket(projectId: string | null) {
  const [status, setStatus] = useState<ChatConnectionStatus>('connecting')
  const [question, setQuestion] = useState<ChatQuestion | null>(null)
  const [brief, setBrief] = useState<ProjectBriefDraft | null>(null)
  const [readyToBuild, setReadyToBuild] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!projectId) return undefined

    setStatus('connecting')
    setQuestion(null)
    setBrief(null)
    setReadyToBuild(false)

    const socket = new WebSocket(engineWsUrl(`/projects/${projectId}/chat`))
    socketRef.current = socket
    let seq = 0

    socket.onopen = () => setStatus('open')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ChatTurnMessage
      if (message.kind === 'ready') {
        setReadyToBuild(true)
        setBrief(message.brief)
      } else {
        seq += 1
        setQuestion({ text: message.text, seq })
        setBrief(message.brief ?? null)
      }
    }

    return () => socket.close()
  }, [projectId])

  const sendAnswer = useCallback((text: string) => {
    socketRef.current?.send(JSON.stringify({ text }))
  }, [])

  return { status, question, brief, readyToBuild, sendAnswer }
}
