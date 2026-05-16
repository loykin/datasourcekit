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

export interface DatasourceRuntime {
  query(request: DataQuery, context?: QueryContext): Promise<QueryResult>
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

export function defineDatasourceRuntime(handlers: DatasourceRuntime): DatasourceRuntime {
  return handlers
}
