# Local `bigint-buffer` compatibility fork

This fork keeps the upstream `bigint-buffer` API and pure JavaScript conversions while removing its optional native binding. The upstream native `toBigIntLE()` implementation is affected by CVE-2025-3194; there is no upstream patched release. The converter is not needed for the small fixed-width values used by the RNG service, so the JavaScript implementation avoids the unsafe native path without changing call sites.

The upstream package is Apache-2.0 licensed; its license is retained here. Keep this fork until upstream publishes and we verify a fixed release.
