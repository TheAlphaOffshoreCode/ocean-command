-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRATOR', 'OPERATIONS_MANAGER', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VesselType" AS ENUM ('AHTS', 'PSV', 'OSRV', 'PLSV', 'RSV', 'DSV', 'CSV', 'FPSO', 'DRILLSHIP', 'TUG', 'SUPPLY_VESSEL', 'SUPPORT_VESSEL');

-- CreateEnum
CREATE TYPE "VesselStatus" AS ENUM ('IN_OPERATION', 'IN_TRANSIT', 'STANDBY', 'AT_PORT', 'AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('REAL', 'SIMULATED', 'DEMO');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('FIELD', 'PLATFORM', 'SUBSEA_SITE', 'PORT', 'ANCHORAGE', 'WAYPOINT');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('ROV_INSPECTION', 'RPAS_INSPECTION', 'CARGO_OPERATION', 'CREW_TRANSFER', 'ANCHOR_HANDLING', 'SUBSEA_INSPECTION', 'SURVEY', 'DIVING_OPERATION', 'MAINTENANCE', 'SUPPLY_OPERATION');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('PLANNED', 'PREPARING', 'READY', 'IN_PROGRESS', 'SUSPENDED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OperationEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'RESCHEDULED', 'NOTE_ADDED', 'WEATHER_HOLD', 'RESOURCE_CHANGED');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('SAFETY', 'ENVIRONMENTAL', 'OPERATIONAL', 'TECHNICAL', 'WEATHER', 'SECURITY', 'REGULATORY');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'MONITORED', 'CLOSED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('WEATHER', 'VESSEL', 'OPERATION', 'ASSET', 'SAFETY', 'RISK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('UNREAD', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('RAISED', 'ESCALATED', 'ASSIGNED', 'ACKNOWLEDGED', 'RESOLVED', 'REOPENED', 'COMMENTED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CRANE', 'WINCH', 'PROPULSION', 'GENERATOR', 'THRUSTER', 'ROV', 'RPAS', 'COMMUNICATION_SYSTEM', 'NAVIGATION_EQUIPMENT', 'DP_SYSTEM', 'FIRE_SYSTEM', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('HEALTHY', 'ATTENTION', 'MAINTENANCE_REQUIRED', 'FAILURE');

-- CreateEnum
CREATE TYPE "AssetCriticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'OVERHAUL');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('PERSONAL_INJURY', 'NEAR_MISS', 'EQUIPMENT_DAMAGE', 'ENVIRONMENTAL_SPILL', 'DROPPED_OBJECT', 'COLLISION', 'FIRE', 'LOSS_OF_POSITION', 'SECURITY', 'PROCESS_SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('NEGLIGIBLE', 'MINOR', 'MODERATE', 'MAJOR', 'SEVERE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'UNDER_INVESTIGATION', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CERTIFICATE', 'PROCEDURE', 'REPORT', 'DRAWING', 'MANUAL', 'PERMIT', 'OTHER');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastLoginAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imo" TEXT,
    "mmsi" TEXT,
    "callsign" TEXT,
    "type" "VesselType" NOT NULL,
    "flag" TEXT NOT NULL,
    "operator" TEXT,
    "lengthM" DECIMAL(6,2),
    "beamM" DECIMAL(5,2),
    "draftM" DECIMAL(5,2),
    "status" "VesselStatus" NOT NULL DEFAULT 'AVAILABLE',
    "lastLatitude" DECIMAL(9,6),
    "lastLongitude" DECIMAL(9,6),
    "lastSpeedKn" DECIMAL(5,2),
    "lastHeadingDeg" INTEGER,
    "lastDestination" TEXT,
    "lastPositionAt" TIMESTAMPTZ(3),
    "lastPositionSource" "DataSource",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VesselPosition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "speedKn" DECIMAL(5,2),
    "headingDeg" INTEGER,
    "courseDeg" INTEGER,
    "destination" TEXT,
    "source" "DataSource" NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VesselPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basin" TEXT,
    "type" "LocationType" NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "waterDepthM" INTEGER,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "OperationType" NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "vesselId" TEXT,
    "locationId" TEXT,
    "responsibleId" TEXT,
    "plannedStart" TIMESTAMPTZ(3) NOT NULL,
    "plannedEnd" TIMESTAMPTZ(3) NOT NULL,
    "actualStart" TIMESTAMPTZ(3),
    "actualEnd" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" "OperationEventType" NOT NULL,
    "fromStatus" "OperationStatus",
    "toStatus" "OperationStatus",
    "message" TEXT,
    "actorId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "windSpeedKn" DECIMAL(5,2),
    "windGustKn" DECIMAL(5,2),
    "windDirectionDeg" INTEGER,
    "waveHeightM" DECIMAL(4,2),
    "wavePeriodS" DECIMAL(4,1),
    "waveDirectionDeg" INTEGER,
    "swellHeightM" DECIMAL(4,2),
    "swellPeriodS" DECIMAL(4,1),
    "swellDirectionDeg" INTEGER,
    "precipitationMm" DECIMAL(5,2),
    "visibilityNm" DECIMAL(5,2),
    "pressureHpa" DECIMAL(6,1),
    "airTempC" DECIMAL(4,1),
    "seaTempC" DECIMAL(4,1),
    "seaState" INTEGER,
    "source" "DataSource" NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "WeatherObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "forecastFor" TIMESTAMPTZ(3) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "windSpeedKn" DECIMAL(5,2),
    "windGustKn" DECIMAL(5,2),
    "windDirectionDeg" INTEGER,
    "waveHeightM" DECIMAL(4,2),
    "swellHeightM" DECIMAL(4,2),
    "visibilityNm" DECIMAL(5,2),
    "precipitationMm" DECIMAL(5,2),
    "source" "DataSource" NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "RiskCategory" NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "level" "RiskLevel" NOT NULL,
    "origin" TEXT,
    "operationId" TEXT,
    "vesselId" TEXT,
    "ownerId" TEXT,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "reviewDate" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAction" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "RiskAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'UNREAD',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceRef" TEXT,
    "vesselId" TEXT,
    "operationId" TEXT,
    "assetId" TEXT,
    "assigneeId" TEXT,
    "acknowledgedAt" TIMESTAMPTZ(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "type" "AlertEventType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "vesselId" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'HEALTHY',
    "condition" INTEGER,
    "criticality" "AssetCriticality" NOT NULL DEFAULT 'MEDIUM',
    "operatingHours" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "lastMaintenanceAt" TIMESTAMPTZ(3),
    "nextMaintenanceAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "performedAt" TIMESTAMPTZ(3) NOT NULL,
    "hoursAtService" DECIMAL(10,1),
    "description" TEXT NOT NULL,
    "performedBy" TEXT,
    "downtimeH" DECIMAL(6,2),

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vesselId" TEXT,
    "operationId" TEXT,
    "assetId" TEXT,
    "locationText" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "category" "IncidentCategory" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "description" TEXT NOT NULL,
    "impact" TEXT,
    "peopleInvolved" INTEGER NOT NULL DEFAULT 0,
    "immediateActions" TEXT,
    "probableCause" TEXT,
    "investigation" TEXT,
    "reportedById" TEXT,
    "investigatorId" TEXT,
    "closedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "IncidentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "vesselId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "validFrom" TIMESTAMPTZ(3),
    "validUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_idx" ON "Membership"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Vessel_organizationId_status_idx" ON "Vessel"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Vessel_organizationId_archivedAt_idx" ON "Vessel"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_organizationId_imo_key" ON "Vessel"("organizationId", "imo");

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_organizationId_mmsi_key" ON "Vessel"("organizationId", "mmsi");

-- CreateIndex
CREATE INDEX "VesselPosition_vesselId_recordedAt_idx" ON "VesselPosition"("vesselId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "VesselPosition_organizationId_recordedAt_idx" ON "VesselPosition"("organizationId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "Location_organizationId_type_idx" ON "Location"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_name_key" ON "Location"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Operation_organizationId_status_plannedStart_idx" ON "Operation"("organizationId", "status", "plannedStart");

-- CreateIndex
CREATE INDEX "Operation_organizationId_vesselId_plannedStart_idx" ON "Operation"("organizationId", "vesselId", "plannedStart");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_organizationId_code_key" ON "Operation"("organizationId", "code");

-- CreateIndex
CREATE INDEX "OperationEvent_operationId_occurredAt_idx" ON "OperationEvent"("operationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "OperationEvent_organizationId_occurredAt_idx" ON "OperationEvent"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "WeatherObservation_organizationId_observedAt_idx" ON "WeatherObservation"("organizationId", "observedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WeatherObservation_locationId_observedAt_provider_key" ON "WeatherObservation"("locationId", "observedAt", "provider");

-- CreateIndex
CREATE INDEX "WeatherForecast_organizationId_forecastFor_idx" ON "WeatherForecast"("organizationId", "forecastFor");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherForecast_locationId_forecastFor_provider_key" ON "WeatherForecast"("locationId", "forecastFor", "provider");

-- CreateIndex
CREATE INDEX "Risk_organizationId_status_level_idx" ON "Risk"("organizationId", "status", "level");

-- CreateIndex
CREATE INDEX "Risk_organizationId_operationId_idx" ON "Risk"("organizationId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "Risk_organizationId_code_key" ON "Risk"("organizationId", "code");

-- CreateIndex
CREATE INDEX "RiskAction_riskId_idx" ON "RiskAction"("riskId");

-- CreateIndex
CREATE INDEX "Alert_organizationId_status_severity_createdAt_idx" ON "Alert"("organizationId", "status", "severity", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_organizationId_vesselId_status_idx" ON "Alert"("organizationId", "vesselId", "status");

-- CreateIndex
CREATE INDEX "Alert_organizationId_sourceModule_sourceRef_idx" ON "Alert"("organizationId", "sourceModule", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_organizationId_code_key" ON "Alert"("organizationId", "code");

-- CreateIndex
CREATE INDEX "AlertEvent_alertId_occurredAt_idx" ON "AlertEvent"("alertId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Asset_organizationId_status_criticality_idx" ON "Asset"("organizationId", "status", "criticality");

-- CreateIndex
CREATE INDEX "Asset_organizationId_vesselId_idx" ON "Asset"("organizationId", "vesselId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_nextMaintenanceAt_idx" ON "Asset"("organizationId", "nextMaintenanceAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_organizationId_tag_key" ON "Asset"("organizationId", "tag");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_assetId_performedAt_idx" ON "MaintenanceRecord"("assetId", "performedAt" DESC);

-- CreateIndex
CREATE INDEX "Incident_organizationId_status_severity_idx" ON "Incident"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "Incident_organizationId_occurredAt_idx" ON "Incident"("organizationId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Incident_organizationId_code_key" ON "Incident"("organizationId", "code");

-- CreateIndex
CREATE INDEX "IncidentAction_incidentId_idx" ON "IncidentAction"("incidentId");

-- CreateIndex
CREATE INDEX "Document_organizationId_vesselId_idx" ON "Document"("organizationId", "vesselId");

-- CreateIndex
CREATE INDEX "Document_organizationId_validUntil_idx" ON "Document"("organizationId", "validUntil");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_actorId_createdAt_idx" ON "AuditLog"("organizationId", "actorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vessel" ADD CONSTRAINT "Vessel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VesselPosition" ADD CONSTRAINT "VesselPosition_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationEvent" ADD CONSTRAINT "OperationEvent_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherObservation" ADD CONSTRAINT "WeatherObservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherForecast" ADD CONSTRAINT "WeatherForecast_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAction" ADD CONSTRAINT "RiskAction_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertEvent" ADD CONSTRAINT "AlertEvent_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
