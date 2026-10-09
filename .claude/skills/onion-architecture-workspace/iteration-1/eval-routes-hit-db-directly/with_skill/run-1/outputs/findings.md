# Architecture review: bookmarks module

Paths relative to `fixtures/bookmarks/`. Module is at "routes-only" stage, but `routes.ts` queries the DB directly, which is a violation at any stage.

1. **`src/modules/bookmarks/routes.ts:2,4,5,15,21-24,34-37` - Routes query the database directly (transport depends on persistence).**
   The handler file imports `drizzle-orm`, the `db` singleton and `db/schema`, and runs select/insert inline. This is the "Transport never queries" rule; the DB import must live in exactly one place.
   Fix: add `src/modules/bookmarks/repository.ts` (domain-shaped methods such as `listForWorkspace(workspaceId)`, `findById(workspaceId, id)`, `create(workspaceId, input)`). Move all drizzle/schema imports there. Routes call it. A thin repository is enough; a service is only needed once a business rule appears.

2. **`src/modules/bookmarks/routes.ts:4` - `db` is imported as a module-level global rather than injected.**
   Bypasses the composition root, so tests cannot inject a fake and must mock the module. Fix: the repository takes the DB handle in its constructor; construct it in `platform/container.ts` (lazy getter, plus a `ContainerOverrides` slot). Routes use `container.bookmarksRepo`.

3. **`src/modules/bookmarks/routes.ts:25-27` - Handler hand-builds the error response.**
   `reply.code(404).send({ ok: false, message: ... })` duplicates the status-code decision and invents an error shape. `NotFoundError` already exists in `platform/errors.ts` and is unused.
   Fix: `throw new NotFoundError('bookmark')` (from the repository's null result) and let the single error handler in `app.ts` map it. Drop the `reply` parameter.

4. **`src/modules/bookmarks/routes.ts:15,28,38` - Raw Drizzle rows are returned as the API response; no `schema.response`.**
   The wire contract mirrors the physical table (`workspaceId`, `createdAt` Date, any future column leaks automatically). A column rename becomes a breaking API change and there is no output allowlist.
   Fix: define a `BookmarkDto` zod schema (contract type), add `toBookmarkDto(row)` in `modules/bookmarks/helpers.ts`, map at the edge, and declare `schema.response` on all three routes. Drizzle `$inferSelect` types stop at the repository boundary.

5. **`src/modules/bookmarks/routes.ts:20,33` - Params/body are validated by schema but typed with unchecked casts (`req.params as z.infer<...>`, `req.body as ...`).**
   The schema is passed as a zod object with no evidence that `fastify-type-provider-zod` validator/serializer compilers are in use here, and the casts discard type safety, so the schema and handler type can silently drift.
   Fix: register the route with the zod type provider (`app.withTypeProvider<ZodTypeProvider>()`) so `req.params` / `req.body` are inferred from `schema`, and remove the `as` casts. (Verify the compilers are set in `app.ts`, which is outside this fixture.)

6. **`src/modules/bookmarks/routes.ts:9-10` - Request schemas are defined inline in the routes file.**
   Minor: transport contracts should be the shared Zod contracts (`@devdigest/shared`, vendored in both server and client) so the client and server share one source of truth. Fix: move `CreateBody` / `Params` / the DTO into the shared contracts (edit both vendored copies by hand), or at least into the module's `types.ts`. Low priority.

7. **`src/modules/bookmarks/routes.ts:21-24` and `src/db/schema.ts:5` - Workspace scoping is correct in routes (`getContext` then `workspaceId` in every query), but only because each handler remembers to add it.**
   Once the repository exists (finding 1), make `workspaceId` a required first parameter of every repository method so tenancy cannot be omitted by a future handler. This is a hardening note rather than a current bug; every query here is correctly scoped.

## Checked, no problem
- `src/modules/_shared/context.ts`: `getContext` taking `FastifyRequest` is the one sanctioned adaptation point; it resolves tenancy through `container.auth`. Fine.
- `src/platform/errors.ts`: fine (note `ValidationError` has no constructor/message handling but that is not a layering issue).
- No service layer is needed yet: there are no business rules. Do not add a pass-through `service.ts`; promote to one when a rule or second caller appears. No transaction is needed (each operation is a single statement).
- No `process.env` reads and no adapters in this module.
