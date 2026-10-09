# Architecture review: bookmarks module

Only `src/modules/bookmarks/routes.ts` has real problems. `platform/errors.ts`, `db/schema.ts` and `_shared/context.ts` are fine. `getContext` is the one allowed place where Fastify is adapted.

1. **`modules/bookmarks/routes.ts:2,4-5,15,21-24,34-37` - Routes query the database directly.**
   `routes.ts` imports `drizzle-orm`, the `db` singleton and the `bookmarks` table, and runs select/insert inline. This is a violation at any module stage. It also means the DB is not reached through the container, so tests cannot inject an override.
   Fix: add `modules/bookmarks/repository.ts` with domain-shaped methods, for example `listForWorkspace(workspaceId)`, `getById(workspaceId, id)` and `create(workspaceId, {url, title})`. Construct it in `platform/container.ts` with a lazy getter and an override slot in `ContainerOverrides`. Keep the `drizzle-orm`, `db/client` and `db/schema` imports only in that file. Routes then call `container.bookmarksRepo.*`. A two-function repository is enough, and a `service.ts` can wait until a business rule appears.

2. **`modules/bookmarks/routes.ts:15,28,38` - Drizzle rows are returned as the API response.**
   The raw `$inferSelect` row, including `workspaceId`, is sent over the wire. A column rename becomes a breaking API change, and `workspaceId` leaks.
   Fix: have the repository return rows and map them at the edge in `modules/bookmarks/helpers.ts` (`toBookmarkDto`). Return a contract type, for example a `BookmarkDto` zod schema in the shared contracts (vendored in both `server` and `client`; edit both copies by hand).

3. **`modules/bookmarks/routes.ts:13,18,31` - No `schema.response` is declared.**
   The response allowlist is a security boundary. Without it nothing strips fields the handler did not promise, which is how finding 2 leaks `workspaceId`.
   Fix: declare `schema: { response: { 200: BookmarkDto, 201: BookmarkDto, 404: ... } }` on every route. For the list route use `z.array(BookmarkDto)`.

4. **`modules/bookmarks/routes.ts:25-27` - The handler builds its own error body.**
   `reply.code(404).send({ ok: false, message: 'bookmark missing' })` duplicates a decision the central error handler already makes. It also gives this module a different error shape from the others. `NotFoundError` exists in `platform/errors.ts` and is unused here.
   Fix: `throw new NotFoundError('bookmark')` when the repository returns nothing, and drop the `reply` parameter from the handler. The handler in `app.ts` maps it to 404.

5. **`modules/bookmarks/routes.ts:20,33` - Types are cast with `as` instead of inferred from the schema.**
   `req.params as z.infer<...>` and `req.body as z.infer<...>` mean the type is asserted rather than derived from the route schema. This hand-maintains a second source of truth. It also suggests `fastify-type-provider-zod` is not being used on this app instance (`FastifyInstance` is untyped).
   Fix: type the app as `FastifyInstance` with the zod type provider, for example `app.withTypeProvider<ZodTypeProvider>()`, so `req.params` and `req.body` are inferred from `schema.params` and `schema.body`. Remove the casts.

6. **`modules/bookmarks/routes.ts:13-16` - `GET /bookmarks` has no `schema` block.**
   This is a smaller consistency point. The route has no schema declaration, so the response and the contract are undocumented (see finding 3). It is covered by the fix for finding 3.

## Notes (not findings)

- There is no `service.ts`. For a module with no business rules, routes-only plus a repository is a legitimate stage. Do not add a pass-through service.
- No transaction is needed: each handler does a single statement.
- `getContext(container, req)` is used on every route, so tenancy scoping is correct.
