#!/usr/bin/env node
'use strict';

const { chromium, webkit, devices } = require('@playwright/test');

const baseUrl = process.env.A03_URL || 'http://127.0.0.1:4178/';
const cases = [
  ['chromium', chromium, {}],
  ['webkit-iphone', webkit, { ...devices['iPhone 14'] }],
];

async function verifyCase(name, browserType, contextOptions) {
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
    if (!body.includes('TEST — NO COMPLETION CREDIT')) {
      throw new Error(`${name}: completion guard missing`);
    }
    if (!body.includes('Bullard') || !body.includes('HeartMath') || !body.includes('Dispenza')) {
      throw new Error(`${name}: source map missing`);
    }

    const requiredAssets = [
      'acceptance-ambient.mp3',
      'acceptance-binaural-low-a.mp3',
      'acceptance-minimal.mp3',
      'manifest.json',
      'machine-verification.json',
    ];
    for (const file of requiredAssets) {
      const response = await page.request.get(new URL(file, baseUrl).toString());
      if (!response.ok()) throw new Error(`${name}: ${file} HTTP ${response.status()}`);
    }

    await page.getByText('Binaural Low A').click();
    await page.getByRole('button', { name: 'Begin five-minute test' }).click();
    await page.waitForFunction(() => {
      const player = document.querySelector('#player');
      return player && player.currentTime > 0;
    }, null, { timeout: 7000 });

    const src = await page.locator('#player').getAttribute('src');
    if (!src || !src.includes('acceptance-binaural-low-a.mp3')) {
      throw new Error(`${name}: selected source not loaded`);
    }
    const paused = await page.locator('#player').evaluate(player => player.paused);
    if (paused) throw new Error(`${name}: player is paused after start gesture`);
    if (consoleErrors.length) {
      throw new Error(`${name}: console errors ${consoleErrors.join(' | ')}`);
    }
    console.log(`${name}: PASS`);
  } finally {
    await browser.close();
  }
}

(async () => {
  for (const [name, browserType, contextOptions] of cases) {
    await verifyCase(name, browserType, contextOptions);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
