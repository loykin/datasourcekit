# @loykin/datasourcekit

DatasourceKit은 dashboard, query editor, reporting tool에서 datasource를 백엔드 source-of-truth 기준으로 관리하고 실행하기 위한 frontend contract layer다.

DatasourceKit은 datasource 저장소가 아니고, secret 저장소도 아니며, 권한 판정 주체도 아니다. Type, instance, secret, permission, 실제 query 실행은 앱 백엔드가 소유한다.

자세한 설계는 [`docs/design.md`](docs/design.md)를 참조.

## Install

```bash
pnpm add @loykin/datasourcekit
```

## Manager + Plugin

```ts
import {
  createDatasourceManager,
  defineDatasourcePlugin,
} from '@loykin/datasourcekit'

const postgresPlugin = defineDatasourcePlugin({
  type: 'postgres',
  name: 'PostgreSQL',
  configEditor: (props) => PostgresConfigEditor(props),
  queryEditor: (props) => PostgresQueryEditor(props),
  backend: {
    transform: (raw) => normalizePostgresResult(raw),
  },
})

const manager = createDatasourceManager({
  plugins: [postgresPlugin],
  backend: {
    types: {
      list: (ctx) => backend.listDatasourceTypes(ctx),
      get: (type, ctx) => backend.getDatasourceType(type, ctx),
    },
    instances: {
      list: (options, ctx) => backend.listDatasources(options, ctx),
      get: (uid, ctx) => backend.getDatasource(uid, ctx),
      create: (input, ctx) => backend.createDatasource(input, ctx),
      update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
      delete: (uid, ctx) => backend.deleteDatasource(uid, ctx),
    },
    query: (request, ctx) => backend.queryDatasource(request, ctx),
    healthCheck: (uid, ctx) => backend.healthCheckDatasource(uid, ctx),
  },
})
```

## Core Flow

```ts
const types = await manager.types.list(ctx)
const { items } = await manager.instances.list({ filter: { type: 'postgres' } }, ctx)

const result = await manager.instances.query({
  id: 'q1',
  datasourceUid: 'postgres-main',
  datasourceType: 'postgres',
  query: { sql: 'select * from users limit 10' },
}, ctx)
```

Query 실행은 datasource type으로 plugin을 찾고, raw backend 응답은 해당 plugin의 `backend.transform`이 `QueryResult`로 정규화한다. `manager.backend.transform`은 없다.

## Permissions

권한의 최종 판정은 백엔드가 한다. DatasourceKit은 `DatasourceContext`로 인증/tenant 정보를 전달하고, 백엔드가 반환한 `permissions` hint를 UI에 노출할 수 있게 한다.

프론트의 permission hint는 버튼 표시나 disabled 처리에만 사용한다. `create`, `update`, `delete`, `query` 호출은 항상 백엔드에서 다시 검사되어야 한다.

## REST Helper

특정 REST convention을 쓰는 백엔드라면 `createRestDatasourceManager`를 backend helper로 사용할 수 있다. URL shape, auth, error envelope이 다르면 직접 backend handler를 연결하는 것을 권장한다.

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

## Error Model

백엔드 실패와 stale 상태는 domain error로 드러난다.

| Error | 상황 |
|---|---|
| `DatasourceTypeNotRegisteredError` | registry에 없는 datasource type |
| `DatasourceNotFoundError` | 삭제되었거나 존재하지 않는 uid/type |
| `DatasourceForbiddenError` | 권한이 없는 action |
| `DatasourceUnauthorizedError` | 인증되지 않은 요청 |
| `DatasourceConflictError` | stale update/delete |
| `DatasourceValidationError` | config 또는 query input validation 실패 |
| `DatasourceTransportError` | network/backend 실패 |
| `DatasourceCapabilityError` | plugin/backend가 지원하지 않는 capability |
