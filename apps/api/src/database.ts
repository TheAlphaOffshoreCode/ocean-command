import pg from "pg";
import { config } from "./config.js";
let pool: pg.Pool | undefined;
export function db(): pg.Pool { pool ??= new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 }); return pool; }
export async function closeDb(): Promise<void> { await pool?.end(); pool = undefined; }
