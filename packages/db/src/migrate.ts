import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get already applied migrations
    const { rows: applied } = await pool.query("SELECT name FROM _migrations ORDER BY id");
    const appliedNames = new Set(applied.map((r: { name: string }) => r.name));

    // Read migration files
    const migrationsDir = join(__dirname, "..", "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedNames.has(file)) {
        continue;
      }

      console.log(`  Applying migration: ${file}`);
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await pool.query("COMMIT");
        count++;
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }

    if (count === 0) {
      console.log("  No new migrations to apply.");
    } else {
      console.log(`  Applied ${count} migration(s) successfully.`);
    }
  } finally {
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
