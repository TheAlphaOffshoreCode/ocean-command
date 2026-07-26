# ADR-006 — Plain coordinates and Leaflet raster maps; PostGIS and WebGL deferred

* **Status:** Accepted
* **Date:** 2026-07-26
* **Phase:** 0

## Context

The map is the most visible part of Ocean Command. Two independent choices hide behind it: how
positions are **stored and queried**, and how they are **rendered**. The MVP tracks 8 vessels and
a handful of locations, needs no basemap API key, and must cost nothing.

## Options considered — storage

**PostGIS** (`geography(Point,4326)`): spatial indexes, exact distance, geofencing, polygons.
Costs an extension that not every managed free tier enables, a heavier local stack, and Prisma
type friction (unsupported column types need raw SQL).

**Decimal lat/lon columns**: trivially portable, fully typed, and adequate for rendering markers
and Haversine radius queries over tens of rows.

## Options considered — rendering

**Leaflet 1.9 + react-leaflet 5** — small, mature, raster tiles, no API key with CARTO's dark
basemap; no WebGL, weaker at tens of thousands of features.
**MapLibre GL 6** — vector tiles, smooth zoom, better at scale; needs a vector tile source
(free tiers exist but usually with a key), heavier bundle, more complex React integration.
**A paid SDK** (Mapbox, Google) — rejected on the cost constraint alone.

## Decision

**Store** `latitude` / `longitude` as `Decimal(9,6)` (~0.1 m precision). **Render** with Leaflet
and a dark raster basemap, wrapped in one `MapPanel` component that owns the map instance.

`Decimal`, not `Float`: accumulated rounding in stored positions is a real defect, and a
position is a fact of record, not an approximation.

The map is isolated behind our own component boundary — `MapPanel` takes markers and callbacks
and exposes no Leaflet types to the rest of the application. Swapping to MapLibre later replaces
one file.

Distance queries use a Haversine SQL expression until there is a reason not to.

**Adopt PostGIS when** any of these appears: geofencing/safety zones around platforms, track
geometry as a linestring, polygon containment, or nearest-neighbour queries over a large fleet.
Migration path: add the extension and a generated `geography` column derived from the existing
`latitude`/`longitude`, backfill, add a GiST index. No data is lost and no column is dropped.

**Adopt MapLibre when** marker count or interaction smoothness becomes a measured problem, or
vector styling becomes a design requirement.

## Consequences

**Positive.** Runs on any PostgreSQL, including the leanest free tier. No map API key, no map
bill, no key to leak in the client bundle. Small bundle. Both upgrade paths are additive rather
than rewrites, and both have written triggers, so the deferral is a plan and not an omission.

**Negative.** No spatial index: radius queries are sequential scans, which is fine at this size
and would not be at fleet scale. Raster tiles look less crisp than vector at high zoom. Leaflet
is imperative inside a declarative tree, so marker lifecycle has to be managed by hand — the
known failure mode (risk #5) is memory leaks from markers never removed, which is why the map
lives in exactly one component.
