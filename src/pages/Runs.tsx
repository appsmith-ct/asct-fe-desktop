import { DownloadIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type LLMCall = {
  node: string
  role: string
  profile_id: string
  prompt_version: number
  prompt: string
  response: string
  input_tokens: number
  output_tokens: number
  latency_ms: number
  validation_outcome: string
  retry_index: number
}

type RunMetrics = {
  run_id: string
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  by_role: {
    role: string
    call_count: number
    retry_count: number
    input_tokens: number
    output_tokens: number
    first_attempt_validation_rate: number
  }[]
}

export default function RunsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [metrics, setMetrics] = useState<RunMetrics | null>(null)
  const [calls, setCalls] = useState<LLMCall[]>([])
  const [inspecting, setInspecting] = useState<LLMCall | null>(null)

  useEffect(() => {
    if (!projectId) return
    void api
      .GET('/runs/{run_id}/metrics', { params: { path: { run_id: projectId } } })
      .then(({ data }) => setMetrics(data ?? null))
    void api
      .GET('/runs/{run_id}/llm-calls', { params: { path: { run_id: projectId } } })
      .then(({ data }) => setCalls(data ?? []))
  }, [projectId])

  function exportCsv() {
    const header = 'node,role,profile_id,input_tokens,output_tokens,latency_ms,validation_outcome,retry_index'
    const rows = calls.map((c) =>
      [c.node, c.role, c.profile_id, c.input_tokens, c.output_tokens, c.latency_ms, c.validation_outcome, c.retry_index].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectId}-llm-calls.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Runs and metrics</h1>
          <p className="text-sm text-muted-foreground">
            Per-role tokens, retries and first-attempt validation rate, plus every LLM call made
            for this run.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={calls.length === 0}>
          <DownloadIcon className="size-4" /> Export CSV
        </Button>
      </div>

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {metrics.total_calls} call(s) · {metrics.total_input_tokens} in /{' '}
              {metrics.total_output_tokens} out tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>In tokens</TableHead>
                  <TableHead>Out tokens</TableHead>
                  <TableHead>First-attempt rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.by_role.map((role) => (
                  <TableRow key={role.role}>
                    <TableCell className="font-mono">{role.role}</TableCell>
                    <TableCell>{role.call_count}</TableCell>
                    <TableCell>{role.retry_count}</TableCell>
                    <TableCell>{role.input_tokens}</TableCell>
                    <TableCell>{role.output_tokens}</TableCell>
                    <TableCell>{Math.round(role.first_attempt_validation_rate * 100)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">LLM calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Node</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Retry</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.map((call, i) => (
                <TableRow key={i} className="cursor-pointer" onClick={() => setInspecting(call)}>
                  <TableCell className="font-mono">{call.node}</TableCell>
                  <TableCell>{call.role}</TableCell>
                  <TableCell>
                    <Badge variant={call.validation_outcome === 'success' ? 'success' : 'destructive'}>
                      {call.validation_outcome}
                    </Badge>
                  </TableCell>
                  <TableCell>{call.retry_index}</TableCell>
                  <TableCell>
                    {call.input_tokens}/{call.output_tokens}
                  </TableCell>
                  <TableCell>{Math.round(call.latency_ms)}ms</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={inspecting !== null} onOpenChange={(open) => !open && setInspecting(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {inspecting?.node} · {inspecting?.role}
            </DialogTitle>
          </DialogHeader>
          {inspecting && (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm">
              <div>
                <div className="font-medium text-muted-foreground">Prompt</div>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                  {inspecting.prompt}
                </pre>
              </div>
              <div>
                <div className="font-medium text-muted-foreground">Response</div>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                  {inspecting.response}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
