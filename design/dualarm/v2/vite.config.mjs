import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const modelRoot = path.resolve(root, '../../../../rocos-mujoco/config/dualarm');
const files = ['urdf/dualarm.urdf', ...fs.readdirSync(path.join(modelRoot, 'meshes')).filter(n => n.endsWith('.STL')).map(n => `meshes/${n}`)];
const font = path.resolve(root, '../proposal-font.woff2');
export default defineConfig({
  resolve: { alias: { '@': path.resolve(root, '../../../src') } },
  root, base: './', plugins: [react(), {
    name: 'local-design-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/model\//, '');
        const file = req.url === '/proposal-font.woff2' ? font : files.includes(name) ? path.join(modelRoot, name) : null;
        if (!file) return next();
        res.setHeader('Content-Type', file.endsWith('.urdf') ? 'application/xml' : 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files) this.emitFile({ type: 'asset', fileName: `model/${name}`, source: fs.readFileSync(path.join(modelRoot, name)) });
      this.emitFile({ type: 'asset', fileName: 'proposal-font.woff2', source: fs.readFileSync(font) });
    },
  }], server: { host: '127.0.0.1', port: 5186 }, preview: { host: '127.0.0.1', port: 5186 },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1100 },
});
