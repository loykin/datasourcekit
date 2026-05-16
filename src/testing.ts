import { DatasourceConflictError, DatasourceNotFoundError } from './errors'
import type {
  DatasourceCreateInput,
  DatasourceInstance,
  DatasourceManager,
  DatasourceUpdateInput,
} from './manager'

function nextVersion(current?: string): string {
  return String(Number(current ?? '0') + 1)
}

export function createMemoryDatasourceManager(
  seed: DatasourceInstance[] = [],
): DatasourceManager {
  let store: DatasourceInstance[] = seed.map((d) => ({ ...d }))

  return {
    async list() {
      return [...store]
    },

    async get(uid) {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return { ...ds }
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
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        version: nextVersion(ds.version),
        updatedAt: new Date().toISOString(),
      }
      store = [...store.slice(0, idx), updated, ...store.slice(idx + 1)]
      return { ...updated }
    },

    async delete(uid) {
      const exists = store.some((d) => d.uid === uid)
      if (!exists) throw new DatasourceNotFoundError(uid)
      store = store.filter((d) => d.uid !== uid)
    },
  }
}
