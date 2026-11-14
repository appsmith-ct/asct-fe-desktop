import {
  FolderKanbanIcon,
  MessageSquareIcon,
  SettingsIcon,
  ShapesIcon,
  TableIcon,
  WaypointsIcon,
  FolderTreeIcon,
} from 'lucide-react'
import { NavLink, Navigate, Route, Routes, useMatch } from 'react-router'

import { cn } from '@/lib/utils'
import ArtifactsPage from '@/pages/Artifacts'
import ChatPage from '@/pages/Chat'
import PipelinePage from '@/pages/Pipeline'
import ProjectsPage from '@/pages/Projects'
import RunsPage from '@/pages/Runs'
import SettingsPage from '@/pages/Settings'
import WorkspacePage from '@/pages/Workspace'

const PROJECT_NAV = [
  { to: 'chat', label: 'Chat', icon: MessageSquareIcon },
  { to: 'pipeline', label: 'Pipeline', icon: WaypointsIcon },
  { to: 'artifacts', label: 'Artifacts', icon: ShapesIcon },
  { to: 'workspace', label: 'Workspace', icon: FolderTreeIcon },
  { to: 'runs', label: 'Runs & metrics', icon: TableIcon },
]

function Sidebar() {
  // `useParams` only sees params from routes it's rendered *inside* — `Sidebar` is a sibling of
  // `<Routes>`, not nested under a matched route, so it can't use that here. `useMatch` works
  // from anywhere: it matches the pattern against the current location directly.
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-card p-3">
      <div className="mb-2 px-2 text-sm font-semibold tracking-tight">Appsmith-CT</div>
      <SidebarLink to="/projects" icon={FolderKanbanIcon} label="Projects" end />
      {projectId && (
        <div className="mt-2 flex flex-col gap-1 border-t pt-2">
          <div className="truncate px-2 text-xs font-medium text-muted-foreground">
            {projectId}
          </div>
          {PROJECT_NAV.map((item) => (
            <SidebarLink
              key={item.to}
              to={`/projects/${projectId}/${item.to}`}
              icon={item.icon}
              label={item.label}
            />
          ))}
        </div>
      )}
      <div className="mt-auto border-t pt-2">
        <SidebarLink to="/settings" icon={SettingsIcon} label="Settings" />
      </div>
    </aside>
  )
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
          isActive
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId/chat" element={<ChatPage />} />
          <Route path="/projects/:projectId/pipeline" element={<PipelinePage />} />
          <Route path="/projects/:projectId/artifacts" element={<ArtifactsPage />} />
          <Route path="/projects/:projectId/workspace" element={<WorkspacePage />} />
          <Route path="/projects/:projectId/runs" element={<RunsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
