import { useRef, useState } from 'react'
import { defineDatasourceManager, defineDatasourceRuntime } from '@loykin/datasourcekit'
import { createFakeBackend } from './fakeBackend'
import { PurposeTab } from './tabs/PurposeTab'
import { ManagerTab } from './tabs/ManagerTab'
import { ScenariosTab } from './tabs/ScenariosTab'
import { RuntimeTab } from './tabs/RuntimeTab'

const TABS = [
  { id: 'purpose', label: 'Purpose' },
  { id: 'manager', label: 'Manager' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'runtime', label: 'Runtime' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [active, setActive] = useState<TabId>('purpose')

  const backendRef = useRef(createFakeBackend())
  const backend = backendRef.current

  const manager = defineDatasourceManager({
    list: (options) => backend.list(options),
    get: (uid) => backend.get(uid),
    create: (input) => backend.create(input),
    update: (uid, patch) => backend.update(uid, patch),
    delete: (uid) => backend.delete(uid),
  })

  const runtime = defineDatasourceRuntime({
    query: (request) => backend.query(request.datasourceUid),
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
    variableQuery: async () => [],
    queryAnnotations: async () => [],
  })

  const content: Record<TabId, React.ReactNode> = {
    purpose: <PurposeTab />,
    manager: <ManagerTab manager={manager} />,
    scenarios: <ScenariosTab manager={manager} backend={backend} />,
    runtime: <RuntimeTab runtime={runtime} />,
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
