import { defineConfig } from '@playwright/test'

/** The formal acceptance smoke test (spec section 10, M6: "a Playwright smoke test drives chat,
 * gate approval and run inspection against a FakeLLM engine"). Starts both halves itself — the
 * engine with `--fake-llm` (ScenarioFakeChatModel, not a real endpoint) and the UI dev server —
 * so `npx playwright test` is the whole story, no manual setup required.
 */
export default defineConfig({
  testDir: './e2e',
  // M7 added a second gate to the scenario, and reaching it means a real component build
  // (subprocess scaffolding, ruff/mypy/pytest gates) has to finish first — that's the bulk of
  // the budget here, not anything the UI does.
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // `--db-path` isolated under `test-results/` (gitignored, Playwright's own scratch space)
      // — without it, every run registers its timestamped project in the *real* per-user
      // settings database, which otherwise just accumulates a `smoke-test-<timestamp>` entry
      // forever.
      command:
        'uv run appsmith serve --fake-llm --port 8010 --db-path test-results/e2e-settings.sqlite3',
      cwd: '../asct-be-engine',
      url: 'http://127.0.0.1:8010/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm exec vite --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_ENGINE_URL: 'http://127.0.0.1:8010' },
    },
  ],
})
