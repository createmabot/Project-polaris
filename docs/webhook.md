# Webhook Integration

## TradingView Webhook

This endpoint receives alert payloads from TradingView, validates them, and stores them in the database. 

**Endpoint**: `POST /api/integrations/tradingview/webhook` (legacy `/api/webhooks/tradingview` also supported)

### Authentication
You must provide a valid `WebhookToken`.
1. **URL Query Param**: `?token=<your-token>` (Recommended and required for TradingView via URL)
2. **Header**: `Authorization: Bearer <your-token>`

*Note: If a `shared_secret` field is provided in the JSON payload, it will be strictly validated against the provided token. It cannot replace the token.*

### Required Payload Fields (External Payload v1)
The JSON payload should include minimum required fields for deduplication and symbol resolution:

```json
{
  "alert_name": "MA25 breakout",
  "alert_type": "technical",
  "tradingview_symbol": "TSE:7203",
  "timeframe": "D",
  "triggered_at": "2026-03-11T00:15:00Z"
}
```

**Pure Text Fallback**: If the payload is completely unstructured text (non-JSON), it will still be accepted to prevent data loss. The event will be stored with a `needs_review` status, and AI summarization jobs will not be automatically generated.

Any other fields (e.g., `trigger_price`, `message`, `metadata`) will be preserved in the raw JSON payload saved to the database.

### Behavior & Validations
- **401 Unauthorized**: Missing or invalid token.
- **400 Bad Request**: Missing `alert_name`, `timeframe`, `triggered_at`, or `tradingview_symbol`/`symbol`.
- **200 OK**: Event successfully parsed and saved into `alert_events` table.
- **Deduplication**: Deduplication is strictly enforced by the database via a unique `dedupeKey` hash generated from the payload. As a performance auxiliary, a 1-hour Redis cache is also used. Duplicate events return a 200 response (`{"data": {"status": "duplicate_ignored"}}`).
- **Webhook Receipts**: All incoming requests are logged to `webhook_receipts` immediately, even if they fail validation, enabling complete audit trails.

### Testing Locally
```bash
curl -X POST "http://localhost:3000/api/integrations/tradingview/webhook?token=test-webhook-token-123" \
  -H "Content-Type: application/json" \
  -d @fixtures/tradingview-webhook.json
```
