import { LocationType, type PrismaClient, VesselStatus, VesselType } from '@prisma/client'

import { imoCheckDigit } from '../../src/lib/domain/vessel/identifiers'

/**
 * Demo fleet.
 *
 * Vessels, operators and IMO/MMSI numbers are **fictional**. Basin names are real
 * geography and the coordinates are plausible for a demonstration, but no vessel
 * or operation here corresponds to a real company's asset.
 *
 * IMO numbers are built with the real check-digit algorithm — the same function
 * the validator uses — so seeded vessels are not a special case that would pass
 * where a user's input fails.
 */

/** Six digits plus its computed check digit. */
function imo(sixDigits: string): string {
  return `${sixDigits}${imoCheckDigit(sixDigits)}`
}

/** MID 710 is Brazil. Nine digits total, starting 2–7, as a ship station must. */
function mmsi(suffix: string): string {
  return `710${suffix}`
}

type VesselSeed = {
  name: string
  type: VesselType
  status: VesselStatus
  imo: string
  mmsi: string
  callsign: string
  operator: string
  lengthM: number
  beamM: number
  draftM: number
}

const VESSELS: VesselSeed[] = [
  {
    name: 'OC Atlantic',
    type: VesselType.PSV,
    status: VesselStatus.IN_OPERATION,
    imo: imo('941020'),
    mmsi: mmsi('100011'),
    callsign: 'PPOC1',
    operator: 'Ocean Command Marine',
    lengthM: 87.9,
    beamM: 19,
    draftM: 6.4,
  },
  {
    name: 'OC Horizon',
    type: VesselType.AHTS,
    status: VesselStatus.IN_TRANSIT,
    imo: imo('941021'),
    mmsi: mmsi('100022'),
    callsign: 'PPOC2',
    operator: 'Ocean Command Marine',
    lengthM: 78.5,
    beamM: 18.5,
    draftM: 7.2,
  },
  {
    name: 'OC Sentinel',
    type: VesselType.OSRV,
    status: VesselStatus.STANDBY,
    imo: imo('941022'),
    mmsi: mmsi('100033'),
    callsign: 'PPOC3',
    operator: 'Ocean Command Marine',
    lengthM: 67.2,
    beamM: 15.8,
    draftM: 5.6,
  },
  {
    name: 'OC Explorer',
    type: VesselType.RSV,
    status: VesselStatus.IN_OPERATION,
    imo: imo('941023'),
    mmsi: mmsi('100044'),
    callsign: 'PPOC4',
    operator: 'Ocean Command Subsea',
    lengthM: 96.4,
    beamM: 22,
    draftM: 7.8,
  },
  {
    name: 'OC Pioneer',
    type: VesselType.PLSV,
    status: VesselStatus.IN_OPERATION,
    imo: imo('941024'),
    mmsi: mmsi('100055'),
    callsign: 'PPOC5',
    operator: 'Ocean Command Subsea',
    lengthM: 146,
    beamM: 30,
    draftM: 8.5,
  },
  {
    name: 'OC Guardian',
    type: VesselType.DSV,
    // Alongside for planned maintenance: excluded from AIS tracking, so its
    // position should stay put while the others move.
    status: VesselStatus.MAINTENANCE,
    imo: imo('941025'),
    mmsi: mmsi('100066'),
    callsign: 'PPOC6',
    operator: 'Ocean Command Subsea',
    lengthM: 110.5,
    beamM: 22,
    draftM: 7.1,
  },
  {
    name: 'OC Venture',
    type: VesselType.CSV,
    status: VesselStatus.AVAILABLE,
    imo: imo('941026'),
    mmsi: mmsi('100077'),
    callsign: 'PPOC7',
    operator: 'Ocean Command Marine',
    lengthM: 120.8,
    beamM: 25,
    draftM: 8,
  },
  {
    name: 'OC Titan',
    // An FPSO stays on station by design; the domain excludes it from tracking.
    type: VesselType.FPSO,
    status: VesselStatus.IN_OPERATION,
    imo: imo('941027'),
    mmsi: mmsi('100088'),
    callsign: 'PPOC8',
    operator: 'Ocean Command Production',
    lengthM: 320,
    beamM: 58,
    draftM: 21,
  },
]

type LocationSeed = {
  name: string
  basin: string
  type: LocationType
  latitude: number
  longitude: number
  waterDepthM: number
}

const LOCATIONS: LocationSeed[] = [
  {
    name: 'Santos Basin — Block SB-14',
    basin: 'Santos Basin',
    type: LocationType.FIELD,
    latitude: -25.31,
    longitude: -43.02,
    waterDepthM: 2140,
  },
  {
    name: 'Santos Basin — SB-14 Subsea Cluster',
    basin: 'Santos Basin',
    type: LocationType.SUBSEA_SITE,
    latitude: -25.44,
    longitude: -42.87,
    waterDepthM: 2210,
  },
  {
    name: 'Campos Basin — Block CB-07',
    basin: 'Campos Basin',
    type: LocationType.FIELD,
    latitude: -22.41,
    longitude: -40.11,
    waterDepthM: 1180,
  },
  {
    name: 'Campos Basin — CB-07 Platform',
    basin: 'Campos Basin',
    type: LocationType.PLATFORM,
    latitude: -22.28,
    longitude: -40.24,
    waterDepthM: 1090,
  },
  {
    name: 'Espírito Santo Basin — Block ES-03',
    basin: 'Espírito Santo Basin',
    type: LocationType.FIELD,
    latitude: -20.07,
    longitude: -39.42,
    waterDepthM: 1650,
  },
  {
    name: 'Port of Vitória — Anchorage',
    basin: 'Espírito Santo Basin',
    type: LocationType.ANCHORAGE,
    latitude: -20.31,
    longitude: -40.29,
    waterDepthM: 24,
  },
]

export async function seedFleet(prisma: PrismaClient, organizationId: string) {
  for (const vessel of VESSELS) {
    await prisma.vessel.upsert({
      // Tenant-scoped natural key: two organizations may legitimately track the
      // same hull, so the IMO alone is not unique.
      where: { organizationId_imo: { organizationId, imo: vessel.imo } },
      update: { name: vessel.name, status: vessel.status, operator: vessel.operator },
      create: { ...vessel, flag: 'BR', organizationId },
    })
  }

  for (const location of LOCATIONS) {
    await prisma.location.upsert({
      where: { organizationId_name: { organizationId, name: location.name } },
      update: { latitude: location.latitude, longitude: location.longitude },
      create: { ...location, organizationId },
    })
  }

  return { vessels: VESSELS.length, locations: LOCATIONS.length }
}
