import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4: the Vite plugin replaces tailwind.config.ts + postcss + autoprefixer.
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "push-sw.js"],
      manifest: {
        name: "Resin Art Assistant",
        short_name: "Resin Art",
        description: "Customer messaging dashboard",
        theme_color: "#10b981", // emerald-500, matches the UI
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        // Adds `push` + `notificationclick` handlers to the generated service worker.
        importScripts: ["/push-sw.js"],
        // Never serve the SPA shell for API calls.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Cache API GET requests for 5 minutes (cleared on logout).
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // disable PWA in dev to avoid caching confusion
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Keep long-lived vendor code in separate, cache-friendly chunks.
        codeSplitting: {
          groups: [
            { name: "sentry", test: /node_modules[\\/]@sentry/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        ws: true, // lets a future WebSocket transport use /api/ws through the proxy
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
