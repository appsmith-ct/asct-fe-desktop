import { FolderPlusIcon, MessageSquareIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type ProjectSummary = {
  id: string
  name: string
  root_path: string
  ready_to_build: boolean
  brief_goal: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  async function reload() {
    const { data } = await api.GET('/projects')
    setProjects(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function createProject(name: string, workspacePath: string) {
    const { data } = await api.POST('/projects', {
      body: { name, workspace_path: workspacePath || null },
    })
    setOpen(false)
    await reload()
    if (data) navigate(`/projects/${data.id}/chat`)
  }

  async function deleteProject(id: string) {
    await api.DELETE('/projects/{project_id}', { params: { path: { project_id: id } } })
    await reload()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Create a project, pick a workspace folder, or open one you already started.
          </p>
        </div>
        <NewProjectDialog open={open} onOpenChange={setOpen} onCreate={createProject} />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FolderPlusIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No projects yet — create one to start the intake conversation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {project.id}
                    {project.ready_to_build ? (
                      <Badge variant="success">ready to build</Badge>
                    ) : (
                      <Badge variant="secondary">chat in progress</Badge>
                    )}
                  </CardTitle>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{project.root_path}</p>
                  {project.brief_goal && (
                    <p className="mt-1 text-sm text-muted-foreground">{project.brief_goal}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/projects/${project.id}/chat`)}
                  >
                    <MessageSquareIcon className="size-4" /> Open
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteProject(project.id)}>
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, workspacePath: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [workspacePath, setWorkspacePath] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FolderPlusIcon className="size-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A URL shortener"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>Workspace folder (optional)</Label>
            <Input
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder="leave blank to use the default workspace directory"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!name}
            onClick={() => {
              void onCreate(name, workspacePath)
              setName('')
              setWorkspacePath('')
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
