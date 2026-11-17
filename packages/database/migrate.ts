import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Run all SQL migration files in numerical order using node-postgres.
export async function runMigrations(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llmstxt_directory';

  // Local Docker PostgreSQL has no SSL by default
  const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  console.log(`[Migrate] Connecting to database (SSL: ${isRemote})...`);
  const pool = new pg.Pool({
    connectionString,
    ssl: isRemote
      ? {
        rejectUnauthorized,
        ca: process.env.DATABASE_CA_CERT,
      }
      : undefined,
  });

  try {
    const client = await pool.connect();
    try {
      const migrationsDir = path.join(__dirname, 'migrations');
      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

      console.log(`[Migrate] Found ${sqlFiles.length} migration file(s). Running migrations...`);

      for (const file of sqlFiles) {
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf-8');
        console.log(`[Migrate] Applying ${file}...`);
        await client.query(sql);
      }

      console.log('✅ [Migrate] All migrations applied successfully!');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ [Migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}

