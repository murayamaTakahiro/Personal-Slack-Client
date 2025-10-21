import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  // Use relative paths for assets (critical for Tauri production builds)
  base: "./",

  plugins: [svelte({
    preprocess: sveltePreprocess({
      typescript: true
    })
  })],
  
  // Path resolution
  resolve: {
    alias: {
      $lib: resolve('./src/lib')
    }
  },
  
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
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
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  
  // Code splitting configuration
  build: {
    rollupOptions: {
      output: {
        // Disable manual chunks to avoid circular dependency issues
        // Let Vite handle automatic code splitting
        manualChunks: undefined,

        // Optimize chunk names for production
        chunkFileNames: 'assets/[name]-[hash].js',

        // Entry file names
        entryFileNames: 'assets/[name]-[hash].js',

        // Asset file names
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },

    // Use esbuild for faster and more reliable minification
    // (terser can cause initialization order issues with circular dependencies)
    minify: 'esbuild',
    
    // Target modern browsers for better optimization
    target: 'es2020',
    
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 500
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['svelte', '@tauri-apps/api', 'pdfjs-dist'],
    exclude: []
  }
}));
