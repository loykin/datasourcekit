import { useMemo, useRef, useState } from 'react'
import {
  createDatasourceManager,
  defineDatasourcePlugin,
  tableRowsToFrame,
  type QueryResult,
} from '@loykin/datasourcekit'
import { createFakeBackend } from './fakeBackend'
import { PurposeTab } from './tabs/PurposeTab'
import { TypesTab } from './tabs/TypesTab'
import { ManagerTab } from './tabs/ManagerTab'
import { ScenariosTab } from './tabs/ScenariosTab'
import { RuntimeTab } from './tabs/RuntimeTab'
import { CapabilitiesTab } from './tabs/CapabilitiesTab'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'types', label: 'Types' },
  { id: 'manager', label: 'Datasources' },
  { id: 'query', label: 'Query Routing' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'errors', label: 'Error Flows' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [active, setActive] = useState<TabId>('overview')

  const backendRef = useRef(createFakeBackend())
  const backend = backendRef.current

  const manager = useMemo(() => createDatasourceManager({
    plugins: [
      defineDatasourcePlugin({
        type: 'postgres',
        name: 'PostgreSQL',
        configEditor: () => null,
        queryEditor: () => null,
        backend: {
          transform: normalizeRawResult,
        },
      }),
      defineDatasourcePlugin({
        type: 'clickhouse',
        name: 'ClickHouse',
        configEditor: () => null,
        queryEditor: () => null,
        backend: {
          transform: normalizeRawResult,
        },
      }),
      defineDatasourcePlugin({
        type: 'mysql',
        name: 'MySQL',
        configEditor: () => null,
        queryEditor: () => null,
        backend: {
          transform: normalizeRawResult,
        },
      }),
      defineDatasourcePlugin({
        type: 'prometheus',
        name: 'Prometheus',
        description: 'Registered frontend plugin, not installed on backend',
        configEditor: () => null,
        queryEditor: () => null,
        backend: {
          transform: normalizeRawResult,
        },
      }),
    ],
    backend: {
      types: {
        list: () => backend.listTypes(),
        get: (type) => backend.getType(type),
        install: (type) => backend.installType(type),
        uninstall: (type) => backend.uninstallType(type),
        enable: (type) => backend.enableType(type),
        disable: (type) => backend.disableType(type),
      },
      instances: {
        list: (options) => backend.list(options),
        get: (uid) => backend.get(uid),
        create: (input) => backend.create(input),
        update: (uid, patch) => backend.update(uid, patch),
        delete: (uid) => backend.delete(uid),
      },
      query: (request) => backend.query(request),
      healthCheck: (uid) => backend.healthCheck(uid),
      validateQuery: async () => ({ valid: true }),
      listNamespaces: (uid) => backend.listNamespaces(uid),
      listFields: (uid, request) => backend.listFields(uid, request),
    },
  }), [backend])

  function normalizeRawResult(raw: unknown): QueryResult {
      const r = raw as { fields: string[]; data: unknown[][]; reqId: string; uid: string }
      return {
        frames: [
          tableRowsToFrame({
            columns: r.fields.map((name) => ({ name, type: 'string' })),
            rows: r.data,
          }),
        ],
        requestId: r.reqId,
        stats: {
          rowsReturned: r.data.length,
        },
        meta: { uid: r.uid, normalized: true, rawBackendResponse: raw },
      }
  }

  const content: Record<TabId, React.ReactNode> = {
    overview: <PurposeTab />,
    types: <TypesTab manager={manager} />,
    manager: <ManagerTab manager={manager} />,
    query: <RuntimeTab manager={manager} />,
    capabilities: <CapabilitiesTab manager={manager} />,
    errors: <ScenariosTab manager={manager} backend={backend} />,
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="bg-white border-b border-gray-200 px-8 py-3 flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">DatasourceKit Playground</h1>
          <p className="text-xs text-gray-400 mt-0.5">@loykin/datasourcekit</p>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-8">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active === tab.id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-6">
        {content[active]}
      </div>
    </div>
  )
}
