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
        'src/test/**',
        'server/index.ts',
        'server/testUtils.ts',
        'server/testDb.ts',
        'server/testGlobalSetup.ts',
        '**/*.test.*',
      ],
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
          environmentOptions: {
            jsdom: {
              url: 'http://localhost',
              pretendToBeVisual: true,
            },
          },
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
