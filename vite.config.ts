// @ts-nocheck
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA({
    //   injectRegister: "script",
    //   registerType: "autoUpdate",
    //   includeAssets: ["icon-16.png", "icon-32.png", "icon-128.png", "icon-256.png", "icon-512.png", "logo.png"],
    //   manifest: {
    //     name: "Viko Kits",
    //     short_name: "Viko",
    //     description: "Audio and video toolkit",
    //     theme_color: "#0f172a",
    //     background_color: "#ffffff",
    //     display: "standalone",
    //     start_url: "/",
    //     icons: [
    //       { src: "/icon-256.png", sizes: "256x256", type: "image/png" },
    //       { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    //       { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    //     ],
    //   },
    //   workbox: {
    //     cleanupOutdatedCaches: true,
    //     globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}"],
    //   },
    //   devOptions: {
    //     enabled: false,
    //   },
    // }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));
