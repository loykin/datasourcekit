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

export interface QueryContext {
  variables?: Record<string, string | string[]>
  timeRange?: { from: string; to: string; raw?: { from: string; to: string } }
  authContext?: AuthContext
  signal?: AbortSignal
  builtins?: Record<string, string>
  meta?: Record<string, unknown>
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
