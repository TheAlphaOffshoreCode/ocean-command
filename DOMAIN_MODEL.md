# Domain model

Current aggregates: Organization, User, Role, Permission and AuditLog. `Organization` is the tenant boundary. Every User and Role belongs to exactly one organization; AuditLog records actor, tenant, action, target and request correlation.
