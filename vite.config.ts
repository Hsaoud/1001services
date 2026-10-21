import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  // `--mode standalone` : tout est inliné dans un seul index.html, jouable hors ligne d'un double-clic.
  const single = mode === 'standalone';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    // `--mode stable` : pas de rechargement automatique (tests pendant que d'autres fichiers changent).
    server: {
      port: 5180,
      host: '127.0.0.1',
      hmr: mode === 'stable' ? false : undefined,
      watch: mode === 'stable' ? { ignored: ['**/*'] } : undefined,
    },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 3000,
      outDir: single ? 'dist-standalone' : 'dist',
      assetsInlineLimit: single ? 100_000_000 : 4096,
      rollupOptions: single ? undefined : { input: { main: resolve(import.meta.dirname, 'index.html') } },
    },
  };
});
