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
    version?: string
  }

export interface DatasourceListFilter {
  type?: string | string[]
  enabled?: boolean
  search?: string
}

export interface DatasourceListOptions {
  filter?: DatasourceListFilter
  page?: number
  pageSize?: number
  cursor?: string
}

export interface DatasourceListResult {
  items: DatasourceInstance[]
  total?: number
  nextCursor?: string
}

export interface DatasourceManagerContext {
  authToken?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  meta?: Record<string, unknown>
}

export interface DatasourceManager {
  list(options?: DatasourceListOptions, context?: DatasourceManagerContext): Promise<DatasourceListResult>
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
    list(options, context) {
      const params = new URLSearchParams()
      if (options?.filter?.type !== undefined) {
        const types = Array.isArray(options.filter.type) ? options.filter.type : [options.filter.type]
        for (const t of types) params.append('type', t)
      }
      if (options?.filter?.enabled !== undefined) params.set('enabled', String(options.filter.enabled))
      if (options?.filter?.search !== undefined) params.set('search', options.filter.search)
      if (options?.page !== undefined) params.set('page', String(options.page))
      if (options?.pageSize !== undefined) params.set('pageSize', String(options.pageSize))
      if (options?.cursor !== undefined) params.set('cursor', options.cursor)
      const qs = params.toString()
      return send<DatasourceListResult>(qs ? `?${qs}` : '', { method: 'GET' }, context)
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
