import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createDatasourceExecutor,
  createDatasourceRegistry,
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

type TabId = 'quickstart' | 'registry' | 'query' | 'capabilities' | 'authorization' | 'remote'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'registry', label: 'Registry' },
  { id: 'query', label: 'Query' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'authorization', label: 'Authorization' },
  { id: 'remote', label: 'Remote Bridge' },
]

const countries = ['US', 'KR', 'JP', 'DE', 'FR']
const datasourceUid = 'sales-demo'
const datasourceOptions: SalesOptions = {
  endpoint: 'https://example.internal/sales',
  region: 'ap-northeast-2',
  sampleRate: 1,
}

type SalesDatasourceDef = DatasourcePluginDef<SalesOptions, SalesQuery>

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

function createSalesDatasource(options: {
  uid?: string
  name?: string
  datasourceOptions?: SalesOptions
} = {}): SalesDatasourceDef {
  const uid = options.uid ?? datasourceUid
  const datasourceConfig = options.datasourceOptions ?? datasourceOptions

  return defineDatasource<SalesOptions, SalesQuery>({
    uid,
    type: 'mock-sales',
    name: options.name ?? 'Mock Sales Datasource',
    options: datasourceConfig,
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
}

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

function CodeBlock({ children }: { children: string }) {
  return <pre className="json code">{children}</pre>
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
  const [activeTab, setActiveTab] = useState<TabId>('quickstart')
  const [query, setQuery] = useState<SalesQuery>({ metric: 'orders', country: 'all', limit: 5, minRevenue: 0 })
  const [role, setRole] = useState('analyst')
  const [result, setResult] = useState<QueryResult>()
  const [streamResult, setStreamResult] = useState<QueryResult>()
  const [remotePayload, setRemotePayload] = useState<unknown>()
  const [health, setHealth] = useState<DatasourceHealthResult>()
  const [validation, setValidation] = useState<DatasourceValidationResult>()
  const [namespaces, setNamespaces] = useState<DatasourceSchemaNamespace[]>([])
  const [fields, setFields] = useState<DatasourceSchemaField[]>([])
  const [variables, setVariables] = useState<VariableOption[]>([])
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [datasourceDefs, setDatasourceDefs] = useState<SalesDatasourceDef[]>(() => [createSalesDatasource()])
  const [datasourceDraft, setDatasourceDraft] = useState({
    name: 'Mock Sales Datasource',
    endpoint: datasourceOptions.endpoint,
    region: datasourceOptions.region,
    sampleRate: datasourceOptions.sampleRate,
  })
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)

  const registry = useMemo(
    () => createDatasourceRegistry(datasourceDefs as unknown as DatasourcePluginDef[]),
    [datasourceDefs],
  )

  const executor = useMemo(
    () =>
      createDatasourceExecutor({
        registry,
        authorize: (request) => {
          const roles = request.context.authContext?.subject?.roles ?? []
          if (request.action === 'datasource:subscribe' && !roles.includes('analyst') && !roles.includes('admin')) {
            return { allowed: false, reason: 'Subscribe requires analyst or admin role' }
          }
          return true
        },
      }),
    [registry],
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
  const showQueryInput = activeTab === 'query' || activeTab === 'capabilities' || activeTab === 'authorization' || activeTab === 'remote'

  function pushLog(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((current) => [{ id: Date.now() + current.length, level, message, detail }, ...current].slice(0, 8))
  }

  function draftDatasource(): SalesDatasourceDef {
    return createSalesDatasource({
      name: datasourceDraft.name,
      datasourceOptions: {
        endpoint: datasourceDraft.endpoint,
        region: datasourceDraft.region,
        sampleRate: datasourceDraft.sampleRate,
      },
    })
  }

  function registrySalesDatasources(): SalesDatasourceDef[] {
    return registry.list() as unknown as SalesDatasourceDef[]
  }

  function registerDatasource() {
    registry.register(draftDatasource() as unknown as DatasourcePluginDef)
    setDatasourceDefs(registrySalesDatasources())
    pushLog('info', 'datasource registered', registry.get(datasourceUid))
  }

  function updateDatasource() {
    try {
      const next = draftDatasource()
      registry.update(datasourceUid, {
        name: next.name,
        options: next.options,
        cacheTtlMs: next.cacheTtlMs,
      })
      setDatasourceDefs(registrySalesDatasources())
      pushLog('info', 'datasource updated', registry.get(datasourceUid))
    } catch (error) {
      pushLog('error', formatError(error))
    }
  }

  function unregisterDatasource() {
    const removed = registry.unregister(datasourceUid)
    setDatasourceDefs(registrySalesDatasources())
    pushLog(removed ? 'info' : 'error', removed ? 'datasource unregistered' : 'datasource was not registered')
  }

  function clearDatasources() {
    registry.clear()
    setDatasourceDefs([])
    pushLog('info', 'registry cleared')
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
    const nextVariables = await executor.metricFindQuery({
      id: 'country-variable',
      datasourceUid,
      datasourceType: 'mock-sales',
      query: query.country === 'all' ? '' : query.country,
    }, {
      variables: context.variables,
      authContext: context.authContext,
      timeRange: context.timeRange,
    })
    setVariables(nextVariables)
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

  async function runRemoteBridge() {
    const payload = {
      endpoint: '/api/datasource/query',
      method: 'POST',
      body: {
        request,
        context,
      },
    }
    setRemotePayload(payload)
    pushLog('info', 'remote bridge payload prepared', payload)
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
          <p>Registry, executor, datasource capabilities, and app-owned remote bridge patterns.</p>
        </div>
        <div className="statusPill">
          <span className={isStreaming ? 'dot live' : 'dot'} />
          {isStreaming ? 'Streaming' : 'Idle'}
        </div>
      </header>

      <nav className="tabBar" aria-label="DatasourceKit sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className={showQueryInput ? 'workspace' : 'workspace noQueryInput'}>
        {showQueryInput ? (
          <aside className="panel controls">
            <div className="panelHeader">
              <h2>DataQuery & Context</h2>
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

            <div className="jsonPanel">
              <h3>QueryContext</h3>
              <JsonBlock value={context} />
            </div>
          </aside>
        ) : null}

        <section className="content">
          {activeTab === 'quickstart' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader">
                  <h2>Quickstart</h2>
                  <span>register / execute / result</span>
                </div>
                <div className="explainGrid">
                  <div>
                    <strong>1. Define</strong>
                    <p>Create a datasource plugin. The plugin owns how queryData reaches a database, API, SDK, or app backend.</p>
                  </div>
                  <div>
                    <strong>2. Register</strong>
                    <p>Put datasource plugins into a registry. Runtime management can add, update, delete, or clear datasources.</p>
                  </div>
                  <div>
                    <strong>3. Execute</strong>
                    <p>Executor receives DataQuery and QueryContext, resolves the datasource, checks policy, and returns QueryResult.</p>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Minimal Usage</h2>
                  <span>framework independent</span>
                </div>
                <CodeBlock>{`const datasource = defineDatasource({
  uid: 'sales-demo',
  type: 'mock-sales',
  async queryData(request, context) {
    return runQuery(request.query, context.variables)
  },
})

const registry = createDatasourceRegistry([datasource])
const executor = createDatasourceExecutor({ registry })

const result = await executor.query(dataQuery, queryContext)`}</CodeBlock>
              </article>

              <article className="panel executePanel">
                <div className="panelHeader">
                  <h2>Try It</h2>
                  <span>{registry.has(datasourceUid) ? 'registered' : 'not registered'}</span>
                </div>
                <div className="buttonGrid compact">
                  <button className="primary" onClick={runQuery}>Run Query</button>
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>QueryResult</h2>
                  <span>{result?.rows.length ?? 0} rows</span>
                </div>
                <ResultTable result={result} />
              </article>
            </>
          ) : null}

          {activeTab === 'registry' ? (
            <>
              <article className="panel">
                <div className="panelHeader">
                  <h2>Registered Datasources</h2>
                  <span>{registry.list().length} plugin</span>
                </div>
                <div className="schemaList">
                  {registry.list().length === 0 ? (
                    <div>
                      <strong>No datasource registered</strong>
                      <span>Queries fail until a datasource is registered again.</span>
                    </div>
                  ) : (
                    registry.list().map((datasource) => (
                      <div key={datasource.uid}>
                        <strong>{datasource.name ?? datasource.uid}</strong>
                        <span>{datasource.uid} / {datasource.type}</span>
                        <small>{JSON.stringify(datasource.options ?? {})}</small>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="panel controls">
                <div className="panelHeader">
                  <h2>Manage Datasource</h2>
                  <span>register / update / delete</span>
                </div>
                <div className="formGrid">
                  <label>
                    Name
                    <input
                      value={datasourceDraft.name}
                      onChange={(event) => setDatasourceDraft({ ...datasourceDraft, name: event.target.value })}
                    />
                  </label>
                  <label>
                    Endpoint
                    <input
                      value={datasourceDraft.endpoint}
                      onChange={(event) => setDatasourceDraft({ ...datasourceDraft, endpoint: event.target.value })}
                    />
                  </label>
                  <label>
                    Region
                    <input
                      value={datasourceDraft.region}
                      onChange={(event) => setDatasourceDraft({ ...datasourceDraft, region: event.target.value })}
                    />
                  </label>
                  <label>
                    Sample rate
                    <input
                      max="1"
                      min="0"
                      step="0.1"
                      type="number"
                      value={datasourceDraft.sampleRate}
                      onChange={(event) => setDatasourceDraft({ ...datasourceDraft, sampleRate: Number(event.target.value) })}
                    />
                  </label>
                </div>
                <div className="buttonGrid manageActions">
                  <button className="primary" onClick={registerDatasource}>Register</button>
                  <button onClick={updateDatasource}>Update</button>
                  <button className="danger" onClick={unregisterDatasource}>Delete</button>
                  <button onClick={clearDatasources}>Clear All</button>
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Management API</h2>
                  <span>runtime registry</span>
                </div>
                <CodeBlock>{`const registry = createDatasourceRegistry([])

registry.register(datasource)
registry.update('sales-demo', { options: nextOptions })
registry.unregister('sales-demo')
registry.clear()

const executor = createDatasourceExecutor({ registry })`}</CodeBlock>
              </article>
            </>
          ) : null}

          {activeTab === 'query' ? (
            <>
              <article className="panel executePanel">
                <div className="panelHeader">
                  <h2>Executor</h2>
                  <span>query / stream</span>
                </div>
                <div className="buttonGrid">
                  <button className="primary" onClick={runQuery}>Run Query</button>
                  <button className={isStreaming ? 'danger' : ''} onClick={toggleStream}>
                    {isStreaming ? 'Stop Stream' : 'Start Stream'}
                  </button>
                </div>
              </article>

              <div className="summaryGrid">
                <article className="panel metric">
                  <span>Rows</span>
                  <strong>{result?.rows.length ?? 0}</strong>
                  <small>{result?.requestId ?? 'No request'}</small>
                </article>
                <article className="panel metric">
                  <span>Streaming</span>
                  <strong>{isStreaming ? 'Live' : 'Idle'}</strong>
                  <small>{streamResult?.meta?.streamTick ? `tick ${streamResult.meta.streamTick}` : 'No stream data'}</small>
                </article>
                <article className="panel metric">
                  <span>Role</span>
                  <strong>{role}</strong>
                  <small>viewer cannot subscribe</small>
                </article>
              </div>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Query Result</h2>
                  <span>{result?.columns.length ?? 0} columns</span>
                </div>
                <ResultTable result={result} />
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Stream Result</h2>
                  <span>{streamResult?.meta?.streamTick ? `tick ${streamResult.meta.streamTick}` : 'not started'}</span>
                </div>
                <ResultTable result={streamResult} />
              </article>
            </>
          ) : null}

          {activeTab === 'capabilities' ? (
            <>
              <article className="panel executePanel">
                <div className="panelHeader">
                  <h2>Datasource Capabilities</h2>
                  <span>editor / schema / health / variables / annotations</span>
                </div>
                <div className="buttonGrid">
                  <button onClick={runValidation}>Validate Query</button>
                  <button onClick={runHealth}>Health Check</button>
                  <button onClick={loadSchema}>Load Schema</button>
                  <button onClick={loadVariables}>Variable Options</button>
                  <button onClick={loadAnnotations}>Annotations</button>
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
                  <span>Schema</span>
                  <strong>{fields.length}</strong>
                  <small>{namespaces.length} namespaces</small>
                </article>
              </div>

              <div className="splitGrid">
                <article className="panel">
                  <div className="panelHeader">
                    <h2>Schema Browser Data</h2>
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
                </article>

                <article className="panel">
                  <div className="panelHeader">
                    <h2>Variable Options</h2>
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
            </>
          ) : null}

          {activeTab === 'authorization' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader">
                  <h2>Authorization Hook</h2>
                  <span>datasource-level policy</span>
                </div>
                <p className="leadText">
                  The executor can enforce datasource policy before calling a plugin. In this demo, query is allowed for
                  every role, but subscribe is allowed only for analyst and admin.
                </p>
              </article>

              <div className="summaryGrid">
                <article className="panel metric">
                  <span>Current role</span>
                  <strong>{role}</strong>
                  <small>Change it in DataQuery & Context</small>
                </article>
                <article className="panel metric">
                  <span>Query</span>
                  <strong>Allowed</strong>
                  <small>datasource:query</small>
                </article>
                <article className="panel metric">
                  <span>Subscribe</span>
                  <strong>{role === 'viewer' ? 'Denied' : 'Allowed'}</strong>
                  <small>datasource:subscribe</small>
                </article>
              </div>

              <article className="panel executePanel">
                <div className="panelHeader">
                  <h2>Try Policy</h2>
                  <span>viewer should fail streaming</span>
                </div>
                <div className="buttonGrid compact">
                  <button className="primary" onClick={runQuery}>Run Query</button>
                  <button className={isStreaming ? 'danger' : ''} onClick={toggleStream}>
                    {isStreaming ? 'Stop Stream' : 'Start Stream'}
                  </button>
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Policy Code</h2>
                  <span>executor option</span>
                </div>
                <CodeBlock>{`const executor = createDatasourceExecutor({
  registry,
  authorize(request) {
    const roles = request.context.authContext?.subject?.roles ?? []
    if (request.action === 'datasource:subscribe') {
      return roles.includes('analyst') || roles.includes('admin')
    }
    return true
  },
})`}</CodeBlock>
              </article>
            </>
          ) : null}

          {activeTab === 'remote' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader">
                  <h2>Remote Bridge</h2>
                  <span>app-owned backend</span>
                </div>
                <p className="leadText">
                  DatasourceKit is not a backend server. A plugin may call your backend, or an app can expose an adapter
                  endpoint that receives DataQuery and QueryContext, runs server-side policy, then returns QueryResult.
                </p>
                <div className="buttonGrid compact">
                  <button className="primary" onClick={runRemoteBridge}>Prepare Payload</button>
                </div>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Remote Query Payload</h2>
                  <span>/api/datasource/query</span>
                </div>
                {remotePayload ? <JsonBlock value={remotePayload} /> : <div className="empty">No payload prepared</div>}
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Client Bridge Example</h2>
                  <span>custom adapter/plugin</span>
                </div>
                <CodeBlock>{`const remoteDatasource = defineDatasource({
  uid: 'remote-query',
  type: 'backend',
  async queryData(request, context) {
    const response = await fetch('/api/datasource/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request, context }),
      signal: context.signal,
    })
    return response.json()
  },
})`}</CodeBlock>
              </article>
            </>
          ) : null}
        </section>

        {showQueryInput ? (
          <aside className="panel inspector">
            <div className="panelHeader">
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
        ) : null}
      </section>
    </main>
  )
}
