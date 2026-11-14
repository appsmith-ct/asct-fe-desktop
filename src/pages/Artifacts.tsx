import { useEffect, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type ArtifactSummary = {
  kind: string
  id: string
  version: number
  produced_by: string
  created_at: string
}

export default function ArtifactsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([])
  const [selected, setSelected] = useState<ArtifactSummary | null>(null)
  const [versions, setVersions] = useState<number[]>([])
  const [version, setVersion] = useState<number | null>(null)
  const [content, setContent] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!projectId) return
    void api
      .GET('/runs/{run_id}/artifacts', { params: { path: { run_id: projectId } } })
      .then(({ data }) => setArtifacts(data ?? []))
  }, [projectId])

  async function select(artifact: ArtifactSummary) {
    setSelected(artifact)
    if (!projectId) return
    const { data } = await api.GET('/runs/{run_id}/artifacts/{kind}/{artifact_id}/versions', {
      params: { path: { run_id: projectId, kind: artifact.kind, artifact_id: artifact.id } },
    })
    setVersions(data?.versions ?? [])
    setVersion(artifact.version)
    await loadContent(artifact.kind, artifact.id)
  }

  async function loadContent(kind: string, id: string) {
    if (!projectId) return
    const { data } = await api.GET('/runs/{run_id}/artifacts/{kind}/{artifact_id}', {
      params: { path: { run_id: projectId, kind, artifact_id: id } },
    })
    setContent((data as Record<string, unknown>) ?? null)
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-4 p-6">
      <Card className="w-72 shrink-0 overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-sm">Artifacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {artifacts.length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing produced yet.</p>
          )}
          {artifacts.map((artifact) => (
            <button
              key={`${artifact.kind}/${artifact.id}`}
              onClick={() => void select(artifact)}
              className={`flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                selected?.kind === artifact.kind && selected.id === artifact.id ? 'bg-accent' : ''
              }`}
            >
              <span className="font-mono text-xs text-muted-foreground">{artifact.kind}</span>
              <span className="flex items-center gap-2">
                {artifact.id}
                <Badge variant="outline">v{artifact.version}</Badge>
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="flex-1 overflow-y-auto">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {selected ? `${selected.kind} / ${selected.id}` : 'Select an artifact'}
          </CardTitle>
          {selected && versions.length > 1 && (
            <Select
              value={String(version)}
              onValueChange={(v) => {
                setVersion(Number(v))
                void loadContent(selected.kind, selected.id)
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v} value={String(v)}>
                    version {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {content ? (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {JSON.stringify(content, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              No version history/diffing yet — raw JSON per version for now (see the M6 plan
              doc's scope note).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
