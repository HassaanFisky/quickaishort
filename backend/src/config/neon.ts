import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "../models/schema.js";

let sql: NeonQueryFunction<false, false>;
let db: NeonHttpDatabase<typeof schema>;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!db) {
    const databaseUrl = process.env.NEON_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("NEON_DATABASE_URL environment variable is not set");
    }
    sql = neon(databaseUrl);
    db = drizzle(sql, { schema });
  }
  return db;
}

export async function connectDatabase(): Promise<void> {
  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("NEON_DATABASE_URL environment variable is not set");
  }

  const testSql = neon(databaseUrl);
  await testSql`SELECT 1 AS connected`;
  console.log("✅ Connected to Neon Postgres");

  sql = testSql;
  db = drizzle(sql, { schema });
}
