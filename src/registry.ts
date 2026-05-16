import type {
  DatasourceConfigEditorProps,
  DatasourcePluginDef,
  DatasourceQueryEditorProps,
} from './plugin'

export interface DatasourceRegistry {
  register(plugin: DatasourcePluginDef): void
  get(type: string): DatasourcePluginDef | undefined
  has(type: string): boolean
  list(): DatasourcePluginDef[]
  getConfigEditor(
    type: string,
  ): ((props: DatasourceConfigEditorProps<unknown>) => unknown) | undefined
  getQueryEditor(
    type: string,
  ): ((props: DatasourceQueryEditorProps<unknown, unknown>) => unknown) | undefined
}

export function createDatasourceRegistry(
  plugins: readonly DatasourcePluginDef[] = [],
): DatasourceRegistry {
  const byType = new Map<string, DatasourcePluginDef>()

  const registry: DatasourceRegistry = {
    register(plugin) {
      byType.set(plugin.type, plugin)
    },

    get(type) {
      return byType.get(type)
    },

    has(type) {
      return byType.has(type)
    },

    list() {
      return [...byType.values()]
    },

    getConfigEditor(type) {
      return byType.get(type)?.configEditor as
        | ((props: DatasourceConfigEditorProps<unknown>) => unknown)
        | undefined
    },

    getQueryEditor(type) {
      return byType.get(type)?.queryEditor as
        | ((props: DatasourceQueryEditorProps<unknown, unknown>) => unknown)
        | undefined
    },
  }

  for (const plugin of plugins) registry.register(plugin)

  return registry
}
