import { DatasourceCapabilityError } from './errors'
import type {
  Annotation,
  AnnotationQuery,
  BatchQueryResult,
  DataQuery,
  DatasourceHealthResult,
  DatasourceSchemaField,
  DatasourceSchemaFieldRequest,
  DatasourceSchemaNamespace,
  DatasourceValidationResult,
  QueryContext,
  QueryResult,
  VariableOption,
} from './types'

export interface QueryCallOptions {
  transform?: (result: QueryResult) => QueryResult | Promise<QueryResult>
}

export interface DatasourceRuntime {
  query(request: DataQuery, context?: QueryContext, options?: QueryCallOptions): Promise<QueryResult>
  batchQuery(requests: DataQuery[], context?: QueryContext, options?: QueryCallOptions): Promise<BatchQueryResult>
  subscribe?: (
    request: DataQuery,
    context: QueryContext,
    onData: (result: QueryResult) => void,
    onError: (error: Error) => void,
    options?: QueryCallOptions,
  ) => () => void
  healthCheck(uid: string, context?: QueryContext): Promise<DatasourceHealthResult>
  validateQuery(uid: string, query: unknown, context?: QueryContext): Promise<DatasourceValidationResult>
  listNamespaces(uid: string, context?: QueryContext): Promise<DatasourceSchemaNamespace[]>
  listFields(
    uid: string,
    request: DatasourceSchemaFieldRequest,
    context?: QueryContext,
  ): Promise<DatasourceSchemaField[]>
  variableQuery(request: DataQuery<string>, context?: QueryContext): Promise<VariableOption[]>
  queryAnnotations(query: AnnotationQuery, context?: QueryContext): Promise<Annotation[]>
}

type DatasourceRuntimeHandlersBase = {
  // When provided, the backend handles batching natively.
  // When omitted, defineDatasourceRuntime falls back to parallel query() calls.
  batchQuery?: (requests: DataQuery[], context?: QueryContext) => Promise<BatchQueryResult>
  subscribe?: (
    request: DataQuery,
    context: QueryContext,
    onData: (raw: unknown) => void,
    onError: (error: Error) => void,
  ) => () => void
  healthCheck?: (uid: string, context?: QueryContext) => Promise<DatasourceHealthResult>
  validateQuery?: (uid: string, query: unknown, context?: QueryContext) => Promise<DatasourceValidationResult>
  listNamespaces?: (uid: string, context?: QueryContext) => Promise<DatasourceSchemaNamespace[]>
  listFields?: (
    uid: string,
    request: DatasourceSchemaFieldRequest,
    context?: QueryContext,
  ) => Promise<DatasourceSchemaField[]>
  variableQuery?: (request: DataQuery<string>, context?: QueryContext) => Promise<VariableOption[]>
  queryAnnotations?: (query: AnnotationQuery, context?: QueryContext) => Promise<Annotation[]>
}

// When transform is provided, query may return any backend-specific shape.
// When transform is omitted, query must return QueryResult directly.
type DatasourceRuntimeHandlersWithTransform = DatasourceRuntimeHandlersBase & {
  query(request: DataQuery, context?: QueryContext): Promise<unknown>
  transform(raw: unknown, request: DataQuery, context?: QueryContext): QueryResult | Promise<QueryResult>
}

type DatasourceRuntimeHandlersNoTransform = DatasourceRuntimeHandlersBase & {
  query(request: DataQuery, context?: QueryContext): Promise<QueryResult>
}

export type DatasourceRuntimeHandlers =
  | DatasourceRuntimeHandlersWithTransform
  | DatasourceRuntimeHandlersNoTransform

async function applyTransforms(
  raw: unknown,
  request: DataQuery,
  context: QueryContext | undefined,
  runtimeTransform: DatasourceRuntimeHandlersWithTransform['transform'] | undefined,
  callTransform: QueryCallOptions['transform'],
): Promise<QueryResult> {
  const normalized = runtimeTransform
    ? await runtimeTransform(raw, request, context)
    : (raw as QueryResult)
  return callTransform ? callTransform(normalized) : normalized
}

export function defineDatasourceRuntime(handlers: DatasourceRuntimeHandlers): DatasourceRuntime {
  const runtimeTransform = 'transform' in handlers ? handlers.transform : undefined

  const runtime: DatasourceRuntime = {
    async query(request, context, options) {
      const raw = await handlers.query(request, context)
      return applyTransforms(raw, request, context, runtimeTransform, options?.transform)
    },

    async batchQuery(requests, context, options) {
      if (handlers.batchQuery) {
        return handlers.batchQuery(requests, context)
      }
      const items = await Promise.all(
        requests.map(async (request) => {
          try {
            const data = await runtime.query(request, context, options)
            return { data }
          } catch (error) {
            return { error: error instanceof Error ? error : new Error(String(error)) }
          }
        }),
      )
      return { items }
    },

    async healthCheck(uid, context) {
      if (!handlers.healthCheck) throw new DatasourceCapabilityError(uid, 'healthCheck')
      return handlers.healthCheck(uid, context)
    },

    async validateQuery(uid, query, context) {
      if (!handlers.validateQuery) throw new DatasourceCapabilityError(uid, 'validateQuery')
      return handlers.validateQuery(uid, query, context)
    },

    async listNamespaces(uid, context) {
      if (!handlers.listNamespaces) throw new DatasourceCapabilityError(uid, 'listNamespaces')
      return handlers.listNamespaces(uid, context)
    },

    async listFields(uid, request, context) {
      if (!handlers.listFields) throw new DatasourceCapabilityError(uid, 'listFields')
      return handlers.listFields(uid, request, context)
    },

    async variableQuery(request, context) {
      if (!handlers.variableQuery) throw new DatasourceCapabilityError(request.datasourceUid, 'variableQuery')
      return handlers.variableQuery(request, context)
    },

    async queryAnnotations(query, context) {
      if (!handlers.queryAnnotations) throw new DatasourceCapabilityError(query.datasourceUid, 'queryAnnotations')
      return handlers.queryAnnotations(query, context)
    },
  }

  if (handlers.subscribe) {
    const handlerSubscribe = handlers.subscribe
    runtime.subscribe = (request, context, onData, onError, options) =>
      handlerSubscribe(request, context, async (raw) => {
        const result = await applyTransforms(raw, request, context, runtimeTransform, options?.transform)
        onData(result)
      }, onError)
  }

  return runtime
}
