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
            <code className="text-teal-700 bg-teal-50 px-1 rounded text-xs">defineDatasourceManager</code>.
            DatasourceKit provides the typed contract, not the store.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <p className="text-sm font-semibold text-gray-900 mb-2">Runtime contract</p>
          <p className="text-sm text-gray-500">
            Query, schema, health, and validation all delegate to the backend through{' '}
            <code className="text-teal-700 bg-teal-50 px-1 rounded text-xs">defineDatasourceRuntime</code> handlers.
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
        <CodeBlock>{`const manager = defineDatasourceManager({
  list:   (options, ctx) => backend.listDatasources(options, ctx),
  get:    (uid, ctx)     => backend.getDatasource(uid, ctx),
  create: (input, ctx)   => backend.createDatasource(input, ctx),
  update: (uid, patch, ctx) => backend.updateDatasource(uid, patch, ctx),
  delete: (uid, ctx)     => backend.deleteDatasource(uid, ctx),
})

const runtime = defineDatasourceRuntime({
  query:          (request, ctx) => backend.queryDatasource(request, ctx),
  healthCheck:    (uid, ctx)     => backend.healthCheck(uid, ctx),
  validateQuery:  (uid, q, ctx)  => backend.validateQuery(uid, q, ctx),
  listNamespaces: (uid, ctx)     => backend.listNamespaces(uid, ctx),
  listFields:     (uid, req, ctx) => backend.listFields(uid, req, ctx),
})`}</CodeBlock>
      </div>
    </div>
  )
}
