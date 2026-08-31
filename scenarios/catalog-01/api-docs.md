# Catalog API

List catalog items with page-based pagination.

## List

```
GET /v1/catalog?page=1&limit=10
```

Response includes `page`, `limit`, and `totalPages`.

Example:

```json
{
  "items": [],
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```
