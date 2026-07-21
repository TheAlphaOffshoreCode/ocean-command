# Event catalog

Identity events are `organization.created`, `auth.login`, `auth.logout`, and `user.created`. Asset audit events are `asset.created`, `asset.updated` and `asset.deleted`. They are currently persisted audit events. Future domain events will include an explicit version, organization ID, entity identity, occurrence time, source, correlation ID and payload.
