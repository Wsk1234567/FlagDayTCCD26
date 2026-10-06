import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/wskan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const initial = JSON.parse(await readFile(new URL('../data/event.json', import.meta.url), 'utf8'));
await mkdir(new URL('./screenshots/', import.meta.url), { recursive: true });
async function ready() { await page.waitForFunction(() => document.querySelector('#stats').getAttribute('aria-busy') === 'false'); }
async function text(id) { return await page.locator(`#${id}`).innerText(); }
async function fixture(data) {
  await page.unroute('**/data/event.json');
  await page.route('**/data/event.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  await page.goto('http://127.0.0.1:8080/');
  await ready();
}
try {
  await page.goto('http://127.0.0.1:8080/'); await ready();
  assert.equal(await text('stat-sold'), '0 张');
  assert.equal(await text('stat-value'), 'RM 0');
  assert.equal(await page.locator('#leaderboard-body tr').count(), 7);
  assert.equal(await page.locator('.squad-card').count(), 8);
  assert.equal(await page.locator('.rules-list > ol > li').count(), 9);
  assert.equal(await page.locator('.podium').count(), 0);
  assert.match(await text('deadline'), /待公布/);
  await page.screenshot({ path: fileURLToPath(new URL('./screenshots/desktop.png', import.meta.url)), fullPage: true });
  for (const width of [320, 390, 560, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.width, `Overflow at ${width}: ${JSON.stringify(dimensions)}`);
    await page.locator('.squad-card').first().locator('summary').click();
    assert.equal(await page.locator('.squad-card').first().getAttribute('open'), '');
    await page.locator('.squad-card').first().locator('summary').click();
    if (width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: fileURLToPath(new URL('./screenshots/mobile.png', import.meta.url)), fullPage: true });
      await page.screenshot({ path: fileURLToPath(new URL('./screenshots/mobile-top.png', import.meta.url)) });
    }
  }
  console.log('PASS: initial zero data, 9 rules, 7 rankings, 8 squad cards, 6 viewport widths and details interaction');

  const data = structuredClone(initial);
  data.updatedAt = '2026-10-06T18:00:00+08:00';
  data.deadline = '2026-10-29T17:00:00+08:00';
  Object.assign(data.groups[0], { verifiedSold: 50, treasuryReceived: 250, handoffComplete: true });
  Object.assign(data.groups[1], { verifiedSold: 50, treasuryReceived: 100 });
  Object.assign(data.groups[2], { verifiedSold: 30, treasuryReceived: 0 });
  Object.assign(data.groups[7], { verifiedSold: 100, treasuryReceived: 500, handoffComplete: true });
  await fixture(data);
  assert.equal(await text('stat-sold'), '230 张');
  assert.equal(await text('stat-value'), 'RM 1,150');
  assert.equal(await text('stat-received'), 'RM 850');
  assert.equal(await text('stat-milestones'), '2 站');
  assert.equal(await text('mission-percent'), '30%');
  assert.equal(await text('f5-sold'), '100');
  assert.ok(!(await text('leaderboard-body')).includes('F5'));
  assert.deepEqual(await page.locator('#leaderboard-body .rank-badge').allTextContents(), ['01', '01', '03', '04', '04', '04', '04']);
  assert.equal(await page.locator('.champion-label').count(), 0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: fileURLToPath(new URL('./screenshots/populated.png', import.meta.url)), fullPage: true });
  console.log('PASS: populated money totals, tie ranks, milestones, F5 exclusion and achievements');

  data.status = 'final';
  data.finalSnapshot = { confirmedAt: data.updatedAt, deadline: data.deadline, groups: structuredClone(data.groups) };
  data.groups[6].verifiedSold = 999;
  await fixture(data);
  assert.equal(await text('stat-sold'), '230 张');
  assert.equal(await page.locator('.champion-label').count(), 2);
  assert.match(await text('event-state'), /最终成绩已锁定/);
  console.log('PASS: locked final snapshot and tied champions');

  await page.unroute('**/data/event.json');
  await page.route('**/data/event.json', route => route.fulfill({ status: 404, body: 'Missing' }));
  await page.reload(); await ready();
  assert.ok(await page.locator('#load-error').isVisible());
  assert.equal(await text('stat-sold'), '—');
  assert.match(await text('error-message'), /404/);
  assert.equal(await page.locator('.rules-list > ol > li').count(), 9);
  await page.unroute('**/data/event.json');
  await page.route('**/data/event.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(initial) }));
  await page.locator('#retry').click(); await ready();
  assert.equal(await text('stat-sold'), '0 张');
  assert.ok(await page.locator('#load-error').isHidden());
  console.log('PASS: HTTP failure shows no invented zeros; retry recovers');

  const invalid = structuredClone(initial); invalid.groups.pop();
  await fixture(invalid);
  assert.equal(await text('stat-value'), '—');
  assert.ok(await page.locator('#load-error').isVisible());
  await page.unroute('**/data/event.json');
  await page.route('**/data/event.json', route => route.fulfill({ contentType: 'application/json', body: '{broken' }));
  await page.reload(); await ready();
  assert.match(await text('error-message'), /格式有误/);
  console.log('PASS: invalid/incomplete JSON is rejected');

  const named = structuredClone(initial);
  named.groups[0].name = '<img src=x onerror=alert(1)>';
  await fixture(named);
  assert.equal(await page.locator('#leaderboard-body img').count(), 0);
  assert.ok((await text('leaderboard-body')).includes(named.groups[0].name));
  console.log('PASS: team names rendered as text, not HTML');
  const longNames = structuredClone(initial);
  longNames.groups.forEach(g => { g.name = 'ABCDEFGHIJ'.repeat(4); g.verifiedSold = 1000000; });
  longNames.updatedAt = '2026-10-06T18:00:00+08:00';
  await page.setViewportSize({ width: 390, height: 900 });
  await fixture(longNames);
  const largeDimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(largeDimensions.document <= largeDimensions.width, `Long names overflow: ${JSON.stringify(largeDimensions)}`);
  assert.ok(await page.locator('.table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth), 'Long names must not be clipped inside leaderboard');
  assert.ok(await page.locator('#mission-total').evaluate(el => el.getBoundingClientRect().width <= el.parentElement.getBoundingClientRect().width), 'Large total must fit inside mission ring');
  console.log('PASS: maximum-length team names and large totals fit mobile width');
  await page.unroute('**/data/event.json');
  await page.goto('http://127.0.0.1:8080/'); await ready();
  assert.deepEqual(errors, []);
  console.log('PASS: no JavaScript runtime errors');
} finally {
  await browser.close();
}
