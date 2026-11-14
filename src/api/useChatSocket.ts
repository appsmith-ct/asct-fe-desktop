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

/** `WS /projects/{id}/chat` (spec section 9) — one question/answer turn per message, matching
 * `appsmith.api.routers.chat.chat_ws` exactly: the server always sends a `{kind, text, brief}`
 * frame after connecting and after every answer, settling into `kind: "ready"` once the brief is
 * frozen.
 */
export function useChatSocket(projectId: string | null) {
  const [status, setStatus] = useState<ChatConnectionStatus>('connecting')
  const [question, setQuestion] = useState<string>('')
  const [brief, setBrief] = useState<ProjectBriefDraft | null>(null)
  const [readyToBuild, setReadyToBuild] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!projectId) return undefined

    setStatus('connecting')
    setQuestion('')
    setBrief(null)
    setReadyToBuild(false)

    const socket = new WebSocket(engineWsUrl(`/projects/${projectId}/chat`))
    socketRef.current = socket

    socket.onopen = () => setStatus('open')
    socket.onclose = () => setStatus('closed')
    socket.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ChatTurnMessage
      if (message.kind === 'ready') {
        setReadyToBuild(true)
        setBrief(message.brief)
      } else {
        setQuestion(message.text)
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
