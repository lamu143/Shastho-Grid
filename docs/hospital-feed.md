# Connecting a hospital or blood bank to ShasthoGrid

DGHS has no public live feed of ICU beds, ventilators or blood stock. ShasthoGrid therefore takes
counts straight from each facility. There are two ways in:

1. **Staff entry**: a `hospital_admin` or `blood_bank_officer` updates counts in the app.
2. **System feed**: the hospital's own HIS or blood-bank software pushes counts to the API.

Every count records where it came from (`SEED_DEMO`, `STAFF` or `FEED`) and when it was reported.
The dispatch screen labels each hospital **Live**, **Stale** (not refreshed for
`CAPACITY_STALE_MINUTES`, 6 hours by default) or **Demo**. CareMatch ranks stale hospitals lower
and lists them in `stale_facilities`.

## 1. Get an API key

An admin, or that facility's own officer, creates the key:

```bash
curl -X POST "$API/api/v1/facilities/$FACILITY_ID/feed-keys" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"label": "BMU HIS integration"}'
```

Each key has a **scope**, which follows the creator's role:
- A `hospital_admin` gets `RESOURCES`: beds and ventilators.
- A `blood_bank_officer` gets `BLOOD`.
- An admin may choose `RESOURCES`, `BLOOD` or `ALL` by sending `"scope"`.

A push containing a section outside the key's scope is rejected with 403 `FEED_SCOPE_VIOLATION`.

The response contains `api_key` (it starts with `sgf_`). **It is shown only once.** ShasthoGrid
keeps only a SHA-256 hash. List keys with `GET …/feed-keys` and revoke one with
`DELETE …/feed-keys/{key_id}`. A revoked key stops working at once.

## 2. Push counts

Send what **your own system** shows. Push every 5–15 minutes, and also whenever a count changes.

```bash
curl -X POST "$API/api/v1/feed/v1/capacity" \
  -H "X-Facility-Key: $SGF_KEY" -H "Content-Type: application/json" \
  -d '{
    "reported_at": "2026-11-26T09:30:00+06:00",
    "resources": [
      {"resource_type": "ICU_BED",    "total_physical_count": 30, "staffed_capacity_count": 24, "available_count": 3},
      {"resource_type": "VENTILATOR", "total_physical_count": 20, "staffed_capacity_count": 16, "available_count": 1}
    ],
    "blood": [
      {"blood_type": "O-", "units_in_stock": 4, "nearest_expiry_date": "2026-12-04"}
    ]
  }'
```

| Field | Values |
|---|---|
| `resource_type` | `ICU_BED`, `VENTILATOR`, `HDU_BED`, `NICU_BED` |
| counts | Must satisfy `available ≤ staffed ≤ physical`. Staffed means beds with nurses on shift, not just a physical bed. |
| `blood_type` | `O-`, `O+`, `A-`, `A+`, `B-`, `B+`, `AB-`, `AB+` |
| `units_in_stock` | Every unit on the shelf, including units ShasthoGrid has reserved |
| `reported_at` | Optional ISO-8601 time with a timezone offset. It may not be in the future (5 min of clock skew is allowed) or more than 24 h old. |

## What ShasthoGrid does with a push

- **Pending holds are subtracted.** Your census does not yet include patients a dispatcher has
  booked who are still in the ambulance. ShasthoGrid stores
  `available = reported − its own pending holds` (statuses HELD, CONFIRMED or EN_ROUTE), so a bed
  is never sold twice. Blood works the same way: `available = units_in_stock − units_reserved`.
- **Older reports never overwrite newer ones.** A report with an earlier `reported_at` than the stored
  one, whether that came from staff or the feed, comes back as `SKIPPED_OLDER`.
- **Each row reports its outcome:** `APPLIED`, `SKIPPED_OLDER` or `NOT_STOCKED` (the facility has no
  such row on file), along with `held_by_shasthogrid` and `available_now`.
- **Pushes are audited.** Each push writes a `FEED_CAPACITY_PUSH` audit entry with the key prefix and
  every row. A push is an ordinary database transaction that takes row locks in LockStep order.

## Errors

| Status | `error_code` | Meaning |
|---|---|---|
| 401 | `FEED_KEY_INVALID` | Missing, unknown or revoked key, or the facility is inactive |
| 403 | `FEED_SCOPE_VIOLATION` | The key's scope does not cover that section |
| 422 | validation / `FEED_TIMESTAMP_*` | Counts break the invariant, a type is repeated, or the timestamp is out of range |
| 429 | rate limit | Slow down; retry after the interval in `Retry-After` (feed and login share a stricter per-IP limit of 30/min) |
