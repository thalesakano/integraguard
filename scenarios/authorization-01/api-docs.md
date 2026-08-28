# Pre-Authorization API

## Creating an authorization

Submit a pre-authorization request using:

```
POST /v1/pre-authorization
```

### Request body

| Field | Type | Required |
|-------|------|----------|
| beneficiary_id | string | yes |
| procedures | array | yes |

Example:

```json
{
  "beneficiary_id": "BEN-123",
  "procedures": [{ "code": "789" }]
}
```

### Response

Returns `authorizationId`, `status`, and `businessStatus`.

## Query authorization status

```
GET /v1/pre-authorization/{id}
```
