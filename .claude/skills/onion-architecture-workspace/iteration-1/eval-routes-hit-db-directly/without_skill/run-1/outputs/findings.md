# Architecture findings: bookmarks module

Note: routes.ts imports ../../db/client.js and ../../platform/container.js, which are not in the fixture; not checked.

1. **routes.ts:4-5, 15, 21-24, 34-37 - Routes query the database directly.** Handlers call db.select()/db.insert() with Drizzle operators and the table object; persistence, workspace scoping and not-found logic live in the HTTP adapter. No service, no repository. Fix: add bookmarks/service.ts (list/get/create), a BookmarkRepository port (ports.ts) and a Drizzle implementation (repository.drizzle.ts, the only file importing drizzle-orm and db/schema). Routes only parse input, call the service, shape the response.

2. **routes.ts:4 - Global `db` singleton instead of injected dependency.** The container is passed in but unused for data access; tests need real Postgres or module mocking; no seam for transactions. Fix: wire repository and service in the composition root (platform/container.ts); routes use container.bookmarks.service; tests use an in-memory repository.

3. **routes.ts:25-27 - Ad hoc 404.** Sends `{ ok: false, message: 'bookmark missing' }`, bypassing the unused NotFoundError (platform/errors.ts:1); body shape likely differs from the central error format. Fix: service throws NotFoundError('Bookmark'); one central setErrorHandler maps errors to status and body.

4. **routes.ts:15, 28, 38 - Raw Drizzle rows returned as the API response.** Persistence shape (incl. workspaceId, Date createdAt) becomes the public contract. Fix: define a BookmarkDto/response schema and map rows to it in the repository or service.

5. **routes.ts:18, 31 (and 20, 33) - Validation unreliable and types cast.** Zod objects are passed as Fastify schema without a Zod type provider/validatorCompiler, then handlers use `as z.infer<...>` casts that hide failure if validation is not running; schemas declared inline, no response schema. Fix: register fastify-type-provider-zod, drop the casts, move schemas to bookmarks/schemas.ts, add response schemas.

6. **_shared/context.ts:1-7 - Context helper tied to HTTP and Container.** getContext takes FastifyRequest and the whole Container for just { workspaceId }, called in every handler; pushes service code toward depending on Fastify/Container. Fix: resolve workspace once in an onRequest/preHandler hook, decorate the request, and pass a plain workspaceId to the service.
