import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Run against the independent dual-arm Vite entry (default port 5186).
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
try {
  for (const width of [1600, 1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(process.env.DUALARM_PREVIEW_URL || 'http://127.0.0.1:5186/?mode=demo');
    await page.evaluate(() => document.fonts.ready);
    for (const [side, name] of [['left', '左臂'], ['right', '右臂']]) {
      const summary = page.locator(`.arm-summary.${side}`);
      if (side === 'right') {
        await summary.getByRole('button', { name: '申请控制权', exact: true }).click();
        await summary.getByRole('button', { name: '使能', exact: true }).click();
      }
      // Clear the notice, exercising the first empty -> nonempty transition too.
      await summary.locator('.arm-select').click();
      const state = summary.locator('.machine-state');
      for (const joint of [1, 7]) {
        const button = page.getByRole('button', { name: `${name} J${joint} 正向点动`, exact: true });
        const row = button.locator('..');
        const other = page.locator(`tr[data-arm=${side === 'left' ? 'right' : 'left'}]`);
        const otherBefore = await other.innerText();
        await button.scrollIntoViewIfNeeded();
        const before = await button.boundingBox();
        const qBefore = await row.locator('.num').innerText();
        await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(240);
        assert.match(await state.innerText(), /JOGGING/);
        assert.deepEqual(await button.boundingBox(), before, `${width} ${name} J${joint}: button moved on press`);
        assert.notEqual(await row.locator('.num').innerText(), qBefore);
        assert.equal(await other.innerText(), otherBefore, 'The other arm must not move');
        // Leave while still holding: capture must not keep the jog running.
        await page.mouse.move(before.x - 10, before.y + before.height / 2);
        await page.waitForTimeout(100);
        assert.match(await state.innerText(), /STOPPED/);
        const stopped = await row.locator('.num').innerText();
        await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
        await page.waitForTimeout(180);
        assert.equal(await row.locator('.num').innerText(), stopped, 'Re-entry must not restart a held pointer');
        await page.mouse.up();
        assert.deepEqual(await button.boundingBox(), before, 'Button moved on stop');
        // A new press can start normally; release stops it.
        await page.mouse.down();
        await page.waitForTimeout(120);
        assert.match(await state.innerText(), /JOGGING/);
        await page.mouse.up();
        assert.match(await state.innerText(), /STOPPED/);
        await button.focus();
        await page.keyboard.down('Enter');
        await page.waitForTimeout(120);
        assert.match(await state.innerText(), /JOGGING/);
        await page.keyboard.up('Enter');
        assert.match(await state.innerText(), /STOPPED/);
      }
      checks.push(`${width}px ${name}: stable J1/J7 buttons; release/leave stop; re-entry stays stopped; keyboard works; other arm unchanged`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '右臂 J1 正向点动', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/dualarm-jog-fixed.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
