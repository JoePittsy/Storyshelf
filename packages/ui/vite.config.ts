import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Library build: ESM JS, one CSS file (dist/styles.css) and, from tsc, the .d.ts. Storybook and Vitest read the same file.
export default defineConfig({
  plugins: [react()],
  oxc: { jsx: { runtime: 'automatic', development: false } },
  css: { modules: { generateScopedName: 'ui-[name]__[local]___[hash:base64:5]' } },
  build: {
    target: 'esnext',
    cssTarget: 'chrome120',
    emptyOutDir: true,
    lib: {
      // Two entries: the components, and the global CSS (src/styles.ts, which only imports it; its empty JS is deleted by the build script).
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        styles: fileURLToPath(new URL('./src/styles.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: [/^react($|\/)/, /^react-dom($|\/)/, /^lucide-react($|\/)/],
    },
  },
});
