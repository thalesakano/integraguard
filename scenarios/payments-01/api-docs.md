# Payments API

POST /v1/payments

| Field | Required |
|-------|----------|
| amount | yes |
| currency | yes |

Declined payments return HTTP 402 or 400 with an error body.

Successful response HTTP 200:

```json
{ "paymentId": "pay_123", "status": "captured" }
```
