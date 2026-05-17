import { DatasourceConflictError, DatasourceNotFoundError } from './errors'
import type { DatasourceManagerBackend } from './manager'
import { tableRowsToFrame } from './types'
import type {
  DataQuery,
  DatasourceContext,
  DatasourceCreateInput,
  DatasourceInstance,
  DatasourceListOptions,
  DatasourceListResult,
  DatasourceTypeInfo,
  DatasourceUpdateInput,
  QueryResult,
} from './types'

function nextVersion(current?: string): string {
  return String(Number(current ?? '0') + 1)
}

function defaultTypes(seed: DatasourceInstance[]): DatasourceTypeInfo[] {
  const seen = new Set<string>()
  const types: DatasourceTypeInfo[] = []
  for (const instance of seed) {
    if (seen.has(instance.type)) continue
    seen.add(instance.type)
    types.push({
      type: instance.type,
      name: instance.type,
      enabled: true,
      installed: true,
    })
  }
  return types
}

export interface CreateMemoryDatasourceBackendOptions {
  instances?: DatasourceInstance[]
  types?: DatasourceTypeInfo[]
}

export function createMemoryDatasourceBackend(
  options: CreateMemoryDatasourceBackendOptions = {},
): DatasourceManagerBackend {
  let store: DatasourceInstance[] = (options.instances ?? []).map((d) => ({ ...d }))
  let types: DatasourceTypeInfo[] = (options.types ?? defaultTypes(store)).map((t) => ({ ...t }))

  function findType(type: string): DatasourceTypeInfo {
    const info = types.find((t) => t.type === type)
    if (!info) throw new DatasourceNotFoundError(type)
    return info
  }

  function findInstance(uid: string): DatasourceInstance {
    const ds = store.find((d) => d.uid === uid)
    if (!ds) throw new DatasourceNotFoundError(uid)
    return ds
  }

  return {
    types: {
      async list() {
        return types.map((t) => ({ ...t }))
      },

      async get(type) {
        return { ...findType(type) }
      },

      async install(type) {
        if (!types.some((t) => t.type === type)) {
          types = [...types, { type, name: type, installed: true, enabled: false }]
        }
      },

      async uninstall(type) {
        findType(type)
        types = types.filter((t) => t.type !== type)
      },

      async enable(type) {
        const current = findType(type)
        types = types.map((t) => t.type === type ? { ...current, enabled: true } : t)
      },

      async disable(type) {
        const current = findType(type)
        types = types.map((t) => t.type === type ? { ...current, enabled: false } : t)
      },
    },

    instances: {
      async list(listOptions?: DatasourceListOptions): Promise<DatasourceListResult> {
        let items = [...store]
        const filter = listOptions?.filter
        if (filter?.type !== undefined) {
          const filterTypes = Array.isArray(filter.type) ? filter.type : [filter.type]
          items = items.filter((d) => filterTypes.includes(d.type))
        }
        if (filter?.enabled !== undefined) {
          items = items.filter((d) => (d.enabled ?? true) === filter.enabled)
        }
        if (filter?.search !== undefined) {
          const query = filter.search.toLowerCase()
          items = items.filter(
            (d) => d.name.toLowerCase().includes(query) || d.uid.toLowerCase().includes(query),
          )
        }
        const total = items.length
        if (listOptions?.page !== undefined && listOptions?.pageSize !== undefined) {
          const start = listOptions.page * listOptions.pageSize
          items = items.slice(start, start + listOptions.pageSize)
        } else if (listOptions?.pageSize !== undefined) {
          items = items.slice(0, listOptions.pageSize)
        }
        return { items: items.map((d) => ({ ...d })), total }
      },

      async get(uid) {
        return { ...findInstance(uid) }
      },

      async create(input: DatasourceCreateInput) {
        const now = new Date().toISOString()
        const uid = input.uid ?? `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const ds: DatasourceInstance = {
          uid,
          type: input.type,
          name: input.name,
          ...(input.options !== undefined ? { options: input.options } : {}),
          enabled: input.enabled ?? true,
          ...(input.meta !== undefined ? { meta: input.meta } : {}),
          version: '1',
          createdAt: now,
          updatedAt: now,
        }
        store = [...store, ds]
        if (!types.some((t) => t.type === input.type)) {
          types = [...types, { type: input.type, name: input.type, installed: true, enabled: true }]
        }
        return { ...ds }
      },

      async update(uid, patch: DatasourceUpdateInput) {
        const idx = store.findIndex((d) => d.uid === uid)
        if (idx === -1) throw new DatasourceNotFoundError(uid)
        const ds = store[idx]
        if (patch.version !== undefined && ds.version !== patch.version) {
          throw new DatasourceConflictError(
            `"${uid}" version conflict: expected ${patch.version}, got ${ds.version}`,
          )
        }
        const updated: DatasourceInstance = {
          ...ds,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.options !== undefined ? { options: patch.options } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.meta !== undefined ? { meta: patch.meta } : {}),
          version: nextVersion(ds.version),
          updatedAt: new Date().toISOString(),
        }
        store = [...store.slice(0, idx), updated, ...store.slice(idx + 1)]
        return { ...updated }
      },

      async delete(uid) {
        findInstance(uid)
        store = store.filter((d) => d.uid !== uid)
      },
    },

    async query(request: DataQuery, _context?: DatasourceContext): Promise<QueryResult> {
      const ds = findInstance(request.datasourceUid)
      return {
        frames: [
          tableRowsToFrame({
            columns: [
              { name: 'name', type: 'string' },
              { name: 'type', type: 'string' },
              { name: 'version', type: 'string' },
            ],
            rows: [[ds.name, ds.type, ds.version ?? '']],
          }),
        ],
        requestId: request.id,
        meta: { datasourceUid: ds.uid },
      }
    },
  }
}
