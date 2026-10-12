import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      // Babel plugins for production — strip console logs except errors
      babel: {
        plugins: mode === 'production'
          ? [['transform-remove-console', { exclude: ['error', 'warn'] }]]
          : [],
      },
    }),
  ],

  // Path aliases for clean imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@api': path.resolve(__dirname, './src/api'),
      '@components': path.resolve(__dirname, './src/components'),
      '@context': path.resolve(__dirname, './src/context'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@pages': path.resolve(__dirname, './src/pages'),
    },
  },

  // Dev server configuration
  server: {
    port: 3000,
    strictPort: true,
    // Secure proxy — all API and WS calls go through the dev server,
    // which avoids CORS issues and hides the backend origin from the browser.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        // Strip /api prefix if the backend doesn't use it
        // rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
    // Security headers for development
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },

  // Production build optimisations
  build: {
    outDir: 'dist',
    sourcemap: false, // Never expose source maps in production
    minify: 'esbuild',
    target: 'es2020',
    // Chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk: rarely changes → long-lived cache
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Axios + DOMPurify in their own chunk
          utils: ['axios', 'dompurify'],
        },
        // Content-addressed file names for immutable caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    // Warn if any chunk exceeds 500 kB
    chunkSizeWarningLimit: 500,
  },

  // Dependency pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios', 'dompurify'],
  },
}));
