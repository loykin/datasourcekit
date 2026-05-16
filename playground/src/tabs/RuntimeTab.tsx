import { useState } from 'react'
import type {
  BatchQueryResult,
  DatasourceHealthResult,
  DatasourceManager,
  DatasourceSchemaNamespace,
  QueryResult,
} from '@loykin/datasourcekit'
import { CodeBlock, ErrorBadge, type LogEntry, LogPanel, ResultTable } from '../ui'

interface Props {
  manager: DatasourceManager
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500'
const selectCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white'
const btnPrimary = 'bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-700 transition-colors'
const btnOutline = 'border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50 transition-colors'

export function RuntimeTab({ manager }: Props) {
  const [uid, setUid] = useState('postgres-main')
  const [type, setType] = useState('postgres')
  const [useCallTransform, setUseCallTransform] = useState(false)

  const [queryResult, setQueryResult] = useState<QueryResult | undefined>()
  const [queryError, setQueryError] = useState('')

  const [batchResult, setBatchResult] = useState<BatchQueryResult | undefined>()
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
      const result = await manager.instances.query({
        id: `q-${Date.now()}`,
        datasourceUid: uid,
        datasourceType: type,
        query: { rawSql: 'select name, type, version' },
      }, undefined, callOptions)
      setQueryResult(result)
      log('info', `instances.query("${uid}", "${type}") succeeded`, result.meta)
    } catch (err) {
      setQueryError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function runBatchQuery() {
    try {
      const requests = [
        { id: `batch-1-${Date.now()}`, datasourceUid: 'postgres-main', datasourceType: 'postgres' },
        { id: `batch-2-${Date.now()}`, datasourceUid: 'clickhouse-analytics', datasourceType: 'clickhouse' },
      ]
      const result = await manager.instances.batchQuery(requests, undefined, callOptions)
      setBatchResult(result)
      const ok = result.items.filter((i) => i.data).length
      const fail = result.items.filter((i) => i.error).length
      log('info', `instances.batchQuery() → ${ok} ok, ${fail} failed`)
    } catch (err) {
      log('error', fmt(err))
    }
  }

  async function runHealthCheck() {
    try {
      const result = await manager.instances.healthCheck(uid, type)
      setHealth(result)
      log('info', `instances.healthCheck("${uid}", "${type}") → ${result.ok ? 'ok' : 'fail'}`, result)
    } catch (err) { log('error', fmt(err)) }
  }

  async function runListNamespaces() {
    try {
      const result = await manager.instances.listNamespaces(uid, type)
      setNamespaces(result)
      log('info', `instances.listNamespaces("${uid}", "${type}") → ${result.length} namespaces`)
    } catch (err) { log('error', fmt(err)) }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Datasource request</p>
        <div className="grid grid-cols-[1fr_180px_auto] gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">UID</label>
            <input className={inputCls} value={uid} onChange={(e) => setUid(e.target.value)} placeholder="postgres-main" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Type</label>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="postgres">postgres</option>
              <option value="clickhouse">clickhouse</option>
              <option value="mysql">mysql</option>
              <option value="redis">redis</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={useCallTransform}
              onChange={(e) => setUseCallTransform(e.target.checked)}
            />
            call transform
          </label>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Query routing</p>
        <CodeBlock>{`const result = await manager.instances.query(request, ctx, {
  transform: panelLevelPostProcess,
})

// internal
plugin = registry.get(request.datasourceType)
raw = plugin.backend?.query?.(request, ctx) ?? managerBackend.query(request, ctx)
normalized = plugin.backend?.transform?.(raw, request, ctx) ?? raw as QueryResult
final = options?.transform?.(normalized) ?? normalized`}</CodeBlock>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Single query</span>
          {queryResult && (
            <span className="text-xs text-gray-400">
              {queryResult.meta?.callTransformApplied ? 'plugin transform + call transform' : 'plugin transform'}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <button className={btnPrimary} onClick={runQuery}>manager.instances.query()</button>
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

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Batch</p>
          <button className={btnOutline} onClick={runBatchQuery}>instances.batchQuery()</button>
          {batchResult && (
            <p className="text-sm text-gray-500">
              {batchResult.items.filter((i) => i.data).length} ok / {batchResult.items.filter((i) => i.error).length} failed
            </p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Health</p>
          <button className={btnOutline} onClick={runHealthCheck}>instances.healthCheck()</button>
          {health && (
            <p className={`text-sm ${health.ok ? 'text-green-700' : 'text-red-700'}`}>
              {health.ok ? 'OK' : 'FAIL'} {health.message}
            </p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <p className="text-sm font-semibold text-gray-900">Schema</p>
          <button className={btnOutline} onClick={runListNamespaces}>instances.listNamespaces()</button>
          {namespaces.length > 0 && (
            <p className="text-sm text-gray-500">{namespaces.length} namespaces</p>
          )}
        </div>
      </div>

      <LogPanel entries={logs} />
    </div>
  )
}
