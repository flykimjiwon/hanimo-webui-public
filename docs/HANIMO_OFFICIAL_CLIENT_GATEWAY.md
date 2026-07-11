# Hanimo Official Client Gateway Contract

Status: **WebUI contract frozen for the first public release; client implementation is the next phase.**

This document fixes the boundary between hanimo-webui, Hanimo Code, and the
Hanimo VS Code extension. The WebUI remains the self-hosted account, policy,
model-routing, and API-key gateway. Official clients consume it through a
standard OpenAI-compatible interface.

## Connection contract

| Field | Value |
|---|---|
| Base URL | `https://your-hanimo-host.example/v1` |
| Authentication | `Authorization: Bearer hmo_...` |
| Model discovery | `GET /v1/models` |
| Chat | `POST /v1/chat/completions` |
| Legacy autocomplete | `POST /v1/completions` |
| Optional capabilities | `POST /v1/embeddings`, `POST /v1/rerank` |

`/api/v1/*` remains as the WebUI's direct and backward-compatible route, but
official clients must use `/v1` as their base URL. Browser session cookies are
not part of this contract.

Users issue an API key from `/my-api-keys`. The plaintext `hmo_` key is shown
once; hanimo-webui stores its hash. Clients must treat it as a secret, must not
put it in a URL, and must not print it in logs or diagnostics.

## Current manual configuration

Until the dedicated preset ships, Hanimo Code and the VS Code extension share
the same `~/.hanimo/config.yaml` values:

```yaml
api:
  base_url: "https://your-hanimo-host.example/v1"
  api_key: "hmo_REPLACE_WITH_YOUR_KEY"
models:
  super: "MODEL_ID_FROM_V1_MODELS"
  dev: "MODEL_ID_FROM_V1_MODELS"
default:
  provider: "custom"
```

The equivalent environment variables are `HANIMO_API_BASE_URL`,
`HANIMO_API_KEY`, `HANIMO_MODEL_SUPER`, and `HANIMO_MODEL_DEV`.

## Next-phase implementation

### Hanimo Code

1. Add a first-class `hanimo` provider whose default base URL is user supplied.
2. Detect Hanimo by an explicit provider choice, not by hostname. A local
   `http://localhost:3000/v1` WebUI must not be mistaken for Ollama.
3. Implement generic OpenAI-compatible `ListModels()` using `GET {base}/models`
   with the configured bearer key.
4. Preserve streaming text, usage chunks, tool calls, and OpenAI error bodies.
5. Add contract tests against the WebUI mock/install harness.

### Hanimo VS Code

1. Add a `Hanimo WebUI` provider preset with base URL and `hmo_` key fields.
2. Reuse the updated Hanimo Code Go server instead of adding a second proxy
   implementation in TypeScript.
3. Keep the key masked in the webview and out of extension output logs.
4. Refresh the model picker from `/v1/models` immediately after saving.
5. Show distinct diagnostics for gateway authentication, unreachable WebUI,
   and upstream provider failures.

## Acceptance matrix

The integration phase is complete only when both official clients pass these
checks against the same hanimo-webui instance:

| Scenario | Expected result |
|---|---|
| Valid `hmo_` key lists models | OpenAI `object: list` response |
| Invalid, revoked, or expired key | `401` without fallback to cookies |
| Non-stream chat | OpenAI chat completion response |
| Streaming chat | Ordered SSE chunks and clean completion |
| Tool call | Name and JSON arguments preserved |
| OpenAI-compatible authenticated upstream | WebUI uses the configured upstream key, never the caller key |
| Local Ollama upstream | Model discovery and chat work without an upstream key |
| Labs disabled | All gateway endpoints remain available |

## Compatibility ownership

hanimo-webui owns the public `/v1` contract and `hmo_` lifecycle. Hanimo Code
owns the generic OpenAI client and model discovery. The VS Code extension owns
the preset, secret-safe settings UX, and packaging of the shared Go server.
Breaking this contract requires coordinated tests in all three repositories.
