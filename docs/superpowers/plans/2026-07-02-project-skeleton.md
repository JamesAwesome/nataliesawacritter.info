# Project Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working project skeleton for the critter tracker: tooling (compose, tests, CI) plus a thin vertical slice proving React page → Express API → Postgres end to end, zero product features.

**Architecture:** Single `app/` package containing a Vite React client and an Express 5 API server (pool_monitor's dashboard pattern). Postgres 18 runs in docker compose on a named volume; the server runs Drizzle migrations at startup. Tests are Vitest with three projects: node unit, jsdom client, and Testcontainers integration.

**Tech Stack:** Node 24 LTS, pnpm 11.9.0, TypeScript 6.0.3, React 19.2.7, Vite 8.1.3, Express 5.2.1, Drizzle ORM 0.45.2 + drizzle-kit 0.31.10, pg 8.22, Vitest 4.1.9 + Testing Library, @testcontainers/postgresql 12, postgres:18.4, cloudflare/cloudflared:2026.6.1.

**Spec:** `docs/superpowers/specs/2026-07-02-project-skeleton-design.md`

## Global Constraints

- Package manager is pnpm 11.9.0 ONLY (`packageManager` field + `only-allow` preinstall). Never run npm/yarn installs.
- Docker images pinned exactly: `postgres:18.4`, `node:24.18.0-slim`, `cloudflare/cloudflared:2026.6.1`. npm deps use caret ranges; the lockfile is the pin.
- Server-side relative imports MUST use `.js` extensions (e.g. `./db/index.js`) — TypeScript resolves them to `.ts` sources, and the compiled ESM needs the extension under Node.
- App container hardening (pool_monitor convention): `no-new-privileges:true`, `cap_drop: ALL`, `read_only: true` + tmpfs `/tmp`, runs as the `node` user.
- No product features: no sightings API routes, no calendar/history/leaderboard UI. The only page is the health page; the only API route is `GET /api/health`.
- All commands below run from the repo root unless the step says otherwise. `pnpm` commands run in `app/`.
- Working directory: `/Users/james/projects/github/jamesawesome/nataliesawacritter.info` (or its worktree copy).

---

### Task 1: Repo hygiene — design docs in-tree, .gitignore

**Files:**
- Create: `docs/design/` (extracted from the handoff zip at repo root)
- Create: `.gitignore`
- Delete: `Natalie's Animal Sighting Tracker.zip`

**Interfaces:**
- Consumes: nothing
- Produces: `docs/design/README.md` (the design spec later feature tasks will read), versioned prototype + screenshots

- [ ] **Step 1: Extract the handoff zip into docs/design**

```bash
mkdir -p docs/design
unzip -o "Natalie's Animal Sighting Tracker.zip" -d /tmp/critter-handoff
cp -R /tmp/critter-handoff/design_handoff_critter_tracker/. docs/design/
rm -rf /tmp/critter-handoff
ls docs/design
```

Expected: `README.md`, `Natalies Critter Tracker.dc.html`, `screenshots/` (4 PNGs inside).

- [ ] **Step 2: Delete the zip**

```bash
git rm "Natalie's Animal Sighting Tracker.zip"
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.env
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 4: Verify tracked state**

Run: `git status --short`
Expected: deleted zip, new `.gitignore`, new `docs/design/*` files; nothing unexpected.

- [ ] **Step 5: Commit**

```bash
git add .gitignore docs/design
git commit -m "chore: extract design handoff into docs/design, add .gitignore"
```

---

### Task 2: App package scaffold — configs that lint, typecheck, and build

**Files:**
- Create: `app/package.json`, `app/.npmrc`, `app/tsconfig.json`, `app/tsconfig.app.json`, `app/tsconfig.node.json`, `app/tsconfig.server.json`, `app/eslint.config.js`, `app/vite.config.ts`, `app/vitest.config.ts`, `app/index.html`, `app/src/main.tsx`, `app/src/App.tsx`, `app/src/index.css`, `app/src/test/setup.ts`, `app/server/index.ts` (stub)

**Interfaces:**
- Consumes: nothing
- Produces: the toolchain every later task uses — scripts `dev`, `dev:server`, `build`, `lint`, `typecheck`, `test`, `test:coverage`, `db:generate`, `start`; vitest projects named `unit` (node, `server/**/*.test.ts`), `client` (jsdom, `src/**/*.test.{ts,tsx}`), `integration` (node, `server/**/*.integration.test.ts`); `App` default-exported React component rendered by `main.tsx`.

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "critter-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@11.9.0",
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "dev": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc -b && vite build && tsc -p tsconfig.server.json",
    "lint": "eslint .",
    "typecheck": "tsc -b && tsc -p tsconfig.server.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "db:generate": "drizzle-kit generate",
    "start": "node dist/server/index.js"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.2",
    "express": "^5.2.1",
    "pg": "^8.22.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@testcontainers/postgresql": "^12.0.4",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/express": "^5.0.6",
    "@types/node": "^24.12.4",
    "@types/pg": "^8.15.6",
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.3",
    "@vitest/coverage-v8": "^4.1.9",
    "drizzle-kit": "^0.31.10",
    "eslint": "^10.6.0",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "jsdom": "^29.1.1",
    "tsx": "^4.22.5",
    "typescript": "~6.0.3",
    "typescript-eslint": "^8.62.1",
    "vite": "^8.1.3",
    "vitest": "^4.1.9"
  }
}
```

- [ ] **Step 2: Create `app/.npmrc`**

```ini
shamefully-hoist=false
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 3: Create the four tsconfig files**

`app/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`app/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2023",
    "useDefineForClassFields": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`app/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts", "drizzle.config.ts"]
}
```

`app/tsconfig.server.json` (compiles `server/` to `dist/server` for production; also typechecks server tests):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "outDir": "dist/server",
    "rootDir": "server",
    "declaration": false,
    "sourceMap": false,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["server"]
}
```

- [ ] **Step 4: Create `app/eslint.config.js`**

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'drizzle'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
)
```

- [ ] **Step 5: Create `app/vite.config.ts` and `app/vitest.config.ts`**

`app/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist/client',
  },
})
```

`app/vitest.config.ts` (Vitest 4 `projects` — unit/client/integration):

```ts
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
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
```

- [ ] **Step 6: Create the client and server stubs**

`app/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Natalie Saw a Critter!</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`app/src/App.tsx` (placeholder — replaced in Task 6):

```tsx
export default function App() {
  return <h1>🐾 Natalie Saw a Critter!</h1>
}
```

`app/src/index.css` (placeholder — replaced in Task 6):

```css
body {
  margin: 0;
}
```

`app/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

`app/server/index.ts` (placeholder — replaced in Task 5; exists so `tsc -p tsconfig.server.json` has input):

```ts
console.log('server entrypoint placeholder — replaced in Task 5')
```

- [ ] **Step 7: Install and verify the toolchain**

Run (from `app/`):

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

Expected: install writes `pnpm-lock.yaml`; lint and typecheck exit 0; build produces `app/dist/client/index.html` and `app/dist/server/index.js`. (`pnpm test` would fail — no test files exist yet; that's expected, don't run it.)

- [ ] **Step 8: Commit**

```bash
git add app
git commit -m "feat: scaffold app package (vite+react client, express server toolchain, vitest projects)"
```

---

### Task 3: Drizzle schema, migration 0001, Testcontainers integration test

**Files:**
- Create: `app/drizzle.config.ts`, `app/server/db/schema.ts`, `app/server/db/index.ts`
- Create: `app/drizzle/` (generated SQL migration — committed)
- Test: `app/server/db/db.integration.test.ts`

**Interfaces:**
- Consumes: toolchain from Task 2 (`db:generate` script, `integration` vitest project)
- Produces: `createDb(connectionString: string): { pool: pg.Pool, db: NodePgDatabase<typeof schema> }` from `server/db/index.js`; `sightings` table object from `server/db/schema.js` with columns `id, emoji, name, sightedOn, sightedTime, place, comment, photoPath, createdAt`; committed migrations in `app/drizzle/` that `migrate(db, { migrationsFolder: 'drizzle' })` applies (cwd-relative: run the server from `app/` in dev, `/app` in Docker).

- [ ] **Step 1: Write the failing integration test**

`app/server/db/db.integration.test.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './index.js'
import { sightings } from './schema.js'

describe('migrations + sightings table', () => {
  let container: StartedPostgreSqlContainer
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    handle = createDb(container.getConnectionUri())
    await migrate(handle.db, { migrationsFolder: 'drizzle' })
  })

  afterAll(async () => {
    await handle?.pool.end()
    await container?.stop()
  })

  it('inserts a sighting and reads it back', async () => {
    const [inserted] = await handle.db
      .insert(sightings)
      .values({ emoji: '🦊', name: 'Fox', sightedOn: '2026-07-02' })
      .returning()

    expect(inserted.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    expect(inserted.createdAt).toBeInstanceOf(Date)

    const rows = await handle.db.select().from(sightings)
    expect(rows).toHaveLength(1)
    expect(rows[0].emoji).toBe('🦊')
    expect(rows[0].name).toBe('Fox')
    expect(rows[0].sightedOn).toBe('2026-07-02')
    expect(rows[0].place).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `app/`): `pnpm vitest run --project integration`
Expected: FAIL — cannot resolve `./index.js` / `./schema.js` (files don't exist yet).

- [ ] **Step 3: Write the schema**

`app/server/db/schema.ts`:

```ts
import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const sightings = pgTable('sightings', {
  // uuid (not serial): reads are public, so IDs must not be enumerable
  id: uuid('id').primaryKey().defaultRandom(),
  emoji: text('emoji').notNull(),
  name: text('name'),
  sightedOn: date('sighted_on', { mode: 'string' }).notNull(),
  // free-form per design ("just now" when absent), so text not time
  sightedTime: text('sighted_time'),
  place: text('place'),
  comment: text('comment'),
  photoPath: text('photo_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 4: Write the db factory**

`app/server/db/index.ts`:

```ts
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString })
  const db = drizzle(pool, { schema })
  return { pool, db }
}
```

- [ ] **Step 5: Create `app/drizzle.config.ts` and generate the migration**

`app/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
})
```

Run (from `app/`): `pnpm db:generate --name sightings`
Expected: creates `app/drizzle/0000_sightings.sql` and `app/drizzle/meta/`. Open the SQL and confirm it creates table `sightings` with `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `emoji text NOT NULL`, `sighted_on date NOT NULL`, `created_at timestamp with time zone DEFAULT now() NOT NULL`, and nullable `name/sighted_time/place/comment/photo_path`.

- [ ] **Step 6: Run the integration test to verify it passes**

Run (from `app/`): `pnpm vitest run --project integration`
Expected: PASS (first run pulls the `postgres:18.4` image; needs Docker running).

- [ ] **Step 7: Verify lint/typecheck still pass**

Run (from `app/`): `pnpm lint && pnpm typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add app/drizzle.config.ts app/server/db app/drizzle
git commit -m "feat: add sightings schema, migration 0001, and testcontainers integration test"
```

---

### Task 4: Basic-auth middleware (TDD)

**Files:**
- Create: `app/server/auth.ts`, `app/server/testUtils.ts`
- Test: `app/server/auth.test.ts`

**Interfaces:**
- Consumes: `unit` vitest project from Task 2
- Produces: `requireWriteAuth(user: string, password: string): RequestHandler` from `server/auth.js` (mounted on write routes in future feature tasks); `withServer(app: Express, fn: (baseUrl: string) => Promise<void>): Promise<void>` test helper from `server/testUtils.js` (reused in Task 5).

- [ ] **Step 1: Write the test helper**

`app/server/testUtils.ts`:

```ts
import type { Express } from 'express'

/** Start `app` on an ephemeral port, run `fn` against it, always close. */
export async function withServer(app: Express, fn: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('unexpected server address')
  try {
    await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }
}
```

- [ ] **Step 2: Write the failing tests**

`app/server/auth.test.ts`:

```ts
import express from 'express'
import { describe, expect, it } from 'vitest'
import { requireWriteAuth } from './auth.js'
import { withServer } from './testUtils.js'

function appWithAuth() {
  const app = express()
  app.post('/api/protected', requireWriteAuth('natalie', 'sekrit'), (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

function basic(user: string, pass: string) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

describe('requireWriteAuth', () => {
  it('rejects requests with no credentials with 401 + WWW-Authenticate', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, { method: 'POST' })
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toContain('Basic')
    })
  })

  it('rejects wrong password', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: basic('natalie', 'wrong') },
      })
      expect(res.status).toBe(401)
    })
  })

  it('rejects wrong user', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: basic('mallory', 'sekrit') },
      })
      expect(res.status).toBe(401)
    })
  })

  it('rejects malformed authorization header', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: 'Bearer nope' },
      })
      expect(res.status).toBe(401)
    })
  })

  it('accepts correct credentials', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: basic('natalie', 'sekrit') },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: FAIL — cannot resolve `./auth.js`.

- [ ] **Step 4: Implement the middleware**

`app/server/auth.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  // Length comparison leaks only length, not content; timingSafeEqual needs equal sizes.
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

function reject(res: Response) {
  res
    .set('WWW-Authenticate', 'Basic realm="critter-tracker"')
    .status(401)
    .json({ error: 'unauthorized' })
}

export function requireWriteAuth(user: string, password: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? ''
    if (!header.startsWith('Basic ')) {
      reject(res)
      return
    }
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString()
    const separator = decoded.indexOf(':')
    if (separator < 0) {
      reject(res)
      return
    }
    const gotUser = decoded.slice(0, separator)
    const gotPassword = decoded.slice(separator + 1)
    const userOk = safeEqual(gotUser, user)
    const passwordOk = safeEqual(gotPassword, password)
    if (!userOk || !passwordOk) {
      reject(res)
      return
    }
    next()
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: 5 passed.

- [ ] **Step 6: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add app/server/auth.ts app/server/auth.test.ts app/server/testUtils.ts
git commit -m "feat: add timing-safe basic-auth middleware for future write routes"
```

---

### Task 5: Express app — /api/health, static serving, real entrypoint (TDD)

**Files:**
- Create: `app/server/app.ts`
- Modify: `app/server/index.ts` (replace Task 2 placeholder entirely)
- Test: `app/server/app.test.ts`

**Interfaces:**
- Consumes: `withServer` from `server/testUtils.js` (Task 4); `createDb` from `server/db/index.js` (Task 3)
- Produces: `createApp(deps: { checkDb: () => Promise<void> }): Express` from `server/app.js`; a runnable entrypoint (`pnpm dev:server` / `node dist/server/index.js`) that requires env `DATABASE_URL`, honors `PORT` (default 8080), runs migrations at startup, and serves `dist/client` when `NODE_ENV=production`.

- [ ] **Step 1: Write the failing tests**

`app/server/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { withServer } from './testUtils.js'

describe('GET /api/health', () => {
  it('returns 200 {ok, db: true} when the db responds', async () => {
    const app = createApp({ checkDb: async () => {} })
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, db: true })
    })
  })

  it('returns 503 {ok: false, db: false} when the db check throws', async () => {
    const app = createApp({
      checkDb: async () => {
        throw new Error('connection refused')
      },
    })
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/health`)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ ok: false, db: false })
    })
  })

  it('returns JSON 404 for unknown /api routes', async () => {
    const app = createApp({ checkDb: async () => {} })
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/nope`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not found' })
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: auth tests pass, app tests FAIL — cannot resolve `./app.js`.

- [ ] **Step 3: Implement `createApp`**

`app/server/app.ts`:

```ts
import path from 'node:path'
import express, { type Express } from 'express'

export interface AppDeps {
  /** Resolves if the database is reachable, throws otherwise. */
  checkDb: () => Promise<void>
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    try {
      await deps.checkDb()
      res.json({ ok: true, db: true })
    } catch (err) {
      console.error('health check failed:', err)
      res.status(503).json({ ok: false, db: false })
    }
  })

  const clientDir = path.resolve(import.meta.dirname, '../client')
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (process.env.NODE_ENV === 'production') {
      next() // fall through to static / SPA fallback below
      return
    }
    res.status(404).send('client is served by vite in development')
  })
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(clientDir))
    app.use((_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'))
    })
  }

  return app
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: 8 passed (5 auth + 3 app).

- [ ] **Step 5: Replace the entrypoint placeholder**

`app/server/index.ts` (full replacement):

```ts
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from './app.js'
import { createDb } from './db/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { pool, db } = createDb(connectionString)

// cwd-relative: run from app/ in dev, /app in the container
await migrate(db, { migrationsFolder: 'drizzle' })
console.log('migrations up to date')

const app = createApp({
  checkDb: async () => {
    await pool.query('SELECT 1')
  },
})

const port = Number(process.env.PORT ?? 8080)
const server = app.listen(port, () => {
  console.log(`critter-tracker listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end()
    })
  })
}
```

- [ ] **Step 6: Verify lint/typecheck/build and full test run**

Run (from `app/`):

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
```

Expected: all exit 0; test summary shows unit + integration projects passing (client project has no tests yet — Vitest only errors on a project with zero matches if `passWithNoTests` is unset AND no other project matched; if the run errors for that reason, append `--passWithNoTests`).

- [ ] **Step 7: Commit**

```bash
git add app/server
git commit -m "feat: add express app with /api/health and migrating entrypoint"
```

---

### Task 6: Client health page with design tokens (TDD)

**Files:**
- Modify: `app/src/App.tsx`, `app/src/index.css`, `app/index.html` (full replacements of the Task 2 placeholders)
- Test: `app/src/App.test.tsx`

**Interfaces:**
- Consumes: `GET /api/health` contract from Task 5 (`{ ok: boolean, db: boolean }`, 200 or 503); vite `/api` proxy from Task 2
- Produces: the deployed index page. No exports consumed elsewhere.

- [ ] **Step 1: Write the failing component tests**

`app/src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function stubFetch(result: Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(() => result))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App health page', () => {
  it('shows the connected state when the API reports a healthy db', async () => {
    stubFetch(
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, db: true }), { status: 200 }),
      ),
    )
    render(<App />)
    expect(await screen.findByText(/database connected/i)).toBeInTheDocument()
  })

  it('shows the unavailable state when the API reports the db down', async () => {
    stubFetch(
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, db: false }), { status: 503 }),
      ),
    )
    render(<App />)
    expect(await screen.findByText(/database unavailable/i)).toBeInTheDocument()
  })

  it('shows the unavailable state when the request itself fails', async () => {
    stubFetch(Promise.reject(new Error('network down')))
    render(<App />)
    expect(await screen.findByText(/database unavailable/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app/`): `pnpm vitest run --project client`
Expected: FAIL — placeholder `App` never renders a health status.

- [ ] **Step 3: Implement the health page**

`app/src/App.tsx` (full replacement):

```tsx
import { useEffect, useState } from 'react'

type HealthState = 'loading' | 'connected' | 'unavailable'

export default function App() {
  const [health, setHealth] = useState<HealthState>('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { db: boolean }) => {
        if (!cancelled) setHealth(body.db ? 'connected' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setHealth('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="shell">
      <header className="header">
        <h1>🐾 Natalie Saw a Critter!</h1>
      </header>
      <p className="status" role="status">
        {health === 'loading' && 'Checking the burrow…'}
        {health === 'connected' && 'Database connected 🎉'}
        {health === 'unavailable' && 'Database unavailable 😿'}
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `app/`): `pnpm vitest run --project client`
Expected: 3 passed.

- [ ] **Step 5: Apply the design tokens (fonts + gradients from `docs/design/README.md`)**

`app/index.html` (full replacement — adds the handoff's Google Fonts):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Natalie Saw a Critter!</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Quicksand:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`app/src/index.css` (full replacement — tokens only, no product UI):

```css
:root {
  /* Rainbow Sherbet tokens — docs/design/README.md "Design Tokens" */
  --ink: #4a3b63;
  --ink-secondary: #9aa8c7;
  --border-hairline: #e3ecfa;
  --rainbow: linear-gradient(
    90deg,
    #ffd1dc,
    #ffe1b8,
    #fff6b8,
    #d7f5c8,
    #c8f0e4,
    #c7e3fa,
    #d9cff2
  );
}

body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(180deg, #eaf6ff, #fdf1ff);
  color: var(--ink);
  font-family: 'Quicksand', sans-serif;
}

.shell {
  max-width: 420px;
  margin: 48px auto;
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(70, 90, 140, 0.22);
  overflow: hidden;
}

.header {
  background: var(--rainbow);
  padding: 18px;
  text-align: center;
}

.header h1 {
  margin: 0;
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 18px;
}

.status {
  padding: 24px;
  text-align: center;
  font-weight: 600;
}
```

- [ ] **Step 6: Verify the dev loop end to end (manual smoke)**

Requires Docker running. From the repo root:

```bash
docker run --rm -d --name critter-dev-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_USER=critters -e POSTGRES_DB=critters -p 5432:5432 postgres:18.4
cd app
DATABASE_URL=postgres://critters:dev@localhost:5432/critters pnpm dev:server &
sleep 3
curl -s http://localhost:8080/api/health
```

Expected: `{"ok":true,"db":true}`. Then clean up:

```bash
kill %1
docker rm -f critter-dev-pg
```

(The compose file arrives in Task 7; this throwaway container just proves the slice before Docker packaging.)

- [ ] **Step 7: Full verification and commit**

Run (from `app/`): `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass — 3 projects green.

```bash
git add app/src app/index.html
git commit -m "feat: health page with rainbow-sherbet design tokens"
```

---

### Task 7: Dockerfile, docker-compose, .env.example — durable end-to-end

**Files:**
- Create: `app/Dockerfile`, `app/.dockerignore`, `docker-compose.yml`, `.env.example`

**Interfaces:**
- Consumes: `pnpm build` outputs (`dist/client`, `dist/server`), `drizzle/` migrations, entrypoint env contract (`DATABASE_URL`, `PORT`) from Task 5
- Produces: `docker compose up` serving the app on :8080 against durable postgres; named volumes `pgdata` and `photos`; `tunnel` profile for cloudflared.

- [ ] **Step 1: Create `app/.dockerignore`**

```
node_modules
dist
coverage
```

- [ ] **Step 2: Create `app/Dockerfile`**

```dockerfile
FROM node:24.18.0-slim AS build

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24.18.0-slim

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

# Photo uploads land here (named volume). Create it owned by node so the
# volume inherits writable ownership on first use.
RUN mkdir -p /data/photos && chown node:node /data/photos

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "dist/server/index.js"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:18.4
    container_name: critter-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-critters}
      POSTGRES_USER: ${POSTGRES_USER:-critters}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}
    ports:
      - "5432:5432"
    volumes:
      # postgres:18 images keep PGDATA under /var/lib/postgresql (not .../data)
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-critters} -d ${POSTGRES_DB:-critters}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  app:
    build:
      context: ./app
    container_name: critter-app
    restart: unless-stopped
    # Defense-in-depth: drop privileges, read-only root FS (pool_monitor convention)
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-critters}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-critters}
      WRITE_USER: ${WRITE_USER:-}
      WRITE_PASSWORD: ${WRITE_PASSWORD:-}
      TZ: ${TIMEZONE:-America/New_York}
    volumes:
      - photos:/data/photos
    depends_on:
      postgres:
        condition: service_healthy

  cloudflared:
    image: cloudflare/cloudflared:2026.6.1
    container_name: critter-cloudflared
    restart: unless-stopped
    profiles: ["tunnel"]
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - app

volumes:
  pgdata:
  photos:
```

- [ ] **Step 4: Create `.env.example`**

```bash
# Copy to .env and fill in. .env is gitignored — never commit it.

# --- Postgres ---
POSTGRES_DB=critters
POSTGRES_USER=critters
# Required. Generate one: openssl rand -hex 24
POSTGRES_PASSWORD=

# --- App ---
# Credentials Natalie uses for write actions (logging/deleting sightings).
# Reads are public. Leave blank until write endpoints exist.
WRITE_USER=
WRITE_PASSWORD=
TIMEZONE=America/New_York

# --- Local dev (pnpm dev:server outside docker) ---
# DATABASE_URL=postgres://critters:<POSTGRES_PASSWORD>@localhost:5432/critters

# --- Cloudflare tunnel (prod only; docker compose --profile tunnel up -d) ---
CLOUDFLARE_TUNNEL_TOKEN=
```

- [ ] **Step 5: Bring the stack up and verify the slice**

```bash
cp .env.example .env
# set POSTGRES_PASSWORD in .env, e.g.:
sed -i '' "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
docker compose up -d --build
docker compose ps
curl -s http://localhost:8080/api/health
```

Expected: postgres healthy, app running, health returns `{"ok":true,"db":true}`. Loading http://localhost:8080 in a browser shows the health page with "Database connected 🎉". Confirm cloudflared is NOT running (`docker compose ps` shows only postgres + app).

- [ ] **Step 6: Verify durability across down/up**

```bash
docker compose exec postgres psql -U critters -d critters \
  -c "INSERT INTO sightings (emoji, name, sighted_on) VALUES ('🦔', 'Durability Hedgehog', '2026-07-02');"
docker compose down
docker compose up -d
docker compose exec postgres psql -U critters -d critters -c "SELECT emoji, name FROM sightings;"
```

Expected: the hedgehog row survives (named volume `pgdata` persisted through `down`/`up`).

- [ ] **Step 7: Clean up the test row and commit**

```bash
docker compose exec postgres psql -U critters -d critters \
  -c "DELETE FROM sightings WHERE name = 'Durability Hedgehog';"
git add app/Dockerfile app/.dockerignore docker-compose.yml .env.example
git commit -m "feat: dockerize app with durable postgres compose stack and tunnel profile"
```

---

### Task 8: CI workflow + Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Consumes: scripts from Task 2 (`lint`, `typecheck`, `test:coverage`, `build`); Dockerfile from Task 7
- Produces: CI gate on PRs and main; automated weekly dependency PRs.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  app:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
        with:
          version: 11.9.0
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: app/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      # includes the Testcontainers integration project — Docker is available
      # on GitHub's ubuntu runners out of the box
      - run: pnpm test:coverage
      - run: pnpm build

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v4
      - name: Build app image
        uses: docker/build-push-action@v7
        with:
          context: ./app
          push: false
```

- [ ] **Step 2: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /app
    schedule:
      interval: weekly
  - package-ecosystem: docker
    directory: /app
    schedule:
      interval: weekly
  - package-ecosystem: docker-compose
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 3: Validate workflow syntax locally**

Run: `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest` (or `actionlint` if installed; if neither is available, skip — CI itself is the backstop on push).
Expected: no findings.

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: add lint/typecheck/test/build + docker build workflow and dependabot"
```

---

### Task 9: README

**Files:**
- Modify: `README.md` (full replacement)

**Interfaces:**
- Consumes: everything above (documents it)
- Produces: onboarding doc.

- [ ] **Step 1: Replace `README.md`**

```markdown
# 🐾 Natalie Saw a Critter!

Natalie sees things, she sees them with her eyes. This app lets her log wildlife
sightings and view them as a calendar, a filterable history, and a Top Critters
leaderboard. Live (eventually) at nataliesawacritter.info.

The full UI design lives in [`docs/design/`](docs/design/README.md) — open
`docs/design/Natalies Critter Tracker.dc.html` in a browser for the interactive
prototype.

## Stack

React 19 + Vite client and Express 5 API in one package (`app/`), Drizzle ORM
over Postgres 18, all orchestrated with docker compose. Postgres data lives in
the `pgdata` named volume; only `docker compose down -v` destroys it.

## Prerequisites

- Docker (with compose)
- Node 24 + pnpm 11 (`corepack enable`) — only needed for development

## Running it

    cp .env.example .env    # then set POSTGRES_PASSWORD (see comments inside)
    docker compose up -d --build

App: http://localhost:8080 — `GET /api/health` reports DB connectivity.

For public hosting via Cloudflare tunnel, set `CLOUDFLARE_TUNNEL_TOKEN` in
`.env` and run `docker compose --profile tunnel up -d`.

## Development

    docker compose up -d postgres
    cd app
    pnpm install
    DATABASE_URL=postgres://critters:<your-password>@localhost:5432/critters pnpm dev:server
    pnpm dev   # second terminal; vite proxies /api → :8080

Migrations run automatically at server startup. To create one: edit
`app/server/db/schema.ts`, then `pnpm db:generate --name <change>` and commit
the generated files in `app/drizzle/`.

## Tests & checks

    pnpm test            # unit + client + integration (integration needs Docker)
    pnpm test:coverage
    pnpm lint
    pnpm typecheck

CI runs all of the above plus a docker image build on every PR and push to main.
```

- [ ] **Step 2: Verify the README's commands match reality**

Skim each command block and confirm it matches the scripts in `app/package.json` and the compose service names. Expected: no drift.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, dev workflow, and test instructions"
```

---

## Final verification (Definition of Done from the spec)

- [ ] From a clean checkout with `.env` from example: `docker compose up` serves the health page on :8080 with "Database connected 🎉", and data survives `docker compose down && docker compose up -d` (Task 7 steps 5–6).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build` all pass in `app/`.
- [ ] CI is green on the PR once pushed.
- [ ] No product features beyond the slice.
