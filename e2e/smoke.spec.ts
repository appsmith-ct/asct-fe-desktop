import { expect, test } from '@playwright/test'

/** The M6 acceptance scenario, driven entirely through the UI against `appsmith serve
 * --fake-llm`: create a project, chat it to a frozen brief, start a run, wait for the real
 * `after_sa` gate, approve it, then confirm the Runs and Artifacts screens show real data for
 * what just happened. Whether the full component build finishes successfully isn't asserted —
 * "run inspection" works the same either way (see the engine's `ScenarioFakeChatModel` docstring
 * and the M6 plan doc's scope note) — but on this exact scripted scenario it reliably does.
 *
 * Extended for M7's own acceptance half: after the SA gate, the run reaches the *milestone demo*
 * gate, where the UI offers a change request as well as approval. The scripted fake model returns
 * the same content on every call, so this can't assert that the architecture *changed* (that's
 * `tests/test_milestone_loop.py`, engine-side, where a genuinely different second pass is
 * scripted) — what it proves is that the loop's pause is reachable and the change request
 * actually lands through the UI.
 */
test('chat, gate approval and run inspection', async ({ page }, testInfo) => {
  // A unique name every run, under a scratch workspace path rather than the engine's default
  // projects directory — `appsmith serve`'s settings database is the real per-user one (not
  // reset between test runs, since profiles/role mappings are harmless to reuse), but a project
  // directory left over from a *previous* run would already be mid-conversation or further along,
  // breaking this test's assumption that it starts from a blank slate.
  const projectName = `smoke-test-${Date.now()}`
  // The engine derives the project id from the *last path segment* of `workspace_path` when one
  // is given (ignoring the `name` field entirely in that case) — so the uniqueness has to live
  // here, not just in `projectName`, or every run would collide on a literal "workspace" id.
  const workspacePath = testInfo.outputPath(projectName)

  await page.goto('/projects')

  // -- Projects: create one --------------------------------------------------------------
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByPlaceholder('A URL shortener').fill(projectName)
  await page.getByPlaceholder(/leave blank to use the default/).fill(workspacePath)
  await page.getByRole('button', { name: 'Create' }).click()

  await page.waitForURL(/\/projects\/[^/]+\/chat/)
  const projectId = page.url().match(/\/projects\/([^/]+)\/chat/)?.[1]
  expect(projectId).toBeTruthy()

  // -- Chat: drive the intake conversation to a frozen brief -----------------------------
  await expect(page.getByText('What would you like to build?')).toBeVisible()
  await page.getByPlaceholder('Type your answer…').fill('a to-do list app')
  await page.getByPlaceholder('Type your answer…').press('Enter')

  // `exact: true` matters here, not just style: the Observability panel (below the chat) now
  // shows the raw prompt/response for this same turn, which contains this question text and
  // the word "goal" as substrings -- a loose getByText would match both and fail as ambiguous.
  await expect(
    page.getByText('Anything else before we start building?', { exact: true }),
  ).toBeVisible()
  await page.getByPlaceholder('Type your answer…').fill('nothing else')
  await page.getByPlaceholder('Type your answer…').press('Enter')

  await expect(page.getByText('Brief is ready to build.')).toBeVisible()
  await expect(page.getByText('Goal', { exact: true })).toBeVisible()

  // -- Start the run and reach the after_sa gate ------------------------------------------
  await page.getByRole('button', { name: 'Start build' }).click()
  await page.waitForURL(/\/pipeline/)

  // ISSUE-9: the gate names what it's asking for and shows what was just produced, instead of
  // the raw gate id and a bare Approve button ("Paused at gate after_sa / Approve" was the
  // banner's entire text content). The gate id is still on screen, as a hint beside the title.
  await expect(page.getByText('Approve the architecture')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('after_sa')).toBeVisible()
  await expect(page.getByText(/Components:/)).toBeVisible()
  // Both halves of what's being approved: the architecture itself, and the BA plan it answers.
  await expect(page.getByText(/milestone\(s\),/)).toBeVisible()

  // -- Gate approval -----------------------------------------------------------------------
  await page.getByRole('button', { name: 'Approve and continue' }).click()
  await expect(page.getByText('Approve the architecture')).not.toBeVisible()

  // ISSUE-7: `build_milestone` opens into the steps it actually is — the per-component chain
  // (Tech Lead plan, scaffold, tasks, e2e, handoff) and the milestone-level steps after it.
  // Published by the engine from inside the milestone flow, which used to publish nothing.
  await expect(page.getByText('Tech Lead plan')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Integrate', { exact: true })).toBeVisible()
  // Worth asserting *visibility* rather than mere presence: React Flow leaves a node
  // `visibility: hidden` until it has measured it, and hands rebuilt nodes back to the measurer
  // — so a `nodes` array recreated on every render (a 3s status poll makes that often) leaves
  // the graph invisible in beats. This assertion is what caught that.

  // -- M7: the milestone demo pause, with its change-request control ----------------------
  // A different control from the plain gate banner above, deliberately (see MilestoneGate):
  // this gate is a conversation, not a yes/no.
  // Waits for the gate's own distinctive sentence, not the "milestone demo" badge: `getByText`
  // with a string is a case-insensitive *substring* match, so "milestone demo" also matches the
  // React Flow node labelled "Milestone demo" and would pass the instant the graph renders,
  // long before the milestone has actually been built.
  await expect(page.getByText('This milestone is built.')).toBeVisible({ timeout: 150_000 })
  await expect(page.getByText('milestone demo', { exact: true })).toBeVisible()

  // The milestone rail shows the BA's plan and which milestone is signed off.
  await expect(page.getByText('Milestones', { exact: true })).toBeVisible()

  await page.getByPlaceholder(/Want something changed/).fill('it should also support refunds')
  await page.getByRole('button', { name: 'Request change' }).click()
  // Recorded, listed, and the run is still parked — submitting doesn't resume it, so a user can
  // raise several before approving.
  await expect(page.getByText('CR-001')).toBeVisible()
  // Scoped to the list item on purpose. `getByText` also matches the textarea's own value, so
  // the unscoped version was really asserting two things at once — "it's in the list" and "the
  // draft box has been cleared" — and failed as ambiguous whenever the clear lagged the list.
  await expect(
    page.getByRole('listitem').filter({ hasText: 'it should also support refunds' }),
  ).toBeVisible()
  await expect(page.getByPlaceholder(/Want something changed/)).toHaveValue('')
  await expect(page.getByRole('button', { name: /Approve and apply 1 change/ })).toBeVisible()

  await page.getByRole('button', { name: /Approve and apply 1 change/ }).click()

  // -- Run inspection: give the (real, subprocess-backed) component build a while to finish,
  // then confirm the Runs and Artifacts screens show real data regardless of its outcome.
  await page.waitForTimeout(8_000)

  await page.getByRole('link', { name: 'Runs & metrics' }).click()
  await expect(page.getByText(/\d+ call\(s\)/)).toBeVisible()
  await expect(page.getByRole('cell', { name: 'ba', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'sa', exact: true }).first()).toBeVisible()

  await page.getByRole('link', { name: 'Artifacts' }).click()
  await expect(page.getByText('RequirementsArtifact')).toBeVisible()
  await expect(page.getByText('Architecture')).toBeVisible()
  await page.getByText('Architecture').click()
  await expect(page.getByText(`"id": "${projectId}"`)).toBeVisible()

  // M7's artifacts reach the screen too: the milestone demo record, and the change request the
  // user raised, both stored as real versioned artifacts rather than run-local state.
  await expect(page.getByText('MilestoneDemo')).toBeVisible()
  await expect(page.getByText('ChangeRequest')).toBeVisible()
})

/** ISSUE-1: the chat transcript has to survive a reload and a trip to another screen.
 *
 * It was never actually lost — the engine checkpoints the intake conversation per project — but
 * the transcript lived only in React state, so a refresh showed an empty chat above a
 * conversation that was entirely intact. Separate from the main smoke test because it needs its
 * own project at a half-finished point, before the brief freezes.
 */
test('the chat transcript survives a reload and navigation', async ({ page }, testInfo) => {
  const projectName = `chat-persist-${Date.now()}`
  const workspacePath = testInfo.outputPath(projectName)

  await page.goto('/projects')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByPlaceholder('A URL shortener').fill(projectName)
  await page.getByPlaceholder(/leave blank to use the default/).fill(workspacePath)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/projects\/[^/]+\/chat/)

  await expect(page.getByText('What would you like to build?')).toBeVisible()
  await page.getByPlaceholder('Type your answer…').fill('a to-do list app')
  await page.getByPlaceholder('Type your answer…').press('Enter')

  // One full turn: the user's own message and the agent's reply are both on screen.
  await expect(page.getByText('a to-do list app', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Anything else before we start building?', { exact: true }),
  ).toBeVisible()

  // --- a reload -------------------------------------------------------------------------
  await page.reload()
  await expect(page.getByText('a to-do list app', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Anything else before we start building?', { exact: true }),
  ).toBeVisible()

  // --- and a trip to another screen and back --------------------------------------------
  await page.getByRole('link', { name: 'Artifacts' }).click()
  await page.waitForURL(/\/artifacts/)
  await page.getByRole('link', { name: 'Chat' }).click()
  await page.waitForURL(/\/chat/)
  await expect(page.getByText('a to-do list app', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Anything else before we start building?', { exact: true }),
  ).toBeVisible()

  // The conversation is genuinely resumed, not restarted: answering carries on from where it
  // left off, with the earlier turns still above the new one.
  //
  // Deliberately not asserting that this reaches "Brief is ready to build." — ScenarioFakeChatModel
  // decides readiness from a per-instance call counter, and the engine builds one chat model per
  // WS connection, so a reload resets that counter and the fake asks again. The engine's own
  // state is resumed correctly (the replayed transcript above is proof); it's the scripted fake
  // that can't model "second turn" across a reconnect.
  await page.getByPlaceholder('Type your answer…').fill('nothing else')
  await page.getByPlaceholder('Type your answer…').press('Enter')
  await expect(page.getByText('nothing else', { exact: true })).toBeVisible()
  await expect(page.getByText('a to-do list app', { exact: true })).toBeVisible()
})
