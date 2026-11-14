import { ChevronRightIcon, FileIcon, FolderIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router'

import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type FileEntry = { path: string; is_dir: boolean }

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)

  async function openFile(path: string) {
    if (!projectId) return
    setSelectedPath(path)
    const { data } = await api.GET('/projects/{project_id}/file-content', {
      params: { path: { project_id: projectId }, query: { path } },
    })
    setContent((data as { content: string } | undefined)?.content ?? '')
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-4 p-6">
      <Card className="w-72 shrink-0 overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-sm">Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          {projectId && (
            <FileTree
              projectId={projectId}
              dirPath=""
              depth={0}
              selectedPath={selectedPath}
              onSelectFile={openFile}
            />
          )}
        </CardContent>
      </Card>

      <Card className="flex-1 overflow-y-auto">
        <CardHeader>
          <CardTitle className="font-mono text-sm">{selectedPath ?? 'No file selected'}</CardTitle>
        </CardHeader>
        <CardContent>
          {content !== null ? (
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
              <code>{content || '(empty file)'}</code>
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pick a file from the tree. No lint/test results or per-task diffs here yet (see the
              M6 plan doc's scope note) — just the file tree and its content, read-only.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FileTree({
  projectId,
  dirPath,
  depth,
  selectedPath,
  onSelectFile,
}: {
  projectId: string
  dirPath: string
  depth: number
  selectedPath: string | null
  onSelectFile: (path: string) => void
}) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void api
      .GET('/projects/{project_id}/files', {
        params: { path: { project_id: projectId }, query: { path: dirPath } },
      })
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoaded(true)
      })
  }, [projectId, dirPath])

  if (!loaded) return null
  if (entries.length === 0 && depth === 0) {
    return <p className="text-xs text-muted-foreground">Nothing built yet.</p>
  }

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => {
        const name = entry.path.split('/').pop() ?? entry.path
        const isExpanded = expanded.has(entry.path)
        return (
          <div key={entry.path}>
            <button
              onClick={() => {
                if (entry.is_dir) {
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(entry.path)) next.delete(entry.path)
                    else next.add(entry.path)
                    return next
                  })
                } else {
                  onSelectFile(entry.path)
                }
              }}
              style={{ paddingLeft: `${depth * 14 + 4}px` }}
              className={cn(
                'flex w-full items-center gap-1 rounded-sm py-0.5 text-left text-sm hover:bg-accent',
                selectedPath === entry.path && 'bg-accent',
              )}
            >
              {entry.is_dir ? (
                <ChevronRightIcon
                  className={cn('size-3.5 shrink-0 transition-transform', isExpanded && 'rotate-90')}
                />
              ) : (
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              {entry.is_dir && <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="truncate">{name}</span>
            </button>
            {entry.is_dir && isExpanded && (
              <FileTree
                projectId={projectId}
                dirPath={entry.path}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
