# Pre-Authorization API v1

## Overview

This API supports pre-authorization of medical procedures with **full idempotency** via `Idempotency-Key` header.

## Authentication

No special headers required.

## Creating an authorization

```
POST /v1/pre-authorization
```

### Request body

| Field | Type | Required |
|-------|------|----------|
| beneficiaryCard | string | yes |
| procedureCode | string | yes |

Example:

```json
{
  "beneficiaryCard": "123456",
  "procedureCode": "789"
}
```

### Idempotency

Send `Idempotency-Key` header to prevent duplicate submissions. The API guarantees exactly-once semantics.

### Response

Returns HTTP 200 with:

```json
{
  "authorizationId": "AUTH-xxx",
  "status": "approved"
}
```

Errors are returned as HTTP 4xx/5xx.

## Query status

```
GET /v1/pre-authorization/{id}
```
