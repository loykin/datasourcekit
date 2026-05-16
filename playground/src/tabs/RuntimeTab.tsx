import { useState } from 'react'
import type {
  BatchQueryResult,
  DatasourceHealthResult,
  DatasourceRuntime,
  DatasourceSchemaNamespace,
  QueryResult,
} from '@loykin/datasourcekit'
import { CodeBlock, ErrorBadge, type LogEntry, LogPanel, ResultTable } from '../ui'

interface Props {
  runtime: DatasourceRuntime
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500'
const btnPrimary = 'bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-700 transition-colors'
const btnOutline = 'border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50 transition-colors'

export function RuntimeTab({ runtime }: Props) {
  const [uid, setUid] = useState('postgres-main')
  const [useCallTransform, setUseCallTransform] = useState(false)

  const [queryResult, setQueryResult] = useState<QueryResult | undefined>()
  const [queryError, setQueryError] = useState('')

  const [batchUids, setBatchUids] = useState('postgres-main, clickhouse-analytics')
  const [batchResult, setBatchResult] = useState<BatchQueryResult | undefined>()
  const [batchError, setBatchError] = useState('')

  const [health, setHealth] = useState<DatasourceHealthResult | undefined>()
  const [namespaces, setNamespaces] = useState<DatasourceSchemaNamespace[]>([])

  const [logs, setLogs] = useState<LogEntry[]>([])

  function log(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((prev) => [{ id: Date.now() + prev.length, level, message, detail }, ...prev].slice(0, 10))
  }

  function fmt(err: unknown) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  const callOptions = useCallTransform
    ? {
        transform: (r: QueryResult) => ({
          ...r,
          columns: r.columns.map((c) => ({ ...c, name: c.name.toUpperCase() })),
          meta: { ...r.meta, callTransformApplied: true },
        }),
      }
    : undefined

  async function runQuery() {
    setQueryError('')
    try {
      const result = await runtime.query({ id: `q-${Date.now()}`, datasourceUid: uid }, undefined, callOptions)
      setQueryResult(result)
      log('info', `query("${uid}") succeeded`, result.meta)
    } catch (err) {
      setQueryError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function runBatchQuery() {
    setBatchError('')
    try {
      const uids = batchUids.split(',').map((s) => s.trim()).filter(Boolean)
      const requests = uids.map((u, i) => ({ id: `batch-${i}-${Date.now()}`, datasourceUid: u }))
      const result = await runtime.batchQuery(requests, undefined, callOptions)
      setBatchResult(result)
      const ok = result.items.filter((i) => i.data).length
      const fail = result.items.filter((i) => i.error).length
      log('info', `batchQuery() → ${ok} ok, ${fail} failed`, { uids })
    } catch (err) {
      setBatchError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function runHealthCheck() {
    try {
      const result = await runtime.healthCheck(uid)
      setHealth(result)
      log('info', `healthCheck("${uid}") → ${result.ok ? 'ok' : 'fail'}`, result)
    } catch (err) { log('error', fmt(err)) }
  }

  async function runListNamespaces() {
    try {
      const result = await runtime.listNamespaces(uid)
      setNamespaces(result)
      log('info', `listNamespaces("${uid}") → ${result.length} namespaces`)
    } catch (err) { log('error', fmt(err)) }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Config */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Datasource config</p>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">UID</label>
            <input className={inputCls} value={uid} onChange={(e) => setUid(e.target.value)} placeholder="postgres-main" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={useCallTransform}
              onChange={(e) => setUseCallTransform(e.target.checked)}
            />
            call transform (uppercase columns)
          </label>
        </div>
      </div>

      {/* Transform pipeline explainer */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Transform pipeline</p>
        <CodeBlock>{`// 1. runtime transform — registered once, normalizes backend raw response
defineDatasourceRuntime({
  query: (req, ctx) => backend.query(req, ctx),    // returns unknown
  transform: (raw) => ({                            // normalizes to QueryResult
    columns: raw.fields.map(name => ({ name, type: 'string' })),
    rows: raw.data,
  }),
})

// 2. call transform — passed per query, for panel-level post-processing
const result = await runtime.query(request, ctx, {
  transform: (r) => ({
    ...r,
    columns: r.columns.map(c => ({ ...c, name: c.name.toUpperCase() })),
  }),
})`}</CodeBlock>
      </div>

      {/* Single query */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Single query</span>
          {queryResult && (
            <span className="text-xs text-gray-400">
              {queryResult.meta?.callTransformApplied ? 'runtime + call transform' : 'runtime transform only'}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <button className={btnPrimary} onClick={runQuery}>runtime.query()</button>
          {queryError && <ErrorBadge message={queryError} />}
          {queryResult && (
            <>
              <ResultTable result={queryResult} />
              <pre className="text-xs text-gray-400 bg-gray-50 rounded-md px-3 py-2 font-mono">
                {JSON.stringify(queryResult.meta, null, 2)}
              </pre>
            </>
          )}
        </div>
      </div>

      {/* Batch query */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Batch query</span>
          <span className="text-xs text-gray-400">no handler registered — falls back to parallel query()</span>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">UIDs (comma separated)</label>
            <input className={inputCls} value={batchUids} onChange={(e) => setBatchUids(e.target.value)} />
          </div>
          <button className={btnOutline} onClick={runBatchQuery}>runtime.batchQuery()</button>
          {batchError && <ErrorBadge message={batchError} />}
          {batchResult && (
            <div className="space-y-3">
              {batchResult.items.map((item, i) => (
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">result[{i}]</span>
                    <span className={`text-xs font-medium ${item.error ? 'text-red-600' : 'text-green-600'}`}>
                      {item.error ? 'error' : 'ok'}
                    </span>
                  </div>
                  <div className="p-3">
                    {item.error
                      ? <ErrorBadge message={`${item.error.name}: ${item.error.message}`} />
                      : item.data ? <ResultTable result={item.data} /> : null
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
          <CodeBlock>{`// native batch — backend processes all requests at once
defineDatasourceRuntime({
  batchQuery: (requests, ctx) => backend.batchQuery(requests, ctx),
})

// no handler — runtime falls back to parallel query() calls automatically
const { items } = await runtime.batchQuery([q1, q2, q3])
// items[i] = { data: QueryResult } | { error: Error }`}</CodeBlock>
        </div>
      </div>

      {/* Health + Namespaces */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Health check</span>
          </div>
          <div className="p-5 space-y-3">
            <button className={btnOutline} onClick={runHealthCheck}>runtime.healthCheck()</button>
            {health && (
              <div className={`text-sm p-3 rounded-md ${health.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                <span className="font-medium">{health.ok ? 'OK' : 'FAIL'}</span>
                {health.message && <span className="ml-2">{health.message}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Namespaces</span>
            {namespaces.length > 0 && <span className="text-xs text-gray-400">{namespaces.length}</span>}
          </div>
          <div className="p-5 space-y-3">
            <button className={btnOutline} onClick={runListNamespaces}>runtime.listNamespaces()</button>
            {namespaces.length > 0 && (
              <div className="divide-y divide-gray-100">
                {namespaces.map((ns) => (
                  <div key={ns.id} className="py-2 flex items-center gap-2">
                    <span className="text-sm text-gray-700">{ns.name}</span>
                    <span className="text-xs text-gray-400">{ns.kind}</span>
                    {ns.parentId && <span className="text-xs text-gray-300">↳ {ns.parentId}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <LogPanel entries={logs} />
    </div>
  )
}
