import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const ROBOT_HOST = process.env.ROBOT_HOST || '127.0.0.1';
const ROBOT_PORT = process.env.ROBOT_PORT || '8080';
const VITE_PORT = parseInt(process.env.VITE_PORT || '5173', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Preserve Vite 5's browser targets when upgrading the build tool.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-antd': ['antd', '@ant-design/icons'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: VITE_PORT,
    open: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: `http://${ROBOT_HOST}:${ROBOT_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://${ROBOT_HOST}:${ROBOT_PORT}`,
        ws: true,
      },
    },
  },
});
