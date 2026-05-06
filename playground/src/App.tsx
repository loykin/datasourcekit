import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createDatasourceExecutor,
  defineDatasource,
  type Annotation,
  type DataQuery,
  type DatasourceHealthResult,
  type DatasourcePluginDef,
  type DatasourceSchemaField,
  type DatasourceSchemaNamespace,
  type DatasourceValidationResult,
  type QueryContext,
  type QueryResult,
  type VariableOption,
} from '@loykin/datasourcekit'

type SalesOptions = {
  endpoint: string
  region: string
  sampleRate: number
}

type SalesQuery = {
  metric: 'orders' | 'revenue' | 'countries'
  country: string
  limit: number
  minRevenue: number
}

type LogEntry = {
  id: number
  level: 'info' | 'error'
  message: string
  detail?: unknown
}

const countries = ['US', 'KR', 'JP', 'DE', 'FR']
const datasourceUid = 'sales-demo'
const datasourceOptions: SalesOptions = {
  endpoint: 'https://example.internal/sales',
  region: 'ap-northeast-2',
  sampleRate: 1,
}

const salesRows = [
  { orderId: 'A-1001', country: 'US', product: 'Atlas', revenue: 12800, status: 'paid' },
  { orderId: 'A-1002', country: 'KR', product: 'Beacon', revenue: 9400, status: 'paid' },
  { orderId: 'A-1003', country: 'JP', product: 'Compass', revenue: 11200, status: 'review' },
  { orderId: 'A-1004', country: 'DE', product: 'Atlas', revenue: 7600, status: 'paid' },
  { orderId: 'A-1005', country: 'FR', product: 'Beacon', revenue: 6900, status: 'paid' },
  { orderId: 'A-1006', country: 'US', product: 'Compass', revenue: 15300, status: 'paid' },
  { orderId: 'A-1007', country: 'KR', product: 'Atlas', revenue: 18100, status: 'review' },
]

function querySales(request: DataQuery<SalesQuery>, context: QueryContext & { datasourceOptions: SalesOptions }): QueryResult {
  const query = request.query ?? { metric: 'orders', country: 'all', limit: 10, minRevenue: 0 }
  const filtered = salesRows
    .filter((row) => query.country === 'all' || row.country === query.country)
    .filter((row) => row.revenue >= query.minRevenue)
    .slice(0, query.limit)

  if (query.metric === 'countries') {
    const grouped = countries.map((country) => {
      const countryRows = filtered.filter((row) => row.country === country)
      return [country, countryRows.length, countryRows.reduce((sum, row) => sum + row.revenue, 0)]
    })

    return {
      columns: [
        { name: 'country', type: 'string' },
        { name: 'orders', type: 'number' },
        { name: 'revenue', type: 'number' },
      ],
      rows: grouped,
      requestId: request.id,
      meta: { endpoint: context.datasourceOptions.endpoint, region: context.datasourceOptions.region },
    }
  }

  if (query.metric === 'revenue') {
    return {
      columns: [
        { name: 'product', type: 'string' },
        { name: 'revenue', type: 'number' },
      ],
      rows: Object.entries(
        filtered.reduce<Record<string, number>>((acc, row) => {
          acc[row.product] = (acc[row.product] ?? 0) + row.revenue
          return acc
        }, {}),
      ).map(([product, revenue]) => [product, revenue]),
      requestId: request.id,
      meta: { sampleRate: context.datasourceOptions.sampleRate, variables: context.variables ?? {} },
    }
  }

  return {
    columns: [
      { name: 'orderId', type: 'string' },
      { name: 'country', type: 'string' },
      { name: 'product', type: 'string' },
      { name: 'revenue', type: 'number' },
      { name: 'status', type: 'string' },
    ],
    rows: filtered.map((row) => [row.orderId, row.country, row.product, row.revenue, row.status]),
    requestId: request.id,
    meta: { source: 'mock-sales', tenantId: context.authContext?.tenantId },
  }
}

const salesDatasource = defineDatasource<SalesOptions, SalesQuery>({
  uid: datasourceUid,
  type: 'mock-sales',
  name: 'Mock Sales Datasource',
  options: datasourceOptions,
  cacheTtlMs: 30_000,
  queryData: async (request, context) => querySales(request, context),
  subscribeData: (request, context, onData) => {
    let tick = 0
    const intervalId = window.setInterval(() => {
      tick += 1
      const result = querySales(request, context)
      onData({
        ...result,
        rows: result.rows.slice(0, 4).map((row, index) => [...row, tick + index]),
        columns: [...result.columns, { name: 'tick', type: 'number' }],
        meta: { ...result.meta, streamTick: tick },
      })
    }, 1200)

    return () => window.clearInterval(intervalId)
  },
  variable: {
    metricFindQuery: async (query) => {
      const keyword = query.toLowerCase()
      return countries
        .filter((country) => country.toLowerCase().includes(keyword))
        .map((country) => ({ label: country, value: country }))
    },
  },
  editor: {
    defaultQuery: { metric: 'orders', country: 'all', limit: 5, minRevenue: 0 },
    validateQuery: (query) => {
      const candidate = query as Partial<SalesQuery>
      const errors = [
        candidate.limit !== undefined && candidate.limit <= 0 ? 'limit must be greater than 0' : undefined,
        candidate.minRevenue !== undefined && candidate.minRevenue < 0 ? 'minRevenue cannot be negative' : undefined,
      ].filter((error): error is string => Boolean(error))

      return { valid: errors.length === 0, errors }
    },
  },
  connector: {
    configSchema: {
      endpoint: { type: 'string', label: 'Endpoint', required: true },
      region: { type: 'string', label: 'Region', required: true },
      sampleRate: { type: 'number', label: 'Sample rate', min: 0, max: 1, step: 0.1 },
    },
    healthCheck: async (options) => ({
      ok: options.endpoint.startsWith('https://'),
      message: options.endpoint.startsWith('https://') ? 'Datasource endpoint is reachable' : 'Endpoint must use HTTPS',
      details: { endpoint: options.endpoint, region: options.region },
    }),
  },
  schema: {
    listNamespaces: async () => [
      { id: 'sales', name: 'Sales', kind: 'database' },
      { id: 'sales.orders', name: 'Orders', kind: 'table', parentId: 'sales' },
      { id: 'sales.revenue', name: 'Revenue', kind: 'metric', parentId: 'sales' },
    ],
    listFields: async () => [
      { name: 'orderId', type: 'string', label: 'Order ID' },
      { name: 'country', type: 'string', label: 'Country' },
      { name: 'product', type: 'string', label: 'Product' },
      { name: 'revenue', type: 'number', label: 'Revenue' },
      { name: 'status', type: 'string', label: 'Status' },
    ],
  },
  annotations: {
    queryAnnotations: async (annotationQuery) => [
      {
        id: 'deploy-2026-05',
        time: Date.now() - 1000 * 60 * 60 * 6,
        title: 'Pricing rollout',
        text: `Annotation query: ${annotationQuery.name ?? annotationQuery.id}`,
        tags: ['release', 'sales'],
        color: '#2563eb',
        source: annotationQuery,
      },
    ],
  },
})

function buildContext(role: string): QueryContext {
  return {
    variables: { country: 'KR', channel: ['direct', 'partner'] },
    timeRange: {
      from: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      to: new Date().toISOString(),
    },
    authContext: {
      tenantId: 'tenant-demo',
      subject: { id: 'playground-user', roles: [role] },
    },
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>
}

function ResultTable({ result }: { result?: QueryResult }) {
  if (!result) return <div className="empty">No result yet</div>

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {result.columns.map((column) => (
              <th key={column.name}>{column.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState<SalesQuery>({ metric: 'orders', country: 'all', limit: 5, minRevenue: 0 })
  const [role, setRole] = useState('analyst')
  const [result, setResult] = useState<QueryResult>()
  const [streamResult, setStreamResult] = useState<QueryResult>()
  const [health, setHealth] = useState<DatasourceHealthResult>()
  const [validation, setValidation] = useState<DatasourceValidationResult>()
  const [namespaces, setNamespaces] = useState<DatasourceSchemaNamespace[]>([])
  const [fields, setFields] = useState<DatasourceSchemaField[]>([])
  const [variables, setVariables] = useState<VariableOption[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)

  const executor = useMemo(
    () =>
      createDatasourceExecutor({
        datasources: [salesDatasource as unknown as DatasourcePluginDef],
        authorize: (request) => {
          const roles = request.context.authContext?.subject?.roles ?? []
          if (request.action === 'datasource:subscribe' && !roles.includes('analyst') && !roles.includes('admin')) {
            return { allowed: false, reason: 'Subscribe requires analyst or admin role' }
          }
          return true
        },
      }),
    [],
  )

  const context = useMemo(() => buildContext(role), [role])
  const request = useMemo<DataQuery<SalesQuery>>(
    () => ({
      id: `query-${query.metric}`,
      datasourceUid,
      datasourceType: 'mock-sales',
      query,
      cacheTtlMs: 30_000,
    }),
    [query],
  )

  function pushLog(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((current) => [{ id: Date.now() + current.length, level, message, detail }, ...current].slice(0, 8))
  }

  async function runQuery() {
    try {
      const nextResult = await executor.query(request, context)
      setResult(nextResult)
      pushLog('info', 'queryData completed', nextResult.meta)
    } catch (error) {
      pushLog('error', formatError(error))
    }
  }

  async function runHealth() {
    const nextHealth = await executor.healthCheck(datasourceUid, context)
    setHealth(nextHealth)
    pushLog('info', 'healthCheck completed', nextHealth)
  }

  async function runValidation() {
    const nextValidation = await executor.validateQuery(datasourceUid, query, context)
    setValidation(nextValidation)
    pushLog('info', 'validateQuery completed', nextValidation)
  }

  async function loadSchema() {
    const [nextNamespaces, nextFields] = await Promise.all([
      executor.listNamespaces(datasourceUid, context),
      executor.listFields(datasourceUid, { namespaceId: 'sales.orders' }, context),
    ])
    setNamespaces(nextNamespaces)
    setFields(nextFields)
    pushLog('info', 'schema loaded', { namespaces: nextNamespaces.length, fields: nextFields.length })
  }

  async function loadVariables() {
    const support = salesDatasource.variable
    const nextVariables = await support?.metricFindQuery(query.country === 'all' ? '' : query.country, {
      datasourceOptions,
      variables: context.variables ?? {},
      authContext: context.authContext,
      timeRange: context.timeRange ? { from: context.timeRange.from, to: context.timeRange.to } : undefined,
    })
    setVariables(nextVariables ?? [])
    pushLog('info', 'variable options loaded', nextVariables)
  }

  async function loadAnnotations() {
    const nextAnnotations = await executor.queryAnnotations(
      { id: 'release-events', datasourceUid, name: 'Release events', query: { country: query.country } },
      context,
    )
    setAnnotations(nextAnnotations)
    pushLog('info', 'annotations loaded', nextAnnotations)
  }

  function toggleStream() {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = undefined
      setIsStreaming(false)
      pushLog('info', 'subscription stopped')
      return
    }

    try {
      unsubscribeRef.current = executor.subscribe(
        request,
        context,
        (nextResult) => {
          setStreamResult(nextResult)
          setIsStreaming(true)
        },
        (error) => {
          setIsStreaming(false)
          pushLog('error', formatError(error))
        },
      )
      pushLog('info', 'subscription started')
    } catch (error) {
      pushLog('error', formatError(error))
    }
  }

  useEffect(() => {
    void runQuery()
    void loadSchema()
    void runHealth()
  }, [])

  useEffect(() => {
    return () => {
      unsubscribeRef.current?.()
    }
  }, [])

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>DatasourceKit Playground</h1>
          <p>Compose a datasource request, execute it, then inspect the runtime context.</p>
        </div>
        <div className="statusPill">
          <span className={isStreaming ? 'dot live' : 'dot'} />
          {isStreaming ? 'Streaming' : 'Idle'}
        </div>
      </header>

      <nav className="flowRail" aria-label="DatasourceKit execution flow">
        <div>
          <strong>1</strong>
          <span>Request</span>
        </div>
        <i />
        <div>
          <strong>2</strong>
          <span>Execute</span>
        </div>
        <i />
        <div>
          <strong>3</strong>
          <span>Inspect</span>
        </div>
      </nav>

      <section className="workspace">
        <aside className="panel controls stepPanel">
          <div className="panelHeader">
            <h2><span className="stepBadge">1</span> Request Builder</h2>
            <span>{datasourceUid}</span>
          </div>

          <label>
            Metric
            <select value={query.metric} onChange={(event) => setQuery({ ...query, metric: event.target.value as SalesQuery['metric'] })}>
              <option value="orders">Orders</option>
              <option value="revenue">Revenue</option>
              <option value="countries">Countries</option>
            </select>
          </label>

          <label>
            Country
            <select value={query.country} onChange={(event) => setQuery({ ...query, country: event.target.value })}>
              <option value="all">All</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>

          <label>
            Limit
            <input
              type="number"
              min="1"
              value={query.limit}
              onChange={(event) => setQuery({ ...query, limit: Number(event.target.value) })}
            />
          </label>

          <label>
            Minimum revenue
            <input
              type="number"
              min="0"
              step="100"
              value={query.minRevenue}
              onChange={(event) => setQuery({ ...query, minRevenue: Number(event.target.value) })}
            />
          </label>

          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="analyst">analyst</option>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
          </label>

          <div className="jsonPanel">
            <h3>DataQuery</h3>
            <JsonBlock value={request} />
          </div>
        </aside>

        <section className="content stepPanel">
          <article className="panel executePanel">
            <div className="panelHeader">
              <h2><span className="stepBadge">2</span> Executor</h2>
              <span>createDatasourceExecutor()</span>
            </div>
            <div className="buttonGrid">
              <button className="primary" onClick={runQuery}>Run Query</button>
              <button onClick={runValidation}>Validate</button>
              <button onClick={runHealth}>Health</button>
              <button onClick={loadSchema}>Schema</button>
              <button onClick={loadVariables}>Variables</button>
              <button onClick={loadAnnotations}>Annotations</button>
              <button className={isStreaming ? 'danger' : ''} onClick={toggleStream}>
                {isStreaming ? 'Stop Stream' : 'Start Stream'}
              </button>
            </div>
          </article>

          <div className="summaryGrid">
            <article className="panel metric">
              <span>Health</span>
              <strong>{health?.ok ? 'OK' : 'Unknown'}</strong>
              <small>{health?.message ?? 'Run health check'}</small>
            </article>
            <article className="panel metric">
              <span>Validation</span>
              <strong>{validation ? (validation.valid ? 'Valid' : 'Invalid') : 'Pending'}</strong>
              <small>{validation?.errors?.join(', ') || 'No validation errors'}</small>
            </article>
            <article className="panel metric">
              <span>Rows</span>
              <strong>{result?.rows.length ?? 0}</strong>
              <small>{result?.requestId ?? 'No request'}</small>
            </article>
          </div>

          <article className="panel">
            <div className="panelHeader">
              <h2>Query Result</h2>
              <span>{result?.columns.length ?? 0} columns</span>
            </div>
            <ResultTable result={result} />
          </article>

          <div className="splitGrid">
            <article className="panel">
              <div className="panelHeader">
                <h2>Stream</h2>
                <span>{streamResult?.meta?.streamTick ? `tick ${streamResult.meta.streamTick}` : 'not started'}</span>
              </div>
              <ResultTable result={streamResult} />
            </article>
            <article className="panel">
              <div className="panelHeader">
                <h2>Variables</h2>
                <span>{variables.length} options</span>
              </div>
              <div className="chipList">
                {variables.map((option) => (
                  <span key={option.value}>{option.label}</span>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panelHeader">
                <h2>Annotations</h2>
                <span>{annotations.length} events</span>
              </div>
              <div className="annotationList">
                {annotations.map((annotation) => (
                  <div key={annotation.id}>
                    <strong>{annotation.title}</strong>
                    <span>{new Date(annotation.time).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <aside className="panel inspector stepPanel">
          <div className="panelHeader">
            <h2><span className="stepBadge">3</span> Inspector</h2>
            <span>{role}</span>
          </div>
          <JsonBlock value={context} />

          <div className="panelHeader logHeader">
            <h2>Schema</h2>
            <span>{namespaces.length} namespaces</span>
          </div>
          <div className="schemaList">
            {namespaces.map((namespace) => (
              <div key={namespace.id}>
                <strong>{namespace.name}</strong>
                <span>{namespace.kind}</span>
              </div>
            ))}
          </div>
          <div className="fieldList">
            {fields.map((field) => (
              <span key={field.name}>{field.label ?? field.name}</span>
            ))}
          </div>

          <div className="panelHeader logHeader">
            <h2>Events</h2>
            <span>{logs.length}</span>
          </div>
          <div className="logList">
            {logs.map((log) => (
              <div className={log.level} key={log.id}>
                <strong>{log.message}</strong>
                {log.detail !== undefined ? <JsonBlock value={log.detail} /> : null}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  )
}
