export interface AuthSubject {
  id: string
  roles?: string[]
  groups?: string[]
  attributes?: Record<string, unknown>
}

export interface AuthContext {
  subject?: AuthSubject
  tenantId?: string
  attributes?: Record<string, unknown>
}

export interface DataQuery<TQuery = unknown> {
  id: string
  datasourceUid: string
  datasourceType?: string
  query?: TQuery
  options?: Record<string, unknown>
  cacheTtlMs?: number
  staleWhileRevalidate?: boolean
  permissions?: unknown[]
  meta?: Record<string, unknown>
}

export interface DatasourceContext {
  authToken?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  variables?: Record<string, string | string[]>
  timeRange?: { from: string; to: string; raw?: { from: string; to: string } }
  authContext?: AuthContext
  builtins?: Record<string, string>
  meta?: Record<string, unknown>
}

export interface DatasourcePermissionHint {
  canRead?: boolean
  canCreate?: boolean
  canUpdate?: boolean
  canDelete?: boolean
  canQuery?: boolean
  canManage?: boolean
  reason?: string
}

export interface DatasourceTypeInfo {
  type: string
  name: string
  description?: string
  enabled?: boolean
  installed?: boolean
  permissions?: DatasourcePermissionHint
  hasConfigEditor?: boolean
  hasQueryEditor?: boolean
  meta?: Record<string, unknown>
}

export interface DatasourceInstance<TOptions = unknown> {
  uid: string
  type: string
  name: string
  options?: TOptions
  enabled?: boolean
  version?: string
  createdAt?: string
  updatedAt?: string
  permissions?: DatasourcePermissionHint
  meta?: Record<string, unknown>
}

export interface DatasourceCreateInput<TOptions = unknown> {
  uid?: string
  type: string
  name: string
  options?: TOptions
  enabled?: boolean
  meta?: Record<string, unknown>
}

export type DatasourceUpdateInput<TOptions = unknown> =
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

export interface QueryResult {
  columns: Array<{ name: string; type: string; meta?: Record<string, unknown> }>
  rows: unknown[][]
  requestId?: string
  meta?: Record<string, unknown>
}

export interface VariableOption {
  label: string
  value: string
}

export interface DatasourceValidationResult {
  valid: boolean
  errors?: string[]
}

export interface DatasourceHealthResult {
  ok: boolean
  message?: string
  details?: Record<string, unknown>
}

export interface DatasourceSchemaNamespace {
  id: string
  name: string
  kind?: 'database' | 'schema' | 'table' | 'metric' | 'bucket' | 'index' | string
  parentId?: string
  meta?: Record<string, unknown>
}

export interface DatasourceSchemaFieldRequest {
  namespaceId: string
}

export interface DatasourceSchemaField {
  name: string
  type?: string
  label?: string
  description?: string
  meta?: Record<string, unknown>
}

export interface AnnotationQuery<TQuery = unknown> {
  id: string
  datasourceUid: string
  name?: string
  query?: TQuery
  options?: Record<string, unknown>
  hide?: boolean
  color?: string
}

export type BatchQueryResultItem =
  | { data: QueryResult; error?: never }
  | { data?: never; error: Error }

export interface BatchQueryResult {
  items: BatchQueryResultItem[]
}

export interface Annotation {
  id?: string
  time: number
  timeEnd?: number
  title?: string
  text?: string
  tags?: string[]
  color?: string
  source?: AnnotationQuery
  meta?: Record<string, unknown>
}
