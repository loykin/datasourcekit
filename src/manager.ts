import {
  DatasourceCapabilityError,
  DatasourceConflictError,
  DatasourceForbiddenError,
  DatasourceNotFoundError,
  DatasourceTransportError,
  DatasourceTypeNotRegisteredError,
  DatasourceUnauthorizedError,
  DatasourceValidationError,
} from './errors'
import type { DatasourcePluginDef } from './plugin'
import { createDatasourceRegistry, type DatasourceRegistry } from './registry'
import type {
  BatchQueryResult,
  DataQuery,
  DatasourceContext,
  DatasourceCreateInput,
  DatasourceHealthResult,
  DatasourceInstance,
  DatasourceListOptions,
  DatasourceListResult,
  DatasourceSchemaField,
  DatasourceSchemaFieldRequest,
  DatasourceSchemaNamespace,
  DatasourceTypeInfo,
  DatasourceUpdateInput,
  DatasourceValidationResult,
  QueryResult,
} from './types'

export interface QueryCallOptions {
  transform?: (result: QueryResult) => QueryResult | Promise<QueryResult>
}

export interface DatasourceManagerTypes {
  list(context?: DatasourceContext): Promise<DatasourceTypeInfo[]>
  get(type: string, context?: DatasourceContext): Promise<DatasourceTypeInfo>
  install?(type: string, context?: DatasourceContext): Promise<void>
  uninstall?(type: string, context?: DatasourceContext): Promise<void>
  enable?(type: string, context?: DatasourceContext): Promise<void>
  disable?(type: string, context?: DatasourceContext): Promise<void>
}

export interface DatasourceManagerInstances {
  list(options?: DatasourceListOptions, context?: DatasourceContext): Promise<DatasourceListResult>
  get(uid: string, context?: DatasourceContext): Promise<DatasourceInstance>
  create(
    input: DatasourceCreateInput,
    context?: DatasourceContext,
  ): Promise<DatasourceInstance>
  update(
    uid: string,
    patch: DatasourceUpdateInput,
    context?: DatasourceContext,
  ): Promise<DatasourceInstance>
  delete(uid: string, context?: DatasourceContext): Promise<void>
  query(
    request: DataQuery,
    context?: DatasourceContext,
    options?: QueryCallOptions,
  ): Promise<QueryResult>
  batchQuery(
    requests: DataQuery[],
    context?: DatasourceContext,
    options?: QueryCallOptions,
  ): Promise<BatchQueryResult>
  healthCheck(uid: string, type: string, context?: DatasourceContext): Promise<DatasourceHealthResult>
  validateQuery(
    uid: string,
    type: string,
    query: unknown,
    context?: DatasourceContext,
  ): Promise<DatasourceValidationResult>
  listNamespaces(
    uid: string,
    type: string,
    context?: DatasourceContext,
  ): Promise<DatasourceSchemaNamespace[]>
  listFields(
    uid: string,
    type: string,
    request: DatasourceSchemaFieldRequest,
    context?: DatasourceContext,
  ): Promise<DatasourceSchemaField[]>
}

export interface DatasourceManager {
  registerPlugin(plugin: DatasourcePluginDef): void
  registry: DatasourceRegistry
  types: DatasourceManagerTypes
  instances: DatasourceManagerInstances
}

export interface DatasourceManagerBackend {
  types: {
    list(context?: DatasourceContext): Promise<DatasourceTypeInfo[]>
    get(type: string, context?: DatasourceContext): Promise<DatasourceTypeInfo>
    install?(type: string, context?: DatasourceContext): Promise<void>
    uninstall?(type: string, context?: DatasourceContext): Promise<void>
    enable?(type: string, context?: DatasourceContext): Promise<void>
    disable?(type: string, context?: DatasourceContext): Promise<void>
  }
  instances: {
    list(options?: DatasourceListOptions, context?: DatasourceContext): Promise<DatasourceListResult>
    get(uid: string, context?: DatasourceContext): Promise<DatasourceInstance>
    create(
      input: DatasourceCreateInput,
      context?: DatasourceContext,
    ): Promise<DatasourceInstance>
    update(
      uid: string,
      patch: DatasourceUpdateInput,
      context?: DatasourceContext,
    ): Promise<DatasourceInstance>
    delete(uid: string, context?: DatasourceContext): Promise<void>
  }
  query(request: DataQuery, context?: DatasourceContext): Promise<unknown>
  batchQuery?(requests: DataQuery[], context?: DatasourceContext): Promise<BatchQueryResult>
  healthCheck?(uid: string, context?: DatasourceContext): Promise<DatasourceHealthResult>
  validateQuery?(
    uid: string,
    query: unknown,
    context?: DatasourceContext,
  ): Promise<DatasourceValidationResult>
  listNamespaces?(uid: string, context?: DatasourceContext): Promise<DatasourceSchemaNamespace[]>
  listFields?(
    uid: string,
    request: DatasourceSchemaFieldRequest,
    context?: DatasourceContext,
  ): Promise<DatasourceSchemaField[]>
}

export interface CreateDatasourceManagerOptions {
  registry?: DatasourceRegistry
  plugins?: readonly DatasourcePluginDef[]
  backend: DatasourceManagerBackend
}

function getRequestType(request: DataQuery): string {
  if (!request.datasourceType) {
    throw new DatasourceValidationError('query request requires datasourceType', [
      'datasourceType is required for plugin routing',
    ])
  }
  return request.datasourceType
}

function getPlugin(registry: DatasourceRegistry, type: string): DatasourcePluginDef {
  const plugin = registry.get(type)
  if (!plugin) throw new DatasourceTypeNotRegisteredError(type)
  return plugin
}

async function normalizeQueryResult(
  raw: unknown,
  request: DataQuery,
  context: DatasourceContext | undefined,
  plugin: DatasourcePluginDef,
  options: QueryCallOptions | undefined,
): Promise<QueryResult> {
  const normalized = plugin.backend?.transform
    ? await plugin.backend.transform(raw, request, context)
    : raw as QueryResult
  return options?.transform ? options.transform(normalized) : normalized
}

function typeInfoFromPlugin(plugin: DatasourcePluginDef): DatasourceTypeInfo {
  return {
    type: plugin.type,
    name: plugin.name,
    ...(plugin.description !== undefined ? { description: plugin.description } : {}),
    installed: false,
    enabled: false,
    hasConfigEditor: plugin.configEditor !== undefined,
    hasQueryEditor: plugin.queryEditor !== undefined,
    ...(plugin.meta !== undefined ? { meta: plugin.meta } : {}),
  }
}

function mergeTypeInfo(
  backendTypes: DatasourceTypeInfo[],
  plugins: DatasourcePluginDef[],
): DatasourceTypeInfo[] {
  const byType = new Map<string, DatasourceTypeInfo>()
  for (const typeInfo of backendTypes) byType.set(typeInfo.type, { ...typeInfo })

  for (const plugin of plugins) {
    const current = byType.get(plugin.type)
    if (current) {
      byType.set(plugin.type, {
        ...current,
        name: current.name || plugin.name,
        hasConfigEditor: plugin.configEditor !== undefined,
        hasQueryEditor: plugin.queryEditor !== undefined,
      })
    } else {
      byType.set(plugin.type, typeInfoFromPlugin(plugin))
    }
  }

  return [...byType.values()]
}

async function getInstanceOptions(
  backend: DatasourceManagerBackend,
  uid: string,
  context?: DatasourceContext,
): Promise<unknown> {
  const instance = await backend.instances.get(uid, context)
  return instance.options ?? {}
}

function missingCapability(uid: string, capability: string): never {
  throw new DatasourceCapabilityError(uid, capability)
}

export function createDatasourceManager(options: CreateDatasourceManagerOptions): DatasourceManager {
  const registry = options.registry ?? createDatasourceRegistry(options.plugins)

  if (options.registry && options.plugins) {
    for (const plugin of options.plugins) registry.register(plugin)
  }

  const manager: DatasourceManager = {
    registry,

    registerPlugin(plugin) {
      registry.register(plugin)
    },

    types: {
      async list(context) {
        const backendTypes = await options.backend.types.list(context)
        return mergeTypeInfo(backendTypes, registry.list())
      },

      async get(type, context) {
        const plugin = registry.get(type)
        let backendType: DatasourceTypeInfo | undefined
        try {
          backendType = await options.backend.types.get(type, context)
        } catch (error) {
          if (!(error instanceof DatasourceNotFoundError) || !plugin) throw error
        }
        if (!backendType) {
          if (!plugin) throw new DatasourceNotFoundError(type)
          return typeInfoFromPlugin(plugin)
        }
        if (!plugin) return backendType
        return {
          ...backendType,
          hasConfigEditor: plugin.configEditor !== undefined,
          hasQueryEditor: plugin.queryEditor !== undefined,
        }
      },

      ...(options.backend.types.install
        ? { install: (type, context) => options.backend.types.install?.(type, context) ?? missingCapability(type, 'types.install') }
        : {}),
      ...(options.backend.types.uninstall
        ? { uninstall: (type, context) => options.backend.types.uninstall?.(type, context) ?? missingCapability(type, 'types.uninstall') }
        : {}),
      ...(options.backend.types.enable
        ? { enable: (type, context) => options.backend.types.enable?.(type, context) ?? missingCapability(type, 'types.enable') }
        : {}),
      ...(options.backend.types.disable
        ? { disable: (type, context) => options.backend.types.disable?.(type, context) ?? missingCapability(type, 'types.disable') }
        : {}),
    },

    instances: {
      list: (listOptions, context) => options.backend.instances.list(listOptions, context),
      get: (uid, context) => options.backend.instances.get(uid, context),
      create: (input, context) => options.backend.instances.create(input, context),
      update: (uid, patch, context) => options.backend.instances.update(uid, patch, context),
      delete: (uid, context) => options.backend.instances.delete(uid, context),

      async query(request, context, callOptions) {
        const type = getRequestType(request)
        const plugin = getPlugin(registry, type)
        const raw = plugin.backend?.query
          ? await plugin.backend.query(request, context)
          : await options.backend.query(request, context)
        return normalizeQueryResult(raw, request, context, plugin, callOptions)
      },

      async batchQuery(requests, context, callOptions) {
        if (options.backend.batchQuery) {
          const result = await options.backend.batchQuery(requests, context)
          if (!callOptions?.transform) return result
          const items = await Promise.all(result.items.map(async (item) => {
            if (item.error || !item.data) return item
            try {
              return { data: await callOptions.transform!(item.data) }
            } catch (error) {
              return { error: error instanceof Error ? error : new Error(String(error)) }
            }
          }))
          return { items }
        }

        const items = await Promise.all(requests.map(async (request) => {
          try {
            const data = await manager.instances.query(request, context, callOptions)
            return { data }
          } catch (error) {
            return { error: error instanceof Error ? error : new Error(String(error)) }
          }
        }))
        return { items }
      },

      async healthCheck(uid, type, context) {
        const plugin = getPlugin(registry, type)
        if (plugin.backend?.healthCheck) {
          const datasourceOptions = await getInstanceOptions(options.backend, uid, context)
          return plugin.backend.healthCheck(uid, datasourceOptions, context)
        }
        return options.backend.healthCheck?.(uid, context) ?? missingCapability(uid, 'healthCheck')
      },

      async validateQuery(uid, type, query, context) {
        const plugin = getPlugin(registry, type)
        if (plugin.backend?.validateQuery) {
          return plugin.backend.validateQuery(uid, query, context)
        }
        return options.backend.validateQuery?.(uid, query, context) ?? missingCapability(uid, 'validateQuery')
      },

      async listNamespaces(uid, type, context) {
        const plugin = getPlugin(registry, type)
        if (plugin.backend?.listNamespaces) {
          const datasourceOptions = await getInstanceOptions(options.backend, uid, context)
          return plugin.backend.listNamespaces(uid, datasourceOptions, context)
        }
        return options.backend.listNamespaces?.(uid, context) ?? missingCapability(uid, 'listNamespaces')
      },

      async listFields(uid, type, request, context) {
        const plugin = getPlugin(registry, type)
        if (plugin.backend?.listFields) {
          const datasourceOptions = await getInstanceOptions(options.backend, uid, context)
          return plugin.backend.listFields(uid, request, datasourceOptions, context)
        }
        return options.backend.listFields?.(uid, request, context) ?? missingCapability(uid, 'listFields')
      },
    },
  }

  return manager
}

export interface CreateRestDatasourceManagerOptions {
  baseUrl: string
  fetch?: typeof fetch
  getHeaders?: (context?: DatasourceContext) => HeadersInit | Promise<HeadersInit>
  paths?: Partial<RestDatasourceManagerPaths>
  unwrap?<T>(body: unknown, response: Response): T
  createError?(response: Response, body: unknown): Error | undefined
}

export interface RestDatasourceManagerPaths {
  typesList(): string
  typeGet(type: string): string
  typeAction(type: string, action: 'install' | 'uninstall' | 'enable' | 'disable'): string
  instancesList(queryString: string): string
  instanceGet(uid: string): string
  instanceCreate(): string
  instanceUpdate(uid: string): string
  instanceDelete(uid: string): string
  query(): string
  healthCheck(uid: string): string
  validateQuery(uid: string): string
  listNamespaces(uid: string): string
  listFields(uid: string): string
}

const defaultRestPaths: RestDatasourceManagerPaths = {
  typesList: () => '/types',
  typeGet: (type) => `/types/${encodeURIComponent(type)}`,
  typeAction: (type, action) => `/types/${encodeURIComponent(type)}/${action}`,
  instancesList: (qs) => qs,
  instanceGet: (uid) => `/${encodeURIComponent(uid)}`,
  instanceCreate: () => '',
  instanceUpdate: (uid) => `/${encodeURIComponent(uid)}`,
  instanceDelete: (uid) => `/${encodeURIComponent(uid)}`,
  query: () => '/query',
  healthCheck: (uid) => `/${encodeURIComponent(uid)}/health`,
  validateQuery: (uid) => `/${encodeURIComponent(uid)}/validate-query`,
  listNamespaces: (uid) => `/${encodeURIComponent(uid)}/namespaces`,
  listFields: (uid) => `/${encodeURIComponent(uid)}/fields`,
}

function mergeRestPaths(paths?: Partial<RestDatasourceManagerPaths>): RestDatasourceManagerPaths {
  return { ...defaultRestPaths, ...paths }
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function parseResponse<T>(
  response: Response,
  options: CreateRestDatasourceManagerOptions,
): Promise<T> {
  const body = await readJson(response)

  if (response.ok) {
    return options.unwrap ? options.unwrap<T>(body, response) : body as T
  }

  const customError = options.createError?.(response, body)
  if (customError) throw customError

  const errorBody = body as { message?: string; errors?: string[] } | undefined
  const message = errorBody?.message
  if (response.status === 401) throw new DatasourceUnauthorizedError(message)
  if (response.status === 403) throw new DatasourceForbiddenError(message)
  if (response.status === 404) throw new DatasourceNotFoundError(message ?? 'unknown')
  if (response.status === 409) throw new DatasourceConflictError(message)
  if (response.status === 422) throw new DatasourceValidationError(message, errorBody?.errors)
  throw new DatasourceTransportError(message, response.status)
}

async function requestHeaders(
  options: CreateRestDatasourceManagerOptions,
  context?: DatasourceContext,
): Promise<HeadersInit> {
  return {
    'content-type': 'application/json',
    ...(context?.authToken ? { authorization: `Bearer ${context.authToken}` } : {}),
    ...(context?.headers ?? {}),
    ...await options.getHeaders?.(context),
  }
}

function queryString(options?: DatasourceListOptions): string {
  const params = new URLSearchParams()
  if (options?.filter?.type !== undefined) {
    const types = Array.isArray(options.filter.type) ? options.filter.type : [options.filter.type]
    for (const type of types) params.append('type', type)
  }
  if (options?.filter?.enabled !== undefined) params.set('enabled', String(options.filter.enabled))
  if (options?.filter?.search !== undefined) params.set('search', options.filter.search)
  if (options?.page !== undefined) params.set('page', String(options.page))
  if (options?.pageSize !== undefined) params.set('pageSize', String(options.pageSize))
  if (options?.cursor !== undefined) params.set('cursor', options.cursor)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function createRestDatasourceManager(
  options: CreateRestDatasourceManagerOptions,
): DatasourceManagerBackend {
  const fetchImpl = options.fetch ?? fetch
  const baseUrl = options.baseUrl.replace(/\/$/, '')
  const paths = mergeRestPaths(options.paths)

  async function send<T>(
    path: string,
    init: RequestInit,
    context?: DatasourceContext,
  ): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: await requestHeaders(options, context),
      ...(context?.signal ? { signal: context.signal } : {}),
    })
    return parseResponse<T>(response, options)
  }

  return {
    types: {
      list: (context) => send<DatasourceTypeInfo[]>(paths.typesList(), { method: 'GET' }, context),
      get: (type, context) => send<DatasourceTypeInfo>(paths.typeGet(type), { method: 'GET' }, context),
      install: (type, context) => send<void>(paths.typeAction(type, 'install'), { method: 'POST' }, context),
      uninstall: (type, context) => send<void>(paths.typeAction(type, 'uninstall'), { method: 'POST' }, context),
      enable: (type, context) => send<void>(paths.typeAction(type, 'enable'), { method: 'POST' }, context),
      disable: (type, context) => send<void>(paths.typeAction(type, 'disable'), { method: 'POST' }, context),
    },
    instances: {
      list: (options, context) => send<DatasourceListResult>(paths.instancesList(queryString(options)), { method: 'GET' }, context),
      get: (uid, context) => send<DatasourceInstance>(paths.instanceGet(uid), { method: 'GET' }, context),
      create: (input, context) => send<DatasourceInstance>(paths.instanceCreate(), {
        method: 'POST',
        body: JSON.stringify(input),
      }, context),
      update: (uid, patch, context) => send<DatasourceInstance>(paths.instanceUpdate(uid), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }, context),
      delete: (uid, context) => send<void>(paths.instanceDelete(uid), { method: 'DELETE' }, context),
    },
    query: (request, context) => send<unknown>(paths.query(), {
      method: 'POST',
      body: JSON.stringify(request),
    }, context),
    healthCheck: (uid, context) => send<DatasourceHealthResult>(paths.healthCheck(uid), { method: 'GET' }, context),
    validateQuery: (uid, query, context) => send<DatasourceValidationResult>(paths.validateQuery(uid), {
      method: 'POST',
      body: JSON.stringify(query),
    }, context),
    listNamespaces: (uid, context) => send<DatasourceSchemaNamespace[]>(paths.listNamespaces(uid), { method: 'GET' }, context),
    listFields: (uid, request, context) => send<DatasourceSchemaField[]>(paths.listFields(uid), {
      method: 'POST',
      body: JSON.stringify(request),
    }, context),
  }
}
