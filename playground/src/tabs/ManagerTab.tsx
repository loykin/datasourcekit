import { useEffect, useState } from 'react'
import type { DatasourceInstance, DatasourceManager, DatasourceListOptions } from '@loykin/datasourcekit'
import { CodeBlock, ErrorBadge, type LogEntry, LogPanel } from '../ui'

interface Props {
  manager: DatasourceManager
}

const TYPE_OPTIONS = ['postgres', 'mysql', 'clickhouse', 'redis']

const inputCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500'
const selectCls = 'w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white'

const DEFAULT_OPTIONS: Record<string, string> = {
  postgres: '{\n  "host": "localhost",\n  "port": 5432,\n  "database": "app"\n}',
  clickhouse: '{\n  "host": "localhost",\n  "port": 8123,\n  "database": "analytics"\n}',
  mysql: '{\n  "host": "localhost",\n  "port": 3306,\n  "database": "reports"\n}',
  redis: '{\n  "host": "localhost",\n  "port": 6379\n}',
}

export function ManagerTab({ manager }: Props) {
  const [instances, setInstances] = useState<DatasourceInstance[]>([])
  const [total, setTotal] = useState<number | undefined>()
  const [selected, setSelected] = useState('')

  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState('postgres')
  const [createOptions, setCreateOptions] = useState(DEFAULT_OPTIONS.postgres)
  const [createError, setCreateError] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [pageSize, setPageSize] = useState(0)

  const [logs, setLogs] = useState<LogEntry[]>([])

  function log(level: LogEntry['level'], message: string, detail?: unknown) {
    setLogs((prev) => [{ id: Date.now() + prev.length, level, message, detail }, ...prev].slice(0, 10))
  }

  function fmt(err: unknown) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  async function fetchList(options?: DatasourceListOptions) {
    const result = await manager.instances.list(options)
    setInstances(result.items)
    setTotal(result.total)
    return result
  }

  useEffect(() => {
    fetchList().catch((err) => log('error', fmt(err)))
  }, [manager])

  async function handleList() {
    try {
      const result = await fetchList()
      log('info', `list() → ${result.items.length} datasources`, result.items.map((d) => d.uid))
    } catch (err) { log('error', fmt(err)) }
  }

  async function handleFilteredList() {
    try {
      const options: DatasourceListOptions = {}
      if (search.trim()) options.filter = { search: search.trim() }
      if (typeFilter) options.filter = { ...options.filter, type: typeFilter }
      if (pageSize > 0) options.pageSize = pageSize
      const result = await fetchList(options)
      log('info', `list(filter) → ${result.items.length} / ${result.total ?? '?'} total`, options)
    } catch (err) { log('error', fmt(err)) }
  }

  async function handleCreate() {
    setCreateError('')
    try {
      const options = JSON.parse(createOptions) as Record<string, unknown>
      const ds = await manager.instances.create({ type: createType, name: createName, options })
      await fetchList()
      setCreateName('')
      log('info', `create() → "${ds.uid}"`, { name: ds.name, type: ds.type })
    } catch (err) {
      setCreateError(fmt(err))
      log('error', fmt(err))
    }
  }

  async function handleDelete(uid: string) {
    try {
      await manager.instances.delete(uid)
      setSelected('')
      await fetchList()
      log('info', `delete("${uid}") succeeded`)
    } catch (err) { log('error', fmt(err)) }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-sm font-semibold text-gray-900">Datasource instances</p>
        <p className="text-sm text-gray-500 mt-1">
          These calls go to the backend-owned datasource store. The frontend does not keep authoritative datasource state.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Create */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Create instance</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name</label>
              <input className={inputCls} value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="My datasource" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Type</label>
              <select
                className={selectCls}
                value={createType}
                onChange={(e) => {
                  setCreateType(e.target.value)
                  setCreateOptions(DEFAULT_OPTIONS[e.target.value] ?? '{}')
                }}
              >
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Type-specific options</label>
              <textarea
                className={`${inputCls} font-mono min-h-28`}
                value={createOptions}
                onChange={(e) => setCreateOptions(e.target.value)}
              />
            </div>
            {createError && <ErrorBadge message={createError} />}
            <button
              className="w-full bg-teal-600 text-white text-sm font-medium py-2 rounded-md hover:bg-teal-700 disabled:opacity-40 transition-colors"
              onClick={handleCreate}
              disabled={!createName.trim()}
            >
                manager.instances.create()
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Load from backend</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Search</label>
              <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name or uid" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Type</label>
                <select className={selectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">all</option>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Page size</label>
                <select className={selectCls} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  <option value={0}>no limit</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="bg-teal-600 text-white text-sm font-medium py-2 rounded-md hover:bg-teal-700 transition-colors"
                onClick={handleList}
              >
                instances.list()
              </button>
              <button
                className="border border-teal-600 text-teal-700 text-sm font-medium py-2 rounded-md hover:bg-teal-50 transition-colors"
                onClick={handleFilteredList}
              >
                instances.list(filter)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Results</span>
          <span className="text-xs text-gray-400">
            {instances.length > 0 ? `${instances.length}${total !== undefined ? ` / ${total} total` : ''}` : '—'}
          </span>
        </div>
        {instances.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Call instances.list() to load</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {instances.map((ds) => (
              <div
                key={ds.uid}
                className={`px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors ${selected === ds.uid ? 'bg-teal-50' : ''}`}
                onClick={() => setSelected(ds.uid === selected ? '' : ds.uid)}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">{ds.name}</span>
                  <span className="text-xs text-gray-400 ml-2 truncate">{ds.uid}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-gray-400">{ds.type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ds.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {ds.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <span className="text-xs text-gray-400">v{ds.version}</span>
                  {selected === ds.uid && (
                    <button
                      className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleDelete(ds.uid) }}
                    >
                      delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API example */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Filter & pagination API</p>
        <CodeBlock>{`// filter by type + name search
const { items, total } = await manager.instances.list({
  filter: { type: 'postgres', search: 'main', enabled: true },
})

// page-based
const { items, total } = await manager.instances.list({ page: 0, pageSize: 10 })

// cursor-based
const { items, nextCursor } = await manager.instances.list({ pageSize: 10 })
const next = await manager.instances.list({ pageSize: 10, cursor: nextCursor })`}</CodeBlock>
      </div>

      <LogPanel entries={logs} />
    </div>
  )
}
