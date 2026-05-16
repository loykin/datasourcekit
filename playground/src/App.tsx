import { useRef, useState } from 'react'
import {
  defineDatasourceManager,
  defineDatasourceRuntime,
  DatasourceConflictError,
  DatasourceForbiddenError,
  DatasourceNotFoundError,
  DatasourceValidationError,
  type DatasourceCreateInput,
  type DatasourceHealthResult,
  type DatasourceInstance,
  type DatasourceSchemaNamespace,
  type QueryResult,
} from '@loykin/datasourcekit'

// ---------------------------------------------------------------------------
// Fake backend
// ---------------------------------------------------------------------------

type Scenario = 'none' | 'forbidCreate' | 'forbidDelete' | 'forbidUpdate' | 'conflict'

function createFakeBackend() {
  function makeTs() { return new Date().toISOString() }
  function nextVer(v?: string) { return String(Number(v ?? 0) + 1) }

  const SEED: DatasourceInstance[] = [
    { uid: 'postgres-main', type: 'postgres', name: 'Main PostgreSQL', enabled: true, version: '1', createdAt: makeTs(), updatedAt: makeTs() },
    { uid: 'clickhouse-analytics', type: 'clickhouse', name: 'Analytics ClickHouse', enabled: true, version: '1', createdAt: makeTs(), updatedAt: makeTs() },
  ]

  let store: DatasourceInstance[] = [...SEED]
  let scenario: Scenario = 'none'

  return {
    setScenario(s: Scenario) { scenario = s },
    reset() { store = SEED.map((d) => ({ ...d })); scenario = 'none' },
    actorDelete(uid: string) { store = store.filter((d) => d.uid !== uid) },

    async list(): Promise<DatasourceInstance[]> { return [...store] },

    async get(uid: string): Promise<DatasourceInstance> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return ds
    },

    async create(input: DatasourceCreateInput): Promise<DatasourceInstance> {
      if (scenario === 'forbidCreate') throw new DatasourceForbiddenError('create not allowed for this tenant')
      if (!input.name.trim()) throw new DatasourceValidationError('name is required', ['name is required'])
      const uid = `ds-${Date.now()}`
      const now = makeTs()
      const ds: DatasourceInstance = { uid, type: input.type, name: input.name.trim(), enabled: true, version: '1', createdAt: now, updatedAt: now }
      store = [...store, ds]
      return ds
    },

    async update(uid: string, patch: { name?: string; version?: string }): Promise<DatasourceInstance> {
      if (scenario === 'forbidUpdate') throw new DatasourceForbiddenError('update not allowed')
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      if (scenario === 'conflict') throw new DatasourceConflictError(`"${uid}" was modified by another actor`)
      if (patch.version !== undefined && ds.version !== patch.version) {
        throw new DatasourceConflictError(`"${uid}" version conflict: expected ${patch.version}, got ${ds.version}`)
      }
      const updated = { ...ds, ...patch, uid, version: nextVer(ds.version), updatedAt: makeTs() }
      store = store.map((d) => (d.uid === uid ? updated : d))
      return updated
    },

    async delete(uid: string): Promise<void> {
      if (scenario === 'forbidDelete') throw new DatasourceForbiddenError('delete not allowed')
      const exists = store.some((d) => d.uid === uid)
      if (!exists) throw new DatasourceNotFoundError(uid)
      store = store.filter((d) => d.uid !== uid)
    },

    // Raw format — backend's own response shape
    async query(uid: string): Promise<unknown> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return {
        _raw: true,
        fields: ['name', 'type', 'version'],
        data: [[ds.name, ds.type, ds.version ?? '—']],
        reqId: `req-${Date.now()}`,
        uid,
      }
    },

    async healthCheck(uid: string): Promise<DatasourceHealthResult> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return { ok: true, message: `${ds.name} is reachable`, details: { uid, type: ds.type, version: ds.version } }
    },

    async listNamespaces(uid: string): Promise<DatasourceSchemaNamespace[]> {
      const ds = store.find((d) => d.uid === uid)
      if (!ds) throw new DatasourceNotFoundError(uid)
      return [
        { id: 'public', name: 'public', kind: 'schema' },
        { id: 'public.users', name: 'users', kind: 'table', parentId: 'public' },
        { id: 'public.events', name: 'events', kind: 'table', parentId: 'public' },
      ]
    },
  }
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type TabId = 'purpose' | 'manager' | 'scenarios' | 'runtime'
type LogEntry = { id: number; level: 'info' | 'error'; message: string; detail?: unknown }

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'purpose', label: 'Purpose' },
  { id: 'manager', label: 'Manager' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'runtime', label: 'Runtime' },
]

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

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
          <tr>{result.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{String(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ErrorBadge({ error }: { error: string }) {
  return (
    <div className="errorBadge">
      <strong>{error}</strong>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [tab, setTab] = useState<TabId>('purpose')
  const [logs, setLogs] = useState<LogEntry[]>([])

  // manager state
  const [instances, setInstances] = useState<DatasourceInstance[]>([])
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState('postgres')
  const [selectedUid, setSelectedUid] = useState<string>('')

  // runtime state
  const [queryResult, setQueryResult] = useState<QueryResult | undefined>()
  const [health, setHealth] = useState<DatasourceHealthResult | undefined>()
  const [namespaces, setNamespaces] = useState<DatasourceSchemaNamespace[]>([])
  const [runtimeUid, setRuntimeUid] = useState('postgres-main')
  const [useCallTransform, setUseCallTransform] = useState(false)

  // per-card scenario errors
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})

  function setCardError(key: string, msg: string) {
    setCardErrors((prev) => ({ ...prev, [key]: msg }))
  }
  function clearCardErrors() {
    setCardErrors({})
  }

  const backendRef = useRef(createFakeBackend())
  const backend = backendRef.current

  const manager = defineDatasourceManager({
    list: () => backend.list(),
    get: (uid) => backend.get(uid),
    create: (input) => backend.create(input),
    update: (uid, patch) => backend.update(uid, patch),
    delete: (uid) => backend.delete(uid),
  })

  const runtime = defineDatasourceRuntime({
    query: (request) => backend.query(request.datasourceUid),

    // Runtime transform: normalize backend raw response to QueryResult
    transform: (raw) => {
      const r = raw as { fields: string[]; data: unknown[][]; reqId: string; uid: string }
      return {
        columns: r.fields.map((name) => ({ name, type: 'string' })),
        rows: r.data,
        requestId: r.reqId,
        meta: { uid: r.uid, normalized: true },
      }
    },

    healthCheck: (uid) => backend.healthCheck(uid),
    validateQuery: async () => ({ valid: true }),
    listNamespaces: (uid) => backend.listNamespaces(uid),
    listFields: async () => [],
    metricFindQuery: async () => [],
    queryAnnotations: async () => [],
  })

  function pushLog(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((prev) => [{ id: Date.now() + prev.length, level, message, detail }, ...prev].slice(0, 12))
  }

  function formatError(err: unknown) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  async function refreshList() {
    const list = await manager.list()
    setInstances(list)
    return list
  }

  async function handleList() {
    try {
      const list = await refreshList()
      pushLog('info', `manager.list() → ${list.length} datasources`, list.map((d) => d.uid))
    } catch (err) {
      pushLog('error', formatError(err))
    }
  }

  async function handleCreate() {
    try {
      const created = await manager.create({ type: createType, name: createName })
      await refreshList()
      setCreateName('')
      pushLog('info', 'manager.create() succeeded', { uid: created.uid, name: created.name })
    } catch (err) {
      pushLog('error', formatError(err))
    }
  }

  async function handleDelete(uid: string) {
    try {
      await manager.delete(uid)
      await refreshList()
      pushLog('info', `manager.delete("${uid}") succeeded`)
    } catch (err) {
      pushLog('error', formatError(err))
    }
  }

  async function triggerScenario(cardKey: string, s: Scenario) {
    backend.setScenario(s)
    setCardErrors((prev) => ({ ...prev, [cardKey]: '' }))
    try {
      if (s === 'forbidCreate') {
        await manager.create({ type: 'postgres', name: 'New DS' })
      } else if (s === 'forbidDelete') {
        const list = await manager.list()
        if (list[0]) await manager.delete(list[0].uid)
      } else if (s === 'forbidUpdate') {
        const list = await manager.list()
        if (list[0]) await manager.update(list[0].uid, { name: 'Updated' })
      } else if (s === 'conflict') {
        const list = await manager.list()
        if (list[0]) await manager.update(list[0].uid, { name: 'Updated', version: '999' })
      }
    } catch (err) {
      setCardError(cardKey, formatError(err))
      pushLog('error', formatError(err))
    } finally {
      backend.setScenario('none')
    }
  }

  async function triggerActorDelete() {
    const list = await manager.list()
    const target = list[0]
    if (!target) { pushLog('error', 'no datasources to delete'); return }
    backend.actorDelete(target.uid)
    pushLog('info', `another actor deleted "${target.uid}" on the server`)
    setCardErrors((prev) => ({ ...prev, actorDelete: '' }))
    try {
      await manager.get(target.uid)
    } catch (err) {
      setCardError('actorDelete', formatError(err))
      pushLog('error', formatError(err))
    }
  }

  function resetScenario() {
    backend.reset()
    clearCardErrors()
    setInstances([])
    pushLog('info', 'backend reset to initial state')
  }

  async function runRuntimeQuery() {
    try {
      const result = await runtime.query(
        { id: `q-${Date.now()}`, datasourceUid: runtimeUid },
        undefined,
        useCallTransform
          ? {
              // Call transform: per-panel post-processing (uppercasing column names here)
              transform: (r) => ({
                ...r,
                columns: r.columns.map((c) => ({ ...c, name: c.name.toUpperCase() })),
                meta: { ...r.meta, callTransformApplied: true },
              }),
            }
          : undefined,
      )
      setQueryResult(result)
      pushLog('info', `runtime.query("${runtimeUid}") succeeded`, result.meta)
    } catch (err) {
      pushLog('error', formatError(err))
    }
  }

  async function runHealthCheck() {
    try {
      const result = await runtime.healthCheck(runtimeUid)
      setHealth(result)
      pushLog('info', `runtime.healthCheck("${runtimeUid}") → ${result.ok ? 'ok' : 'fail'}`, result)
    } catch (err) {
      pushLog('error', formatError(err))
    }
  }

  async function runListNamespaces() {
    try {
      const result = await runtime.listNamespaces(runtimeUid)
      setNamespaces(result)
      pushLog('info', `runtime.listNamespaces("${runtimeUid}") → ${result.length} namespaces`)
    } catch (err) {
      pushLog('error', formatError(err))
    }
  }

  const hasQueryInput = tab === 'manager' || tab === 'runtime'

  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>DatasourceKit Playground</h1>
          <p>Backend is source of truth. DatasourceKit is the contract layer.</p>
        </div>
      </header>

      <nav className="tabBar" aria-label="sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} type="button">
            {t.label}
          </button>
        ))}
      </nav>

      <section className={hasQueryInput ? 'workspace' : 'workspace noQueryInput'}>

        {tab === 'manager' ? (
          <aside className="panel controls">
            <div className="panelHeader">
              <h2>Create Datasource</h2>
            </div>
            <label>
              Name
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="My Datasource" />
            </label>
            <label>
              Type
              <select value={createType} onChange={(e) => setCreateType(e.target.value)}>
                <option value="postgres">postgres</option>
                <option value="mysql">mysql</option>
                <option value="clickhouse">clickhouse</option>
                <option value="redis">redis</option>
              </select>
            </label>
            <button className="primary" onClick={handleCreate} disabled={!createName.trim()}>
              manager.create()
            </button>

            <div className="panelHeader" style={{ marginTop: 16 }}>
              <h2>Loaded</h2>
              <span>{instances.length} datasources</span>
            </div>
            <div className="schemaList">
              {instances.length === 0
                ? <div style={{ color: '#64748b', fontSize: 13 }}>Call list() to load</div>
                : instances.map((ds) => (
                  <div key={ds.uid}
                    style={{ cursor: 'pointer', outline: selectedUid === ds.uid ? '2px solid #0f766e' : undefined }}
                    onClick={() => setSelectedUid(ds.uid)}>
                    <strong>{ds.name}</strong>
                    <span>{ds.uid} / {ds.type}</span>
                    <small>version {ds.version ?? '—'}</small>
                  </div>
                ))
              }
            </div>
            {selectedUid && (
              <button className="danger" onClick={() => handleDelete(selectedUid)}>
                manager.delete("{selectedUid}")
              </button>
            )}
          </aside>
        ) : null}

        {tab === 'runtime' ? (
          <aside className="panel controls">
            <div className="panelHeader">
              <h2>Datasource UID</h2>
            </div>
            <label>
              uid
              <input value={runtimeUid} onChange={(e) => setRuntimeUid(e.target.value)} placeholder="postgres-main" />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, display: 'flex', marginTop: 4 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', minHeight: 'auto' }}
                checked={useCallTransform}
                onChange={(e) => setUseCallTransform(e.target.checked)}
              />
              call transform (uppercase columns)
            </label>
            <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
              <button className="primary" onClick={runRuntimeQuery}>runtime.query()</button>
              <button onClick={runHealthCheck}>runtime.healthCheck()</button>
              <button onClick={runListNamespaces}>runtime.listNamespaces()</button>
            </div>
            <div className="panelHeader" style={{ marginTop: 16 }}>
              <h2>Health</h2>
            </div>
            {health
              ? <div className="schemaList"><div><strong>{health.ok ? 'OK' : 'FAIL'}</strong><span>{health.message}</span></div></div>
              : <div style={{ color: '#64748b', fontSize: 13 }}>run healthCheck()</div>
            }
            <div className="panelHeader" style={{ marginTop: 16 }}>
              <h2>Namespaces</h2>
              <span>{namespaces.length}</span>
            </div>
            <div className="schemaList">
              {namespaces.map((ns) => (
                <div key={ns.id}><strong>{ns.name}</strong><span>{ns.kind}</span></div>
              ))}
            </div>
          </aside>
        ) : null}

        <section className="content">

          {tab === 'purpose' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader"><h2>What DatasourceKit is</h2></div>
                <div className="explainGrid">
                  <div>
                    <strong>Backend owns truth</strong>
                    <p>Datasource list, state, secrets, and permissions live on the backend. DatasourceKit never pretends to own them.</p>
                  </div>
                  <div>
                    <strong>Manager contract</strong>
                    <p>Apps wire their own backend handlers into <code>defineDatasourceManager</code>. DatasourceKit provides the typed contract, not the store.</p>
                  </div>
                  <div>
                    <strong>Runtime contract</strong>
                    <p>Query, schema, health, validation all delegate to the backend through <code>defineDatasourceRuntime</code> handlers.</p>
                  </div>
                </div>
              </article>

              <article className="panel infoPanel">
                <div className="panelHeader"><h2>Architecture</h2></div>
                <CodeBlock>{`Frontend / dashboard / editor
  -> DatasourceKit contracts
      -> app backend
          -> datasource storage, secrets, permissions, query execution`}</CodeBlock>
              </article>

              <article className="panel infoPanel">
                <div className="panelHeader"><h2>Minimal wiring</h2></div>
                <CodeBlock>{`const manager = defineDatasourceManager({
  list: (ctx) => backend.listDatasources(ctx),
  get: (uid, ctx) => backend.getDatasource(uid, ctx),
  create: (input, ctx) => backend.createDatasource(input, ctx),
  update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
  delete: (uid, ctx) => backend.deleteDatasource(uid, ctx),
})

const runtime = defineDatasourceRuntime({
  query: (request, ctx) => backend.queryDatasource(request, ctx),
  healthCheck: (uid, ctx) => backend.healthCheckDatasource(uid, ctx),
  validateQuery: (uid, query, ctx) => backend.validateDatasourceQuery(uid, query, ctx),
  listNamespaces: (uid, ctx) => backend.listDatasourceNamespaces(uid, ctx),
  listFields: (uid, request, ctx) => backend.listDatasourceFields(uid, request, ctx),
})`}</CodeBlock>
              </article>
            </>
          ) : null}

          {tab === 'manager' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader"><h2>Manager Contract</h2><span>defineDatasourceManager</span></div>
                <p className="leadText">
                  The manager wires your backend handlers into a typed CRUD contract.
                  DatasourceKit provides the interface — your backend owns the state.
                </p>
                <CodeBlock>{`const manager = defineDatasourceManager({
  list: (ctx) => backend.listDatasources(ctx),
  get: (uid, ctx) => backend.getDatasource(uid, ctx),
  create: (input, ctx) => backend.createDatasource(input, ctx),
  update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
  delete: (uid, ctx) => backend.deleteDatasource(uid, ctx),
})`}</CodeBlock>
              </article>

              <article className="panel executePanel">
                <div className="panelHeader"><h2>Try Manager</h2></div>
                <div className="buttonGrid compact">
                  <button className="primary" onClick={handleList}>manager.list()</button>
                </div>
              </article>
            </>
          ) : null}

          {tab === 'scenarios' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader"><h2>Backend Scenarios</h2></div>
                <p className="leadText">
                  Deleted, forbidden, conflict, and validation states are normal operating flows.
                  DatasourceKit surfaces them as typed errors so the UI can handle them explicitly.
                </p>
              </article>

              <div className="splitGrid">
                <article className="panel infoPanel">
                  <div className="panelHeader"><h2>Forbidden Create</h2></div>
                  <p className="leadText">Backend rejects create due to tenant permissions. Expected: show permission error, disable create.</p>
                  <CodeBlock>{`// DatasourceForbiddenError
// -> disable action or show permission error`}</CodeBlock>
                  {cardErrors['forbidCreate'] && <ErrorBadge error={cardErrors['forbidCreate']} />}
                  <div style={{ marginTop: 12 }}>
                    <button onClick={() => triggerScenario('forbidCreate', 'forbidCreate')}>Trigger</button>
                  </div>
                </article>

                <article className="panel infoPanel">
                  <div className="panelHeader"><h2>Another Actor Deletes</h2></div>
                  <p className="leadText">Another user deletes a datasource on the server. Subsequent get returns NotFoundError. Expected: clear selection, reload list.</p>
                  <CodeBlock>{`// DatasourceNotFoundError
// -> clear selected datasource or reload list`}</CodeBlock>
                  {cardErrors['actorDelete'] && <ErrorBadge error={cardErrors['actorDelete']} />}
                  <div style={{ marginTop: 12 }}>
                    <button onClick={triggerActorDelete}>Trigger</button>
                  </div>
                </article>

                <article className="panel infoPanel">
                  <div className="panelHeader"><h2>Update Conflict</h2></div>
                  <p className="leadText">Backend detects stale version on update. Expected: reload latest datasource, ask user to retry.</p>
                  <CodeBlock>{`// DatasourceConflictError
// -> reload datasource, ask user to retry`}</CodeBlock>
                  {cardErrors['conflict'] && <ErrorBadge error={cardErrors['conflict']} />}
                  <div style={{ marginTop: 12 }}>
                    <button onClick={() => triggerScenario('conflict', 'conflict')}>Trigger</button>
                  </div>
                </article>

                <article className="panel infoPanel">
                  <div className="panelHeader"><h2>Validation Failure</h2></div>
                  <p className="leadText">Backend rejects create due to invalid input. Expected: show field-level errors, do not clear form.</p>
                  <CodeBlock>{`// DatasourceValidationError
// -> show field errors, keep form state`}</CodeBlock>
                  {cardErrors['validation'] && <ErrorBadge error={cardErrors['validation']} />}
                  <div style={{ marginTop: 12 }}>
                    <button onClick={async () => {
                      setCardErrors((prev) => ({ ...prev, validation: '' }))
                      try {
                        await manager.create({ type: 'postgres', name: '' })
                      } catch (err) {
                        const msg = err instanceof DatasourceValidationError
                          ? `${err.name}: ${err.message}${err.errors ? ' — ' + err.errors.join(', ') : ''}`
                          : String(err)
                        setCardError('validation', msg)
                        pushLog('error', msg)
                      }
                    }}>Trigger</button>
                  </div>
                </article>
              </div>

              <article className="panel executePanel">
                <div className="panelHeader"><h2>Reset Backend</h2></div>
                <div className="buttonGrid compact">
                  <button onClick={resetScenario}>Reset to initial state</button>
                </div>
              </article>
            </>
          ) : null}

          {tab === 'runtime' ? (
            <>
              <article className="panel infoPanel">
                <div className="panelHeader"><h2>Transform Pipeline</h2><span>runtime → call</span></div>
                <p className="leadText">
                  When the backend returns its own format, the runtime transform normalizes it to QueryResult.
                  Each query call can apply a per-panel transform for additional filtering, renaming, or validation.
                </p>
                <CodeBlock>{`// 1. Backend raw response -> QueryResult (runtime-level normalization)
const runtime = defineDatasourceRuntime({
  query: (request, ctx) => backend.query(request, ctx), // returns unknown
  transform: (raw, request) => ({
    columns: raw.fields.map(name => ({ name, type: 'string' })),
    rows: raw.data,
    requestId: raw.reqId,
  }),
  ...
})

// 2. QueryResult -> QueryResult (per-panel post-processing)
const result = await runtime.query(request, ctx, {
  transform: (result) => ({
    ...result,
    rows: result.rows.filter(row => row[0] !== null),
    columns: result.columns.map(c => ({ ...c, name: c.name.toUpperCase() })),
  }),
})`}</CodeBlock>
              </article>

              <article className="panel">
                <div className="panelHeader">
                  <h2>Query Result</h2>
                  <span>
                    {queryResult ? (queryResult.meta?.callTransformApplied ? 'runtime + call transform' : 'runtime transform only') : '—'}
                  </span>
                </div>
                <ResultTable result={queryResult} />
                {queryResult && (
                  <div style={{ marginTop: 8 }}>
                    <JsonBlock value={queryResult.meta} />
                  </div>
                )}
              </article>
            </>
          ) : null}

        </section>

        {hasQueryInput ? (
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
