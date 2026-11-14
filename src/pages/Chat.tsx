import { SendIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { api } from '@/api/client'
import { useChatSocket } from '@/api/useChatSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Turn {
  role: 'assistant' | 'user'
  text: string
}

export default function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { status, question, brief, readyToBuild, sendAnswer } = useChatSocket(projectId ?? null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (question) {
      setTurns((prev) => [...prev, { role: 'assistant', text: question.text }])
    }
    // `question` is a fresh { text, seq } object per server message, so this must depend on its
    // identity (via seq), not just its presence — two consecutive questions with the same text
    // (the agent re-asking the same clarifying question) are still two distinct turns to render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.seq])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  function submit() {
    if (!draft.trim() || readyToBuild) return
    setTurns((prev) => [...prev, { role: 'user', text: draft }])
    sendAnswer(draft)
    setDraft('')
  }

  async function startBuild() {
    if (!projectId) return
    await api.POST('/projects/{project_id}/runs', { params: { path: { project_id: projectId } } })
    navigate(`/projects/${projectId}/pipeline`)
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Chat</h1>
          <p className="text-sm text-muted-foreground">
            The intake agent asks what you want to build, then freezes a brief once it's ready.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {status === 'open' ? 'connected' : status}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-4 overflow-hidden">
        <Card className="col-span-2 flex flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    turn.role === 'user'
                      ? 'max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm'
                  }
                >
                  {turn.text}
                </div>
              </div>
            ))}
            {readyToBuild && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                Brief is ready to build.
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t p-3">
            <Input
              value={draft}
              disabled={readyToBuild || status !== 'open'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder={readyToBuild ? 'Brief frozen — start the build below' : 'Type your answer…'}
            />
            <Button size="icon" onClick={submit} disabled={readyToBuild || status !== 'open'}>
              <SendIcon className="size-4" />
            </Button>
          </div>
        </Card>

        <Card className="col-span-1 overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-sm">Project brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {brief ? (
              <>
                <BriefField label="Goal" value={brief.goal} />
                <BriefList label="Users" items={brief.users} />
                <BriefList label="Features" items={brief.features} />
                <BriefList label="Constraints" items={brief.constraints} />
                <BriefList label="Open questions" items={brief.open_questions} />
              </>
            ) : (
              <p className="text-muted-foreground">Nothing yet — answer the first question.</p>
            )}
            {readyToBuild && (
              <Button className="w-full" onClick={startBuild}>
                Start build
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function BriefField({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  )
}

function BriefList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <ul className="list-inside list-disc">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
