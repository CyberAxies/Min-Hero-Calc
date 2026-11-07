import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' keeps the build portable - it works from a GitHub Pages project
// subpath, from file://, or from any static host without reconfiguration.
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Min Hero Calc',
        short_name: 'MinHero',
        description:
          'Team, type-coverage and skill-build calculator for Min Hero: Tower of Sages.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'any',
        lang: 'en',
        id: './',
        categories: ['games', 'utilities'],
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app is 100% static and data lives in the bundle, so we can
        // precache everything and never touch the network at runtime.
        globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest,ttf}'],
      },
    }),
  ],
});
