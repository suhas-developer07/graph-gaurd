import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export { schema };

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let _pool: pg.Pool | null = null;
let _db: Database | null = null;

/**
 * Get or create the database connection.
 * Uses the DATABASE_URL environment variable.
 */
export function getDb(databaseUrl?: string): Database {
  if (_db) return _db;

  const url = databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required. Set it in your environment or pass it directly.");
  }

  _pool = new pg.Pool({ connectionString: url });
  _db = drizzle(_pool, { schema });
  return _db;
}

/**
 * Get the underlying pg.Pool for raw queries or health checks.
 */
export function getPool(databaseUrl?: string): pg.Pool {
  if (_pool) return _pool;
  getDb(databaseUrl);
  return _pool!;
}

/**
 * Close the database connection pool.
 */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}

/**
 * Test database connectivity.
 */
export async function testConnection(databaseUrl?: string): Promise<boolean> {
  try {
    const pool = getPool(databaseUrl);
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}
