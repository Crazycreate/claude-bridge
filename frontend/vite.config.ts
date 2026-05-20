import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// In dev, proxy the WebSocket and health endpoint to the bridge server
// so the frontend can use same-origin URLs in every environment.
const BRIDGE_PORT = 8787;

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    VitePWA({
      // PWA is for installed-on-mobile use; in dev SW only causes stale-bundle pain.
      disable: command !== 'build',
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // We provide our own SW so we can also listen for `push` events.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      manifest: {
        name: 'Claude Bridge',
        short_name: 'Claude',
        description: 'Mobile access to a server-side Claude Code session',
        theme_color: '#faf9f5',
        background_color: '#faf9f5',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${BRIDGE_PORT}`, ws: true },
      '/health': { target: `http://localhost:${BRIDGE_PORT}` },
      '/api': { target: `http://localhost:${BRIDGE_PORT}` },
    },
  },
}));
