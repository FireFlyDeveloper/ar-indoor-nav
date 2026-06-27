import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'homelab.local',
      port: 5173,
      protocol: 'wss',
      clientPort: 5173,
    },
    allowedHosts: true,
  },
  optimizeDeps: {
    // mind-ar@1.2.5 doesn't expose named exports from its package root.
    // The MindARThree class is only available as a subpath import, and
    // Vite's dep pre-bundler can't see through the subpath. Tell Vite to
    // serve it from node_modules directly.
    exclude: ['mind-ar/dist/mindar-image-three.prod.js'],
  },
});
