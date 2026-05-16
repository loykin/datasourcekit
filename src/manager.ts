import {
  DatasourceConflictError,
  DatasourceForbiddenError,
  DatasourceNotFoundError,
  DatasourceTransportError,
  DatasourceUnauthorizedError,
  DatasourceValidationError,
} from './errors'

export interface DatasourceInstance<TOptions = Record<string, unknown>> {
  uid: string
  type: string
  name: string
  options?: TOptions
  enabled?: boolean
  version?: string
  createdAt?: string
  updatedAt?: string
  meta?: Record<string, unknown>
}

export interface DatasourceCreateInput<TOptions = Record<string, unknown>> {
  uid?: string
  type: string
  name: string
  options?: TOptions
  enabled?: boolean
  meta?: Record<string, unknown>
}

export type DatasourceUpdateInput<TOptions = Record<string, unknown>> =
  Partial<Omit<DatasourceCreateInput<TOptions>, 'uid' | 'type'>> & {
    type?: string
    version?: string
  }

export interface DatasourceManagerContext {
  authToken?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  meta?: Record<string, unknown>
}

export interface DatasourceManager {
  list(context?: DatasourceManagerContext): Promise<DatasourceInstance[]>
  get(uid: string, context?: DatasourceManagerContext): Promise<DatasourceInstance>
  create(
    input: DatasourceCreateInput,
    context?: DatasourceManagerContext,
  ): Promise<DatasourceInstance>
  update(
    uid: string,
    patch: DatasourceUpdateInput,
    context?: DatasourceManagerContext,
  ): Promise<DatasourceInstance>
  delete(uid: string, context?: DatasourceManagerContext): Promise<void>
}

export function defineDatasourceManager(handlers: DatasourceManager): DatasourceManager {
  return handlers
}

function nextVersion(current?: string): string {
  const value = Number(current ?? 0)
  return Number.isFinite(value) ? String(value + 1) : String(Date.now())
}

export function createMemoryDatasourceManager(
  initialInstances: readonly DatasourceInstance[] = [],
): DatasourceManager {
  const byUid = new Map(initialInstances.map((instance) => [instance.uid, instance]))

  return {
    async list() {
      return [...byUid.values()]
    },

    async get(uid) {
      const instance = byUid.get(uid)
      if (!instance) throw new DatasourceNotFoundError(uid)
      return instance
    },

    async create(input) {
      const uid = input.uid ?? crypto.randomUUID()
      if (byUid.has(uid)) throw new DatasourceConflictError(`datasource "${uid}" already exists`)
      const now = new Date().toISOString()
      const instance: DatasourceInstance = {
        uid,
        type: input.type,
        name: input.name,
        ...(input.options !== undefined ? { options: input.options } : {}),
        enabled: input.enabled ?? true,
        version: '1',
        createdAt: now,
        updatedAt: now,
        ...(input.meta !== undefined ? { meta: input.meta } : {}),
      }
      byUid.set(uid, instance)
      return instance
    },

    async update(uid, patch) {
      const current = byUid.get(uid)
      if (!current) throw new DatasourceNotFoundError(uid)
      if (patch.version !== undefined && current.version !== patch.version) {
        throw new DatasourceConflictError(`datasource "${uid}" version conflict`)
      }
      const instance: DatasourceInstance = {
        ...current,
        ...patch,
        uid,
        type: patch.type ?? current.type,
        name: patch.name ?? current.name,
        version: nextVersion(current.version),
        updatedAt: new Date().toISOString(),
      }
      byUid.set(uid, instance)
      return instance
    },

    async delete(uid) {
      if (!byUid.delete(uid)) throw new DatasourceNotFoundError(uid)
    },
  }
}

export interface CreateRestDatasourceManagerOptions {
  baseUrl: string
  fetch?: typeof fetch
  getHeaders?: (
    context?: DatasourceManagerContext,
  ) => HeadersInit | Promise<HeadersInit>
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  let body: { message?: string; errors?: string[] } | undefined
  try {
    body = await response.json()
  } catch {
    body = undefined
  }

  const message = body?.message
  if (response.status === 401) throw new DatasourceUnauthorizedError(message)
  if (response.status === 403) throw new DatasourceForbiddenError(message)
  if (response.status === 404) throw new DatasourceNotFoundError(message ?? 'unknown')
  if (response.status === 409) throw new DatasourceConflictError(message)
  if (response.status === 422) throw new DatasourceValidationError(message, body?.errors)
  throw new DatasourceTransportError(message, response.status)
}

async function requestHeaders(
  options: CreateRestDatasourceManagerOptions,
  context?: DatasourceManagerContext,
): Promise<HeadersInit> {
  const headers = {
    'content-type': 'application/json',
    ...(context?.authToken ? { authorization: `Bearer ${context.authToken}` } : {}),
    ...(context?.headers ?? {}),
  }
  return {
    ...headers,
    ...await options.getHeaders?.(context),
  }
}

export function createRestDatasourceManager(
  options: CreateRestDatasourceManagerOptions,
): DatasourceManager {
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = options.baseUrl.replace(/\/$/, '')

  async function send<T>(
    path: string,
    init: RequestInit,
    context?: DatasourceManagerContext,
  ): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: await requestHeaders(options, context),
      ...(context?.signal ? { signal: context.signal } : {}),
    })
    return parseResponse<T>(response)
  }

  return {
    list(context) {
      return send<DatasourceInstance[]>('', { method: 'GET' }, context)
    },

    get(uid, context) {
      return send<DatasourceInstance>(`/${encodeURIComponent(uid)}`, { method: 'GET' }, context)
    },

    create(input, context) {
      return send<DatasourceInstance>('', {
        method: 'POST',
        body: JSON.stringify(input),
      }, context)
    },

    update(uid, patch, context) {
      return send<DatasourceInstance>(`/${encodeURIComponent(uid)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }, context)
    },

    async delete(uid, context) {
      await send<void>(`/${encodeURIComponent(uid)}`, { method: 'DELETE' }, context)
    },
  }
}
