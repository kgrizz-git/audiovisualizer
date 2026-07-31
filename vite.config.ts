import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'es2022',
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/core/**/*.ts', 'src/renderers/**/*.ts', 'src/cli/**/*.ts'],
      exclude: ['**/*.d.ts', 'src/cli/renderMidi.ts'],
    },
  },
});
