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

export type DatasourceFrameType = string
export type DatasourceFieldKind = string

export interface DatasourceField {
  name: string
  kind?: DatasourceFieldKind
  type?: string
  labels?: Record<string, string>
  values: unknown[]
  meta?: Record<string, unknown>
}

export interface DatasourceFrame {
  name?: string
  frameType: DatasourceFrameType
  fields: DatasourceField[]
  meta?: Record<string, unknown>
}

export interface QueryStats {
  executionTimeMs?: number
  rowsReturned?: number
  bytesRead?: number
  meta?: Record<string, unknown>
}

export interface QueryInspect {
  rawQuery?: string
  executedQuery?: string
  meta?: Record<string, unknown>
}

export interface QueryResult {
  frames: DatasourceFrame[]
  stats?: QueryStats
  inspect?: QueryInspect
  requestId?: string
  meta?: Record<string, unknown>
}

export interface TableRowsInput {
  columns: Array<{ name: string; type?: string; meta?: Record<string, unknown> }>
  rows: unknown[][]
  name?: string
  meta?: Record<string, unknown>
}

export interface TableRowsOutput {
  columns: Array<{ name: string; type?: string; meta?: Record<string, unknown> }>
  rows: unknown[][]
}

export function tableRowsToFrame(input: TableRowsInput): DatasourceFrame {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    frameType: 'table',
    fields: input.columns.map((column, columnIndex) => ({
      name: column.name,
      ...(column.type !== undefined ? { type: column.type } : {}),
      values: input.rows.map((row) => row[columnIndex]),
      ...(column.meta !== undefined ? { meta: column.meta } : {}),
    })),
    ...(input.meta !== undefined ? { meta: input.meta } : {}),
  }
}

export function tableFrameToRows(frame: DatasourceFrame): TableRowsOutput {
  const rowCount = frame.fields.reduce((max, field) => Math.max(max, field.values.length), 0)
  return {
    columns: frame.fields.map((field) => ({
      name: field.name,
      ...(field.type !== undefined ? { type: field.type } : {}),
      ...(field.meta !== undefined ? { meta: field.meta } : {}),
    })),
    rows: Array.from({ length: rowCount }, (_, rowIndex) =>
      frame.fields.map((field) => field.values[rowIndex]),
    ),
  }
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

export type DatasourceSchemaKind = string

export interface DatasourceSchemaNamespace {
  id: string
  name: string
  kind?: DatasourceSchemaKind
  parentId?: string
  hasChildren?: boolean
  meta?: Record<string, unknown>
}

export interface DatasourceSchemaFieldRequest {
  namespaceId: string
}

export interface DatasourceSchemaField {
  name: string
  type?: string
  kind?: DatasourceFieldKind
  nullable?: boolean
  label?: string
  insertText?: string
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
  | { id: string; data: QueryResult; error?: never }
  | { id: string; data?: never; error: Error }

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
