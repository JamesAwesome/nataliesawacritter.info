import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts', // type-only reference file, no runtime code
        'src/test/**',
        'server/index.ts',
        'server/testUtils.ts',
        'server/testDb.ts',
        'server/testGlobalSetup.ts',
        '**/*.test.*',
      ],
      // Ratchet floor a few points below current (~95/92/94/96) — blocks real
      // regressions without failing on a single hard-to-test branch. CI runs
      // `pnpm test:coverage`, so this gates every PR.
      thresholds: {
        statements: 93,
        branches: 90,
        functions: 92,
        lines: 94,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['server/**/*.test.ts'],
          exclude: ['server/**/*.integration.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test/setup.ts',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['server/**/*.integration.test.ts'],
          globalSetup: ['./server/testGlobalSetup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
