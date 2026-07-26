# ADR-007 — Risk, weather-window and readiness rules as pure, configurable, explainable modules

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

Three pieces of logic are the actual product: the risk score, the weather-window verdict and the
readiness score. Everything else is CRUD around them. They share three properties:

* they encode judgement that varies by operator, vessel and contract;
* they are the first thing a domain expert will challenge;
* a coordinator will not act on a number they cannot interrogate.

## Options considered

**A. Inline the rules where they are used** — a `if (windSpeed > 25)` in the weather page, the
score computed in the risk form. Fastest, and by phase 6 the same threshold exists in four
places with two different values.

**B. A generic rules engine** (JSON-defined conditions, an evaluator, maybe a rule editor UI).
Flexible, and a large amount of infrastructure to express seven thresholds. It also moves the
logic out of the type system and out of the reach of unit tests, which is the opposite of what
this project is trying to show.

**C. Pure functions with injected configuration** in `lib/domain`, one module per rule family.

## Decision

**Option C**, with three non-negotiable properties.

**1. Pure.** No I/O, no Prisma, no `new Date()` inside — time and configuration are parameters.
The caller loads data and config; the domain decides. This is what makes the boundary tests
(4/5, 9/10, 16/17; each weather threshold; each readiness band) trivial to write and fast to run.

**2. Configurable, with defaults in one place.** Risk bands, weather limits per operation type
and readiness weights live in typed config objects, overridable per organization via
`Organization.settings`. No literal threshold appears at a call site. When an operator says "our
DSV works to 2 m, not 1.5", that is a settings row, not a deploy.

**3. Explainable by construction.** Every rule returns its verdict **with the evidence**:

```ts
{ status: 'UNSAFE', breaches: [{ metric: 'waveHeightM', value: 2.9, limit: 2.5, level: 'UNSAFE' }] }
{ total: 68, band: 'RESTRICTED', factors: [{ key: 'assets', subScore: 40, contribution: 12, evidence: [...] }] }
```

The return type makes the explanation impossible to forget: a caller that renders the verdict
already holds its reasons. A bare number offered to an operations room is a number that gets
overridden and then ignored.

**Not AI.** These verdicts must be deterministic, reproducible and auditable — the same inputs
must give the same answer next month, and someone must be able to point at the rule that
produced it. Phase 9's LLM *explains and summarises* what these functions decide; it never
decides.

## Consequences

**Positive.** The riskiest logic is the easiest to test, and gets tested first. Thresholds are
tunable per tenant without touching code. Explanations come for free at every call site.
Extracting the domain into a shared package later is a move, not a rewrite.

**Negative.** More ceremony than an inline comparison: config must be loaded and passed. Return
types are richer, so callers handle a structure rather than a boolean. Per-organization overrides
mean the default values must be documented as *plausible demonstration defaults* rather than
industry standards — which they are, and `ARCHITECTURE.md` §5.2 says so explicitly.

**Revisit if:** rules ever need to be authored by end users at runtime, which would justify
option B's machinery — with these functions as its evaluation core.
