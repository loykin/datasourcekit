export class DatasourceNotFoundError extends Error {
  constructor(uid: string) {
    super(`datasource "${uid}" not registered`)
    this.name = 'DatasourceNotFoundError'
  }
}

export class DatasourceTypeMismatchError extends Error {
  constructor(uid: string, expected: string, actual: string) {
    super(`datasource "${uid}" type mismatch: expected "${expected}", got "${actual}"`)
    this.name = 'DatasourceTypeMismatchError'
  }
}

export class DatasourceCapabilityError extends Error {
  constructor(uid: string, capability: string) {
    super(`datasource "${uid}" does not support ${capability}`)
    this.name = 'DatasourceCapabilityError'
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
