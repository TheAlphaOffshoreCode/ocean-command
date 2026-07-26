'use client'

import { Fragment, useEffect, useMemo, useRef } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'

import 'leaflet/dist/leaflet.css'

import { statusTone, TONE_COLOR } from '@/components/shared/status-badge'
import type { VesselListItem } from '@/features/fleet/queries/list-vessels'

/**
 * The fleet map.
 *
 * Leaflet is imperative and lives inside a declarative tree, which is where map
 * components usually go wrong (risk #5 in ARCHITECTURE.md). Two rules keep it
 * contained: the map instance lives only here, and no Leaflet type crosses this
 * file's boundary — the page passes plain view models and gets a callback.
 * Swapping to MapLibre later replaces this file and nothing else.
 *
 * Markers are `divIcon` SVG rather than Leaflet's default image markers: no asset
 * to bundle, and a hull that points where it is heading reads as a vessel instead
 * of a pin.
 */

type Props = {
  vessels: VesselListItem[]
  selectedId: string | null
  onSelect: (vesselId: string) => void
}

const BASIN_CENTRE: [number, number] = [-23.2, -41.3]

function vesselIcon(vessel: VesselListItem, selected: boolean): L.DivIcon {
  const colour = TONE_COLOR[statusTone(vessel.status)]
  const heading = vessel.headingDeg ?? 0
  const size = selected ? 30 : 24

  // A hull outline, rotated to the heading. Stationary vessels (no heading, no
  // way on) still render, just pointing north — better than hiding them.
  const svg = `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform: rotate(${heading}deg)">
      <path d="M12 2 L17 20 L12 17 L7 20 Z"
            fill="${colour}"
            stroke="${selected ? '#e8f0f8' : 'rgba(7,14,23,0.85)'}"
            stroke-width="${selected ? 2 : 1.2}" />
    </svg>`

  return L.divIcon({
    html: svg,
    className: 'oc-vessel-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/** Fits the fleet once, then leaves the viewport to the operator. */
function FitFleet({ vessels }: { vessels: VesselListItem[] }) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current || vessels.length === 0) return

    const points = vessels
      .filter((vessel) => vessel.position)
      .map((vessel) => [vessel.position!.latitude, vessel.position!.longitude] as [number, number])

    if (points.length === 0) return

    // Re-fitting on every data refresh would yank the map away from whatever the
    // operator was looking at, so this runs once.
    map.fitBounds(L.latLngBounds(points).pad(0.25))
    fitted.current = true
  }, [map, vessels])

  return null
}

/** Keeps the map sized correctly when its container changes (panel opening, resize). */
function ResizeHandler() {
  const map = useMap()

  useEffect(() => {
    const invalidate = () => map.invalidateSize()
    const observer = new ResizeObserver(invalidate)
    observer.observe(map.getContainer())

    return () => observer.disconnect()
  }, [map])

  return null
}

export function FleetMap({ vessels, selectedId, onSelect }: Props) {
  const positioned = useMemo(() => vessels.filter((vessel) => vessel.position), [vessels])

  return (
    <MapContainer
      center={BASIN_CENTRE}
      zoom={6}
      className="h-full w-full bg-surface"
      // Scroll zoom hijacks page scrolling; ctrl+wheel and the buttons still work.
      scrollWheelZoom={false}
      worldCopyJump
    >
      {/* CARTO dark basemap: free, no API key, and dark by default. Attribution
          is a licence condition, not decoration. */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={18}
      />

      <FitFleet vessels={positioned} />
      <ResizeHandler />

      {positioned.map((vessel) => {
        const { latitude, longitude } = vessel.position!
        const selected = vessel.id === selectedId

        return (
          // Fragment, not a div: anything that is not a Leaflet layer would be
          // rendered as loose DOM outside the map panes.
          <Fragment key={vessel.id}>
            {selected ? (
              <CircleMarker
                center={[latitude, longitude]}
                radius={18}
                pathOptions={{
                  color: TONE_COLOR[statusTone(vessel.status)],
                  weight: 1,
                  fillOpacity: 0.12,
                }}
              />
            ) : null}

            <Marker
              position={[latitude, longitude]}
              icon={vesselIcon(vessel, selected)}
              eventHandlers={{ click: () => onSelect(vessel.id) }}
              // Screen readers and keyboard users get the vessel name, not "marker".
              alt={`${vessel.name} — ${vessel.status}`}
            >
              <Popup>
                <div className="min-w-40 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{vessel.name}</p>
                  <p className="text-xs text-slate-600">
                    {vessel.type} · {vessel.status.replaceAll('_', ' ').toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-600">
                    {vessel.speedKn ?? 0} kn · {vessel.headingDeg ?? 0}°
                  </p>
                  {vessel.destination ? (
                    <p className="text-xs text-slate-600">Bound for {vessel.destination}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-500">
                    {vessel.positionSource === 'REAL' ? 'AIS' : 'Simulated position'}
                  </p>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        )
      })}
    </MapContainer>
  )
}
