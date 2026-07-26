# ADR-004 — Provider interfaces for every external system

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

Ocean Command depends on five classes of external system: AIS vessel tracking, weather, an LLM,
notifications and file storage. At MVP time, three of them cannot be paid for and one (real
AIS) cannot be obtained at all for free with useful coverage. Yet the product must be complete
and demonstrable, and must not need rewriting when a real feed arrives.

There is also a credibility constraint: a demo showing simulated vessel positions as if they
were AIS truth is worse than a demo with no map.

## Options considered

**A. Call external APIs directly from the code that needs them.** Fastest to write. Each
integration then leaks its vendor's shape into components and queries, tests need the network or
ad-hoc mocks, and swapping vendors becomes a search-and-replace across features.

**B. One generic "integration service" abstraction** for all external calls. Too abstract to be
useful — AIS, an LLM and a file store share nothing but the word "external", so the interface
degenerates into `call(name, payload)` and gives up all type safety.

**C. One narrow interface per capability**, implementations selected by configuration.

## Decision

**Option C.** `src/providers/{ais,weather,ai,notifications,storage}/`, each with a typed
interface, one or more implementations, and a factory that reads validated environment
configuration. No `fetch` to a third party exists anywhere else in the codebase.

MVP implementations: `MockAISProvider` (deterministic, seeded), `OpenMeteoWeatherProvider`
(free, no key, includes marine data) with `MockWeatherProvider` for tests/offline,
`NullAIProvider`, in-app notifications, local-filesystem storage.

Three supporting rules:

1. **Provenance travels with the data.** Every record from a provider carries
   `source: REAL | SIMULATED | DEMO` and the provider name, persisted and surfaced in the UI.
   Honesty is a schema property, not a UI afterthought.
2. **External responses are cached in our own tables.** The application reads its database, not
   the vendor. This bounds rate limits and cost, and keeps the product usable during an outage —
   with an explicit staleness indicator.
3. **Providers fail soft.** A provider error degrades one surface (`ProviderError` → stale or
   empty state with a reason). It never breaks the Command Center.

## Consequences

**Positive.** Every feature can be built and tested today without any paid or unavailable feed.
Swapping to real AIS is one new class plus one environment variable. Tests use deterministic
fakes, so no test depends on the network or on today's weather. Cost is controllable by
construction.

**Negative.** More indirection than calling `fetch` in a component, and the mock AIS must stay
plausible enough to be a fair demonstration — a simulator that moves vessels unrealistically
undermines the credibility it exists to protect. Interfaces designed against a mock can encode
wrong assumptions about the real feed; the AIS interface was therefore modelled on real AIS
message fields (MMSI, SOG, COG, heading, destination), not on what the mock finds convenient.

**Revisit if:** a real AIS feed's delivery model turns out to be streaming-push rather than
request-response — the interface would gain a subscription method rather than change shape.
