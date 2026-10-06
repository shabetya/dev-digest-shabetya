export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class ValidationError extends Error {
  readonly statusCode = 422;
}
