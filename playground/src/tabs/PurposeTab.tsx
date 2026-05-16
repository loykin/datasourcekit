import { CodeBlock } from '../ui'

export function PurposeTab() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">Backend owns truth</p>
          <p className="text-sm text-gray-500">
            Datasource list, state, secrets, and permissions live on the backend.
            DatasourceKit never pretends to own them.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">Manager contract</p>
          <p className="text-sm text-gray-500">
            Apps wire their own backend handlers into{' '}
            <code className="text-teal-700 bg-teal-50 px-1 rounded text-xs">createDatasourceManager</code>.
            DatasourceKit provides the typed contract, not the store.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">Plugin routing</p>
          <p className="text-sm text-gray-500">
            Query execution goes through{' '}
            <code className="text-teal-700 bg-teal-50 px-1 rounded text-xs">manager.instances.query</code>,
            then each datasource plugin normalizes its own raw response.
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Architecture</p>
        <CodeBlock>{`Frontend / dashboard / editor
  -> DatasourceKit contracts
      -> app backend
          -> datasource storage, secrets, permissions, query execution`}</CodeBlock>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Minimal wiring</p>
        <CodeBlock>{`const postgresPlugin = defineDatasourcePlugin({
  type: 'postgres',
  name: 'PostgreSQL',
  backend: {
    transform: (raw) => normalizePostgresResult(raw),
  },
})

const manager = createDatasourceManager({
  plugins: [postgresPlugin],
  backend: {
    types: backend.datasourceTypes,
    instances: backend.datasources,
    query: (request, ctx) => backend.queryDatasource(request, ctx),
  },
})`}</CodeBlock>
      </div>
    </div>
  )
}
