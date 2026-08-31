# Orders API

Create an order for a customer.

## Authentication

No special headers required.

## Create order

```
POST /v1/orders
```

| Field | Type | Required |
|-------|------|----------|
| customerId | string | yes |

Example:

```json
{
  "customerId": "CUST-001"
}
```

### Response

HTTP 201:

```json
{
  "orderId": "ORD-xxx",
  "status": "created"
}
```

Errors use HTTP 4xx.

## Get order

```
GET /v1/orders/{id}
```
