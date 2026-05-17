# @loykin/datasourcekit

DatasourceKit is a frontend contract layer for building datasource management and query experiences in dashboard, query editor, and reporting tools.

DatasourceKit is not a backend, not a datasource store, and not the source of truth for permissions or secrets. Datasource types, datasource instances, secrets, authorization, and actual query execution belong to your application backend.

For the full architecture, see [`docs/design.md`](docs/design.md).

## Install

```bash
pnpm add @loykin/datasourcekit
```

## Quickstart

This quickstart shows the complete flow:

1. Expose an application backend contract.
2. Define a datasource plugin.
3. Create a manager.
4. Register a datasource instance.
5. Run a query through the backend.
6. Normalize the backend raw response with the plugin transform.

### 1. Expose Backend APIs

Your backend can be written in Go, Java, Python, Node, or anything else. DatasourceKit does not run in your backend. It only needs the frontend to call backend APIs with this shape.

| Operation | Example endpoint | Backend responsibility |
|---|---|---|
| List types | `GET /api/datasource-types` | Return installed/available datasource types |
| Get type | `GET /api/datasource-types/:type` | Return one datasource type |
| List instances | `GET /api/datasources` | Return datasource instances visible to the user |
| Create instance | `POST /api/datasources` | Validate, authorize, store safe config, create uid |
| Update instance | `PATCH /api/datasources/:uid` | Validate, authorize, handle version/conflict |
| Delete instance | `DELETE /api/datasources/:uid` | Authorize and delete |
| Query | `POST /api/datasource-query` | Load instance, load secrets, authorize, execute driver |
| Health | `GET /api/datasources/:uid/health` | Check connection/status |

Example query request body:

```json
{
  "id": "q1",
  "datasourceUid": "postgres-main",
  "datasourceType": "postgres",
  "query": {
    "rawSql": "select * from users limit 10"
  },
  "options": {
    "timeoutMs": 30000
  }
}
```

The backend should return either a normalized `QueryResult` or a type-specific raw response that the plugin can normalize.

### 2. Create A Frontend Backend Client

This is frontend code. It can call any backend implementation.

```ts
const backend = {
  listDatasourceTypes: (ctx) =>
    api.get('/api/datasource-types', ctx),
  getDatasourceType: (type, ctx) =>
    api.get(`/api/datasource-types/${type}`, ctx),
  listDatasourceInstances: (options, ctx) =>
    api.get('/api/datasources', { ...ctx, params: options }),
  getDatasourceInstance: (uid, ctx) =>
    api.get(`/api/datasources/${uid}`, ctx),
  createDatasourceInstance: (input, ctx) =>
    api.post('/api/datasources', input, ctx),
  updateDatasourceInstance: (uid, patch, ctx) =>
    api.patch(`/api/datasources/${uid}`, patch, ctx),
  deleteDatasourceInstance: (uid, ctx) =>
    api.delete(`/api/datasources/${uid}`, ctx),
  queryDatasource: (request, ctx) =>
    api.post('/api/datasource-query', request, ctx),
}
```

### 3. Define A Datasource Plugin

A plugin owns the type-specific UI hooks and response normalization. PostgreSQL and ClickHouse may return different raw backend response shapes, so `transform` belongs to the plugin, not to the manager backend.

```ts
import {
  createDatasourceManager,
  defineDatasourcePlugin,
  type QueryResult,
} from '@loykin/datasourcekit'

type PostgresOptions = {
  host: string
  port: number
  database: string
}

type PostgresQuery = {
  rawSql: string
}

function normalizePostgresResult(raw: unknown): QueryResult {
  const response = raw as {
    fields: string[]
    rows: unknown[][]
    requestId: string
  }

  return {
    columns: response.fields.map((name) => ({ name, type: 'string' })),
    rows: response.rows,
    requestId: response.requestId,
  }
}

const postgresPlugin = defineDatasourcePlugin<PostgresOptions, PostgresQuery>({
  type: 'postgres',
  name: 'PostgreSQL',
  configEditor: (props) => PostgresConfigEditor(props),
  queryEditor: (props) => PostgresQueryEditor(props),
  backend: {
    transform: (raw, request) => {
      // request.query is PostgresQuery in this plugin.
      return normalizePostgresResult(raw)
    },
  },
})
```

### 4. Create The Manager

`createDatasourceManager` wires frontend plugin routing to your backend handlers.

```ts
const manager = createDatasourceManager({
  plugins: [postgresPlugin],
  backend: {
    types: {
      list: (ctx) => backend.listDatasourceTypes(ctx),
      get: (type, ctx) => backend.getDatasourceType(type, ctx),
    },
    instances: {
      list: (options, ctx) => backend.listDatasourceInstances(options, ctx),
      get: (uid, ctx) => backend.getDatasourceInstance(uid, ctx),
      create: (input, ctx) => backend.createDatasourceInstance(input, ctx),
      update: (uid, patch, ctx) => backend.updateDatasourceInstance(uid, patch, ctx),
      delete: (uid, ctx) => backend.deleteDatasourceInstance(uid, ctx),
    },
    query: (request, ctx) => backend.queryDatasource(request, ctx),
  },
})
```

### 5. Register A Datasource Instance

`options` is type-specific safe config. Do not put passwords, tokens, or other secrets here. Secrets should stay in the backend.

```ts
const datasource = await manager.instances.create({
  type: 'postgres',
  name: 'Main PostgreSQL',
  options: {
    host: 'localhost',
    port: 5432,
    database: 'app',
  },
})
```

### 6. Run A Query

`query` is the type-specific query body. `options` is execution metadata such as timeout, max rows, or cache hints.

```ts
const result = await manager.instances.query({
  id: 'q1',
  datasourceUid: datasource.uid,
  datasourceType: 'postgres',
  query: {
    rawSql: 'select * from users limit 10',
  },
  options: {
    timeoutMs: 30000,
  },
})
```

Execution flow:

```txt
manager.instances.query(request)
  -> registry.get('postgres')
  -> backend.query(request)
  -> postgresPlugin.backend.transform(raw, request)
  -> QueryResult
```

## Manager API

```ts
const types = await manager.types.list(ctx)
const type = await manager.types.get('postgres', ctx)

const { items } = await manager.instances.list({ filter: { type: 'postgres' } }, ctx)
const datasource = await manager.instances.get('postgres-main', ctx)
await manager.instances.update(datasource.uid, { name: 'Renamed' }, ctx)
await manager.instances.delete(datasource.uid, ctx)
```

Optional type management handlers can be exposed when your backend supports them:

```ts
await manager.types.install?.('postgres', ctx)
await manager.types.uninstall?.('postgres', ctx)
await manager.types.enable?.('postgres', ctx)
await manager.types.disable?.('postgres', ctx)
```

## Type-specific Options And Query

DatasourceKit core does not enforce datasource-specific config or query shapes. `TOptions` and `TQuery` are defined by each plugin.

```ts
type ClickHouseOptions = {
  host: string
  port: number
  database: string
}

type ClickHouseQuery = {
  rawSql: string
  format?: 'JSONEachRow' | 'TabSeparated'
}

const clickhousePlugin = defineDatasourcePlugin<ClickHouseOptions, ClickHouseQuery>({
  type: 'clickhouse',
  name: 'ClickHouse',
  queryEditor: ({ query, onChange, onRunQuery }) =>
    ClickHouseQueryEditor({ query, onChange, onRunQuery }),
  backend: {
    transform: (raw, request) => {
      // request.query is ClickHouseQuery in this plugin.
      return normalizeClickHouseResult(raw)
    },
  },
})
```

Examples:

| Type | `query` example |
|---|---|
| PostgreSQL | `{ rawSql: 'select * from users' }` |
| ClickHouse | `{ rawSql: 'select count() from events', format: 'JSONEachRow' }` |
| Prometheus | `{ promql: 'rate(http_requests_total[5m])', step: '30s' }` |
| Redis | `{ command: 'INFO' }` |

## Capabilities

Query execution is separate from datasource capabilities. Capabilities are helper operations for management screens and query editors.

```ts
const health = await manager.instances.healthCheck(uid, type, ctx)
const namespaces = await manager.instances.listNamespaces(uid, type, ctx)
const fields = await manager.instances.listFields(uid, type, { namespaceId }, ctx)
```

These calls may be implemented by `plugin.backend.*` or by the manager backend fallback.

## Permissions

The backend is the final authority for permissions. DatasourceKit only passes request context and exposes backend-provided permission hints.

Frontend permission hints are for UI behavior only, such as hiding or disabling buttons. Every `create`, `update`, `delete`, and `query` call must still be checked by the backend.

## REST Helper

If your backend follows the helper's REST convention, you can use `createRestDatasourceManager` as a backend adapter. If your API paths, auth scheme, or error envelope are different, customize the helper or wire handlers directly with `createDatasourceManager`.

```ts
import {
  createDatasourceManager,
  createRestDatasourceManager,
} from '@loykin/datasourcekit'

const manager = createDatasourceManager({
  plugins: [postgresPlugin],
  backend: createRestDatasourceManager({
    baseUrl: 'https://api.example.com/datasources',
    getHeaders: () => ({ authorization: `Bearer ${token}` }),
  }),
})
```

Custom paths and response envelopes:

```ts
const backend = createRestDatasourceManager({
  baseUrl: 'https://api.example.com/v1',
  paths: {
    typesList: () => '/catalog/datasource-types',
    typeGet: (type) => `/catalog/datasource-types/${type}`,
    instancesList: (queryString) => `/connections${queryString}`,
    query: () => '/query/run',
  },
  unwrap: (body) => body.data,
  createError: (response, body) => {
    if (response.status === 500) {
      return new DatasourceTransportError(body.error?.message, response.status)
    }
    return undefined
  },
})
```

## Framework And Product Adapters

DatasourceKit does not ship product-specific adapters from the core package. Dashboard, alerting, reporting, or React adapters should live in the consuming package or in a separate optional package.

For example, a dashboard package can map its own panel request type into `DataQuery`:

```ts
const result = await manager.instances.query({
  id: panelRequest.id,
  datasourceUid: panelRequest.uid,
  datasourceType: panelRequest.type,
  query: panelRequest.query,
  options: panelRequest.options,
}, datasourceContext)
```

This keeps DatasourceKit focused on the datasource domain contract instead of depending on a specific product runtime.

## Error Model

Backend failures and stale state are surfaced as datasource domain errors.

| Error | When it happens |
|---|---|
| `DatasourceTypeNotRegisteredError` | The requested datasource type has no registered frontend plugin |
| `DatasourceNotFoundError` | The datasource uid or type no longer exists |
| `DatasourceForbiddenError` | The backend rejected the action due to permissions |
| `DatasourceUnauthorizedError` | The request is not authenticated |
| `DatasourceConflictError` | A stale update/delete was rejected |
| `DatasourceValidationError` | Datasource config or query input is invalid |
| `DatasourceTransportError` | Network or backend transport failed |
| `DatasourceCapabilityError` | The plugin/backend does not support the requested capability |
