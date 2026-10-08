import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'Auction Arena',
        short_name: 'Auction',
        description: 'Interactive IPL Mock Auction Platform',
        theme_color: '#2563eb', // auction-primary
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'favicon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
