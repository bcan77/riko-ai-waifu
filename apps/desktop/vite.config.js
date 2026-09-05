import { defineConfig } from 'vite';
export default defineConfig({
  root: '../../waifu-viewer',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: false },
});
