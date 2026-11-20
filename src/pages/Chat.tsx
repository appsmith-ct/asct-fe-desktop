import { SendIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { api } from '@/api/client'
import { useChatSocket } from '@/api/useChatSocket'
import { CallObservability, type ObservedCall } from '@/components/CallObservability'
import { LiveTurn } from '@/components/LiveTurn'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function ChatPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const {
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
  } = useChatSocket(projectId ?? null)
  const [draft, setDraft] = useState('')
  const [calls, setCalls] = useState<ObservedCall[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshCalls = useCallback(() => {
    if (!projectId) return
    void api
      .GET('/runs/{run_id}/llm-calls', { params: { path: { run_id: projectId } } })
      .then(({ data }) => setCalls((data ?? []).filter((c) => c.role === 'intake')))
  }, [projectId])

  // Refetch after every turn (question.seq changes) and once the brief is frozen -- the chat
  // WS itself only carries the question/brief, not the call trace, so this is a separate fetch
  // against the same tracing data the Runs screen's LLM-calls table reads.
  useEffect(() => {
    refreshCalls()
  }, [refreshCalls, question?.seq, readyToBuild])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, liveReasoning, liveContent])

  function submit() {
    if (!draft.trim() || readyToBuild || isThinking) return
    sendAnswer(draft)
    setDraft('')
  }

  async function startBuild() {
    if (!projectId) return
    await api.POST('/projects/{project_id}/runs', { params: { path: { project_id: projectId } } })
    navigate(`/projects/${projectId}/pipeline`)
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-6">
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

      <div className="grid flex-1 grid-cols-5 gap-4 overflow-hidden">
        <Card className="col-span-3 flex flex-col overflow-hidden">
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
            {isThinking && (
              <LiveTurn reasoning={liveReasoning} content={liveContent} startedAt={turnStartedAt} />
            )}
            {readyToBuild && (
              <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success">
                Brief is ready to build.
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t p-3">
            <Input
              value={draft}
              disabled={readyToBuild || isThinking || status !== 'open'}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder={
                readyToBuild
                  ? 'Brief frozen — start the build below'
                  : isThinking
                    ? 'Waiting for a response…'
                    : 'Type your answer…'
              }
            />
            <Button size="icon" onClick={submit} disabled={readyToBuild || isThinking || status !== 'open'}>
              <SendIcon className="size-4" />
            </Button>
          </div>
        </Card>

        <div className="col-span-2 flex flex-col gap-4 overflow-hidden">
          <Card className="flex max-h-[45%] flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">Project brief</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 overflow-y-auto text-sm">
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

          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">Observability</CardTitle>
              <CardDescription>
                What the model actually did on each turn — its hidden reasoning (where the
                profile exposes one) and the raw prompt/response. Intake doesn't call tools, so
                there's nothing to show there.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-y-auto">
              <CallObservability calls={calls} />
            </CardContent>
          </Card>
        </div>
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
