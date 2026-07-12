import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

/**
 * `base` NUNCA es './'. En Capacitor la app se sirve desde https://localhost y las rutas
 * relativas se rompen al navegar (docs/08 §3). Las cartas se referencian con /assets/…
 *
 * Para el APK y para un dominio propio, la base es '/'. GitHub Pages, en cambio, sirve bajo
 * /<repo>/, y entonces hay que decírselo:  BASE_URL=/soledad/ npm run build
 */
const base = process.env['BASE_URL'] ?? '/';

export default defineConfig({
  base,
  plugins: [preact()],
  publicDir: 'public',
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@meta': resolve(__dirname, 'src/meta'),
      '@services': resolve(__dirname, 'src/services'),
      '@app': resolve(__dirname, 'src/app'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@data': resolve(__dirname, 'data'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Sin hashes derivados del tiempo: el build debe ser reproducible (docs/08 §6).
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/meta/**'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
