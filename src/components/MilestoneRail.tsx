import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export interface MilestoneProgress {
  index: number
  id: string
  title: string
  demo_description: string
  requirement_ids: string[]
  component_ids: string[]
  status: 'pending' | 'ready' | 'failed'
  unresolved_bug_count: number
  summary: string
}

/** The project's milestones in BA order, with where the run has got to.
 *
 * This is the one view that makes the milestone *loop* visible. The React Flow graph beside it
 * shows the pipeline's shape (which it has to, since that's the spec's screen), but a cyclic
 * graph can't show "milestone 2 of 3, and milestone 1 is signed off" — that's a position in a
 * sequence, not a position in a graph.
 *
 * Progress comes from stored MilestoneReports on the engine side, not from the live event
 * stream, so it survives a page refresh and an engine restart alike.
 */
export function MilestoneRail({
  milestones,
  currentIndex,
}: {
  milestones: MilestoneProgress[]
  currentIndex: number
}) {
  if (milestones.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No milestones yet — the BA plans them from the frozen brief.
      </p>
    )
  }

  return (
    <ol className="space-y-2">
      {milestones.map((milestone) => {
        const isCurrent = milestone.index === currentIndex && milestone.status === 'pending'
        return (
          <li
            key={milestone.id}
            className={
              isCurrent
                ? 'rounded-md border border-primary/50 bg-primary/5 p-2'
                : 'rounded-md border p-2'
            }
          >
            <div className="flex items-center gap-2">
              <StatusIcon status={milestone.status} />
              <span className="text-sm font-medium">{milestone.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{milestone.id}</span>
              <span className="ml-auto flex items-center gap-1">
                {milestone.unresolved_bug_count > 0 && (
                  <Badge variant="destructive">{milestone.unresolved_bug_count} bug(s)</Badge>
                )}
                <Badge variant={badgeVariant(milestone.status)}>{milestone.status}</Badge>
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{milestone.demo_description}</p>
            {milestone.component_ids.length > 0 && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {milestone.component_ids.join(' · ')}
              </p>
            )}
            {milestone.summary && (
              <p className="mt-1 text-xs text-muted-foreground">{milestone.summary}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function StatusIcon({ status }: { status: MilestoneProgress['status'] }) {
  if (status === 'ready') return <CheckCircle2Icon className="size-4 shrink-0 text-success" />
  if (status === 'failed') return <XCircleIcon className="size-4 shrink-0 text-destructive" />
  return <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" />
}

function badgeVariant(status: MilestoneProgress['status']) {
  if (status === 'ready') return 'success' as const
  if (status === 'failed') return 'destructive' as const
  return 'outline' as const
}
