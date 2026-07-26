# ESP32 contract (implement when the prototype is available)

The device sends a JSON request every 10 seconds to `POST /api/readings`.
It must include the `X-API-Key` header, whose value exactly matches `API_KEY`
in the backend `.env` file.

```json
{
  "unit_id": "drainage-001",
  "debris_level": 45.2,
  "distance": 27.4,
  "overflow": false,
  "led_status": "YELLOW",
  "battery": 82,
  "timestamp": "2026-07-26T14:30:00+08:00"
}
```

`unit_id` must equal an existing `drainage_units.device_id`. The firmware must
auto-calibrate its empty distance at boot, calculate the clamped 0–100 fill
percentage, include the real ultrasonic distance in centimetres, and never send
the old heartbeat or stuck-mode fields.
