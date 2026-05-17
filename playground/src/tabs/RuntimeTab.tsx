import { useState } from 'react'
import type {
  BatchQueryResult,
  DataQuery,
  DatasourceManager,
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

const QUERY_PAYLOADS: Record<string, string> = {
  postgres: '{\n  "rawSql": "select name, type, version from datasources"\n}',
  clickhouse: '{\n  "rawSql": "select count() from events",\n  "format": "JSONEachRow"\n}',
  mysql: '{\n  "sql": "select name, type, version from datasources",\n  "limit": 100\n}',
  prometheus: '{\n  "promql": "rate(http_requests_total[5m])",\n  "step": "30s"\n}',
  redis: '{\n  "command": "INFO"\n}',
}

const REQUEST_OPTIONS: Record<string, string> = {
  postgres: '{\n  "timeoutMs": 30000\n}',
  clickhouse: '{\n  "timeoutMs": 10000,\n  "maxRows": 1000\n}',
  mysql: '{\n  "timeoutMs": 30000\n}',
  prometheus: '{\n  "timeoutMs": 15000,\n  "range": true\n}',
  redis: '{\n  "timeoutMs": 3000\n}',
}

export function RuntimeTab({ manager }: Props) {
  const [uid, setUid] = useState('postgres-main')
  const [type, setType] = useState('postgres')
  const [queryPayload, setQueryPayload] = useState(QUERY_PAYLOADS.postgres)
  const [requestOptions, setRequestOptions] = useState(REQUEST_OPTIONS.postgres)
  const [useCallTransform, setUseCallTransform] = useState(false)

  const [queryResult, setQueryResult] = useState<QueryResult | undefined>()
  const [queryError, setQueryError] = useState('')
  const [lastRequest, setLastRequest] = useState<DataQuery | undefined>()

  const [batchResult, setBatchResult] = useState<BatchQueryResult | undefined>()
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
          frames: r.frames.map((frame) => ({
            ...frame,
            fields: frame.fields.map((field) => ({ ...field, name: field.name.toUpperCase() })),
          })),
          meta: { ...r.meta, callTransformApplied: true },
        }),
      }
    : undefined

  async function runQuery() {
    setQueryError('')
    try {
      const query = JSON.parse(queryPayload) as Record<string, unknown>
      const options = JSON.parse(requestOptions) as Record<string, unknown>
      const request = {
        id: `q-${Date.now()}`,
        datasourceUid: uid,
        datasourceType: type,
        query,
        options,
      }
      setLastRequest(request)
      const result = await manager.instances.query(request, undefined, callOptions)
      setQueryResult(result)
      log('info', `instances.query("${uid}", "${type}") succeeded`, result.meta)
    } catch (err) {
      setQueryError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function runBatchQuery() {
    try {
      const query = JSON.parse(queryPayload) as Record<string, unknown>
      const requests = [
        { id: `batch-1-${Date.now()}`, datasourceUid: uid, datasourceType: type, query },
        { id: `batch-2-${Date.now()}`, datasourceUid: 'clickhouse-analytics', datasourceType: 'clickhouse', query: JSON.parse(QUERY_PAYLOADS.clickhouse) },
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

  return (
    <div className="max-w-5xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Query request</p>
        <div className="grid grid-cols-[1fr_180px_auto] gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-600 mb-1">UID</label>
            <input className={inputCls} value={uid} onChange={(e) => setUid(e.target.value)} placeholder="postgres-main" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Type</label>
            <select
              className={selectCls}
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setQueryPayload(QUERY_PAYLOADS[e.target.value] ?? '{}')
                setRequestOptions(REQUEST_OPTIONS[e.target.value] ?? '{}')
              }}
            >
              <option value="postgres">postgres</option>
              <option value="clickhouse">clickhouse</option>
              <option value="mysql">mysql</option>
              <option value="prometheus">prometheus</option>
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
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Query body</label>
            <textarea
              className={`${inputCls} font-mono min-h-36`}
              value={queryPayload}
              onChange={(e) => setQueryPayload(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Query options</label>
            <textarea
              className={`${inputCls} font-mono min-h-36`}
              value={requestOptions}
              onChange={(e) => setRequestOptions(e.target.value)}
            />
          </div>
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
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Query execution</span>
          {queryResult && (
            <span className="text-xs text-gray-400">
              {queryResult.meta?.callTransformApplied ? 'plugin transform + call transform' : 'plugin transform'}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button className={btnPrimary} onClick={runQuery}>manager.instances.query()</button>
            <button className={btnOutline} onClick={runBatchQuery}>manager.instances.batchQuery()</button>
          </div>
          {queryError && <ErrorBadge message={queryError} />}
          {queryResult && (
            <>
              <ResultTable result={queryResult} />
            </>
          )}
        </div>
      </div>

      {(lastRequest || queryResult) && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Execution trace</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <TraceBlock
              title="1. Manager request"
              value={lastRequest}
              empty="Run query() to see the request"
            />
            <TraceBlock
              title="2. Backend raw response"
              value={queryResult?.meta?.rawBackendResponse}
              empty="Backend response appears after query"
            />
            <TraceBlock
              title="3. Plugin QueryResult"
              value={queryResult ? {
                frames: queryResult.frames,
                stats: queryResult.stats,
                requestId: queryResult.requestId,
                meta: {
                  uid: queryResult.meta?.uid,
                  normalized: queryResult.meta?.normalized,
                  callTransformApplied: queryResult.meta?.callTransformApplied,
                },
              } : undefined}
              empty="Normalized result appears after transform"
            />
          </div>
        </div>
      )}

      {batchResult && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-semibold text-gray-900 mb-3">Batch result</p>
          <p className="text-sm text-gray-500">
            {batchResult.items.filter((i) => i.data).length} ok / {batchResult.items.filter((i) => i.error).length} failed
          </p>
        </div>
      )}

      <LogPanel entries={logs} />
    </div>
  )
}

function TraceBlock({ title, value, empty }: { title: string; value: unknown; empty: string }) {
  return (
    <div className="p-5 min-w-0">
      <p className="text-sm font-semibold text-gray-900 mb-3">{title}</p>
      {value === undefined ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <pre className="text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-3 overflow-x-auto font-mono max-h-80">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  )
}
