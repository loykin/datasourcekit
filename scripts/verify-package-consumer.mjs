import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))

const workDir = mkdtempSync(join(tmpdir(), 'datasourcekit-consumer-'))
const appDir = join(workDir, 'app')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(workDir, 'npm-cache'),
      ...options.env,
    },
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }

  return result.stdout ?? ''
}

function version(section, name) {
  const value = pkg[section]?.[name]
  if (!value) throw new Error(`Missing ${section}.${name} in package metadata`)
  return value
}

try {
  mkdirSync(join(appDir, 'src'), { recursive: true })

  const packOutput = run('npm', ['pack', '--json', '--pack-destination', workDir], {
    capture: true,
  })
  const packInfo = JSON.parse(packOutput)
  const tarballPath = join(workDir, packInfo[0].filename)

  writeFileSync(
    join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'datasourcekit-consumer-verification',
        private: true,
        type: 'module',
        scripts: {
          'type-check': 'tsc --noEmit',
          'runtime:esm': 'node src/runtime-esm.mjs',
          'runtime:cjs': 'node src/runtime-cjs.cjs',
        },
        dependencies: {
          '@loykin/datasourcekit': `file:${tarballPath}`,
          typescript: version('devDependencies', 'typescript'),
        },
      },
      null,
      2,
    )}\n`,
  )

  writeFileSync(
    join(appDir, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM'],
          strict: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  )

  writeFileSync(
    join(appDir, 'src/index.ts'),
    `import {
  createDatasourceManager,
  defineDatasourcePlugin,
  type QueryResult,
} from '@loykin/datasourcekit'
import { createMemoryDatasourceBackend } from '@loykin/datasourcekit/testing'

type Query = { rawSql: string }

const plugin = defineDatasourcePlugin<unknown, Query>({
  type: 'postgres',
  name: 'PostgreSQL',
  backend: {
    transform(raw): QueryResult {
      return raw as QueryResult
    },
  },
})

const manager = createDatasourceManager({
  plugins: [plugin],
  backend: createMemoryDatasourceBackend({
    instances: [{ uid: 'pg', type: 'postgres', name: 'PostgreSQL' }],
  }),
})

const result = await manager.instances.query({
  id: 'q1',
  datasourceUid: 'pg',
  datasourceType: 'postgres',
  query: { rawSql: 'select 1' },
})

console.log(result.columns.length)
`,
  )

  writeFileSync(
    join(appDir, 'src/runtime-esm.mjs'),
    `import { createDatasourceManager, defineDatasourcePlugin } from '@loykin/datasourcekit'
import { createMemoryDatasourceBackend } from '@loykin/datasourcekit/testing'

const manager = createDatasourceManager({
  plugins: [defineDatasourcePlugin({ type: 'postgres', name: 'PostgreSQL' })],
  backend: createMemoryDatasourceBackend({
    instances: [{ uid: 'pg', type: 'postgres', name: 'PostgreSQL' }],
  }),
})

const result = await manager.instances.query({
  id: 'q1',
  datasourceUid: 'pg',
  datasourceType: 'postgres',
})

if (!Array.isArray(result.rows)) throw new Error('invalid ESM query result')
`,
  )

  writeFileSync(
    join(appDir, 'src/runtime-cjs.cjs'),
    `const { createDatasourceManager, defineDatasourcePlugin } = require('@loykin/datasourcekit')
const { createMemoryDatasourceBackend } = require('@loykin/datasourcekit/testing')

const manager = createDatasourceManager({
  plugins: [defineDatasourcePlugin({ type: 'postgres', name: 'PostgreSQL' })],
  backend: createMemoryDatasourceBackend({
    instances: [{ uid: 'pg', type: 'postgres', name: 'PostgreSQL' }],
  }),
})

manager.instances.query({
  id: 'q1',
  datasourceUid: 'pg',
  datasourceType: 'postgres',
}).then((result) => {
  if (!Array.isArray(result.rows)) throw new Error('invalid CJS query result')
})
`,
  )

  run('pnpm', ['install', '--ignore-scripts'], { cwd: appDir })
  run('pnpm', ['type-check'], { cwd: appDir })
  run('pnpm', ['runtime:esm'], { cwd: appDir })
  run('pnpm', ['runtime:cjs'], { cwd: appDir })

  console.log(`Consumer package verification passed: ${appDir}`)
} finally {
  if (process.env.KEEP_DATASOURCEKIT_CONSUMER_TEST !== '1') {
    rmSync(workDir, { recursive: true, force: true })
  }
}
