#!/usr/bin/env node
import fs from 'node:fs';
import { chromium, webkit, devices } from '@playwright/test';

const baseUrl = process.env.A05_URL || 'http://127.0.0.1:4179/';
const outputPath = process.env.A05_BROWSER_RECORD || 'a05-output/browser-verification.json';
const cases = [
  ['chromium', chromium, {}],
  ['webkit-iphone', webkit, { ...devices['iPhone 14'] }],
];

const results = {};
for (const [name, browserType, contextOptions] of cases) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const body = await page.textContent('body');
    for (const marker of ['VOICE TEST ONLY', 'NO MEDITATION', 'NO COMPLETION CREDIT', 'Sample A', 'Sample B', 'Sample C', 'Best: A, B, C, or NONE']) {
      if (!body.includes(marker)) throw new Error(`${name}: page marker missing: ${marker}`);
    }
    for (const file of ['sample-a.mp3', 'sample-b.mp3', 'sample-c.mp3', 'manifest.json', 'machine-verification.json', 'critical-asr.json']) {
      const response = await page.request.get(new URL(file, baseUrl).toString());
      if (!response.ok()) throw new Error(`${name}: ${file} HTTP ${response.status()}`);
    }
    await page.getByText('Sample B', { exact: false }).click();
    await page.getByRole('button', { name: 'Play selected sample' }).click();
    await page.waitForFunction(() => {
      const player = document.querySelector('#player');
      return player && player.currentTime > 0;
    }, null, { timeout: 10000 });
    let src = await page.locator('#player').getAttribute('src');
    if (!src || !src.includes('sample-b.mp3')) throw new Error(`${name}: Sample B source not loaded`);
    await page.getByText('Sample C', { exact: false }).click();
    await page.getByRole('button', { name: 'Play selected sample' }).click();
    await page.waitForFunction(() => {
      const player = document.querySelector('#player');
      return player && player.currentTime > 0;
    }, null, { timeout: 10000 });
    src = await page.locator('#player').getAttribute('src');
    if (!src || !src.includes('sample-c.mp3')) throw new Error(`${name}: Sample C source not loaded`);
    if (consoleErrors.length) throw new Error(`${name}: console errors: ${consoleErrors.join(' | ')}`);
    results[name] = { result: 'PASS', selected_sources: ['sample-b.mp3', 'sample-c.mp3'] };
    console.log(`${name}: PASS`);
  } finally {
    await browser.close();
  }
}
fs.writeFileSync(outputPath, JSON.stringify({
  schema: 'qctp-a05-browser-verification-v1',
  result: 'PASS',
  base_url: baseUrl,
  cases: results,
  naturalness_gate: 'OPEN_PHYSICAL_USER_SELECTION',
  release_authority: 'ZERO_RELEASE',
}, null, 2) + '\n');
