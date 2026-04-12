import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    {
      name: 'copy-extension-static',
      writeBundle() {
        // Copy manifest, popup HTML, and icons into dist after build
        copyFileSync('manifest.json', 'dist/manifest.json');
        copyFileSync('src/popup/popup.html', 'dist/popup.html');
        cpSync('public/icons', 'dist/icons', { recursive: true });
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]',
        // MV3 requires no dynamic imports in service worker
        manualChunks: undefined,
      },
    },
    // No minification for easier debugging during development
    minify: false,
    // Ensure each entry is self-contained (no code-splitting for extension)
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
