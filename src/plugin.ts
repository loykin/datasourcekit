import type {
  DataQuery,
  DatasourceContext,
  DatasourceHealthResult,
  DatasourceInstance,
  DatasourceSchemaField,
  DatasourceSchemaFieldRequest,
  DatasourceSchemaNamespace,
  DatasourceValidationResult,
  QueryResult,
} from './types'

export interface DatasourceConfigEditorProps<TOptions = unknown> {
  instance: DatasourceInstance<TOptions>
  options: TOptions
  onChange(options: TOptions): void
  onSave(): void
}

export interface DatasourceQueryEditorProps<TOptions = unknown, TQuery = unknown> {
  instance: DatasourceInstance<TOptions>
  query: TQuery
  onChange(query: TQuery): void
  onRunQuery(): void
}

export interface DatasourcePluginBackend<TOptions = unknown, TQuery = unknown> {
  query?(request: DataQuery<TQuery>, context?: DatasourceContext): Promise<unknown>
  transform?(
    raw: unknown,
    request: DataQuery<TQuery>,
    context?: DatasourceContext,
  ): QueryResult | Promise<QueryResult>
  healthCheck?(
    uid: string,
    options: TOptions,
    context?: DatasourceContext,
  ): Promise<DatasourceHealthResult>
  validateQuery?(
    uid: string,
    query: TQuery,
    context?: DatasourceContext,
  ): Promise<DatasourceValidationResult>
  listNamespaces?(
    uid: string,
    options: TOptions,
    context?: DatasourceContext,
  ): Promise<DatasourceSchemaNamespace[]>
  listFields?(
    uid: string,
    request: DatasourceSchemaFieldRequest,
    options: TOptions,
    context?: DatasourceContext,
  ): Promise<DatasourceSchemaField[]>
}

export interface DatasourcePluginDef<TOptions = unknown, TQuery = unknown> {
  type: string
  name: string
  description?: string
  configEditor?(props: DatasourceConfigEditorProps<TOptions>): unknown
  queryEditor?(props: DatasourceQueryEditorProps<TOptions, TQuery>): unknown
  backend?: DatasourcePluginBackend<TOptions, TQuery>
  meta?: Record<string, unknown>
}

export function defineDatasourcePlugin<TOptions = unknown, TQuery = unknown>(
  def: DatasourcePluginDef<TOptions, TQuery>,
): DatasourcePluginDef<TOptions, TQuery> {
  return def
}
