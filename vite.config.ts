import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react(), cesium()],
  server: {
    // Cesium Ion 需要访问外部资源，移除 COEP 头部避免跨域阻止
  },
  // 确保正确处理 Cesium 资源
  optimizeDeps: {
    include: ['cesium'],
  },
}));
