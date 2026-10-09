# Architecture review: bookmarks module

Guide: onion-architecture SKILL.md v1.0.0. All paths under `src/modules/bookmarks/`.

1. **routes.ts:2,4,5 (used at 15, 21-24, 34-37) - Transport queries the database directly.**
   The route file imports `drizzle-orm`, `db/client` and `db/schema`, and runs select/insert inline. The skill treats this as a violation at any module stage.
   Fix: add `modules/bookmarks/repository.ts` with domain-shaped methods, e.g. `listForWorkspace(workspaceId)`, `getById(workspaceId, id)` and `create(workspaceId, {url,title})`. It takes the Drizzle handle, and `routes.ts` no longer imports `drizzle-orm` or `db/*`. Build the repo in `platform/container.ts` (lazy getter plus `ContainerOverrides` slot) and use it as `container.bookmarksRepo`. A thin `service.ts` is optional here, since there are no business rules yet (stage 2 is earned later). Routes call the repo/service via the container.

2. **routes.ts:15, 28, 38 - Drizzle rows returned as the API response.**
   `$inferSelect` rows leak to the wire, so the contract mirrors the physical schema (a column rename becomes a breaking API change). `createdAt` also leaks as a raw Date.
   Fix: add `helpers.ts` with `toBookmarkDto(row)`, and map in the handler or service. Define the DTO type in the shared contracts (`@devdigest/shared`; edit both vendored copies). The repository returns the mapped or domain type, so row types stop at the repository boundary.

3. **routes.ts:25-27 - Handler hand-builds the 404 error body.**
   `reply.code(404).send({ ok: false, ... })` duplicates the central error handler's decision, and `reply` is used for error shaping.
   Fix: `throw new NotFoundError('bookmark')` (already in `platform/errors.ts`), and let the `app.ts` error handler map it. The message becomes "bookmark not found", with the shape consistent with other routes.

4. **routes.ts:13, 18, 31 - No `schema.response` declared on any route.**
   Without it there is no output allowlist, so any extra column added to the table is serialized automatically. This is a security boundary, not cosmetics.
   Fix: declare `response: { 200: BookmarkDto, 201: BookmarkDto }` (array for the list) using the zod DTO schema.

5. **routes.ts:13 - `GET /bookmarks` has no schema at all, and 18/31 use raw zod objects.**
   Schema-first validation is only partly applied: the routes pass bare zod objects in `schema`, with no visible `fastify-type-provider-zod` typing. As a result, handlers fall back to manual casts (`req.params as z.infer<...>` at line 20, `req.body as ...` at line 33). The casts defeat the type provider, so the schema and the handler type can silently drift.
   Fix: build the app with `.withTypeProvider<ZodTypeProvider>()` (or the repo's equivalent in `app.ts`) and drop the casts so `req.params` and `req.body` are inferred from the schema.

6. **routes.ts:2-5 plus the module as a whole - No write path is protected by a unit of work, and the create has no `workspace` guard beyond the argument.**
   Lower severity, and no action is needed today: it is a single insert, so no transaction is required. Revisit when `service.ts` coordinates more than one write; the service owns `db.transaction()` and passes the `tx` handle to the repository as an optional last parameter.
   (Informational, not a blocking finding.)

## Checked and fine
- `_shared/context.ts`: the `FastifyRequest` import is the sanctioned exception, and every route resolves tenancy via `getContext`, then scopes by `workspaceId` (lines 14/19/32; the 404 path correctly uses `and(id, workspaceId)`).
- `schema.ts`: no layering issue (physical schema notes belong to `postgresql-table-design`).
- `platform/errors.ts`: fine as is.
- A module this small may stay at routes+repository without a service (skill: "When NOT to Layer").

## Optional enforcement
Add the dependency-cruiser rule `^src/modules/[^/]+/routes\.ts$` -> `^src/db/schema` or `drizzle-orm`, so finding 1 cannot recur.
