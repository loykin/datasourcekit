import { useEffect, useState } from 'react'
import type { DatasourceManager, DatasourceTypeInfo } from '@loykin/datasourcekit'
import { CodeBlock, ErrorBadge, type LogEntry, LogPanel } from '../ui'

interface Props {
  manager: DatasourceManager
}

const btnPrimary = 'bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-700 transition-colors'
const btnOutline = 'border border-gray-300 text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40'

export function TypesTab({ manager }: Props) {
  const [types, setTypes] = useState<DatasourceTypeInfo[]>([])
  const [selected, setSelected] = useState<DatasourceTypeInfo | undefined>()
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])

  function log(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((prev) => [{ id: Date.now() + prev.length, level, message, detail }, ...prev].slice(0, 10))
  }

  function fmt(err: unknown) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  async function loadTypes() {
    setError('')
    try {
      const result = await manager.types.list()
      setTypes(result)
      log('info', `types.list() -> ${result.length} types`, result.map((t) => t.type))
    } catch (err) {
      setError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function inspect(type: string) {
    setError('')
    try {
      const result = await manager.types.get(type)
      setSelected(result)
      log('info', `types.get("${type}")`, result)
    } catch (err) {
      setError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function toggle(type: DatasourceTypeInfo) {
    setError('')
    try {
      if (type.enabled) {
        await manager.types.disable?.(type.type)
        log('info', `types.disable("${type.type}")`)
      } else {
        await manager.types.enable?.(type.type)
        log('info', `types.enable("${type.type}")`)
      }
      await loadTypes()
    } catch (err) {
      setError(fmt(err))
      log('error', fmt(err))
    }
  }

  useEffect(() => {
    loadTypes().catch((err) => log('error', fmt(err)))
  }, [manager])

  return (
    <div className="max-w-6xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">Datasource types</p>
            <p className="text-sm text-gray-500 mt-1">
              Backend type records are merged with frontend registry plugins.
            </p>
          </div>
          <button className={btnPrimary} onClick={loadTypes}>manager.types.list()</button>
        </div>
      </div>

      {error && <ErrorBadge message={error} />}

      <div className="grid grid-cols-[1fr_360px] gap-4">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 grid grid-cols-[1.2fr_90px_90px_110px_120px_150px] gap-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Type</span>
            <span>Installed</span>
            <span>Enabled</span>
            <span>Config UI</span>
            <span>Query UI</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-gray-100">
            {types.map((type) => (
              <div
                key={type.type}
                className="px-5 py-3 grid grid-cols-[1.2fr_90px_90px_110px_120px_150px] gap-3 items-center hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{type.name}</p>
                  <p className="text-xs text-gray-400">{type.type}</p>
                </div>
                <Status value={type.installed} />
                <Status value={type.enabled} />
                <Status value={type.hasConfigEditor} />
                <Status value={type.hasQueryEditor} />
                <div className="flex items-center gap-2">
                  <button className={btnOutline} onClick={() => inspect(type.type)}>get</button>
                  <button
                    className={btnOutline}
                    onClick={() => toggle(type)}
                    disabled={type.installed === false}
                  >
                    {type.enabled ? 'disable' : 'enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Selected type</p>
            {selected ? (
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-3 overflow-x-auto font-mono">
                {JSON.stringify(selected, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-400">Call types.get()</p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Contract</p>
            <CodeBlock>{`const types = await manager.types.list()

// backend + registry merge
// backend only: redis
// registry only: prometheus
// both: postgres, clickhouse, mysql

const type = await manager.types.get('postgres')
await manager.types.disable?.('redis')`}</CodeBlock>
          </div>
        </div>
      </div>

      <LogPanel entries={logs} />
    </div>
  )
}

function Status({ value }: { value?: boolean }) {
  if (value === undefined) return <span className="text-xs text-gray-300">unknown</span>
  return (
    <span className={`text-xs font-medium ${value ? 'text-green-700' : 'text-gray-400'}`}>
      {value ? 'yes' : 'no'}
    </span>
  )
}
