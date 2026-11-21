import { useEffect, useState } from 'react'

import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** What each pre-milestone gate is actually asking, in words.
 *
 * The banner used to render the raw gate id and an Approve button — its entire text content was
 * "Paused at gate after_sa / Approve", which asks for a decision while withholding what the
 * decision is about. The spec (section 9) wants a gate to show the artifact that was just
 * produced; `after_milestone` already does that properly via `MilestoneGate`, and these two were
 * the ones left behind.
 */
const GATE_COPY: Record<string, { title: string; body: string }> = {
  after_ba: {
    title: 'Approve the requirements and milestone plan',
    body: 'The Business Analyst has turned your brief into numbered requirements and grouped them into demoable milestones. Approving sends this plan to the Software Architect.',
  },
  after_sa: {
    title: 'Approve the architecture',
    body: 'The Software Architect has chosen a stack and split the system into components with contracts between them. Approving starts building the first milestone, component by component.',
  },
}

type Requirement = {
  id: string
  title: string
  priority: string
  milestone_id: string
}

type Milestone = { id: string; title: string; demo_description: string }

type Architecture = {
  style?: string
  deployment?: string
  domain_entities?: string[]
  component_ids?: string[]
  contract_ids?: string[]
  decision_log?: string[]
}

/** The gate pause for every gate except `after_milestone`: what was just produced, and the one
 * decision on offer.
 *
 * The artifacts are fetched here rather than passed in because what a gate shows depends on which
 * gate it is, and nothing above this component needs to know that mapping. Each kind is stored
 * under the project's own id (see `appsmith.roles.ba` / `appsmith.roles.sa`), so the requests need
 * no lookup — a 404 simply means the artifact isn't there, which is normal for a gate reached on a
 * run whose engine was restarted, and renders as the heading alone rather than an error.
 */
export function GateBanner({
  projectId,
  gate,
  onApprove,
}: {
  projectId: string
  gate: string
  onApprove: () => Promise<void>
}) {
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [architecture, setArchitecture] = useState<Architecture | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const fetchArtifact = async (kind: string) => {
        const { data } = await api.GET('/runs/{run_id}/artifacts/{kind}/{artifact_id}', {
          params: { path: { run_id: projectId, kind, artifact_id: projectId }, query: {} },
        })
        return (data ?? null) as Record<string, unknown> | null
      }
      // All at once, not one after another: serialised, the architecture box painted a visible
      // moment before the plan box beside it, which is just a flicker users have to watch.
      // The BA's own two artifacts are worth showing at `after_sa` too — the architecture is a
      // response to them, and "does this design cover what I asked for?" is the question being
      // put to the user at either gate.
      const [architectureData, reqs, stones] = await Promise.all([
        gate === 'after_sa' ? fetchArtifact('Architecture') : Promise.resolve(null),
        fetchArtifact('RequirementsArtifact'),
        fetchArtifact('MilestonesArtifact'),
      ])
      if (cancelled) return
      setArchitecture(architectureData as Architecture | null)
      setRequirements(((reqs?.requirements as Requirement[]) ?? []).slice())
      setMilestones(((stones?.milestones as Milestone[]) ?? []).slice())
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projectId, gate])

  const copy = GATE_COPY[gate]

  return (
    <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="warning">waiting for you</Badge>
            <span className="text-sm font-medium">{copy?.title ?? `Approve gate ${gate}`}</span>
            {/* The gate's own id, kept as a quiet hint rather than as the message: it's what the
                engine logs and what `POST /runs/{id}/control` talks about, so it's worth being
                able to see — it just can't be the only thing the banner says. */}
            <span className="font-mono text-xs text-muted-foreground">{gate}</span>
          </div>
          {copy && <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>}
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onApprove()
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Approving…' : 'Approve and continue'}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {gate === 'after_sa' && architecture && (
          <section className="space-y-1 rounded border bg-background/60 p-2 text-xs">
            <h3 className="text-xs font-medium">Architecture</h3>
            <p className="text-muted-foreground">
              {architecture.style}
              {architecture.deployment ? ` · ${architecture.deployment}` : ''}
            </p>
            <p>
              <span className="text-muted-foreground">Components: </span>
              {(architecture.component_ids ?? []).join(', ') || '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Contracts: </span>
              {(architecture.contract_ids ?? []).join(', ') || 'none'}
            </p>
            {(architecture.decision_log ?? []).length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {(architecture.decision_log ?? []).map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {milestones.length > 0 && (
          <section className="space-y-1 rounded border bg-background/60 p-2 text-xs">
            <h3 className="text-xs font-medium">
              Plan · {milestones.length} milestone(s), {requirements.length} requirement(s)
            </h3>
            <ol className="space-y-1">
              {milestones.map((milestone) => (
                <li key={milestone.id}>
                  <span className="font-medium">{milestone.title}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {requirements.filter((r) => r.milestone_id === milestone.id).length} req ·{' '}
                    {milestone.demo_description}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Nothing is lost by closing this screen or stopping the engine — every graph is
        checkpointed, so the run picks up from its last completed node.
      </p>
    </div>
  )
}
