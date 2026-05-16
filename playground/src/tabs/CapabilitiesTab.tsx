import { useState } from 'react'
import type {
  DatasourceHealthResult,
  DatasourceManager,
  DatasourceSchemaNamespace,
} from '@loykin/datasourcekit'
import { CodeBlock, type LogEntry, LogPanel } from '../ui'

interface Props {
  manager: DatasourceManager
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500'
const selectCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white'
const btnOutline = 'border border-gray-300 text-gray-700 text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50 transition-colors'

export function CapabilitiesTab({ manager }: Props) {
  const [uid, setUid] = useState('postgres-main')
  const [type, setType] = useState('postgres')
  const [health, setHealth] = useState<DatasourceHealthResult | undefined>()
  const [namespaces, setNamespaces] = useState<DatasourceSchemaNamespace[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])

  function log(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((prev) => [{ id: Date.now() + prev.length, level, message, detail }, ...prev].slice(0, 10))
  }

  function fmt(err: unknown) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  async function runHealthCheck() {
    try {
      const result = await manager.instances.healthCheck(uid, type)
      setHealth(result)
      log('info', `instances.healthCheck("${uid}", "${type}")`, result)
    } catch (err) {
      log('error', fmt(err))
    }
  }

  async function runListNamespaces() {
    try {
      const result = await manager.instances.listNamespaces(uid, type)
      setNamespaces(result)
      log('info', `instances.listNamespaces("${uid}", "${type}")`, result)
    } catch (err) {
      log('error', fmt(err))
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-sm font-semibold text-gray-900">Datasource capabilities</p>
        <p className="text-sm text-gray-500 mt-1">
          These are datasource helper operations for management screens and editors. They are separate from query execution.
        </p>
        <div className="grid grid-cols-[1fr_180px] gap-4 mt-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">UID</label>
            <input className={inputCls} value={uid} onChange={(e) => setUid(e.target.value)} />
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
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Health check</p>
            <p className="text-sm text-gray-500 mt-1">Connection/status check for the selected datasource instance.</p>
          </div>
          <button className={btnOutline} onClick={runHealthCheck}>manager.instances.healthCheck()</button>
          {health && (
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-3 overflow-x-auto font-mono">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Schema discovery</p>
            <p className="text-sm text-gray-500 mt-1">Namespace/table/field discovery for query editor assistance.</p>
          </div>
          <button className={btnOutline} onClick={runListNamespaces}>manager.instances.listNamespaces()</button>
          {namespaces.length > 0 && (
            <pre className="text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-3 overflow-x-auto font-mono">
              {JSON.stringify(namespaces, null, 2)}
            </pre>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Contract</p>
        <CodeBlock>{`const health = await manager.instances.healthCheck(uid, type, ctx)
const namespaces = await manager.instances.listNamespaces(uid, type, ctx)
const fields = await manager.instances.listFields(uid, type, { namespaceId }, ctx)

// These calls may be implemented by plugin.backend.* or manager backend fallback.`}</CodeBlock>
      </div>

      <LogPanel entries={logs} />
    </div>
  )
}
