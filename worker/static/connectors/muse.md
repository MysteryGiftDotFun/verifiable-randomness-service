# Mystery Gift TEE Randomness: custom connector brief

This file is for an AI agent building a connector to Mystery Gift randomness.
Read it before writing code. OpenAPI: https://rng.mysterygift.fun/openapi.yaml

## What this service is

Hardware-backed verifiable randomness inside Intel TDX (Phala). It is **not**
Chainlink VRF and **not** Flash VRF (on-chain coordinator). Each paid draw
returns a seed plus a TEE attestation you can verify.

## Connection details

- Base URL: `https://rng.mysterygift.fun`
- Allowed host: `rng.mysterygift.fun` only. Do not call Phala CVM hostnames.
- Auth: paid POSTs currently require **x402** ($0.01 USDC). Muse cannot complete
  an x402 handshake. Use free endpoints without payment. For paid draws, the
  human must supply a developer API key when one is issued (prefix `mgk_`) as
  `Authorization: Bearer`.
- Do **not** send `X-Internal-Secret` or `X-API-Key`. Those are not user keys.
- Content-Type: `application/json`
- Health is `GET /v1/health` only. There is **no** `GET /health`.
- `request_hash` binds the TEE attestation (`SHA256(seed ‖ request_hash)`).
  It is **not** an idempotency key. The same hash still yields a new seed.
- Errors today are `{ "error": "<string>" }`. Missing payment is HTTP 402 with
  `PAYMENT-REQUIRED`, not 401.

## The five calls a connector needs

### 1. Health (free)

```
GET /v1/health
```

200: `{ "status": "ok", "service": "verifiable-randomness-service", ... }`

### 2. Random number (paid)

```
POST /v1/random/number
{"min": 1, "max": 100}
```

200 includes `operation`, `number`, `min`, `max`, `random_seed`, `attestation`,
`timestamp`, `tee_type`.

### 3. Pick one item (paid)

```
POST /v1/random/pick
{"items": ["a", "b", "c"]}
```

`items` must be a non-empty array (max 100000). Response includes `picked` and
`index`.

### 4. Pick winners (paid)

```
POST /v1/random/winners
{"items": ["w1", "w2", "w3"], "count": 2}
```

### 5. Verify attestation (free)

```
POST /v1/verify
{"quote_hex": "...", "expected_report_data_hex": "..."}
```

## Recipes

Fair pick: POST pick, then tell the human the item, index, and that
`attestation` can be verified with call 5.

Raffle: POST winners with `count`. Do not re-roll unless the human asks.

## Rules of the road

- If the API returns 402, stop and tell the human a developer key or x402
  payment is required. Muse cannot pay x402 itself.
- Shuffle max 1000 items.
- Ask before using randomness for gambling-like stakes.
- This HTTP API is not Flash VRF. Do not call Solidity from this brief.
