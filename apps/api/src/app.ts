import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { audit } from "./audit.js";
import { requireAuth, requireRole, hashPassword, verifyPassword } from "./auth.js";
import { config } from "./config.js";
import { db } from "./database.js";

const registerSchema = z.object({ organizationName: z.string().min(2).max(120), organizationSlug: z.string().regex(/^[a-z0-9-]{2,64}$/), name: z.string().min(2).max(120), email: z.string().email(), password: z.string().min(12).max(128) });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const createUserSchema = z.object({ name: z.string().min(2).max(120), email: z.string().email(), password: z.string().min(12).max(128), role: z.enum(["OPERATIONS_COORDINATOR", "VIEWER"]).default("VIEWER") });

export function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, genReqId: () => randomUUID() });
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  app.register(cookie);
  app.register(jwt, { secret: config.JWT_SECRET, cookie: { cookieName: "ocean_session", signed: false } });
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (_request, reply) => { try { await db().query("SELECT 1"); return { status: "ready", database: "available" }; } catch { return reply.code(503).send({ status: "not_ready", database: "unavailable" }); } });

  app.post("/api/v1/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body); const organizationId = randomUUID(); const userId = randomUUID(); const client = await db().connect();
    try { await client.query("BEGIN"); await client.query("INSERT INTO organizations (id,name,slug,timezone) VALUES ($1,$2,$3,'UTC')", [organizationId, body.organizationName, body.organizationSlug]); await client.query("INSERT INTO users (id,organization_id,name,email,password_hash,status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')", [userId, organizationId, body.name, body.email.toLowerCase(), await hashPassword(body.password)]); await client.query("INSERT INTO roles (id,organization_id,name,system_role) VALUES ($1,$2,'Administrator','ADMINISTRATOR')", [randomUUID(), organizationId]); await client.query("INSERT INTO user_roles (user_id,role_id) SELECT $1,id FROM roles WHERE organization_id=$2 AND system_role='ADMINISTRATOR'", [userId, organizationId]); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await audit({ organizationId, userId, action: "organization.created", entityType: "Organization", entityId: organizationId, newValue: { name: body.organizationName }, ipAddress: request.ip, correlationId: request.id });
    const token = await reply.jwtSign({ sub: userId, organizationId, email: body.email.toLowerCase(), roles: ["ADMINISTRATOR"] }, { expiresIn: "15m" }); reply.setCookie("ocean_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 900 }); return reply.code(201).send({ user: { id: userId, name: body.name, email: body.email, roles: ["ADMINISTRATOR"] }, organization: { id: organizationId, name: body.organizationName } });
  });
  app.post("/api/v1/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => { const body = loginSchema.parse(request.body); const result = await db().query("SELECT u.id,u.organization_id,u.name,u.email,u.password_hash,array_agg(r.system_role) roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.email=$1 AND u.status='ACTIVE' GROUP BY u.id", [body.email.toLowerCase()]); const user = result.rows[0] as { id: string; organization_id: string; name: string; email: string; password_hash: string; roles: string[] } | undefined; if (!user || !(await verifyPassword(user.password_hash, body.password))) return reply.code(401).send({ message: "Invalid credentials" }); const token = await reply.jwtSign({ sub: user.id, organizationId: user.organization_id, email: user.email, roles: user.roles }, { expiresIn: "15m" }); reply.setCookie("ocean_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 900 }); await audit({ organizationId: user.organization_id, userId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipAddress: request.ip, correlationId: request.id }); return { user: { id: user.id, name: user.name, email: user.email, roles: user.roles } }; });
  app.post("/api/v1/auth/logout", async (request, reply) => { const claims = await requireAuth(request); reply.clearCookie("ocean_session", { path: "/" }); await audit({ organizationId: claims.organizationId, userId: claims.sub, action: "auth.logout", entityType: "User", entityId: claims.sub, ipAddress: request.ip, correlationId: request.id }); return reply.code(204).send(); });
  app.get("/api/v1/me", async (request) => { const claims = await requireAuth(request); const result = await db().query("SELECT u.id,u.name,u.email,o.name organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=$1 AND u.organization_id=$2", [claims.sub, claims.organizationId]); return { user: { ...result.rows[0], roles: claims.roles } }; });
  app.get("/api/v1/organizations/:id", async (request, reply) => { const claims = await requireAuth(request); if ((request.params as { id: string }).id !== claims.organizationId) return reply.code(404).send({ message: "Organization not found" }); const result = await db().query("SELECT id,name,slug,timezone,created_at,updated_at FROM organizations WHERE id=$1", [claims.organizationId]); return result.rows[0]; });
  app.get("/api/v1/users", async (request) => { const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR"]); const result = await db().query("SELECT u.id,u.name,u.email,u.status,array_agg(r.system_role) roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.organization_id=$1 GROUP BY u.id ORDER BY u.created_at", [claims.organizationId]); return { data: result.rows }; });
  app.post("/api/v1/users", async (request, reply) => { const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR"]); const body = createUserSchema.parse(request.body); const userId = randomUUID(); const role = await db().query("SELECT id FROM roles WHERE organization_id=$1 AND system_role=$2", [claims.organizationId, body.role]); if (!role.rows[0]) return reply.code(422).send({ message: "Role is unavailable" }); await db().query("INSERT INTO users (id,organization_id,name,email,password_hash,status) VALUES ($1,$2,$3,$4,$5,'ACTIVE')", [userId, claims.organizationId, body.name, body.email.toLowerCase(), await hashPassword(body.password)]); await db().query("INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2)", [userId, role.rows[0].id]); await audit({ organizationId: claims.organizationId, userId: claims.sub, action: "user.created", entityType: "User", entityId: userId, newValue: { email: body.email, role: body.role }, ipAddress: request.ip, correlationId: request.id }); return reply.code(201).send({ id: userId, name: body.name, email: body.email, role: body.role }); });
  app.get("/api/v1/audit", async (request) => { const claims = await requireAuth(request); requireRole(claims, ["ADMINISTRATOR"]); const result = await db().query("SELECT id,action,entity_type,entity_id,created_at FROM audit_logs WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100", [claims.organizationId]); return { data: result.rows }; });
  app.setErrorHandler((error, _request, reply) => { if (error instanceof z.ZodError) return reply.code(400).send({ message: "Validation failed", issues: error.issues.map(({ path, message }) => ({ path, message })) }); const appError = error instanceof Error ? error : undefined; const status = (appError as (Error & { statusCode?: number }) | undefined)?.statusCode ?? 500; return reply.code(status).send({ message: status === 500 ? "Internal server error" : (appError?.message ?? "Request failed") }); });
  return app;
}
