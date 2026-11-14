import { expect, test } from '@playwright/test'

/** The M6 acceptance scenario, driven entirely through the UI against `appsmith serve
 * --fake-llm`: create a project, chat it to a frozen brief, start a run, wait for the real
 * `after_sa` gate, approve it, then confirm the Runs and Artifacts screens show real data for
 * what just happened. Whether the full component build finishes successfully isn't asserted —
 * "run inspection" works the same either way (see the engine's `ScenarioFakeChatModel` docstring
 * and the M6 plan doc's scope note) — but on this exact scripted scenario it reliably does.
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

  await expect(page.getByText('Anything else before we start building?')).toBeVisible()
  await page.getByPlaceholder('Type your answer…').fill('nothing else')
  await page.getByPlaceholder('Type your answer…').press('Enter')

  await expect(page.getByText('Brief is ready to build.')).toBeVisible()
  await expect(page.getByText('Goal')).toBeVisible()

  // -- Start the run and reach the after_sa gate ------------------------------------------
  await page.getByRole('button', { name: 'Start build' }).click()
  await page.waitForURL(/\/pipeline/)

  await expect(page.getByText('Paused at gate')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('after_sa')).toBeVisible()

  // -- Gate approval -----------------------------------------------------------------------
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Paused at gate')).not.toBeVisible()

  // -- Run inspection: give the (real, subprocess-backed) component build a while to finish,
  // then confirm the Runs and Artifacts screens show real data regardless of its outcome.
  await page.waitForTimeout(5_000)

  await page.getByRole('link', { name: 'Runs & metrics' }).click()
  await expect(page.getByText(/\d+ call\(s\)/)).toBeVisible()
  await expect(page.getByRole('cell', { name: 'ba', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'sa', exact: true }).first()).toBeVisible()

  await page.getByRole('link', { name: 'Artifacts' }).click()
  await expect(page.getByText('RequirementsArtifact')).toBeVisible()
  await expect(page.getByText('Architecture')).toBeVisible()
  await page.getByText('Architecture').click()
  await expect(page.getByText(`"id": "${projectId}"`)).toBeVisible()
})
