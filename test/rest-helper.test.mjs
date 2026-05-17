import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DatasourceTransportError,
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
      if (String(url).endsWith('/query')) return jsonResponse({ frames: [] })
      return jsonResponse({ items: [], total: 0 })
    },
  })

  await backend.types.list()
  await backend.types.get('postgres')
  await backend.instances.list({ filter: { type: 'postgres', enabled: true }, pageSize: 10 })
  await backend.query(
    { id: 'q1', datasourceUid: 'pg', datasourceType: 'postgres' },
    {
      authToken: 'context-token',
      headers: { 'x-request-id': 'req-1' },
      variables: { service: 'api' },
      timeRange: { from: 'now-1h', to: 'now' },
      builtins: { interval: '1m' },
      meta: { dashboardId: 'dash-1' },
    },
  )

  assert.equal(calls[0].url, 'https://api.example.test/datasources/types')
  assert.equal(calls[1].url, 'https://api.example.test/datasources/types/postgres')
  assert.equal(
    calls[2].url,
    'https://api.example.test/datasources?type=postgres&enabled=true&pageSize=10',
  )
  assert.equal(calls[3].url, 'https://api.example.test/datasources/query')
  assert.equal(calls[3].init.method, 'POST')
  assert.equal(calls[3].init.headers.authorization, 'Bearer token')
  assert.equal(calls[3].init.headers['x-request-id'], 'req-1')
  assert.deepEqual(JSON.parse(calls[3].init.body), {
    id: 'q1',
    datasourceUid: 'pg',
    datasourceType: 'postgres',
  })
})

test('createRestDatasourceManager supports custom paths and response envelopes', async () => {
  const calls = []
  const backend = createRestDatasourceManager({
    baseUrl: 'https://api.example.test/v1',
    paths: {
      typesList: () => '/catalog/datasource-types',
      typeGet: (type) => `/catalog/datasource-types/${type}`,
      instancesList: (qs) => `/connections${qs}`,
      query: () => '/query/run',
    },
    unwrap: (body) => body?.data,
    createError: (response, body) => {
      if (response.status === 500) return new DatasourceTransportError(body?.error?.message, response.status)
      return undefined
    },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/catalog/datasource-types')) {
        return jsonResponse({ data: [{ type: 'postgres', name: 'PostgreSQL' }] })
      }
      if (String(url).endsWith('/query/run')) {
        return jsonResponse({ data: { fields: [], rows: [] } })
      }
      return jsonResponse({ data: { items: [], total: 0 } })
    },
  })

  const types = await backend.types.list()
  await backend.instances.list({ pageSize: 5 })
  const raw = await backend.query({ id: 'q1', datasourceUid: 'pg', datasourceType: 'postgres' })

  assert.equal(types[0].type, 'postgres')
  assert.deepEqual(raw, { fields: [], rows: [] })
  assert.equal(calls[0].url, 'https://api.example.test/v1/catalog/datasource-types')
  assert.equal(calls[1].url, 'https://api.example.test/v1/connections?pageSize=5')
  assert.equal(calls[2].url, 'https://api.example.test/v1/query/run')
})

test('createRestDatasourceManager supports query body serializers without default context serialization', async () => {
  const calls = []
  const backend = createRestDatasourceManager({
    baseUrl: 'https://api.example.test/datasources',
    serializeQueryBody: (request, context) => ({
      request,
      productContext: {
        variables: context?.variables,
        timeRange: context?.timeRange,
        meta: context?.meta,
      },
    }),
    serializeBatchQueryBody: (requests, context) => ({
      requests,
      productContext: {
        variables: context?.variables,
      },
    }),
    fetch: async (url, init) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/batch-query')) return jsonResponse({ items: [] })
      return jsonResponse({ frames: [] })
    },
  })

  const context = {
    authToken: 'secret',
    headers: { 'x-tenant': 'acme' },
    variables: { service: 'api' },
    timeRange: { from: 'now-1h', to: 'now' },
    builtins: { interval: '1m' },
    meta: { dashboardId: 'dash-1' },
  }

  await backend.query({ id: 'q1', datasourceUid: 'pg', datasourceType: 'postgres' }, context)
  await backend.batchQuery?.([{ id: 'A', datasourceUid: 'pg', datasourceType: 'postgres' }], context)

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    request: { id: 'q1', datasourceUid: 'pg', datasourceType: 'postgres' },
    productContext: {
      variables: { service: 'api' },
      timeRange: { from: 'now-1h', to: 'now' },
      meta: { dashboardId: 'dash-1' },
    },
  })
  assert.equal(calls[0].init.headers.authorization, 'Bearer secret')
  assert.equal(calls[0].init.headers['x-tenant'], 'acme')
  assert.equal(JSON.parse(calls[0].init.body).productContext.authToken, undefined)
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    requests: [{ id: 'A', datasourceUid: 'pg', datasourceType: 'postgres' }],
    productContext: {
      variables: { service: 'api' },
    },
  })
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
