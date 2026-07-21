import argon2 from "argon2";
import type { FastifyRequest } from "fastify";
export type Claims = { sub: string; organizationId: string; roles: string[]; email: string };
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);
export async function requireAuth(request: FastifyRequest): Promise<Claims> { await request.jwtVerify(); return request.user as Claims; }
export function requireRole(claims: Claims, allowed: string[]): void { if (!claims.roles.some((role) => allowed.includes(role))) { const error = new Error("Forbidden"); (error as Error & { statusCode: number }).statusCode = 403; throw error; } }
