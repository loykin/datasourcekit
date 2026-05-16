import {
  DatasourceConflictError,
  DatasourceForbiddenError,
  DatasourceNotFoundError,
  DatasourceValidationError,
  type DatasourceCreateInput,
  type DatasourceHealthResult,
  type DatasourceInstance,
  type DatasourceListOptions,
  type DatasourceSchemaNamespace,
  type DatasourceTypeInfo,
} from '@loykin/datasourcekit'

export type Scenario = 'none' | 'forbidCreate' | 'forbidDelete' | 'forbidUpdate' | 'conflict'

function makeTs() { return new Date().toISOString() }
function nextVer(v?: string) { return String(Number(v ?? 0) + 1) }

const SEED: DatasourceInstance[] = [
  { uid: 'postgres-main', type: 'postgres', name: 'Main PostgreSQL', enabled: true, version: '1', createdAt: makeTs(), updatedAt: makeTs() },
  { uid: 'clickhouse-analytics', type: 'clickhouse', name: 'Analytics ClickHouse', enabled: true, version: '1', createdAt: makeTs(), updatedAt: makeTs() },
  { uid: 'mysql-reports', type: 'mysql', name: 'Reports MySQL', enabled: true, version: '1', createdAt: makeTs(), updatedAt: makeTs() },
  { uid: 'redis-cache', type: 'redis', name: 'Cache Redis', enabled: false, version: '1', createdAt: makeTs(), updatedAt: makeTs() },
]

const TYPES: DatasourceTypeInfo[] = [
  { type: 'postgres', name: 'PostgreSQL', enabled: true, installed: true },
  { type: 'clickhouse', name: 'ClickHouse', enabled: true, installed: true },
  { type: 'mysql', name: 'MySQL', enabled: true, installed: true },
  { type: 'redis', name: 'Redis', enabled: false, installed: true },
]

export function createFakeBackend() {
  let store: DatasourceInstance[] = SEED.map((d) => ({ ...d }))
  let types: DatasourceTypeInfo[] = TYPES.map((t) => ({ ...t }))
  let scenario: Scenario = 'none'

  return {
    setScenario(s: Scenario) { scenario = s },
    reset() { store = SEED.map((d) => ({ ...d })); types = TYPES.map((t) => ({ ...t })); scenario = 'none' },
    actorDelete(uid: string) { store = store.filter((d) => d.uid !== uid) },

    async listTypes(): Promise<DatasourceTypeInfo[]> {
      return types
    },

    async getType(type: string): Promise<DatasourceTypeInfo> {
      const info = types.find((t) => t.type === type)
      if (!info) throw new DatasourceNotFoundError(type)
      return info
    },

    async enableType(type: string): Promise<void> {
      await this.getType(type)
      types = types.map((t) => t.type === type ? { ...t, enabled: true } : t)
    },

    async disableType(type: string): Promise<void> {
      await this.getType(type)
      types = types.map((t) => t.type === type ? { ...t, enabled: false } : t)
    },

    async list(options?: DatasourceListOptions) {
      let items = [...store]
      const f = options?.filter
      if (f?.type !== undefined) {
        const types = Array.isArray(f.type) ? f.type : [f.type]
        items = items.filter((d) => types.includes(d.type))
      }
      if (f?.enabled !== undefined) items = items.filter((d) => (d.enabled ?? true) === f.enabled)
      if (f?.search !== undefined) {
        const q = f.search.toLowerCase()
        items = items.filter((d) => d.name.toLowerCase().includes(q) || d.uid.toLowerCase().includes(q))
      }
      const total = items.length
      if (options?.page !== undefined && options?.pageSize !== undefined) {
        items = items.slice(options.page * options.pageSize, (options.page + 1) * options.pageSize)
      } else if (options?.pageSize !== undefined) {
        items = items.slice(0, options.pageSize)
      }
      return { items, total }
    },

    async get(uid: string): Promise<DatasourceInstance> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return ds
    },

    async create(input: DatasourceCreateInput): Promise<DatasourceInstance> {
      if (scenario === 'forbidCreate') throw new DatasourceForbiddenError('create not allowed for this tenant')
      if (!input.name.trim()) throw new DatasourceValidationError('name is required', ['name is required'])
      const uid = `ds-${Date.now()}`
      const now = makeTs()
      const ds: DatasourceInstance = { uid, type: input.type, name: input.name.trim(), enabled: true, version: '1', createdAt: now, updatedAt: now }
      store = [...store, ds]
      return ds
    },

    async update(uid: string, patch: { name?: string; version?: string }): Promise<DatasourceInstance> {
      if (scenario === 'forbidUpdate') throw new DatasourceForbiddenError('update not allowed')
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      if (scenario === 'conflict') throw new DatasourceConflictError(`"${uid}" was modified by another actor`)
      if (patch.version !== undefined && ds.version !== patch.version) {
        throw new DatasourceConflictError(`"${uid}" version conflict: expected ${patch.version}, got ${ds.version}`)
      }
      const updated = { ...ds, ...patch, uid, version: nextVer(ds.version), updatedAt: makeTs() }
      store = store.map((d) => (d.uid === uid ? updated : d))
      return updated
    },

    async delete(uid: string): Promise<void> {
      if (scenario === 'forbidDelete') throw new DatasourceForbiddenError('delete not allowed')
      const exists = store.some((d) => d.uid === uid)
      if (!exists) throw new DatasourceNotFoundError(uid)
      store = store.filter((d) => d.uid !== uid)
    },

    async query(uid: string): Promise<unknown> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return {
        _raw: true,
        fields: ['name', 'type', 'version'],
        data: [[ds.name, ds.type, ds.version ?? '—']],
        reqId: `req-${Date.now()}`,
        uid,
      }
    },

    async healthCheck(uid: string): Promise<DatasourceHealthResult> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return { ok: true, message: `${ds.name} is reachable`, details: { uid, type: ds.type, version: ds.version } }
    },

    async listNamespaces(uid: string): Promise<DatasourceSchemaNamespace[]> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return [
        { id: 'public', name: 'public', kind: 'schema' },
        { id: 'public.users', name: 'users', kind: 'table', parentId: 'public' },
        { id: 'public.events', name: 'events', kind: 'table', parentId: 'public' },
      ]
    },
  }
}

export type FakeBackend = ReturnType<typeof createFakeBackend>
