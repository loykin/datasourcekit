import { useState } from 'react'
import type { DatasourceManager } from '@loykin/datasourcekit'
import { DatasourceValidationError } from '@loykin/datasourcekit'
import type { FakeBackend, Scenario } from '../fakeBackend'
import { CodeBlock, ErrorBadge } from '../ui'

interface Props {
  manager: DatasourceManager
  backend: FakeBackend
}

const cardCls = 'bg-white border border-gray-200 rounded-lg p-5 space-y-3'
const triggerCls = 'text-sm font-medium text-teal-700 border border-teal-300 px-3 py-1.5 rounded-md hover:bg-teal-50 transition-colors'

export function ScenariosTab({ manager, backend }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lastReset, setLastReset] = useState('')

  function setErr(key: string, msg: string) {
    setErrors((prev) => ({ ...prev, [key]: msg }))
  }
  function clearErr(key: string) {
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function fmt(err: unknown) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }

  async function trigger(key: string, scenario: Scenario, action: () => Promise<unknown>) {
    clearErr(key)
    backend.setScenario(scenario)
    try {
      await action()
    } catch (err) {
      setErr(key, fmt(err))
    } finally {
      backend.setScenario('none')
    }
  }

  async function triggerActorDelete() {
    clearErr('actorDelete')
    const { items } = await manager.instances.list()
    if (!items[0]) {
      setErr('actorDelete', 'no datasources — call list() in the Manager tab first')
      return
    }
    backend.actorDelete(items[0].uid)
    try {
      await manager.instances.get(items[0].uid)
    } catch (err) {
      setErr('actorDelete', fmt(err))
    }
  }

  async function triggerConflict() {
    const { items } = await manager.instances.list()
    if (!items[0]) {
      setErr('conflict', 'no datasources — call list() in the Manager tab first')
      return
    }
    await trigger('conflict', 'conflict', () =>
      manager.instances.update(items[0].uid, { name: 'Updated', version: '999' })
    )
  }

  async function triggerValidation() {
    clearErr('validation')
    try {
      await manager.instances.create({ type: 'postgres', name: '' })
    } catch (err) {
      if (err instanceof DatasourceValidationError) {
        setErr('validation', `${err.name}: ${err.message}${err.errors ? ' — ' + err.errors.join(', ') : ''}`)
      } else {
        setErr('validation', fmt(err))
      }
    }
  }

  function reset() {
    backend.reset()
    setErrors({})
    setLastReset(new Date().toLocaleTimeString())
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <p className="text-sm font-semibold text-gray-900">Backend error flows</p>
        <p className="text-sm text-gray-500 mt-1">
          This tab is not another product feature. It shows how DatasourceKit exposes backend-owned failures
          such as permission denial, stale updates, deleted datasources, and validation errors.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3">
        <p className="text-sm text-amber-800">
          These errors are expected operating states. DatasourceKit should surface them as typed errors,
          and the app UI decides whether to reload, clear selection, disable an action, or keep form state.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={cardCls}>
          <p className="text-sm font-semibold text-gray-900">Permission denied</p>
          <p className="text-sm text-gray-500">Backend rejects create due to tenant permissions. Expected: show permission error, disable create.</p>
          <CodeBlock>{`// DatasourceForbiddenError
// -> disable action or show permission error`}</CodeBlock>
          {errors['forbidCreate'] && <ErrorBadge message={errors['forbidCreate']} />}
          <button
            className={triggerCls}
            onClick={() => trigger('forbidCreate', 'forbidCreate', () =>
              manager.instances.create({ type: 'postgres', name: 'New DS' })
            )}
          >
            Trigger
          </button>
        </div>

        <div className={cardCls}>
          <p className="text-sm font-semibold text-gray-900">Deleted by another actor</p>
          <p className="text-sm text-gray-500">Another user deletes a datasource. Subsequent get returns NotFoundError. Expected: clear selection, reload list.</p>
          <CodeBlock>{`// DatasourceNotFoundError
// -> clear selection, reload list`}</CodeBlock>
          {errors['actorDelete'] && <ErrorBadge message={errors['actorDelete']} />}
          <button className={triggerCls} onClick={triggerActorDelete}>Trigger</button>
        </div>

        <div className={cardCls}>
          <p className="text-sm font-semibold text-gray-900">Stale update conflict</p>
          <p className="text-sm text-gray-500">Backend detects stale version on update. Expected: reload datasource, ask user to retry.</p>
          <CodeBlock>{`// DatasourceConflictError
// -> reload datasource, ask user to retry`}</CodeBlock>
          {errors['conflict'] && <ErrorBadge message={errors['conflict']} />}
          <button className={triggerCls} onClick={triggerConflict}>Trigger</button>
        </div>

        <div className={cardCls}>
          <p className="text-sm font-semibold text-gray-900">Validation failure</p>
          <p className="text-sm text-gray-500">Backend rejects create due to invalid input. Expected: show field-level errors, keep form state.</p>
          <CodeBlock>{`// DatasourceValidationError
// -> show field errors, keep form state`}</CodeBlock>
          {errors['validation'] && <ErrorBadge message={errors['validation']} />}
          <button className={triggerCls} onClick={triggerValidation}>Trigger</button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-5 py-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Reset backend</p>
          {lastReset && <p className="text-xs text-gray-400 mt-0.5">Last reset at {lastReset}</p>}
        </div>
        <button
          className="text-sm font-medium border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
          onClick={reset}
        >
          Reset to initial state
        </button>
      </div>
    </div>
  )
}
