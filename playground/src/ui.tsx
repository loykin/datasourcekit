import { tableFrameToRows, type QueryResult } from '@loykin/datasourcekit'

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-950 text-gray-100 text-xs p-4 rounded-lg overflow-x-auto leading-relaxed font-mono">
      {children}
    </pre>
  )
}

export function ErrorBadge({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-md">
      {message}
    </div>
  )
}

export function ResultTable({ result }: { result: QueryResult }) {
  const frame = result.frames.find((frame) => frame.frameType === 'table') ?? result.frames[0]
  if (!frame) {
    return (
      <div className="text-sm text-gray-400">
        No frames returned
      </div>
    )
  }
  const table = tableFrameToRows(frame)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            {table.columns.map((c) => (
              <th key={c.name} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-700">{String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type LogEntry = { id: number; level: 'info' | 'error'; message: string; detail?: unknown }

export function LogPanel({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Events</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-52 overflow-y-auto">
        {entries.map((e) => (
          <div key={e.id} className={`px-4 py-2.5 ${e.level === 'error' ? 'bg-red-50' : ''}`}>
            <span className={`text-sm ${e.level === 'error' ? 'text-red-700 font-medium' : 'text-gray-700'}`}>
              {e.message}
            </span>
            {e.detail !== undefined && (
              <pre className="text-xs text-gray-400 mt-1 overflow-x-auto font-mono">
                {JSON.stringify(e.detail, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
