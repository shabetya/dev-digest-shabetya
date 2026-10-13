# dev-digest-shabetya-conventions

# dev-digest-shabetya-conventions

House conventions for `dev-digest-shabetya`. Flag changes that violate any rule below and cite the offending `file:line`.

## api-fetch-normalized-errors
All API errors are normalized into a custom `ApiError` class that carries status, code, and details, thrown consistently in `apiFetch`.

Detected in `client/src/lib/api.ts:21-63`:

```
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        ...(init?.body != null ? { "content-type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e
    );
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

## schema-shared-created-at
Use a shared `now()` helper for standard `created_at` column timestamps instead of repeating the column definition in every table.

Detected in `server/src/db/schema/_shared.ts:9`:

```
export const now = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
```