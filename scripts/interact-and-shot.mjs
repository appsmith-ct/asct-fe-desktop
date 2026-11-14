#!/usr/bin/env node
// Like `screenshot.mjs`, but clicks through one or more selectors first — for screenshotting a
// dialog, an expanded tree node, or anything else that needs a click to reach. Selectors are
// `|||`-separated and clicked in order, e.g.:
//   node scripts/interact-and-shot.mjs /projects/foo/workspace "text=backend|||text=main.py" file
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const [, , urlPath, selectors, outName] = process.argv
const baseUrl = process.env.UI_BASE_URL ?? 'http://localhost:5173'
mkdirSync('.playwright-shots', { recursive: true })

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'networkidle' })
  for (const sel of selectors.split('|||')) {
    await page.click(sel)
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: `.playwright-shots/${outName}.png`, fullPage: true })
  console.log(`wrote .playwright-shots/${outName}.png`)
} finally {
  await browser.close()
}
