# Pre-Authorization API

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

**Note:** The API accepts beneficiaryCard as shown above.
