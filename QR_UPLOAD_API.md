# Public proof upload API

Public proof uploads use a short-lived server-issued upload intent. The caller
never selects the storage tenant with `company_id`.

## 1. Issue an intent

```http
POST /api/upload/intents/:shopSlug
Content-Type: application/json
```

Example for a public booking (the optional `id` is a browser-generated flow
context used when a guest may resume after sign-in):

```json
{
  "purpose": "BOOKING_QR_PROOF",
  "context": { "type": "BOOKING", "id": "guest-flow-0123456789" }
}
```

The server resolves and validates the shop from `:shopSlug`, fixes the purpose
and context, and returns:

```json
{
  "code": 201,
  "error": false,
  "data": {
    "uploadIntent": "upi1....",
    "expiresAt": "2026-09-05T12:10:00.000Z",
    "maxBytes": 5242880,
    "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    "purpose": "BOOKING_QR_PROOF",
    "contextId": "BOOKING:guest-flow-0123456789"
  }
}
```

Supported purposes are `BOOKING_QR_PROOF`, `ORDER_PAYMENT_PROOF`,
`RESTAURANT_DEPOSIT_PROOF`, and `GROUP_PAYMENT_PROOF`. Context validation also
checks the related published event/class, unpaid installment, active deposit,
or authorized order where applicable. Intents are one-time and replay
protected in the database.

## 2. Upload with the intent

```http
POST /api/upload/qr
Content-Type: multipart/form-data
```

Multipart fields:

- `image`: the proof file;
- `uploadIntent`: the complete intent returned in step 1.

The server verifies the signed tenant, purpose, context, expiry, nonce, file
size, declared MIME type, filename, and file signature. JPEG, PNG, WebP, and
PDF files up to 5 MB are accepted. `company_id` is ignored for attribution and
must not be used by clients.

Successful response:

```json
{
  "code": 201,
  "error": false,
  "data": {
    "url": "/api/storage/uploads/1/qr/qr-...png",
    "deleteToken": "sdt1....",
    "filename": "qr-...png",
    "size": 245760,
    "mimetype": "image/png",
    "purpose": "BOOKING_QR_PROOF",
    "contextId": "BOOKING:guest-flow-0123456789"
  }
}
```

## 3. Use the stored URL

Pass the returned `url` as `qr_proof_image_url` to the appropriate booking,
group, or order endpoint. The business write re-checks the stored upload's
tenant, purpose, context, and file existence before persisting the path.

## Controlled errors

Expected upload failures return a structured 4xx response:

```json
{
  "code": 415,
  "error": true,
  "errorCode": "UPLOAD_SIGNATURE_INVALID",
  "reason": "UPLOAD_SIGNATURE_INVALID",
  "message": "..."
}
```

Codes include `UPLOAD_TOO_LARGE`, `UPLOAD_TYPE_NOT_ALLOWED`,
`UPLOAD_SIGNATURE_INVALID`, `UPLOAD_INTENT_INVALID`, `UPLOAD_INTENT_EXPIRED`,
`UPLOAD_INTENT_REPLAYED`, `UPLOAD_FILE_REQUIRED`, `UPLOAD_FILENAME_INVALID`,
`UPLOAD_MULTIPART_INVALID`, and `UPLOAD_RATE_LIMITED`.

## Delete an unreferenced upload

```http
DELETE /api/upload/qr
Content-Type: application/json
```

```json
{
  "url": "/api/storage/uploads/1/qr/qr-...png",
  "deleteToken": "sdt1...."
}
```

The delete token is signed and path-bound. Deletion is rejected if the token
is forged, expired, mismatched, or the upload is already referenced by a
booking/order/group record. `/api/upload/file` applies the same contract for
commerce payment proofs.

## Client flow

Use the shared frontend helper `app/shop/lib/uploadApi.ts` (or reproduce the
two requests above). Do not construct a public upload request with a caller-
selected `company_id`, and do not expose raw backend error text to users;
localize the returned error code.
