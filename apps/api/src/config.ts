import { z } from "zod";
const schema = z.object({ DATABASE_URL: z.string().url().default("postgres://ocean:change-me-locally@localhost:5432/ocean_command"), JWT_SECRET: z.string().min(32).default("development-only-secret-change-before-production"), WEB_ORIGIN: z.string().url().default("http://localhost:3000"), PORT: z.coerce.number().int().positive().default(4000) });
export const config = schema.parse(process.env);
