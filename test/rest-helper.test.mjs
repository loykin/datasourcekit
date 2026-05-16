import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DatasourceForbiddenError,
  DatasourceValidationError,
  createRestDatasourceManager,
} from '../dist/index.js'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

test('createRestDatasourceManager maps type, instance, and query endpoints', async () => {
  const calls = []
  const backend = createRestDatasourceManager({
    baseUrl: 'https://api.example.test/datasources',
    getHeaders: () => ({ authorization: 'Bearer token' }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/types')) return jsonResponse([{ type: 'postgres', name: 'PostgreSQL' }])
      if (String(url).endsWith('/types/postgres')) return jsonResponse({ type: 'postgres', name: 'PostgreSQL' })
      if (String(url).endsWith('/query')) return jsonResponse({ columns: [], rows: [] })
      return jsonResponse({ items: [], total: 0 })
    },
  })

  await backend.types.list()
  await backend.types.get('postgres')
  await backend.instances.list({ filter: { type: 'postgres', enabled: true }, pageSize: 10 })
  await backend.query({ id: 'q1', datasourceUid: 'pg', datasourceType: 'postgres' })

  assert.equal(calls[0].url, 'https://api.example.test/datasources/types')
  assert.equal(calls[1].url, 'https://api.example.test/datasources/types/postgres')
  assert.equal(
    calls[2].url,
    'https://api.example.test/datasources?type=postgres&enabled=true&pageSize=10',
  )
  assert.equal(calls[3].url, 'https://api.example.test/datasources/query')
  assert.equal(calls[3].init.method, 'POST')
  assert.equal(calls[3].init.headers.authorization, 'Bearer token')
})

test('createRestDatasourceManager maps backend errors to datasource errors', async () => {
  const forbidden = createRestDatasourceManager({
    baseUrl: 'https://api.example.test/datasources',
    fetch: async () => jsonResponse({ message: 'no access' }, { status: 403 }),
  })

  await assert.rejects(
    () => forbidden.instances.delete('pg'),
    DatasourceForbiddenError,
  )

  const validation = createRestDatasourceManager({
    baseUrl: 'https://api.example.test/datasources',
    fetch: async () => jsonResponse({ message: 'bad input', errors: ['name required'] }, { status: 422 }),
  })

  await assert.rejects(
    () => validation.instances.create({ type: 'postgres', name: '' }),
    (error) => {
      assert.equal(error instanceof DatasourceValidationError, true)
      assert.deepEqual(error.errors, ['name required'])
      return true
    },
  )
})
