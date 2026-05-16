# @loykin/datasourcekit

DatasourceKit은 datasource 관리 호출과 datasource 실행 호출을 위한 domain 전용 contract다.

DatasourceKit은 백엔드가 아니고, datasource 저장소도 아니며, datasource 상태의 source of truth도 아니다. 백엔드가 source of truth다.

설계 배경과 원칙은 [`docs/design.md`](docs/design.md)를 참조.

## Install

```bash
pnpm add @loykin/datasourcekit
```

## Manager Contract

앱 백엔드를 연결하는 기본 방법은 `defineDatasourceManager`다.

```ts
import { defineDatasourceManager } from '@loykin/datasourcekit'

const manager = defineDatasourceManager({
  list: (ctx) => backend.listDatasources(ctx),
  get: (uid, ctx) => backend.getDatasource(uid, ctx),
  create: (input, ctx) => backend.createDatasource(input, ctx),
  update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
  delete: (uid, ctx) => backend.deleteDatasource(uid, ctx),
})

const datasources = await manager.list()
```

## Runtime Contract

query, schema, health, validation 실행을 백엔드에 연결하는 방법은 `defineDatasourceRuntime`이다.

```ts
import { defineDatasourceRuntime } from '@loykin/datasourcekit'

const runtime = defineDatasourceRuntime({
  query: (request, ctx) => backend.queryDatasource(request, ctx),
  healthCheck: (uid, ctx) => backend.healthCheckDatasource(uid, ctx),
  validateQuery: (uid, query, ctx) => backend.validateDatasourceQuery(uid, query, ctx),
  listNamespaces: (uid, ctx) => backend.listDatasourceNamespaces(uid, ctx),
  listFields: (uid, request, ctx) => backend.listDatasourceFields(uid, request, ctx),
})

const result = await runtime.query({ id: 'q1', datasourceUid: 'postgres-main' })
```

## Error Model

백엔드 또는 local runtime 실패는 domain error로 드러난다.

```ts
import {
  DatasourceNotFoundError,
  DatasourceForbiddenError,
  DatasourceConflictError,
  DatasourceValidationError,
  DatasourceTransportError,
  DatasourceUnauthorizedError,
  DatasourceCapabilityError,
} from '@loykin/datasourcekit'
```

| Error | 상황 |
|---|---|
| `DatasourceNotFoundError` | 삭제되었거나 존재하지 않는 uid |
| `DatasourceForbiddenError` | 권한이 없는 action |
| `DatasourceConflictError` | stale update/delete |
| `DatasourceValidationError` | config 또는 query input validation 실패 |
| `DatasourceTransportError` | network/backend 실패 |
| `DatasourceUnauthorizedError` | 인증되지 않은 요청 |
| `DatasourceCapabilityError` | 지원하지 않는 local runtime capability |

## REST Helper

특정 REST 경로 convention을 사용하는 백엔드라면 `createRestDatasourceManager`를 convenience helper로 쓸 수 있다. 백엔드 URL shape, auth scheme, error envelope이 다르다면 `defineDatasourceManager`로 직접 연결하는 것을 권장한다.

```ts
import { createRestDatasourceManager } from '@loykin/datasourcekit'

const manager = createRestDatasourceManager({
  baseUrl: 'https://api.example.com/datasources',
  getHeaders: () => ({ authorization: `Bearer ${token}` }),
})
```

## Local Runtime

registry와 executor는 local runtime primitive다. playground demo, test, local-only app, plugin 개발, mock backend에서 사용한다. production datasource management의 source of truth가 아니다.

```ts
import { defineDatasource, createDatasourceRegistry, createDatasourceExecutor } from '@loykin/datasourcekit'

const datasource = defineDatasource({
  uid: 'my-ds',
  type: 'custom',
  async queryData(request, context) {
    return runQuery(request.query, context.variables)
  },
})

const executor = createDatasourceExecutor({
  datasources: [datasource],
})

const result = await executor.query({ id: 'q1', datasourceUid: 'my-ds' })
```
