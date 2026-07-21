# Domain model

Current aggregates: Organization, User, Role, Permission, OffshoreAsset and AuditLog. `Organization` is the tenant boundary. Every User, Role and OffshoreAsset belongs to exactly one organization; an asset code is unique within that tenant. OffshoreAsset captures the operational unit type, lifecycle status, geographic position, timezone and optional operator metadata. AuditLog records actor, tenant, action, target and request correlation.
