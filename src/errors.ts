export class DatasourceNotFoundError extends Error {
  constructor(uid: string) {
    super(`datasource "${uid}" not found`)
    this.name = 'DatasourceNotFoundError'
  }
}

export class DatasourceCapabilityError extends Error {
  constructor(uid: string, capability: string) {
    super(`datasource "${uid}" does not support ${capability}`)
    this.name = 'DatasourceCapabilityError'
  }
}

export class DatasourceTypeNotRegisteredError extends Error {
  constructor(type: string) {
    super(`datasource type "${type}" is not registered`)
    this.name = 'DatasourceTypeNotRegisteredError'
  }
}

export class DatasourceUnauthorizedError extends Error {
  constructor(message = 'datasource request is not authenticated') {
    super(message)
    this.name = 'DatasourceUnauthorizedError'
  }
}

export class DatasourceForbiddenError extends Error {
  constructor(message = 'datasource request is not allowed') {
    super(message)
    this.name = 'DatasourceForbiddenError'
  }
}

export class DatasourceConflictError extends Error {
  constructor(message = 'datasource was modified by another actor') {
    super(message)
    this.name = 'DatasourceConflictError'
  }
}

export class DatasourceValidationError extends Error {
  constructor(
    message = 'datasource validation failed',
    readonly errors?: string[],
  ) {
    super(message)
    this.name = 'DatasourceValidationError'
  }
}

export class DatasourceTransportError extends Error {
  constructor(
    message = 'datasource backend request failed',
    readonly status?: number,
  ) {
    super(message)
    this.name = 'DatasourceTransportError'
  }
}
