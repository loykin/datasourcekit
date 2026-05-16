# DatasourceKit 설계

## 목적

DatasourceKit은 datasource 관리 호출과 datasource 실행 호출을 위한
도메인 전용 계약이다.

DatasourceKit은 백엔드가 아니고, datasource 저장소도 아니며, datasource
상태의 source of truth도 아니다.

Datasource lifecycle, 권한, secret, 영속 저장, 실제 query 실행은 백엔드가
소유한다. DatasourceKit은 프론트엔드 런타임, dashboard 도구, query editor,
schema browser, test/mock runtime이 그 백엔드 또는 local/mock runtime을
일관된 계약으로 호출하게 해준다.

```txt
Frontend / dashboard runtime / editor
  -> DatasourceKit contracts
      -> app backend
          -> datasource storage, secrets, permissions, query execution
```

## 핵심 원칙

백엔드가 source of truth다.

DatasourceKit core는 datasource 목록이나 datasource 상태를 권위 있는
상태처럼 오래 들고 있으면 안 된다. 앱이 UI 상태나 selected datasource
상태를 프론트에 둘 수는 있지만, 그것은 일시적인 UI 상태이며 언제든 백엔드
상태와 달라질 수 있다고 가정해야 한다.

예시:

- 다른 사용자가 datasource를 삭제했다.
- datasource 권한이 바뀌었다.
- datasource 설정이 바뀌었다.
- stale datasource uid로 query를 실행했다.

이 경우 백엔드 응답이 최종 판단이다. DatasourceKit은 표준 에러를 드러내고,
UI가 목록 reload, 선택 해제, 실패 상태 표시를 하게 해야 한다.

## 백엔드 책임

백엔드가 소유하는 것:

- datasource list/get/create/update/delete
- datasource 영속 저장
- secret 저장과 주입
- tenant/user authorization
- optimistic concurrency 또는 version check
- provisioning/import flow
- 실제 query 실행
- schema, health, validation, variable, annotation 실행
- audit log와 policy enforcement

secret은 datasource instance options로 프론트에 노출되면 안 된다.
프론트에서 볼 수 있는 options는 safe config만이어야 한다.

## DatasourceKit 책임

DatasourceKit이 소유하는 것:

- datasource instance 타입 계약
- datasource CRUD 호출 타입 계약
- datasource runtime 호출 타입 계약
- 백엔드 결과를 표현하는 표준 에러 클래스
- test/playground/local runtime을 위한 local/mock/plugin primitive
- 일반적인 transport convention을 위한 선택 helper

DatasourceKit이 소유하지 않는 것:

- 고정된 백엔드 API path convention
- 영속 datasource state
- datasource secret
- 최종 authorization decision
- dashboard layout 또는 panel rendering
- 앱 UI의 cache invalidation policy

## 계층

### 1. Manager Contract

Manager는 datasource domain에 한정된 좁은 data provider다. 범용 resource
provider가 아니며, datasource record만 다룬다.

```ts
interface DatasourceManager {
  list(ctx?): Promise<DatasourceInstance[]>
  get(uid: string, ctx?): Promise<DatasourceInstance>
  create(input, ctx?): Promise<DatasourceInstance>
  update(uid: string, patch, ctx?): Promise<DatasourceInstance>
  delete(uid: string, ctx?): Promise<void>
}
```

핵심 API는 앱이 자기 백엔드 호출 함수를 직접 등록할 수 있어야 한다.

```ts
const manager = defineDatasourceManager({
  list: (ctx) => backend.listDatasources(ctx),
  get: (uid, ctx) => backend.getDatasource(uid, ctx),
  create: (input, ctx) => backend.createDatasource(input, ctx),
  update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
  delete: (uid, ctx) => backend.deleteDatasource(uid, ctx),
})
```

REST helper는 있어도 되지만, 보조 convenience여야 한다. 실제 백엔드는 path
shape, auth scheme, error envelope, versioning rule이 서로 다르기 때문에
REST convention이 중심 추상화가 되면 안 된다.

### 2. Runtime Contract

Runtime은 datasource uid를 대상으로 query/schema/health/validation 같은
실행 작업을 수행한다.

```ts
interface DatasourceRuntime {
  query(request, context?): Promise<QueryResult>
  subscribe?(request, context, onData, onError): () => void
  healthCheck(uid, context?): Promise<DatasourceHealthResult>
  validateQuery(uid, query, context?): Promise<DatasourceValidationResult>
  listNamespaces(uid, context?): Promise<DatasourceSchemaNamespace[]>
  listFields(uid, request, context?): Promise<DatasourceSchemaField[]>
  metricFindQuery(request, context?): Promise<VariableOption[]>
  queryAnnotations(query, context?): Promise<Annotation[]>
}
```

production에서는 runtime method가 보통 백엔드로 위임된다. 백엔드는
datasource config와 secret을 로드하고, 권한을 확인하고, 실제 query를 실행한
뒤 결과를 반환한다.

### 3. Local Registry / Executor

registry와 executor는 local runtime primitive다.

사용처:

- playground demo
- test
- local-only app
- plugin 개발
- mock backend

이들은 production datasource management의 source of truth가 아니다.

## 에러 모델

DatasourceKit은 백엔드 또는 local runtime 실패를 domain error로 정규화해야
한다.

- `DatasourceUnauthorizedError`: 인증되지 않은 요청
- `DatasourceForbiddenError`: 권한이 없는 action
- `DatasourceNotFoundError`: 삭제되었거나 존재하지 않는 datasource uid
- `DatasourceConflictError`: stale update/delete
- `DatasourceValidationError`: datasource config 또는 query input validation 실패
- `DatasourceTransportError`: network/backend 실패
- `DatasourceCapabilityError`: 지원하지 않는 runtime capability

## 삭제되었거나 Stale인 Datasource

DatasourceKit은 삭제되거나 stale인 datasource 문제를 숨기면 안 된다.

예상 query flow:

```txt
frontend tries query(uid)
  -> backend returns 404
  -> DatasourceNotFoundError
  -> UI clears selected datasource or reloads list
```

예상 update conflict flow:

```txt
frontend update(uid, patch, version=1)
  -> backend detects current version=2
  -> DatasourceConflictError
  -> UI reloads latest datasource and asks user to retry
```

## Cache Policy

DatasourceKit core는 durable datasource cache를 소유하면 안 된다.

앱은 자기 UI 상태나 server-state tool을 사용해서 datasource 목록 또는 선택된
datasource detail을 cache할 수 있다. 하지만 모든 runtime call은 백엔드가
stale 상태를 거절할 수 있다고 가정해야 한다. DatasourceKit은 명확한 계약과
에러를 제공해야지, frontend state가 authoritative한 것처럼 행동하면 안 된다.

## Playground 방향

playground는 production mental model을 먼저 가르쳐야 한다.

1. 백엔드가 source of truth다.
2. Manager는 백엔드 계약으로 load/create/update/delete를 호출한다.
3. Runtime은 백엔드 계약으로 query/schema/health/validation을 호출한다.
4. Local registry/executor는 mock/local 구현이다.
5. deleted, forbidden, conflict, validation 상태는 정상적인 운영 flow다.

playground가 frontend registry state를 production datasource management처럼
보여주면 안 된다.

## 현재 Gap

현재 구현에는 `DatasourceManagementClient`가 있고, 이 client가 frontend-side
instance state와 subscription을 들고 있다. demo에는 유용할 수 있지만,
DatasourceKit core가 datasource state를 소유하는 것처럼 보이게 할 위험이
있다.

수정 방향:

- `DatasourceManager`를 core CRUD contract로 유지한다.
- `defineDatasourceManager()`를 handler registration 중심 API로 추가한다.
- stateful management client는 core public API에서 제거하거나 별도 UI helper로
  격리한다.
- REST convention helper는 보조 helper임이 드러나게 rename 또는 격하한다.
- registry/executor는 local runtime primitive로 재정의한다.

## 리팩토링 계획

이 섹션은 설계와 구현이 다시 흔들리지 않도록 하는 실행 계획이다. 구현은 이
문서와 충돌하면 안 된다.

### Phase 1. Core Boundary 고정

목표: source-of-truth 경계를 public API에 명확히 반영한다.

작업:

1. `DatasourceManager`를 유일한 core CRUD contract로 유지한다.
2. 앱 백엔드를 연결하는 기본 방법으로 `defineDatasourceManager(handlers)`를
   추가한다.
3. `DatasourceManagementClient`를 core에서 제거하거나, non-authoritative UI
   helper 설계가 정리될 때까지 public API에서 제외한다.
4. DatasourceKit이 권위 있는 datasource list state를 소유한다고 보이는 API를
   제거한다.

목표 API:

```ts
const manager = defineDatasourceManager({
  list: (ctx) => backend.listDatasources(ctx),
  get: (uid, ctx) => backend.getDatasource(uid, ctx),
  create: (input, ctx) => backend.createDatasource(input, ctx),
  update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
  delete: (uid, ctx) => backend.deleteDatasource(uid, ctx),
})
```

### Phase 2. REST Convention Helper 격하

목표: 특정 backend URL shape이 core abstraction처럼 보이지 않게 한다.

작업:

1. `createHttpDatasourceManager()`를 `createRestDatasourceManager()`로 rename
   하거나, 역할이 명확해질 때까지 export하지 않는다.
2. REST helper는 convenience helper로만 문서화한다.
3. public example은 handler registration을 중심으로 유지한다.
4. 실제 백엔드 error envelope과 headers를 커스터마이즈할 수 있게 한다.

비목표:

- 앱에 `/api/datasources/:uid` 형태의 route를 강제하지 않는다.

### Phase 3. Runtime Contract 분리

목표: datasource management와 datasource execution을 분리한다.

작업:

1. query/schema/health/validation 및 관련 runtime 작업을 위한
   `DatasourceRuntime` interface를 추가한다.
2. 백엔드 runtime binding API로 `defineDatasourceRuntime(handlers)`를 추가한다.
3. 기존 registry/executor는 production management model이 아니라 local runtime
   implementation으로 유지한다.
4. 문서에서는 필요하면 `DatasourceExecutor`를 local executor로 설명한다.

목표 형태:

```ts
const runtime = defineDatasourceRuntime({
  query: (request, ctx) => backend.queryDatasource(request, ctx),
  healthCheck: (uid, ctx) => backend.healthCheckDatasource(uid, ctx),
  validateQuery: (uid, query, ctx) => backend.validateDatasourceQuery(uid, query, ctx),
  listNamespaces: (uid, ctx) => backend.listDatasourceNamespaces(uid, ctx),
  listFields: (uid, request, ctx) => backend.listDatasourceFields(uid, request, ctx),
})
```

### Phase 4. Error Handling 정규화

목표: source-of-truth 변경을 숨기지 않으면서 backend failure를 예측 가능하게
표현한다.

작업:

1. manager와 runtime contract에서 표준 datasource error를 사용한다.
2. 삭제된 datasource flow는 `DatasourceNotFoundError`로 드러낸다.
3. 권한 실패는 `DatasourceForbiddenError` 또는 `DatasourceUnauthorizedError`로
   드러낸다.
4. stale write는 `DatasourceConflictError`로 드러낸다.
5. backend/network failure는 `DatasourceTransportError`로 드러낸다.
6. frontend state가 유효한 척 auto-recover하지 않는다.

예상 UI 동작:

```txt
DatasourceNotFoundError
  -> selected datasource clear or list reload

DatasourceConflictError
  -> current datasource reload and ask user to retry

DatasourceForbiddenError
  -> disable action or show permission error
```

### Phase 5. Playground 재구성

목표: local primitive보다 production mental model을 먼저 보여준다.

현재 registry 중심 playground를 아래 섹션으로 교체한다.

1. **Purpose**
   - backend가 source of truth
   - DatasourceKit은 contract layer

2. **Manager Contract**
   - `defineDatasourceManager({ list, get, create, update, delete })`
   - fake backend를 상대로 load/create/update/delete 시뮬레이션

3. **Backend Scenarios**
   - forbidden create/update/delete
   - 다른 actor가 datasource 삭제
   - update conflict
   - validation failure

4. **Runtime Contract**
   - selected datasource query
   - schema/health/validation을 backend handler로 호출
   - missing datasource query는 not found를 반환

5. **Local Runtime**
   - `defineDatasource`, registry, executor 설명
   - mock/local/plugin development 용도로 위치 지정

playground가 frontend registry mutation을 production datasource management처럼
보여주면 안 된다.

### Phase 6. README 정리

목표: README는 짧게 유지하고 깊은 설계는 이 문서로 연결한다.

작업:

1. 목적을 한 문단으로 명시한다.
2. 최소 manager/runtime 예시만 보여준다.
3. `docs/design.md` 링크를 둔다.
4. CI/CD나 구현 세부사항을 길게 쓰지 않는다.
5. registry가 production datasource store인 것처럼 암시하지 않는다.

### Phase 7. 검증

각 phase 이후 필수 확인:

```bash
pnpm type-check
pnpm build
pnpm playground:build
```

playground 동작이 크게 바뀐 경우 dev server로 수동 확인한다.

- manager flow가 fake backend datasource를 load/create/update/delete한다.
- 삭제된 datasource가 not found로 드러난다.
- forbidden action이 보인다.
- query는 frontend registry state가 아니라 runtime handler를 사용한다.
- local registry/executor는 local/mock runtime으로 명확히 표시된다.

## 하지 말 것

- core에 React 또는 TanStack Query를 넣지 않는다.
- DatasourceKit core가 authoritative datasource list state를 소유하게 하지 않는다.
- REST URL convention을 primary abstraction으로 만들지 않는다.
- frontend-visible datasource options에 secret을 노출하지 않는다.
- registry/executor를 production datasource management로 설명하지 않는다.
- backend `404`, `403`, `409` 상태를 stale frontend data 뒤에 숨기지 않는다.
- playground CRUD가 frontend-local state만 바꾸면서 production flow처럼 보이게 하지
  않는다.
