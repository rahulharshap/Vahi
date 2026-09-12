# Vahi API

A small REST surface over the same data the UI uses. Its first job is to make
the app testable without a browser; its second is integration.

## Authentication

Every request needs a key, minted in **Settings → API keys**. The plaintext is
shown once and stored only as a SHA-256 hash.

```bash
curl https://your-app.vercel.app/api/v1/health \
  -H "Authorization: Bearer vahi_xxxxxxxxxxxx"
```

`x-api-key: vahi_…` works too.

A key belongs to exactly one firm, and every handler runs inside that firm's
scope — there is no way for a request to name a different firm.

### Scopes

| Scope | Can |
| --- | --- |
| `read` | GET anything |
| `write` | also create clients, update filings, send chases, assign documents |
| `admin` | reserved for settings and key management |

Scopes are hierarchical: `admin` implies `write` implies `read`.

## Shape

Success is `{ "data": … }`, sometimes with `{ "meta": { "total", "returned" } }`.
Failure is `{ "error": { "code", "message" } }` with a matching HTTP status.

| Status | Code | Means |
| --- | --- | --- |
| 400 | `invalid_json`, `missing_field`, `invalid_status`, `invalid_date` | the request is malformed |
| 401 | `missing_key`, `invalid_key` | no key, or one that is unknown or revoked |
| 403 | `insufficient_scope` | the key is valid but not permitted |
| 404 | `not_found` | no such record **in this firm** |
| 409 | `chasing_disabled`, `nothing_due` | the request is valid but the state does not allow it |
| 500 | `internal_error` | logged with detail; the caller is told nothing that names a table |

## Endpoints

### `GET /api/v1/health`
Confirms a key works. Returns the firm, the key's scope, and row counts.

### `GET /api/v1/clients`
`?q=` searches name, PAN, GSTIN and contact. `?limit=` up to 500.

### `POST /api/v1/clients` — *write*
`name` and `entityType` required. Generates the client's whole statutory
calendar on creation and returns how many filings that was.

```json
{ "name": "Sri Lakshmi Traders", "entityType": "PROPRIETOR",
  "gstScheme": "MONTHLY", "hasEmployees": true, "state": "Telangana" }
```

### `GET /api/v1/filings`
One filing is one `(client, obligation, period)` — GSTR-3B for Aug 2026. That
is the unit documents attach to and chases are sent about.

Filters: `clientId`, `from`, `to`, `status`, `category`, `assignee`,
`openOnly=true`, `q`, `limit`.

### `GET /api/v1/filings/{id}`
Includes the document checklist, chase history and attached documents.

### `PATCH /api/v1/filings/{id}` — *write*
Any of `status`, `assignee`, `notes`, `extendedDue`. Use `extendedDue` when
CBDT or CBIC moves a date; it overrides the statutory date everywhere,
including the chase schedule.

### `GET /api/v1/chases`
What is due to be chased now, with the message already composed from the
firm's templates.

### `POST /api/v1/chases` — *write*
`{"filingId":"fil_…"}` or `{"all":true}`. Add `"dryRun":true` to see exactly
what would be sent, to whom, without sending. Returns 409 if the firm has
switched chasing off in settings.

### `GET /api/v1/documents`
Documents that arrived but could not be placed — the triage queue.

### `POST /api/v1/documents` — *write*
`{"documentId":"doc_…","filingId":"fil_…","documentLabel":"Bank statement for the period"}`
Places the document and ticks that checklist entry.

## Audit

Every write records who did what: actor (`key_…` for API, `ui` otherwise),
action, entity, and a before/after detail. Queryable from `audit_log`.

## Logging

One JSON line per event to stdout. Credentials are scrubbed before anything is
written — by field name, and by pattern for connection strings and keys that
turn up inside error messages. `LOG_LEVEL` defaults to `info`.
