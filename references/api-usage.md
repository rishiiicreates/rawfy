# REST API Usage Reference

## Starting the Server
Start the local REST server on port 3000:
```bash
rawfy serve --port 3000
```

## Endpoints

### POST `/extract`
Extracts content from a given URL.

**Request Body (JSON):**
```json
{
  "url": "https://example.com",
  "format": "markdown",
  "js": true,
  "wait": 1000
}
```

**Response Body (JSON):**
```json
{
  "url": "https://example.com",
  "title": "Example Domain",
  "content": "...",
  "metadata": {},
  "format": "markdown"
}
```

### GET `/health`
Check if the service is running.
**Response:** `200 OK` `{"status": "ok"}`

## Authentication
If configured, provide the API key via headers:
```http
Authorization: Bearer <API_KEY>
```

## cURL Example
```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "json"}'
```

## Rate Limits & Usage
- Recommend restricting concurrent extractions to avoid memory exhaustion (especially if using `--js`).
- Default payload limit is 5MB.
