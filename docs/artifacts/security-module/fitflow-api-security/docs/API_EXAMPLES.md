# FitFlow Suite Auth API — curl Examples

Base URL below assumes the API is running locally (via `docker compose up`
or `npm start`) on the default port:

```
http://localhost:3000
```

All request/response bodies below are real captures from a live local run
of this exact codebase against a fresh PostgreSQL database (JWTs and
refresh tokens shown are single-use demo values — they will not work
against your own instance).

## 1. Register — `POST /v1/auth/register`

Creates a new account. The server always assigns the default `USER` role
server-side — `role` is never accepted from the request body, so a client
can't self-assign `ADMIN`/`COACH` at signup.

```bash
curl -i -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo.user@fitflow.app",
    "password": "SuperSecret123"
  }'
```

Success — `201 Created`:

```json
{
  "user": {
    "id": "253d18cc-5543-4041-8f56-3a9ef995e043",
    "email": "demo.user@fitflow.app"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "151qCE6Q9CfZ3tdjNmvXkCeMlmxiroDhUqrW6i-YSbWPMAU7xwvOUnGZjAJOERiy",
  "tokenType": "Bearer",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresAt": "2026-08-27T23:55:29.719Z"
}
```

Error — password under 8 characters, `400 Bad Request` (rejected before
any database call):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "password must be at least 8 characters" } }
```

Error — email already registered, `409 Conflict`:

```json
{ "error": { "code": "CONFLICT", "message": "An account with this email already exists" } }
```

Registration is rate-limited to **5 attempts per hour per IP**
(`registerRateLimiter`); exceeding it returns `429 Too Many Requests`.

## 2. Login — `POST /v1/auth/login`

```bash
curl -i -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo.user@fitflow.app",
    "password": "SuperSecret123"
  }'
```

Success — `200 OK`:

```json
{
  "user": {
    "id": "253d18cc-5543-4041-8f56-3a9ef995e043",
    "email": "demo.user@fitflow.app"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "9SR0BI7kS70as_bv53PctZrxBtCj1URYpHpKcLj98o0fdXdCjs39DItmBtGs9dzj",
  "tokenType": "Bearer",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresAt": "2026-08-27T23:55:34.008Z"
}
```

Error — wrong password OR unknown email, always the **same** generic
`401 Unauthorized` (deliberately avoids leaking which part of the
credential pair was wrong, and avoids leaking whether an email is
registered at all):

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" } }
```

Error — account status is not `active`: same generic `401` as above.

Login is rate-limited to **10 attempts per 15 minutes per (IP, email)**
pair (`loginRateLimiter`); exceeding it returns `429 Too Many Requests`.

## 3. Refresh — `POST /v1/auth/refresh`

Refresh tokens are opaque, single-use, and rotate on every call: the
presented token is immediately revoked and replaced with a new pair in
one atomic transaction.

```bash
curl -i -X POST http://localhost:3000/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "9SR0BI7kS70as_bv53PctZrxBtCj1URYpHpKcLj98o0fdXdCjs39DItmBtGs9dzj"
  }'
```

Success — `200 OK` (new pair; the presented token is now revoked):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "nK091910PYMGwLD7u8ZOg0vIXyb3xllnz_pX9KdOZRqy8hnR8mGVzqVfN9cEEcp_",
  "tokenType": "Bearer",
  "accessTokenExpiresIn": 900,
  "refreshTokenExpiresAt": "2026-08-27T23:55:39.557Z"
}
```

Error — missing `refreshToken` in the body, `400 Bad Request`:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "refreshToken is required" } }
```

Error — **reuse of an already-rotated token** (captured live by calling
`/refresh` again with the *old* token from the example above). This is
the reuse-detection path: presenting a token that has already been
rotated is treated as a signal the token was stolen, so **every** active
session for that user is revoked, not just the one being replayed —
`401 Unauthorized`:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Refresh token reuse detected; all sessions have been revoked. Please log in again."
  }
}
```

The same `401` + message is returned for an expired token or a token
belonging to a deactivated account.

Refresh is rate-limited to **30 attempts per 15 minutes per IP**
(`refreshRateLimiter`); exceeding it returns `429 Too Many Requests`.

## 4. Logout — `POST /v1/auth/logout`

Revokes a refresh token (ending that session). Set `"allSessions": true`
to revoke every refresh token for the user (sign out everywhere).

```bash
curl -i -X POST http://localhost:3000/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "UwMLW7T-IBNbXQtxngQYQt2m5isqT2ULjTD7UzhurT2x3YKDNB20pao8iT_2fdBA"
  }'
```

Success — `204 No Content` (no response body).

Logout is intentionally idempotent: a missing, already-revoked, or
unknown `refreshToken` still returns `204`, since the end state ("client
holds no valid session") is identical either way — it never leaks
whether a token was valid.

Sign out of every device:

```bash
curl -i -X POST http://localhost:3000/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "UwMLW7T-IBNbXQtxngQYQt2m5isqT2ULjTD7UzhurT2x3YKDNB20pao8iT_2fdBA",
    "allSessions": true
  }'
```

## Full flow in one script

```bash
BASE=http://localhost:3000

# 1. Register
REGISTER=$(curl -s -X POST $BASE/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"pipeline@fitflow.app","password":"SuperSecret123"}')
echo "$REGISTER" | python3 -m json.tool

REFRESH=$(echo "$REGISTER" | python3 -c "import json,sys; print(json.load(sys.stdin)['refreshToken'])")

# 2. Login (separately, to prove the password was stored/hashed correctly)
curl -s -X POST $BASE/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pipeline@fitflow.app","password":"SuperSecret123"}' | python3 -m json.tool

# 3. Refresh (rotates the token from step 1)
curl -s -X POST $BASE/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}" | python3 -m json.tool

# 4. Logout
curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/v1/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
```

## Reference: status codes used by these routes

| Status | Meaning in this API |
|---|---|
| 200 | Login/refresh succeeded |
| 201 | Registration succeeded |
| 204 | Logout succeeded (no body) |
| 400 | `VALIDATION_ERROR` — missing/malformed input, rejected before touching the database |
| 401 | `UNAUTHORIZED` — bad credentials, invalid/expired/reused refresh token, inactive account |
| 409 | `CONFLICT` — email already registered |
| 429 | `TOO_MANY_REQUESTS` — rate limit exceeded (see per-route limits above) |

See [`FitFlow Suite Refresh Token Rotation & Rate Limiting`](./REFRESH_TOKEN_ROTATION.md)
for the full design rationale behind rotation and rate limiting, and
[`../openapi/openapi.yaml`](../openapi/openapi.yaml) for the complete
machine-readable schema of every field and error shape.
