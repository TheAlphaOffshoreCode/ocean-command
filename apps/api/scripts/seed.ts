import { db, closeDb } from "../src/database.js";
try { console.log("Identity data is created through POST /api/v1/auth/register; no demo credentials are seeded."); await db().query("SELECT 1"); } finally { await closeDb(); }
