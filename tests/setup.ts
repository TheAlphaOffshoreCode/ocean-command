import 'dotenv/config'

// NODE_ENV is set by vitest.config.ts. Integration tests talk to the local
// development database from docker-compose and skip loudly when it is
// unreachable — see tests/helpers/db.ts. CI provides a real PostgreSQL service,
// so nothing is skipped there.
