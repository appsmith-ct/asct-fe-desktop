import { ActivityIcon } from 'lucide-react'
import { useState } from 'react'

import { CallInspector, type ContextWindow, type ObservedCall } from '@/components/CallInspector'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** A compact status strip that opens the full call inspector in a dialog.
 *
 * The strip is the part that earns its place on the screen all the time: how many calls, how
 * close the biggest prompt is to the context window, whether anything failed. The detail — raw
 * prompts, raw responses, pages of model reasoning — is what you go looking for occasionally and
 * want room for when you do, which is a modal rather than a third of a sidebar.
 *
 * Takes calls and a context window rather than fetching anything, so the Chat screen (intake
 * only) and the Runs screen (every role) can use the same component with different slices.
 */
export function ObservabilityDialog({
  calls,
  contextWindow,
  title = 'Model calls',
  description,
}: {
  calls: ObservedCall[]
  contextWindow?: ContextWindow
  title?: string
  description?: string
}) {
  const [open, setOpen] = useState(false)
  const failures = calls.filter((c) => c.validation_outcome !== 'success').length
  const largestPrompt = calls.reduce((most, c) => Math.max(most, c.input_tokens), 0)
  const pct =
    contextWindow && contextWindow.size > 0
      ? Math.round((largestPrompt / contextWindow.size) * 100)
      : null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 font-normal"
        onClick={() => setOpen(true)}
      >
        <ActivityIcon className="size-4 shrink-0 text-muted-foreground" />
        <span>
          {calls.length} model call{calls.length === 1 ? '' : 's'}
        </span>
        {pct !== null && (
          <span className="text-muted-foreground">
            · ~{largestPrompt.toLocaleString()}/{contextWindow!.size.toLocaleString()} ctx ({pct}%)
          </span>
        )}
        {failures > 0 && <span className="text-destructive">· {failures} failed</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="overflow-y-auto pr-1">
            <CallInspector calls={calls} contextWindow={contextWindow} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
