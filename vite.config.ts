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
    // Keep nested agent/editor worktrees out of discovery so local `npm test`
    // and coverage only exercise this checkout (not sibling checkouts under
    // `.kilo/` / `.worktrees/`).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-cli/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/.kilo/**',
      '**/.worktrees/**',
      '**/coverage/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/core/**/*.ts', 'src/renderers/**/*.ts', 'src/cli/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        'src/cli/renderMidi.ts',
        '**/.kilo/**',
        '**/.worktrees/**',
      ],
    },
  },
});
