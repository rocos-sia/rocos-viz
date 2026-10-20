import { expect, test } from '@playwright/test';

test('joint bars use zero and URDF ranges, including asymmetric and prismatic limits', async ({ page }) => {
  await page.goto('/#/teaching');
  const result = await page.evaluate(async () => {
    const path = '/src/core/JointRange.ts';
    const { jointBarRange, readJointRanges } = await import(path);
    const ranges = readJointRanges(`<robot name="limits">
      <joint name="hinge" type="revolute"><limit lower="-1.5707963267948966" upper="3.141592653589793"/></joint>
      <joint name="slide" type="prismatic"><limit lower="-0.1" upper="0.3"/></joint>
      <joint name="spin" type="continuous"><limit lower="-1" upper="1"/></joint>
      <joint name="invalid" type="revolute"><limit lower="2" upper="1"/></joint>
    </robot>`);
    return { ranges, zero: jointBarRange(0, ranges.hinge), negative: jointBarRange(-45, ranges.hinge),
      positive: jointBarRange(90, ranges.hinge), clamped: jointBarRange(300, ranges.hinge),
      oneSided: jointBarRange(50, { min: 10, max: 100, unit: '°' }), fallback: jointBarRange(-30),
      continuous: jointBarRange(400, ranges.spin) };
  });
  expect(result.ranges.slide).toEqual({ min: -100, max: 300, unit: 'mm' });
  expect(result.ranges.spin).toEqual({ unit: '°' });
  expect(result.ranges.invalid).toEqual({ unit: '°' });
  expect(result.zero.zero).toBeCloseTo(100 / 3);
  expect(result.zero.width).toBe(0);
  expect(result.negative.left).toBeCloseTo(100 / 6);
  expect(result.negative.width).toBeCloseTo(100 / 6);
  expect(result.positive.left).toBeCloseTo(result.zero.zero);
  expect(result.positive.width).toBeCloseTo(100 / 3);
  expect(result.clamped.left + result.clamped.width).toBeCloseTo(100);
  expect(result.oneSided.zero).toBe(0);
  expect(result.fallback.zero).toBe(50);
  expect(result.fallback.limited).toBe(false);
  expect(result.continuous.lower).toBe(-540);
  const bars = page.locator('.teach-state-column .teach-joint-track');
  await expect(bars.first().locator('i')).toHaveCSS('width', '0px');
  await expect(bars.nth(1).locator('i')).toHaveClass('negative');
  await expect(bars.nth(2).locator('i')).toHaveClass('positive');
});

for (const language of ['zh', 'en']) {
  test(`points only resize the scene; separated jog controls fit (${language})`, async ({ page }) => {
    await page.addInitScript((language) => localStorage.setItem('rocos-ui', JSON.stringify({ state: { language, themeMode: language === 'en' ? 'dark' : 'light', sidebarCollapsed: false }, version: 0 })), language);
    for (const [width, height] of [[1920, 1080], [1366, 768]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/#/teaching');
      const scene = page.locator('.teach-3d');
      const points = page.locator('.teach-context');
      const state = page.locator('.teach-state-column');
      const motion = page.locator('.teach-motion-column');
      await expect(scene).toBeVisible();
      const [sceneBox, pointBox, stateBox, motionBox] = await Promise.all([scene.boundingBox(), points.boundingBox(), state.boundingBox(), motion.boundingBox()]);
      expect(pointBox!.x).toBe(sceneBox!.x);
      expect(pointBox!.width).toBe(sceneBox!.width);
      expect(pointBox!.y).toBeGreaterThan(sceneBox!.y + sceneBox!.height);
      expect(stateBox!.x).toBeGreaterThan(sceneBox!.x + sceneBox!.width);
      expect(motionBox!.x).toBeGreaterThan(stateBox!.x + stateBox!.width);
      expect(motionBox!.y).toBe(stateBox!.y);
      expect(motionBox!.height).toBe(stateBox!.height);
      await points.locator('.teach-context-actions button').last().click();
      await expect.poll(async () => (await motion.boundingBox())!.height).toBe(motionBox!.height);
      expect((await state.boundingBox())!.height).toBe(stateBox!.height);
      expect((await scene.boundingBox())!.height).not.toBe(sceneBox!.height);
      for (const space of language === 'zh' ? ['关节点动', '笛卡尔点动'] : ['Joint', 'Cartesian']) {
        await page.getByRole('radiogroup', { name: language === 'zh' ? '点动空间' : 'Jog space' }).getByText(space, { exact: true }).click();
        await expect.poll(() => page.locator('.teach-jog-card .teach-card-body').evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1), space).toBe(true);
        await expect(page.getByRole('radiogroup', { name: language === 'zh' ? '点动空间' : 'Jog space' }).getByText(language === 'zh' ? '零空间' : 'Null space', { exact: true })).toHaveCount(0);
        let previousBottom: number | undefined;
        for (const row of await page.locator('.teach-jog-groups .teach-preview-jog').all()) {
          const negative = await row.locator('.jog-negative').boundingBox();
          const positive = await row.locator('.jog-positive').boundingBox();
          const label = await row.locator('.jog-label').boundingBox();
          if (previousBottom !== undefined) expect(negative!.y - previousBottom).toBeGreaterThanOrEqual(16);
          previousBottom = negative!.y + negative!.height;
          expect(negative!.height).toBeGreaterThanOrEqual(44);
          expect(positive!.x - negative!.x - negative!.width).toBeGreaterThanOrEqual(48);
          expect(label!.x).toBeGreaterThan(negative!.x + negative!.width);
          expect(label!.x + label!.width).toBeLessThan(positive!.x);
        }
        if (space === '笛卡尔点动' || space === 'Cartesian') {
          const nullButton = page.getByRole('button', { name: 'N1 +', exact: true });
          await nullButton.scrollIntoViewIfNeeded();
          const nullBox = await nullButton.boundingBox();
          const rotation = await page.getByRole('button', { name: 'RZ +', exact: true }).boundingBox();
          expect(nullBox!.y).toBeGreaterThan(rotation!.y + rotation!.height);
        }
      }
    }
  });
}
