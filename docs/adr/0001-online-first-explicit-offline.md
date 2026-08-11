# ADR-0001: Online-First With Explicit Offline Mode

- Status: Accepted
- Date: 2026-08-10

## Decision

Use the online LINDA MorphoDiTa API by default. Treat local MorphoDiTa as an
explicit user-selected offline transport, with an optional fallback only for
eligible online failures: network errors, HTTP 429, and HTTP 5xx. HTTP 4xx
responses and cancellation do not trigger fallback.

When offline mode is selected, input must remain local. Sidecar startup and
local asset failures are fail-closed: the client reports the error and offers
recovery actions instead of silently switching to LINDA.

Explicit offline mode is a no-remote-network boundary: requests may target
only the local loopback sidecar, never the remote LINDA API.

## Rationale

Online-first avoids requiring a large local model for the normal path while
preserving a clear privacy boundary for users who choose offline processing.
The fail-closed rule prevents an unavailable local service from causing an
unexpected network disclosure.

## Consequences

- The default path depends on network access and LINDA availability.
- Offline operation requires valid local sidecar/model assets.
- Transport status and whether offline mode was explicit or fallback must remain
  visible to the user.
- Tests must cover both the eligible fallback boundary and the fail-closed
  explicit-offline boundary.

Implementation references: `morphodita4/src/services/api.ts`,
`morphodita4/src/services/offlineSidecar.ts`, and
`morphodita4/src/services/offlineFallback.test.ts`.
