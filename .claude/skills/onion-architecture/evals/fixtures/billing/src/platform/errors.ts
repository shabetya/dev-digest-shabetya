export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(what: string) {
    super(`${what} not found`);
  }
}
