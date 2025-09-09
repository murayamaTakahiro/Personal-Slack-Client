import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import sveltePreprocess from "svelte-preprocess";
import { resolve } from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
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
        // Manual chunks for better code splitting
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('svelte')) {
              return 'vendor-svelte';
            }
            if (id.includes('@tauri-apps')) {
              return 'vendor-tauri';
            }
            return 'vendor';
          }
          
          // Feature-based chunks
          if (id.includes('Settings') || id.includes('Keyboard') || id.includes('Emoji') || id.includes('Performance')) {
            return 'feature-settings';
          }
          if (id.includes('SearchBar') || id.includes('ChannelSelector') || id.includes('UserSelector')) {
            return 'feature-search';
          }
          if (id.includes('MessageItem') || id.includes('ThreadView')) {
            return 'feature-messages';
          }
          if (id.includes('Dialog') || id.includes('Picker') || id.includes('Autocomplete')) {
            return 'feature-dialogs';
          }
        },
        
        // Optimize chunk names for production
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
          return `assets/${chunkInfo.name || facadeModuleId}-[hash].js`;
        },
        
        // Entry file names
        entryFileNames: 'assets/[name]-[hash].js',
        
        // Asset file names
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    
    // Optimize for production
    minify: mode === 'production' ? 'terser' : 'esbuild',
    terserOptions: mode === 'production' ? {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    } : undefined,
    
    // Target modern browsers for better optimization
    target: 'es2020',
    
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 500
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['svelte', '@tauri-apps/api'],
    exclude: []
  }
}));
