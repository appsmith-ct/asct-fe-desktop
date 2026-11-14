#!/usr/bin/env node
// Ad hoc dev-loop screenshot tool (not the formal Playwright smoke test under e2e/) — launches
// Chromium, navigates to a path on the running Vite dev server, screenshots it, and exits. Used
// to get visual feedback while building a screen: `node scripts/screenshot.mjs /projects/foo/chat
// chat`, then read `.playwright-shots/chat.png` back.
//
// Assumes `pnpm dev` (and, for anything that calls the engine, `appsmith serve --fake-llm`) are
// already running — this script does not start them itself, unlike `playwright.config.ts`'s
// `webServer` entries for the formal test suite.

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [, , urlPath = '/', name = 'screenshot'] = process.argv
// `localhost`, not `127.0.0.1`: Vite's dev server binds to the IPv6 loopback under the
// `localhost` hostname by default on this machine, not the IPv4 literal — `127.0.0.1` alone
// connection-refuses even though the server is genuinely listening.
const baseUrl = process.env.UI_BASE_URL ?? 'http://localhost:5173'
const outDir = '.playwright-shots'

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300) // let any just-finished fetch paint before capturing
  const outPath = `${outDir}/${name}.png`
  await page.screenshot({ path: outPath, fullPage: true })
  console.log(`wrote ${outPath}`)
} finally {
  await browser.close()
}
