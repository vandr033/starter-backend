# Durable WhatsApp delivery

## Problem and root cause

Before this remediation, `src/services/waha.service.ts` serialized outbound
requests with a process-local Promise chain. A request that had been accepted
by application code but had not yet reached WAHA existed only in that Node.js
process. A restart, a second backend instance, a WAHA disconnect, or a
transport exception could therefore lose the remaining sends. The old sender
also exposed `-1`-style failure handling, which made “queued”, “provider
accepted”, and “permanently failed” easy to conflate.

## Architecture

Normal application code now calls `queueWhatsappText`, `queueWhatsappImage`,
`queueWhatsappCode`, `queueWhatsappGroupMessage`, or `queueWhatsappBatch` in
`src/services/outbound-message.service.ts`. These APIs persist a job before
returning. They do not call WAHA.

`src/services/whatsapp-worker.service.ts` is the only application component
that submits message jobs to the transport (`sendTextNow` and `sendImageNow`).
The worker:

1. checks the configured provider/session;
2. recovers abandoned leases and expires due jobs;
3. atomically claims one eligible `PENDING` job;
4. submits it to WAHA or the local sink;
5. stores `SENT`, `PENDING` with retry metadata, `FAILED`, or `EXPIRED`.

The claim uses `FOR UPDATE SKIP LOCKED` on MySQL 8 and a conditional-update
fallback for older MySQL. `locked_at` and `lock_owner` form a lease; the
default lease is 120 seconds. A worker crash leaves a `PROCESSING` row that a
later worker returns to `PENDING` after the lease expires.

`WAHA_MIN_INTERVAL_MS` remains the spacing between remote submissions and the
worker starts with concurrency one. A transient error stops the current drain
cycle after scheduling the failed job, so an outage does not consume attempts
for every pending recipient.

## Database

Forward migration:

`prisma/migrations/20260905150000_durable_whatsapp_delivery/migration.sql`

The post-WhatsApp semantic linkage is in:

`prisma/migrations/20260907120000_post_whatsapp_semantic_cleanup/migration.sql`

Models:

- `OutboundMessageJob`: recipient, JSON payload, message type, lifecycle
  status, attempts/backoff, lease, error metadata, provider id, expiry, and
  timestamps.
- `OutboundMessageBatch`: campaign/source metadata, company scope,
  idempotency key, and completion timestamp.

Enums are `OutboundMessageChannel`, `OutboundMessageType`, and
`OutboundMessageStatus`. The migration adds unique idempotency/dedupe indexes
and worker/source/company/batch indexes. Historical migrations were not
rewritten.

## Provider state and reconnect behavior

- `disabled`: enqueue APIs return an explicit `SKIPPED` result and do not
  create jobs; the worker does not consume the outbox.
- `sink`: jobs are persisted and completed locally as `SENT` with provider id
  `LOCAL_SINK`, without an external request.
- `remote`: a valid `WAHA_BASE_URL` is required. The worker checks the WAHA
  session and consumes only while its status is `WORKING`.

While WAHA is `STOPPED`, `STARTING`, missing, or unreachable, the worker logs
`whatsapp_worker_paused` and leaves eligible jobs `PENDING` without burning
attempts. It checks again on its poll interval and is also woken when new work
is enqueued. The existing disconnect monitor continues to send an operational
email alert and wakes the in-process worker on status transitions; the worker
is the durable pause/resume mechanism. Reconnection is an optimization, not a
correctness dependency.

`SENT` means WAHA accepted the HTTP submission. This application does not
persist a WhatsApp device-delivery or read receipt, so `SENT` must not be read
as “delivered to the device” or “read by the recipient”.

Legacy notification records use the same lifecycle where they are linked to an
outbox job. A new restaurant notification, booking notification attempt, or
installment reminder is created as `PENDING` with its
`outbound_message_job_id`; the repository propagates `PROCESSING`, `SENT`,
`FAILED`, `EXPIRED`, and `CANCELLED` from that job. `sent_at` and provider ids
are populated only when the worker records `SENT`. Existing unlinked `SENT`
rows remain historical records and are not rewritten.

## Retry and expiration policy

Network errors, timeouts, HTTP 408/425/429/500/502/503/504, and transient
provider failures are retried with bounded delays of 15 seconds, 30 seconds,
1 minute, 2 minutes, 5 minutes, 10 minutes, 30 minutes, and 1 hour, subject to
the job and worker attempt limits. HTTP validation/authentication errors and
invalid persisted payloads become terminal `FAILED` jobs. Stored error text is
sanitized and provider response bodies are not persisted by the worker.

Jobs may carry `expires_at`. OTP jobs use their verification expiry; event
confirmation/invite, ticket, restaurant reminder, and appointment reminder
jobs use the relevant event/ticket/appointment time where available. Expired
jobs are never submitted and become `EXPIRED`.

Operator retry endpoints retry only terminal `FAILED` jobs. `SENT`,
`CANCELLED`, and `EXPIRED` jobs are not silently resurrected by a retry action.

## Caller migration inventory

All WhatsApp-producing application callers found in the backend now enqueue
through the shared API:

- authentication and verification OTPs: Better Auth phone sign-up, regular
  sign-up, profile phone changes, class/commerce/paid-event guest flows, and
  public class attendance; OTP jobs expire with the verification code;
- booking confirmations, updates, cancellations, pending-management alerts,
  staff alerts, no-show notices, and today reminders;
- event and class confirmations, invitations, waitlist notices, ticket QR
  images, and text fallback jobs;
- event/class mass messaging and CRM/customer mass messaging;
- installment/payment reminders;
- restaurant reservation, guest invitation, and waitlist notifications;
- commerce/store order notifications;
- review requests and review operational alerts;
- super-admin test messages and event group messages.

`createWhatsappGroup` remains a separate, explicit WAHA administration
operation because it creates a group rather than delivering an outbound
message. It is not part of the message outbox.

The caller contract is intentionally split: enqueue acceptance means the job
is durable and therefore `PENDING`/queued; it is not provider success. Admin
and customer-facing responses expose queued/pending WhatsApp separately from
`SENT`, while synchronous email continues to use its own provider result.

## Mass messaging and APIs

Mass flows persist one `OutboundMessageBatch` and its WhatsApp jobs before
continuing with their independent email work. The response includes the batch
id and enqueue counts (`queued_whatsapp`, `pending_whatsapp`, duplicates, and
rejections); it no longer waits for WAHA to submit every WhatsApp message.

Authenticated owner/admin endpoints:

- `GET /api/admin/outbound-messages/batches/:batchId`
- `POST /api/admin/outbound-messages/batches/:batchId/retry`
- `POST /api/admin/outbound-messages/batches/:batchId/cancel`
- `POST /api/admin/outbound-messages/jobs/:jobId/retry`
- `POST /api/admin/outbound-messages/jobs/:jobId/cancel`

The event and class admin screens use stable client-generated idempotency keys,
poll batch progress, show pending/processing/sent/failed counts, and retry
failed persisted batch jobs. CRM mass messaging also sends an idempotency key;
the batch API can be used to inspect its durable result.

Logical sends use source-aware dedupe keys. Batch idempotency keys are scoped by
company before storage, so the database's global unique index cannot join two
tenants accidentally. Repeated HTTP requests or frontend retries therefore
resolve to the existing job/batch instead of creating a new logical send.
Processing remains at-least-once: if WAHA accepted a message and
the worker crashes before recording `SENT`, lease recovery can submit it again.
The stable dedupe key prevents duplicate enqueue records, but exactly-once
provider delivery cannot be guaranteed without provider-side idempotency.

## Runtime and deployment

The web server starts the worker in-process and stops it during graceful
shutdown. A separate worker process is also available:

```bash
npm run start
npm run worker:whatsapp
```

Useful settings are `WHATSAPP_WORKER_ENABLED`,
`WHATSAPP_WORKER_POLL_INTERVAL_MS`, `WHATSAPP_JOB_LEASE_MS`,
`WHATSAPP_WORKER_SHUTDOWN_TIMEOUT_MS`, `WHATSAPP_MAX_ATTEMPTS`,
`WAHA_MIN_INTERVAL_MS`, and the existing `WAHA_*` provider settings. Running
both the web process and a separate worker is safe because persisted claims
are lease/ownership guarded.

### Production supervision

The production process manager or container platform must supervise at least
one worker-capable process. `npm run start` is worker-capable because
`src/server.ts` starts the in-process worker after the HTTP server starts.
`npm run worker:whatsapp` is useful when the worker should run as a separately
scaled or separately restarted process; it is worker-capable on its own.
Running both is supported. Multiple worker processes may run concurrently
because claims are guarded by the durable status, lock owner, and lease; a
platform must still keep at least one of these processes alive for queued work
to make progress. This repository does not assert any particular Coolify or
other platform configuration.

Domain persistence and notification enqueue are not yet one transaction for
every legacy flow. The outbox itself is transactional for batch creation, and
the worker never loses an accepted job; some best-effort notifications are
still intentionally created after the surrounding business operation.

## Verification

The final backend test run passed 153 tests (138 passed, 0 failed, 15 skipped
because they require the MySQL integration environment). `npm run typecheck`,
the frontend `npx tsc --noEmit`, and the frontend production build also pass;
the build retains only the repository's existing Browserslist and lint-style
warnings.

The disposable verifier applied all migrations to a fresh temporary MySQL
database and passed with an empty Prisma schema diff, repeatable seed, seeded
role/auth checks (5/5), upload/notification coverage (1/1), Phase 0 MySQL
integration (4/4), restaurant provider persistence (1/1), Phase 1 MySQL
integration (7/7), Phase 2 commerce concurrency (6/6), and durable WhatsApp
integration (1/1). The WhatsApp integration includes the linked notification
lifecycle: queued `PENDING` with no `sent_at`, provider-accepted `SENT` with
the worker timestamp, retry and permanent-failure propagation, expiry without
an apparent send, stale-lease recovery, and the outage/recreated-worker batch
scenario. The temporary database was cleaned after verification.

This verifies the MySQL/worker/transport boundary and outage state machine. It
does not claim a live production WAHA session was interrupted; that final
operational check still requires a disposable WAHA instance and test numbers.
