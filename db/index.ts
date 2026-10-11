import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

export const db = drizzle(pool, {
  schema,
});

export type Database = typeof db;
