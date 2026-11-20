import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export interface ChangeRequestSummary {
  id: string
  version: number
  text: string
  raised_at_milestone_id: string
  status: 'open' | 'applied'
  created_at: string
}

/** The milestone demo pause (spec section 5.5): the one point in a run where the user can ask
 * for something different.
 *
 * Deliberately a separate control from the plain gate banner. Every other gate is a yes/no —
 * approve and the run continues as planned — but this one is a conversation: the user has just
 * seen working software and may want it changed, and raising a change request has to be at least
 * as prominent as approving. Several can be raised before approving; each is stored immediately
 * and all of them are applied together when the gate is approved, which is why submitting one
 * doesn't resume the run.
 */
export function MilestoneGate({
  changeRequests,
  onSubmitChangeRequest,
  onApprove,
}: {
  changeRequests: ChangeRequestSummary[]
  onSubmitChangeRequest: (text: string) => Promise<void>
  onApprove: () => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const open = changeRequests.filter((r) => r.status === 'open')

  async function submit() {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      await onSubmitChangeRequest(draft.trim())
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3">
      <div className="flex items-center gap-2">
        <Badge variant="warning">milestone demo</Badge>
        <span className="text-sm">
          This milestone is built. Approve it to continue, or ask for a change first.
        </span>
      </div>

      {open.length > 0 && (
        <ul className="space-y-1">
          {open.map((request) => (
            <li key={request.id} className="rounded border bg-background/60 p-2 text-xs">
              <span className="font-mono text-muted-foreground">{request.id}</span> {request.text}
            </li>
          ))}
        </ul>
      )}

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Want something changed? Describe it in your own words — the BA will re-plan and the architect will work out what it affects."
        rows={2}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={!draft.trim() || busy} onClick={submit}>
          Request change
        </Button>
        <Button size="sm" disabled={busy} onClick={onApprove}>
          {open.length > 0 ? `Approve and apply ${open.length} change(s)` : 'Approve milestone'}
        </Button>
      </div>
    </div>
  )
}
