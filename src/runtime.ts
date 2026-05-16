import type {
  Annotation,
  AnnotationQuery,
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
  metricFindQuery(request: DataQuery<string>, context?: QueryContext): Promise<VariableOption[]>
  queryAnnotations(query: AnnotationQuery, context?: QueryContext): Promise<Annotation[]>
}

export interface DatasourceRuntimeHandlers {
  // If query returns unknown, transform must convert it to QueryResult.
  // If transform is omitted, query must return QueryResult directly.
  query(request: DataQuery, context?: QueryContext): Promise<unknown>
  transform?: (raw: unknown, request: DataQuery, context?: QueryContext) => QueryResult | Promise<QueryResult>
  subscribe?(
    request: DataQuery,
    context: QueryContext,
    onData: (result: QueryResult) => void,
    onError: (error: Error) => void,
  ): () => void
  healthCheck(uid: string, context?: QueryContext): Promise<DatasourceHealthResult>
  validateQuery(uid: string, query: unknown, context?: QueryContext): Promise<DatasourceValidationResult>
  listNamespaces(uid: string, context?: QueryContext): Promise<DatasourceSchemaNamespace[]>
  listFields(
    uid: string,
    request: DatasourceSchemaFieldRequest,
    context?: QueryContext,
  ): Promise<DatasourceSchemaField[]>
  metricFindQuery(request: DataQuery<string>, context?: QueryContext): Promise<VariableOption[]>
  queryAnnotations(query: AnnotationQuery, context?: QueryContext): Promise<Annotation[]>
}

async function applyTransforms(
  raw: unknown,
  request: DataQuery,
  context: QueryContext | undefined,
  runtimeTransform: DatasourceRuntimeHandlers['transform'],
  callTransform: QueryCallOptions['transform'],
): Promise<QueryResult> {
  const normalized = runtimeTransform
    ? await runtimeTransform(raw, request, context)
    : (raw as QueryResult)
  return callTransform ? callTransform(normalized) : normalized
}

export function defineDatasourceRuntime(handlers: DatasourceRuntimeHandlers): DatasourceRuntime {
  const runtime: DatasourceRuntime = {
    async query(request, context, options) {
      const raw = await handlers.query(request, context)
      return applyTransforms(raw, request, context, handlers.transform, options?.transform)
    },
    healthCheck: handlers.healthCheck,
    validateQuery: handlers.validateQuery,
    listNamespaces: handlers.listNamespaces,
    listFields: handlers.listFields,
    metricFindQuery: handlers.metricFindQuery,
    queryAnnotations: handlers.queryAnnotations,
  }

  if (handlers.subscribe) {
    const handlerSubscribe = handlers.subscribe
    runtime.subscribe = (request, context, onData, onError, options) =>
      handlerSubscribe(request, context, async (result) => {
        const transformed = options?.transform ? await options.transform(result) : result
        onData(transformed)
      }, onError)
  }

  return runtime
}
