import { db } from "./index";
import { sql } from "drizzle-orm";

export async function checkDatabaseReadiness(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}