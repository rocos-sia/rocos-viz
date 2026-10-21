import { expect, test } from '@playwright/test';

const xml = `<robot name="Cached robot">
  <link name="base"><visual><geometry><mesh filename="package://robot/meshes/base.STL"/></geometry></visual></link>
  <link name="arm"><visual><geometry><box size="0.1 0.1 0.5"/></geometry></visual></link>
  <joint name="hinge" type="revolute"><parent link="base"/><child link="arm"/><axis xyz="0 1 0"/><limit lower="-2" upper="2"/></joint>
</robot>`;
const stl = 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 0.2 0 0\nvertex 0 0.2 0\nendloop\nendfacet\nendsolid test';

test('one connection downloads its model once across overview, teaching and execution', async ({ page }) => {
  let descriptions = 0, meshes = 0;
  await page.addInitScript(() => {
    Reflect.set(window, '__webglProbes', 0);
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (args[0].startsWith('webgl') && args[1] === undefined) {
        Reflect.set(window, '__webglProbes', Reflect.get(window, '__webglProbes') + 1);
      }
      return Reflect.apply(original, this, args);
    };
  });
  await page.addInitScript(() => sessionStorage.setItem('rocos-connection', JSON.stringify({ state: {
    host: '127.0.0.1', port: '8080', isConnected: true, autoLoadModel: true,
  }, version: 0 })));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/robot/urdf') {
      descriptions++;
      return route.fulfill({ contentType: 'text/xml', body: xml });
    }
    if (path === '/api/robot/urdf/mesh') {
      meshes++;
      return route.fulfill({ body: stl });
    }
    return route.fulfill({ json: { success: true, code: 0, data: { has_owner: false } } });
  });
  await page.routeWebSocket('**/ws/robot_state', (socket) => {
    let tick = 0;
    const send = () => socket.send(JSON.stringify({
      joint_states: [{ name: 'hinge', position: 0.5 + (++tick % 10) / 100, velocity: 0, torque: 0 }], is_enabled: false,
    }));
    send();
    const timer = setInterval(send, 20);
    socket.onClose(() => clearInterval(timer));
  });
  const geometryId = () => page.evaluate(async () => {
    const path = '/node_modules/.vite/deps/@react-three_fiber.js';
    const { _roots } = await import(path);
    for (const { store } of _roots.values()) {
      if (!store.getState().gl.domElement.getBoundingClientRect().width) continue;
      const robot = store.getState().scene.getObjectByProperty('isURDFRobot', true);
      if (robot?.robotName === 'Cached robot') {
        return robot.links.base.children[0].children[0].geometry.uuid;
      }
    }
    return null;
  });
  await page.goto('/#/dashboard');
  await expect(page.locator('.teach-robot-preview')).toHaveAttribute('data-model-status', 'ready');
  await expect.poll(geometryId).not.toBeNull();
  const initialGeometry = await geometryId();
  expect(initialGeometry).toBeTruthy();
  const overviewCanvas = await page.locator('.teach-robot-preview canvas').elementHandle();
  let workspaceCanvas: typeof overviewCanvas = null;
  for (const name of ['手动示教', '总览', '运行调试', '总览', '手动示教', '总览']) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect.poll(geometryId).toBe(initialGeometry);
    if (name === '总览') {
      expect(await page.evaluate((canvas) => document.querySelector('.teach-robot-preview canvas') === canvas, overviewCanvas)).toBe(true);
    } else {
      workspaceCanvas ??= await page.locator('.teach-scene-canvas canvas').elementHandle();
      expect(await page.evaluate((canvas) => document.querySelector('.teach-scene-canvas canvas') === canvas, workspaceCanvas)).toBe(true);
    }
    await expect.poll(() => page.evaluate(async () => {
      const path = '/node_modules/.vite/deps/@react-three_fiber.js';
      const { _roots } = await import(path);
      return [..._roots.values()].every(({ store }) => {
        const state = store.getState();
        return state.frameloop === (state.gl.domElement.getBoundingClientRect().width ? 'always' : 'never');
      });
    })).toBe(true);
  }
  expect(await page.evaluate(() => Reflect.get(window, '__webglProbes'))).toBe(0);
  expect({ descriptions, meshes }).toEqual({ descriptions: 1, meshes: 1 });
  // A new connection must fetch again, even when it uses the same server and XML.
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnected(false);
  });
  await expect(page.locator('.teach-robot-info')).toContainText('URDF 初始姿态');
  await page.evaluate(async () => {
    const path = '/src/stores/connectionStore.ts';
    const { useConnectionStore } = await import(path);
    useConnectionStore.getState().setConnected(true);
  });
  await expect(page.locator('.teach-robot-preview')).toHaveAttribute('data-model-status', 'ready');
  await expect(page.locator('.teach-robot-info')).toContainText('Cached robot');
  expect({ descriptions, meshes }).toEqual({ descriptions: 2, meshes: 2 });
  expect(await geometryId()).not.toBe(initialGeometry);
});

test('a browser without WebGL reports a scene error while navigation remains usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      return args[0].includes('webgl') ? null : Reflect.apply(original, this, args);
    };
  });
  await page.goto('/#/teaching');
  await expect(page.locator('.scene-error-title')).toHaveText('3D 视图无法显示');
  await page.getByRole('link', { name: '系统设置', exact: true }).click();
  await expect(page.locator('main > .teach-settings')).toBeVisible();
});

test('shared model leases isolate view state and defer disposal until the last view releases', async ({ page }) => {
  let meshes = 0;
  await page.route('**/api/robot/urdf/mesh?*', (route) => { meshes++; return route.fulfill({ body: stl }); });
  await page.goto('/#/settings');
  const result = await page.evaluate(async (xml) => {
    const cachePath = '/src/core/ControllerModelCache.ts', storePath = '/src/stores/connectionStore.ts';
    const { acquireControllerModel } = await import(cachePath);
    const { useConnectionStore } = await import(storePath);
    const [a, b] = await Promise.all([acquireControllerModel(xml, '/api/robot/urdf/mesh'), acquireControllerModel(xml, '/api/robot/urdf/mesh')]);
    const meshA = a.robot.links.base.children[0].children[0];
    const meshB = b.robot.links.base.children[0].children[0];
    const sharedGeometry = meshA.geometry === meshB.geometry;
    const separateMaterials = meshA.material !== meshB.material;
    a.robot.setJointValue('hinge', 1);
    meshA.material.opacity = 0.3;
    const independent = b.robot.joints.hinge.jointValue[0] === 0 && meshB.material.opacity === 1;
    let disposed = 0;
    meshA.geometry.addEventListener('dispose', () => disposed++);
    useConnectionStore.getState().setConnection('127.0.0.1', '8081');
    const beforeRelease = disposed;
    a.release(); a.release();
    const afterFirst = disposed;
    b.release();
    return { sharedGeometry, separateMaterials, independent, beforeRelease, afterFirst, afterLast: disposed };
  }, xml);
  expect(result).toEqual({ sharedGeometry: true, separateMaterials: true, independent: true, beforeRelease: 0, afterFirst: 0, afterLast: 1 });
  expect(meshes).toBe(1);
});

test('failed mesh downloads can be retried instead of staying in the connection cache', async ({ page }) => {
  let meshes = 0;
  await page.route('**/api/robot/urdf/mesh?*', (route) => {
    meshes++;
    return meshes === 1 ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ body: stl });
  });
  await page.goto('/#/settings');
  const result = await page.evaluate(async (xml) => {
    const path = '/src/core/ControllerModelCache.ts';
    const { acquireControllerModel } = await import(path);
    let rejected = false;
    try { await acquireControllerModel(xml, '/api/robot/urdf/mesh'); } catch { rejected = true; }
    const resource = await acquireControllerModel(xml, '/api/robot/urdf/mesh');
    const name = resource.robot.robotName;
    resource.release();
    return { rejected, name };
  }, xml);
  expect(result).toEqual({ rejected: true, name: 'Cached robot' });
  expect(meshes).toBe(2);
});
