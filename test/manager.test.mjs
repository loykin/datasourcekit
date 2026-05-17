import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DatasourceTypeNotRegisteredError,
  createDatasourceManager,
  defineDatasourcePlugin,
  tableRowsToFrame,
} from '../dist/index.js'
import { createMemoryDatasourceBackend } from '../dist/testing.js'

test('types.list merges backend types with registry plugins', async () => {
  const backend = createMemoryDatasourceBackend({
    types: [
      { type: 'postgres', name: 'PostgreSQL', installed: true, enabled: true },
      { type: 'redis', name: 'Redis', installed: true, enabled: false },
    ],
  })
  const manager = createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'postgres',
        name: 'PostgreSQL',
        configEditor: () => undefined,
        queryEditor: () => undefined,
      }),
      defineDatasourcePlugin({
        type: 'prometheus',
        name: 'Prometheus',
        configEditor: () => undefined,
      }),
    ],
    backend,
  })

  const types = await manager.types.list()
  const byType = Object.fromEntries(types.map((type) => [type.type, type]))

  assert.equal(byType.postgres.installed, true)
  assert.equal(byType.postgres.enabled, true)
  assert.equal(byType.postgres.hasConfigEditor, true)
  assert.equal(byType.postgres.hasQueryEditor, true)

  assert.equal(byType.redis.installed, true)
  assert.equal(byType.redis.hasConfigEditor, undefined)

  assert.equal(byType.prometheus.installed, false)
  assert.equal(byType.prometheus.enabled, false)
  assert.equal(byType.prometheus.hasConfigEditor, true)
})

test('types.get returns registry-only type when backend does not know it', async () => {
  const manager = createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'prometheus',
        name: 'Prometheus',
        queryEditor: () => undefined,
      }),
    ],
    backend: createMemoryDatasourceBackend({ types: [] }),
  })

  const type = await manager.types.get('prometheus')

  assert.equal(type.type, 'prometheus')
  assert.equal(type.installed, false)
  assert.equal(type.hasQueryEditor, true)
})

test('instances.query uses plugin transform after backend fallback query', async () => {
  const manager = createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'postgres',
        name: 'PostgreSQL',
        backend: {
          transform: (raw) => {
            assert.deepEqual(raw, { fields: ['value'], rows: [[1]] })
            return {
              frames: [
                tableRowsToFrame({
                  columns: [{ name: 'value', type: 'number' }],
                  rows: [[1]],
                }),
              ],
              meta: { transformedBy: 'postgres' },
            }
          },
        },
      }),
    ],
    backend: {
      types: {
        list: async () => [{ type: 'postgres', name: 'PostgreSQL' }],
        get: async () => ({ type: 'postgres', name: 'PostgreSQL' }),
      },
      instances: {
        list: async () => ({ items: [] }),
        get: async () => ({ uid: 'pg', type: 'postgres', name: 'PG' }),
        create: async (input) => ({ uid: 'pg', type: input.type, name: input.name }),
        update: async (uid, patch) => ({ uid, type: 'postgres', name: patch.name ?? 'PG' }),
        delete: async () => undefined,
      },
      query: async () => ({ fields: ['value'], rows: [[1]] }),
    },
  })

  const result = await manager.instances.query({
    id: 'q1',
    datasourceUid: 'pg',
    datasourceType: 'postgres',
  })

  assert.equal(result.frames[0].fields[0].name, 'value')
  assert.equal(result.meta.transformedBy, 'postgres')
})

test('instances.query applies call transform after plugin transform', async () => {
  const backend = createMemoryDatasourceBackend({
    instances: [{ uid: 'pg', type: 'postgres', name: 'PG' }],
  })
  const manager = createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'postgres',
        name: 'PostgreSQL',
        backend: {
          transform: () => ({
            frames: [
              tableRowsToFrame({
                columns: [{ name: 'value', type: 'number' }],
                rows: [[1]],
              }),
            ],
          }),
        },
      }),
    ],
    backend,
  })

  const result = await manager.instances.query({
    id: 'q1',
    datasourceUid: 'pg',
    datasourceType: 'postgres',
  }, undefined, {
    transform: (result) => ({
      ...result,
      frames: result.frames.map((frame) => ({
        ...frame,
        fields: frame.fields.map((field) => ({ ...field, name: field.name.toUpperCase() })),
      })),
    }),
  })

  assert.equal(result.frames[0].fields[0].name, 'VALUE')
})

test('instances.batchQuery preserves ids in fallback partial results', async () => {
  const manager = createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'postgres',
        name: 'PostgreSQL',
      }),
    ],
    backend: createMemoryDatasourceBackend({
      instances: [{ uid: 'pg', type: 'postgres', name: 'PG' }],
    }),
  })

  const result = await manager.instances.batchQuery([
    { id: 'A', datasourceUid: 'pg', datasourceType: 'postgres' },
    { id: 'B', datasourceUid: 'missing', datasourceType: 'postgres' },
  ])

  assert.equal(result.items[0].id, 'A')
  assert.equal(result.items[0].data.requestId, 'A')
  assert.equal(result.items[1].id, 'B')
  assert.equal(result.items[1].error.name, 'DatasourceNotFoundError')
})

test('instances.batchQuery rejects native backend items without ids', async () => {
  const manager = createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'postgres',
        name: 'PostgreSQL',
      }),
    ],
    backend: {
      ...createMemoryDatasourceBackend({
        instances: [{ uid: 'pg', type: 'postgres', name: 'PG' }],
      }),
      batchQuery: async () => ({
        items: [{ data: { frames: [] } }],
      }),
    },
  })

  await assert.rejects(
    () => manager.instances.batchQuery([
      { id: 'A', datasourceUid: 'pg', datasourceType: 'postgres' },
    ]),
    (error) => {
      assert.equal(error.name, 'DatasourceValidationError')
      assert.deepEqual(error.errors, ['items[0].id is required'])
      return true
    },
  )
})

test('instances.query throws when datasource type has no registered plugin', async () => {
  const manager = createDatasourceManager({
    backend: createMemoryDatasourceBackend({
      instances: [{ uid: 'pg', type: 'postgres', name: 'PG' }],
    }),
  })

  await assert.rejects(
    () => manager.instances.query({
      id: 'q1',
      datasourceUid: 'pg',
      datasourceType: 'postgres',
    }),
    DatasourceTypeNotRegisteredError,
  )
})
